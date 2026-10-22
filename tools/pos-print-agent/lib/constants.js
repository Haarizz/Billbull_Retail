"use strict";

const HOST = "127.0.0.1";
const PORT = Number(process.env.BILLBULL_PRINT_AGENT_PORT || 19777);
// Surfaced on /health so a till's installed agent build can be identified
// remotely — older builds carry the silent-failure RAW-print bug fixed in 0.2.0.
const VERSION = require("../package.json").version;

module.exports = { HOST, PORT, VERSION };
