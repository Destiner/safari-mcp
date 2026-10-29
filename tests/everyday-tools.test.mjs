import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createEverydayTools, everydayToolDefinitions } from "../plugins/safari-browser-use/server/src/everyday-tools.mjs";
import { createTabIdentity, resolveTabIdentity, resolveTabForUrlWait } from "../plugins/safari-browser-use/server/src/tab-identity.mjs";

function fixture(sessionId = "test") {
  let tabs = [
    { id: "12:1", title: "One", url: "https://one.test/", selected: true },
    { id: "12:2", title: "Two", url: "https://two.test/", selected: false }
  ];
  const calls = [];
  let count = 1;
  let failAction = false;
  let readError = false;
  const adapter = {
    sessionId,
    beginOperation() { calls.push("stopRecorders"); },
    listTabs() { calls.push("list"); if (readError) throw new Error("read denied"); return tabs; },
    doctor() { calls.push("doctor"); return { ok: true }; },
    release() { calls.push("release"); return { released: true }; },
    openTab(options) {
      calls.push(["open", options]);
      if (options.windowId !== "12") throw new Error("window missing");
      const tab = { id: "12:" + (tabs.length + 1), title: "", url: "about:blank", selected: options.active };
      tabs.push(tab); return tab;
    },
    switchTab(metadata) { calls.push(["switch", metadata.id]); },
    makeTab(metadata) {
      const identity = createTabIdentity(metadata);
      const perform = method => value => {
        calls.push([method, value]);
        if (failAction) throw new Error("action failed");
        return { done: true };
      };
      const locator = {
        count() { calls.push("count"); return count; },
        click: perform("click"), type: perform("type"), press: perform("press"), hover: perform("hover"), selectOption: perform("select")
      };
      return {
        _identity: identity,
        goto(url) {
          calls.push(["goto", url]);
          if (failAction === true) throw new Error("navigation failed");
          const tab = tabs.find(tab => tab.id === identity.id);
          tab.url = url; identity.url = url;
          if (failAction === "afterNavigation") {
            tab.title = "Destination";
            identity.everydayNavigating = true;
            throw new Error("navigation settle failed");
          }
        },
        close() { calls.push(["close", identity.id]); tabs = tabs.filter(tab => tab.id !== identity.id); },
        playwright: {
          locator(selector) { calls.push(["css", selector]); return locator; },
          getByRole(role, options) { calls.push(["role", role, options]); return locator; },
          scrollBy: perform("scroll"),
          domSnapshot(options) { calls.push(["snapshot", options]); return "- heading Test"; },
          waitForURL: perform("waitURL"), waitForLoadState: perform("waitLoad")
        }
      };
    }
  };
  const api = createEverydayTools(adapter);
  return { api, calls, tabs: () => tabs, setTabs(value) { tabs = value; }, count(value) { count = value; }, fail(value) { failAction = value; }, readError(value) { readError = value; } };
}
function handle(f, index = 1) { return f.api.call("list_tabs", {}).tabs[index].handle; }

test("all schemas are closed and every per-page tool requires a handle", () => {
  for (const tool of everydayToolDefinitions()) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    if (!["browser_status", "list_tabs", "create_tab", "release_control"].includes(tool.name)) {
      assert.ok(tool.inputSchema.required.includes("handle"));
    }
  }
});

test("validates entire input before even listing or releasing Safari", () => {
  const f = fixture();
  for (const [name, args] of [
    ["create_tab", {}], ["create_tab", { window_id: 12 }],
    ["create_tab", { window_id: "12", active: "false" }],
    ["create_tab", { window_id: "12", url: "javascript:alert(1)" }],
    ["create_tab", { window_id: "12", url: "https://a.test:65536/" }],
    ["create_tab", { window_id: "12", url: "https://a.test/\u0000" }],
    ["create_tab", { window_id: "12", url: "https://user:pass@host/" }],
    ["create_tab", { window_id: "12", url: "https://a.test/\n" }],
    ["page_info", {}], ["page_info", { handle: "x", extra: 1 }],
    ["browser_status", null], ["list_tabs", []],
    ["wait_for_navigation", { handle: "x", timeout_ms: 30001 }],
    ["page_interactions", { handle: "x", actions: [] }],
    ["page_interactions", { handle: "x", actions: Array(21).fill({ type: "scroll", delta_y: 1 }) }],
    ["page_interactions", { handle: "x", actions: [{ type: "click", target: { selector: "button" } }, { type: "eval", code: "1" }] }],
    ["page_interactions", { handle: "x", actions: [{ type: "click", target: { selector: "button", role: "button" } }] }],
    ["page_interactions", { handle: "x", actions: [{ type: "click", target: { role: "button" } }] }],
    ["page_interactions", { handle: "x", actions: [{ type: "keyPress", target: { selector: "input" }, key: "Tab" }] }],
    ["page_interactions", { handle: "x", actions: [{ type: "scroll", delta_y: NaN }] }]
  ]) assert.throws(() => f.api.call(name, args), /invalid_arguments/, name + JSON.stringify(args));
  assert.deepEqual(f.calls, []);
});

test("listing returns opaque stable handles and explicit window/selection metadata", () => {
  const f = fixture();
  const first = f.api.call("list_tabs", { window_id: "12" });
  assert.equal(first.tabs.length, 2);
  assert.equal(first.tabs[0].window_id, "12");
  assert.equal(first.tabs[0].selected, true);
  assert.notEqual(first.tabs[0].handle, "12:1");
  assert.deepEqual(f.api.call("list_tabs", {}).tabs, first.tabs);
  assert.deepEqual(f.api.call("list_tabs", { window_id: "99" }), { tabs: [] });
});

test("index shifts fail stale rather than following unique URLs", () => {
  const f = fixture();
  const h = handle(f);
  f.setTabs([{ ...f.tabs()[1], id: "12:1" }]);
  assert.throws(() => f.api.call("page_info", { handle: h }), /stale_tab_handle/);
  assert.notEqual(handle(f, 0), h);
});

test("duplicate URLs remain separate coordinate-bound handles", () => {
  const f = fixture(); const h = handle(f);
  f.setTabs([...f.tabs(), { ...f.tabs()[1], id: "12:3" }]);
  assert.equal(f.api.call("page_info", { handle: h }).handle, h);
  assert.notEqual(handle(f, 2), h);
  f.tabs()[1].title = "Replacement";
  assert.throws(() => f.api.call("page_info", { handle: h }), /stale_tab_handle/);
  f.tabs()[1].title = "Two";
  assert.throws(() => f.api.call("page_info", { handle: h }), /invalid handle/);
  assert.notEqual(handle(f), h);
});

test("missing or externally navigated tabs invalidate handles; no cross-window matching", () => {
  for (const mutate of [tab => ({ ...tab, url: "https://changed.test/" }), tab => ({ ...tab, id: "99:1" })]) {
    const f = fixture(); const h = handle(f);
    f.setTabs([f.tabs()[0], mutate(f.tabs()[1])]);
    assert.throws(() => f.api.call("page_info", { handle: h }), /stale_tab_handle/);
  }
});

test("reset invalidates every handle without reusing it or forgetting the counter", () => {
  const f = fixture(); const h = handle(f);
  f.api.reset();
  assert.throws(() => f.api.call("page_info", { handle: h }), /stale_tab_handle/);
  assert.notEqual(handle(f), h);
});

test("handles from a previous connection cannot target a new session", () => {
  const first = fixture("connection-a");
  const h = handle(first);
  const second = fixture("connection-b");
  handle(second);
  assert.throws(() => second.api.call("page_info", { handle: h }), /stale_tab_handle/);
});

test("read errors propagate and release is attempted", () => {
  const f = fixture(); f.readError(true);
  assert.throws(() => f.api.call("list_tabs", {}), /read denied/);
  assert.equal(f.calls.at(-1), "release");
});

test("creation is explicit-window and background by default; navigation does not mark auto-record", () => {
  const f = fixture();
  const created = f.api.call("create_tab", { window_id: "12", url: "https://new.test/" });
  assert.equal(created.created_by_api, true);
  assert.equal(created.url, "https://new.test/");
  assert.deepEqual(f.calls.find(call => Array.isArray(call) && call[0] === "open"), ["open", { windowId: "12", active: false }]);
  assert.throws(() => f.api.call("create_tab", { window_id: "99" }), /window missing/);
  f.api.call("close_tab", { handle: created.handle });
  assert.throws(() => f.api.call("page_info", { handle: created.handle }), /stale_tab_handle/);
});

test("closing existing tabs requires explicit permission; selected or unknown-selected tabs never close", () => {
  const f = fixture(); const h = handle(f);
  assert.throws(() => f.api.call("close_tab", { handle: h }), /allow_existing/);
  f.api.call("close_tab", { handle: h, allow_existing: true });
  for (const selected of [true, undefined]) {
    const g = fixture(); const selectedHandle = handle(g, 0);
    g.tabs()[0].selected = selected;
    assert.throws(() => g.api.call("close_tab", { handle: selectedHandle, allow_existing: true }), /selected/);
    assert.equal(g.calls.some(call => Array.isArray(call) && call[0] === "close"), false);
  }
});

test("content is truthfully ARIA, navigation and wait use the explicit page", () => {
  const f = fixture(); const h = handle(f);
  assert.deepEqual(f.api.call("get_page_content", { handle: h, root: "main" }), { format: "aria", snapshot: "- heading Test" });
  assert.equal(f.api.call("navigate_to_url", { handle: h, url: "https://next.test/" }).url, "https://next.test/");
  f.api.call("wait_for_navigation", { handle: h, expected_url: "https://next.test/", state: "interactive", timeout_ms: 100 });
  assert.ok(f.calls.some(call => Array.isArray(call) && call[0] === "waitURL"));
  f.api.call("release_control", {});
  assert.equal(f.api.call("page_info", { handle: h }).handle, h);
});

test("all supported interaction types use strict supported locator methods", () => {
  const f = fixture(); const h = handle(f);
  const target = { role: "button", name: "Go" };
  const result = f.api.call("page_interactions", { handle: h, actions: [
    { type: "click", target }, { type: "type", target, text: "hello" },
    { type: "keyPress", target, key: "Enter" }, { type: "hover", target },
    { type: "selectMenuItem", target, value: "yes" }, { type: "scroll", delta_y: 100 }
  ] });
  assert.equal(result.completed, 6);
  assert.equal(f.calls.filter(call => call === "count").length, 5);
  assert.deepEqual(f.calls.find(call => Array.isArray(call) && call[0] === "role"), ["role", "button", { name: "Go", exact: true }]);
});

test("strict uniqueness and runtime errors return partial progress without retry", () => {
  const f = fixture(); const h = handle(f); f.count(2);
  const result = f.api.call("page_interactions", { handle: h, actions: [
    { type: "scroll", delta_y: 10 }, { type: "click", target: { selector: "button" } }, { type: "scroll", delta_y: 10 }
  ] });
  assert.equal(result.ok, false); assert.equal(result.completed, 1); assert.equal(result.failed_index, 1);
  assert.match(result.error, /strict_locator/);
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === "scroll").length, 1);
  assert.equal(f.calls.at(-1), "release");
  f.count(1); f.fail(true);
  const failed = f.api.call("page_interactions", { handle: h, actions: [{ type: "click", target: { selector: "button" } }] });
  assert.equal(failed.completed, 0); assert.match(failed.error, /action failed/);
});

test("creation supports existing blank tabs and duplicate destinations; failures retain cleanup handles", () => {
  const f = fixture();
  f.tabs()[1].url = "about:blank";
  const blank = f.api.call("create_tab", { window_id: "12" });
  assert.equal(blank.created, true);
  assert.equal(blank.url, "about:blank");
  assert.notEqual(blank.handle, handle(f));
  const duplicate = f.api.call("create_tab", { window_id: "12", url: "https://one.test/" });
  assert.equal(duplicate.created, true);
  assert.equal(duplicate.url, "https://one.test/");
  f.api.call("navigate_to_url", { handle: blank.handle, url: "https://one.test/" });
  assert.equal(f.api.call("page_info", { handle: blank.handle }).handle, blank.handle);
  f.fail(true);
  const failed = f.api.call("create_tab", { window_id: "12", url: "https://fail.test/" });
  assert.equal(failed.created, true);
  assert.equal(failed.created_by_api, true);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /navigation failed/);
  f.api.call("close_tab", { handle: failed.handle });
});

test("post-creation runtime failures report side effects and retain handles when feasible", () => {
  for (const mode of ["afterNavigation", "readError"]) {
    const f = fixture();
    if (mode === "readError") f.readError(true);
    else f.fail(mode);
    const result = f.api.call("create_tab", { window_id: "12", url: "https://next.test/" });
    assert.equal(result.created, true);
    assert.equal(result.ok, false);
    assert.match(result.error, /failed|denied/);
    f.readError(false);
    assert.equal(f.api.call("page_info", { handle: result.handle }).handle, result.handle);
    f.api.call("close_tab", { handle: result.handle });
  }
});

test("created provenance never transfers to a matching user tab at a different coordinate", () => {
  for (const change of ["close", "navigate"]) {
    const f = fixture();
    const created = f.api.call("create_tab", { window_id: "12", url: "https://two.test/" });
    if (change === "close") f.setTabs(f.tabs().slice(0, 2));
    else f.tabs()[2].url = "https://elsewhere.test/";
    assert.throws(() => f.api.call("close_tab", { handle: created.handle }), /stale_tab_handle/);
    const user = f.api.call("list_tabs", {}).tabs[1];
    assert.equal(user.created_by_api, false);
    assert.throws(() => f.api.call("close_tab", { handle: user.handle }), /allow_existing/);
  }
});

test("wait accepts an already completed exact transition only at the original coordinate", () => {
  const f = fixture(); const h = handle(f);
  f.tabs()[1].url = "https://done.test/";
  f.tabs()[1].title = "Done";
  f.api.call("wait_for_navigation", { handle: h, expected_url: "https://done.test/" });
  assert.equal(f.api.call("page_info", { handle: h }).title, "Done");
  for (const mutation of ["other", "shift", "insert", "peer", "unexpected"]) {
    const g = fixture(); const old = handle(g);
    if (mutation === "other") g.tabs()[0].url = "https://done.test/";
    if (mutation === "shift") g.setTabs([{ ...g.tabs()[1], id: "12:1", url: "https://done.test/" }]);
    if (mutation === "insert") g.tabs().push({ id: "12:3", url: "about:blank", title: "" });
    if (mutation === "peer") { g.tabs()[0].title = "Changed"; g.tabs()[1].url = "https://done.test/"; }
    if (mutation === "unexpected") g.tabs()[1].url = "https://unexpected.test/";
    // The mock wait methods cannot poll: the other-tab case is covered at the real resolver boundary below.
    if (mutation !== "other") assert.throws(() => g.api.call("wait_for_navigation", { handle: old, expected_url: "https://done.test/" }), /stale_tab_handle/);
  }
});

test("runtime identity polling never falls back to another URL tab or ignores topology", () => {
  const tabs = [
    { id: "12:1", url: "https://other.test/", title: "Other" },
    { id: "12:2", url: "https://old.test/", title: "Old" }
  ];
  const identity = { ...createTabIdentity(tabs[1]), everyday: true, everydayTopology: tabs.map(tab => ({ ...tab })) };
  tabs[0].url = "https://done.test/";
  assert.throws(() => resolveTabForUrlWait(identity, tabs, "https://done.test/", true), /topology/);
  tabs[0].url = "https://other.test/";
  assert.equal(resolveTabForUrlWait(identity, tabs, "https://done.test/", true), null);
  tabs[1].url = "https://done.test/";
  tabs[1].title = "Done";
  assert.equal(resolveTabForUrlWait(identity, tabs, "https://done.test/", true).id, "12:2");
  assert.equal(resolveTabIdentity(identity, tabs).title, "Done");
  tabs[1].title = "Replacement";
  assert.throws(() => resolveTabIdentity(identity, tabs), /stale_tab_handle/);
  assert.throws(() => resolveTabForUrlWait(identity, tabs.slice(1), "https://done.test/", true), /topology/);
});

test("valid operations stop prior recording before any browser work", () => {
  const f = fixture();
  f.api.call("browser_status", {});
  assert.deepEqual(f.calls, ["stopRecorders", "doctor"]);
});

test("runtime integration avoids wrapTab, auto-recording and best-effort tab reads", async () => {
  const source = await readFile(new URL("../plugins/safari-browser-use/server/src/jxa-server.template.js", import.meta.url), "utf8");
  const adapter = source.slice(source.indexOf("var everydayTools ="), source.indexOf("function handleToolCall"));
  assert.match(adapter, /new SafariTab\(metadata\)/);
  assert.doesNotMatch(adapter, /wrapTab|markAutoRecordIdentity|collectTabs/);
  assert.match(adapter, /beginOperation: stopAllWebmcpRecorders/);
  assert.match(source, /if \(!everydayOperation\) saveSiteMemory\(entry.site, true\)/);
  for (const fn of ["ensureWebmcpRecorder", "maybeAutoRecord", "maybeAutoProbe", "annotateSnapshot", "drainWebmcp"]) {
    assert.match(source, new RegExp("function " + fn + "[^\\n]*\\n    if \\(everydayOperation\\)"));
  }
  assert.match(source, /everydayTools\.reset\(\)/);
  assert.match(source, /isError: everydayResult && everydayResult\.ok === false/);
  assert.match(source, /if \(everydayOperation\) throw new Error\("recorder_stop_failed:/);
});
