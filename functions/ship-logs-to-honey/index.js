const debug = require("debug")("ship-logs-to-honey");
const { initHoneyClient, extractLogEvents, processAll } = require('./lib')

const { SECRET_ID } = process.env

let honeyClient;

const handler = async event => {
  debug(`received invocation event`, { event })

  if (!honeyClient) {
    honeyClient = await initHoneyClient(SECRET_ID);
  }

  const cwLogEvents = extractLogEvents(event);
  await processAll(cwLogEvents, honeyClient);
};

exports.handler = handler;
