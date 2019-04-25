const debug = require("debug")("ship-logs-to-honey");
const zlib = require("zlib");
const { promisify } = require("util");
const gunzip = promisify(zlib.gunzip);
const { createHoneyClient } = require("libhoney-promise");
const _ = require('lodash')

const SecretsManager = require("aws-sdk/clients/secretsmanager");
const secretsManager = new SecretsManager({ region: process.env.AWS_REGION });

const initHoneyClient = (secretId) => {
  debug(
    `Initializing Honeycomb.IO client with configuration from ${secretId}`
  );

  const getSecretResponse = await secretsManager
    .getSecretValue({ SecretId: secretId })
    .promise();

  const honeycombIOOptions = JSON.parse(
    getSecretResponse.SecretString || "{}"
  );

  return createHoneyClient(honeycombIOOptions);
}

const tryParseJson = str => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

const parseLogData = event => {
  const {
    request_id: requestId,
    event: rawEvent,
    timestamp: log_timestamp
  } = event.extractedFields;

  const data = tryParseJson(rawEvent);

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
  const payload = await gunzip(compressedPayload);
  const json = payload.toString("utf8");

  const logEvent = JSON.parse(json);
  const { logGroup, logStream, logEvents } = logEvent;
  debug("parsed logEvents for %s - %s", logGroup, logStream);

  return logEvents.map(parseLogData).filter(event => event !== null);
};

const extractLogEvents = event => {
  // CloudWatch Logs
  if (event.awslogs) {    
    return parseCWLogEvent(event.awslogs.data);
  }
  
  // Kinesis
  if (event.Records && event.Records[0].eventSource === "aws:kinesis") {
    return _.flatMap(event.Records, record => parseCWLogEvent(record.kinesis.data));
  }
  
  // direct invocations - expect an array of events
  return event;
};

const correlateApiGatewayTraces = event => {
  if (event.service_name !== "APIGateway") {
    return event;
  }

  let traceId = event.requestId;

  if (event.request_correlation_ids["x-correlation-id"]) {
    traceId = event.request_correlation_ids["x-correlation-id"];
  }

  let parentSpanId;

  if (event.request_correlation_ids["x-correlation-span-id"]) {
    parentSpanId = event.request_correlation_ids["x-correlation-span-id"];
  }

  const spanId = `${parentSpanId || traceId}-span`;

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

const processAll = async (logEvents, honeyClient) => {
  const sendOperations = logEvents.map(event => {
    const correlatedEvent = correlateApiGatewayTraces(event);

    debug("sending event data to honeycomb: %o", correlatedEvent);

    return honeyClient.sendEventNow(correlatedEvent);
  });

  return Promise.all(sendOperations);
}

module.exports = {
  initHoneyClient,
  extractLogEvents,
  processAll
};