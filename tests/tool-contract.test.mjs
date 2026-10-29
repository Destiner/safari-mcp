import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolDefinitions
} from "../plugins/safari-browser-use/server/src/tool-definitions.mjs";

test("exposes the everyday API alongside the persistent REPL", () => {
  const tools = createToolDefinitions();

  assert.deepEqual(
    tools.map(tool => tool.name),
    ["js", "js_reset", "browser_status", "list_tabs", "create_tab", "switch_tab", "close_tab", "navigate_to_url", "page_info", "get_page_content", "page_interactions", "wait_for_navigation", "release_control"]
  );
});

test("marks REPL code as write-capable", () => {
  const tools = Object.fromEntries(
    createToolDefinitions().map(tool => [tool.name, tool])
  );

  assert.equal(tools.js.annotations.readOnlyHint, false);
});

test("requires title and code for each REPL cell", () => {
  const tools = Object.fromEntries(
    createToolDefinitions().map(tool => [tool.name, tool])
  );

  assert.deepEqual(tools.js.inputSchema.required, ["title", "code"]);
  assert.equal(tools.js.inputSchema.properties.title.type, "string");
  assert.equal(tools.js.inputSchema.properties.code.type, "string");
});
