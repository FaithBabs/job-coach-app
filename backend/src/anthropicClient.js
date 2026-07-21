// One shared connection to the Claude API. The API key lives only here,
// on the server, read from the .env file — it is never sent to the browser.

const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = { anthropic };
