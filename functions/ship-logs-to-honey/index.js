const debug = require("debug")("ship-logs-to-honey");
const { initHoneyClient, extractLogEvents, processAll } = require('./lib')

let honeyClient;

const handler = async event => {
  debug(`received invocation event`, { event })

  if (!honeyClient) {
    honeyClient = await initHoneyClient("ShipLogs/HoneycombIO");    
  }

  // these are the individual CloudWatch events
  const logEvents = extractLogEvents(event);
  await processAll(logEvents);
};

exports.handler = handler;
