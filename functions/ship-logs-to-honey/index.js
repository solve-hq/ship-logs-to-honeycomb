const { createHoneyClient } = require("libhoney-promise");
const debug = require("debug")("ship-logs-to-honey");

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

const processAll = async (events, hny) => {
  const sendOperations = events.map(event => {
    const correlatedEvent = correlateApiGatewayTraces(event);

    debug("sending event data to honey: %o", correlatedEvent);

    return hny.sendEventNow(correlatedEvent);
  });

  return Promise.all(sendOperations);
};

let honeyClient;

const SecretsManager = require("aws-sdk/clients/secretsmanager");
const secretsManager = new SecretsManager({ region: process.env.AWS_REGION });

const handler = async event => {
  if (!honeyClient) {
    debug(
      "Initializing Honeycomb.IO client with configuration from ShipLogs/HoneycombIO"
    );

    const getSecretResponse = await secretsManager
      .getSecretValue({ SecretId: "ShipLogs/HoneycombIO" })
      .promise();

    const honeycombIOOptions = JSON.parse(
      getSecretResponse.SecretString || "{}"
    );

    honeyClient = createHoneyClient(honeycombIOOptions);
  }

  return processAll(event, honeyClient);
};

exports.handler = handler;
