const debug = require("debug")("ship-logs-to-honey");
const { initHoneyClient, extractLogEvents, processAll } = require('./lib')

let honeyClient;

const handler = async event => {
  debug(`received invocation event`, { event })

  if (!honeyClient) {
    honeyClient = await initHoneyClient("ShipLogs/HoneycombIO");    
  }

  const cwLogEvents = extractLogEvents(event);
  await processAll(cwLogEvents, honeyClient);
};

exports.handler = handler;
