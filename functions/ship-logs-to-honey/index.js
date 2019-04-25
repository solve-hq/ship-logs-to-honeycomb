const debug = require("debug")("ship-logs-to-honey");
const { initHoneyClient, extractLogEvents, processAll } = require('./lib')

const processAll = async (events, hny) => {
  const sendOperations = events.map(event => {
    const correlatedEvent = correlateApiGatewayTraces(event);

    debug("sending event data to honey: %o", correlatedEvent);

    return hny.sendEventNow(correlatedEvent);
  });

  return Promise.all(sendOperations);
};

let honeyClient;

const handler = async event => {
  if (!honeyClient) {
    honeyClient = await initHoneyClient("ShipLogs/HoneycombIO");    
  }

  // these are the individual CloudWatch events
  const logEvents = extractLogEvents(event);
  await processAll(logEvents);
};

exports.handler = handler;
