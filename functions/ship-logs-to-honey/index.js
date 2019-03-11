const { createHoneyClient } = require("libhoney-promise");

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

  return {
    ...event,
    ...traceData
  };
};

const processAll = async (events, logger, hny) => {
  const sendOperations = events.map(event => {
    const correlatedEvent = correlateApiGatewayTraces(event);

    logger.debug("sending event data to honey", {
      event: correlatedEvent
    });

    return hny.sendEventNow(correlatedEvent);
  });

  return Promise.all(sendOperations);
};

let honeycombIOOptions;

const SecretsManager = require("aws-sdk/clients/secretsmanager");
const secretsManager = new SecretsManager({ region: process.env.AWS_REGION });

const handler = async event => {
  if (!honeycombIOOptions) {
    const getSecretResponse = await secretsManager
      .getSecretValue({ SecretId: "ShipLogs/HoneycombIO" })
      .promise();

    honeycombIOOptions = JSON.parse(getSecretResponse.SecretString || "{}");
  }

  const hny = createHoneyClient(honeycombIOOptions);

  return processAll(event, logger, hny);
};

exports.handler = handler;
