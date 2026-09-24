@AGENTS.md

## Replying to Brandon

Be brief. Short answers, plain words, no preamble or recap. Give the steps or
the result, not the reasoning behind them unless asked.

## Checking the UI

`.mcp.json` wires up Chrome DevTools MCP through `scripts/chrome-devtools-mcp.sh`,
which finds whatever Chrome the machine has and goes headless when there is no
display. Start the app with `npm run dev`, then `list_pages` for a pageId before
any page-scoped call, then `navigate_page`, `take_screenshot`,
`list_console_messages`.

A change to a screen is not verified until it has been loaded in a browser.
Tests passing and a clean build say the code compiles, not that the thing works.
