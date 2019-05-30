const debug = require("debug")("ship-logs-to-honey");
const zlib = require("zlib");
const { createHoneyClient } = require("libhoney-promise");
const apiGwLogParser = require("aws-api-gateway-log-parser");
const _ = require("lodash");

const SecretsManager = require("aws-sdk/clients/secretsmanager");
const secretsManager = new SecretsManager({ region: process.env.AWS_REGION });

const initHoneyClient = async secretId => {
  debug(`Initializing Honeycomb.IO client with configuration from ${secretId}`);

  const getSecretResponse = await secretsManager
    .getSecretValue({ SecretId: secretId })
    .promise();

  const honeycombIOOptions = JSON.parse(getSecretResponse.SecretString || "{}");

  return createHoneyClient(honeycombIOOptions);
};

const tryParseEventJson = event => {
  try {
    return JSON.parse(event.match(/(INFO\s*)?(.*)/)[2]);
  } catch (e) {
    return null;
  }
};

const parseLambdaLogData = event => {
  debug("Parsing lambda log event %o", event);

  const {
    request_id: requestId,
    event: rawEvent,
    timestamp: log_timestamp
  } = event.extractedFields;

  const data = tryParseEventJson(rawEvent);

  if (!data) {
    return null;
  }

  return {
    requestId,
    log_timestamp,
    ...data
  };
};

const parseCWLogEvent = data => {
  const compressedPayload = new Buffer(data, "base64");
  const payload = zlib.gunzipSync(compressedPayload);
  const json = payload.toString("utf8");

  const cwLogEvent = JSON.parse(json);
  const { logGroup, logStream, logEvents } = cwLogEvent;
  debug(
    `found [${logEvents.length}] logEvents from ${logGroup} - ${logStream}`
  );

  return cwLogEvent;
};

const extractLogEvents = event => {
  // CloudWatch Logs
  if (event.awslogs) {
    return [parseCWLogEvent(event.awslogs.data)];
  }

  // Kinesis
  if (event.Records && event.Records[0].eventSource === "aws:kinesis") {
    return event.Records.map(record => parseCWLogEvent(record.kinesis.data));
  }

  throw new Error(
    "Unsupported event source. Only CloudWatch Logs and Kinesis are supported."
  );
};

const correlateApiGatewayTraces = event => {
  let traceId = event.requestId;

  if (event.request_correlation_ids["x-correlation-id"]) {
    traceId = event.request_correlation_ids["x-correlation-id"];
  }

  let parentSpanId;
  let spanId;

  if (event.request_correlation_ids["x-correlation-span-id"]) {
    spanId = event.request_correlation_ids["x-correlation-span-id"];

    if (spanId.includes("-span")) {
      const possibleParentSpanId = spanId.substring(0, spanId.indexOf("-span"));

      if (possibleParentSpanId !== traceId) {
        parentSpanId = possibleParentSpanId;
      }
    }
  }

  const traceData = {
    "trace.trace_id": traceId,
    "trace.span_id": spanId,
    "trace.parent_id": parentSpanId
  };

  const additionalFields = {};

  if (event.http_method && event.http_resource_path) {
    additionalFields.name = `${event.http_method} ${event.http_resource_path}`;
  }

  return {
    ...event,
    ...traceData,
    ...additionalFields
  };
};

const generateApiGatewayEvent = event => {
  debug(
    "Generating an event for request %s - %s",
    event.api_stage,
    event.request_id
  );

  const request_correlation_ids = {};

  if (!event.endpoint_response_headers || !event.method_request_headers) {
    if (event.key_throttle) {
      return {
        service_name: "APIGateway",
        request_id: event.request_id,
        api_stage: event.api_stage,
        level: "ERROR",
        errorMessage:
          "Request throttled because the API Gateway stage is over capacity. Increase the ThrottlingBurstLimit and ThrottlingRateLimit in your Stage method settings",
        errorName: "APIGateway-KeyThrottle",
        name: `KeyThrottle`,
        duration_ms: event["request-execution-duration"],
        timestamp: event["@timestamp"],
        status_code: event.method_status,
        request_correlation_ids,
        ...event.key_throttle
      };
    }

    debug(
      "Unable to generate an event because either endpoint_response_headers or method_request_headers are missing"
    );

    return;
  }

  const {
    endpoint_response_headers,
    method_request_headers,
    method_response_headers,
    http_method,
    http_resource_path,
    method_status,
    integration_latency,
    api_stage,
    customer_function_error
  } = event;

  const debugLogEnabledFromHeaders =
    method_response_headers["Debug-Log-Enabled"] === "true";

  const debugLogEnabledFromMethodStatus = method_status >= 400;

  // If debug logging is not enabled, then don't log this event
  // Also, make sure to log any non-successful responses
  if (!debugLogEnabledFromHeaders && !debugLogEnabledFromMethodStatus) {
    debug(
      "Not generating an event because DEBUG level logging isn't enabled by the request headers Debug-Log-Enabled flag"
    );
    return;
  }

  const mappedHeaders = {};

  mappedHeaders.requestId = endpoint_response_headers["x-amzn-RequestId"];
  mappedHeaders.remote_ip = method_request_headers["X-Forwarded-For"];
  mappedHeaders.country = method_request_headers["CloudFront-Viewer-Country"];
  mappedHeaders.user_agent = method_request_headers["User-Agent"];
  mappedHeaders.host = method_request_headers["Host"];
  mappedHeaders.accept = method_request_headers["Accept"];

  mappedHeaders.content_type = endpoint_response_headers["Content-Type"];
  mappedHeaders.content_length = endpoint_response_headers["Content-Length"];
  mappedHeaders.version = endpoint_response_headers["X-Amz-Executed-Version"];

  if (customer_function_error) {
    mappedHeaders.errorMessage = customer_function_error;
    mappedHeaders.errorName = "LambdaInvocationError";
  }

  if (method_response_headers) {
    for (const header in method_response_headers) {
      if (header.toLowerCase().startsWith("x-correlation-")) {
        request_correlation_ids[header.toLowerCase()] =
          method_response_headers[header];
      }
    }
  }

  const result = {
    service_name: "APIGateway",
    level: "TRACE",
    api_stage,
    duration_ms: event["request-execution-duration"],
    timestamp: event["@timestamp"],
    status_code: method_status,
    http_method,
    http_resource_path,
    integration_latency: integration_latency,
    execution_failure: event.execution_failure,
    request_correlation_ids,
    ...mappedHeaders
  };

  return result;
};

const parseApiGatewayLogs = cwLogEvent => {
  const events = apiGwLogParser.parseLogs(cwLogEvent);
  debug("Parsed API Gateway logs into events: %j", { events });

  if (!events) {
    console.log("could not parse API Gateway logs", cwLogEvent);
    return [];
  }

  return events
    .map(event => {
      try {
        const structuredEvent = generateApiGatewayEvent(event);

        if (structuredEvent) {
          debug("Sending API Gateway trace event: %j", {
            structuredEvent,
            rawEvent: event
          });

          return structuredEvent;
        }
      } catch (error) {
        debug("Error generating event %s", error.message);
      }
    })
    .filter(x => x);
};

const sendHoneycombEvent = async (event, honeyClient) => {
  try {
    await honeyClient.sendEventNow(event);
  } catch (err) {
    console.log("failed to send event to Honeycomb", event, err);
  }
};

const processAll = async (cwLogEvents, honeyClient) => {
  const sendOperations = _.flatMap(cwLogEvents, cwLogEvent => {
    if (cwLogEvent.logGroup.startsWith("API-Gateway-Execution-Logs")) {
      const apiGatewayEvents = parseApiGatewayLogs(cwLogEvent);
      const correlatedApiGatewayEvents = apiGatewayEvents.map(
        correlateApiGatewayTraces
      );

      return correlatedApiGatewayEvents.map(apiGwEvent => {
        debug("sending API Gateway log event to honeycomb: %o", apiGwEvent);
        return sendHoneycombEvent(apiGwEvent, honeyClient);
      });
    } else if (cwLogEvent.logGroup.startsWith("/aws/lambda")) {
      return cwLogEvent.logEvents
        .map(parseLambdaLogData)
        .filter(x => x)
        .map(lambdaLogEvent => {
          debug("sending Lambda log event to honeycomb: %o", lambdaLogEvent);
          return sendHoneycombEvent(lambdaLogEvent, honeyClient);
        });
    } else if (cwLogEvent.messageType === "CONTROL_MESSAGE") {
      debug("CloudWatch control message, ignored...");
      return Promise.resolve();
    } else {
      debug("unknown CW log event type, ignored...", cwLogEvent);
      return Promise.resolve();
    }
  });

  return Promise.all(sendOperations);
};

module.exports = {
  initHoneyClient,
  extractLogEvents,
  processAll
};
