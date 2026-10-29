import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const template = await readFile(new URL("../plugins/safari-browser-use/server/src/jxa-server.template.js", import.meta.url), "utf8");
const source = template.slice(template.indexOf("  function recorderTeardownTarget("), template.indexOf("  function webmcpSleep("));

function fixture(pages, entries = [["1:2", { site: "example.test", identity: { id: "1:2", url: "https://example.test/", title: "Recorded" }, documentId: "original" }]]) {
  const recordings = new Map(entries);
  const events = [];
  let failure = null;
  const context = {
    everydayOperation: true,
    listTabs: () => pages,
    runPage(method, { tabId }) {
      events.push([method, tabId]);
      if (failure?.method === method && failure.tabId === tabId) throw new Error("page unavailable");
      const page = pages.find(page => page.id === tabId);
      assert.ok(page, "must not use nonexistent coordinates");
      if (method === "webmcp.status") return { documentId: page.documentId };
      assert.equal(method, "webmcp.uninstall");
      page.stopped = true;
      return { uninstalled: true };
    },
    webmcpStore: {
      recording: id => recordings.get(id),
      recordingTabIds: () => [...recordings.keys()],
      stop: id => recordings.delete(id),
      summary: site => ({ site }),
    },
    drainWebmcp() { assert.fail("named teardown must not drain"); },
    saveSiteMemory() { assert.fail("named teardown must not save memory"); },
  };
  vm.runInNewContext(source, context);
  return { context, events, recordings, fail(method, tabId) { failure = { method, tabId }; }, recover() { failure = null; } };
}

for (const occupied of [true, false]) {
  test(`named teardown follows shifted recorder with ${occupied ? "occupied" : "unoccupied"} old coordinates`, () => {
    const pages = [{ id: "1:1", documentId: "original" }];
    if (occupied) pages.push({ id: "1:2", documentId: "unrelated" });
    const f = fixture(pages);
    f.context.stopAllWebmcpRecorders();
    assert.deepEqual(f.events.filter(([method]) => method === "webmcp.uninstall"), [["webmcp.uninstall", "1:1"]]);
    assert.equal(f.recordings.size, 0);
    assert.equal(pages[1]?.stopped, undefined);
  });
}

for (const pages of [[], [{ id: "1:2", documentId: "new-document" }]]) {
  test(`named teardown clears ${pages.length ? "navigated/replaced" : "closed"} recorder and permits subsequent calls`, () => {
    const f = fixture(pages);
    f.context.stopAllWebmcpRecorders();
    f.context.stopAllWebmcpRecorders();
    assert.equal(f.recordings.size, 0);
    assert.equal(f.events.some(([method]) => method === "webmcp.uninstall"), false);
  });
}

test("duplicate URL/title pages are disambiguated by the document token", () => {
  const f = fixture([
    { id: "1:1", url: "https://example.test/", title: "Recorded", documentId: "original" },
    { id: "1:2", url: "https://example.test/", title: "Recorded", documentId: "other" },
  ]);
  f.context.stopAllWebmcpRecorders();
  assert.deepEqual(f.events.at(-1), ["webmcp.uninstall", "1:1"]);
});

test("ambiguous recorder identity fails without uninstalling or forgetting it", () => {
  const f = fixture([{ id: "1:1", documentId: "original" }, { id: "1:2", documentId: "original" }]);
  assert.throws(() => f.context.stopAllWebmcpRecorders(), /ambiguous.*close duplicate/);
  assert.equal(f.recordings.size, 1);
  assert.equal(f.events.some(([method]) => method === "webmcp.uninstall"), false);
});

for (const method of ["webmcp.status", "webmcp.uninstall"]) {
  test(`${method} failure retains the entry for retry, including after closing the page`, () => {
    const pages = [{ id: "1:1", documentId: "original" }];
    const f = fixture(pages);
    f.fail(method, "1:1");
    assert.throws(() => f.context.stopAllWebmcpRecorders(), /recorder_stop_failed/);
    assert.equal(f.recordings.size, 1);
    f.recover();
    if (method === "webmcp.status") pages.length = 0;
    f.context.stopAllWebmcpRecorders();
    assert.equal(f.recordings.size, 0);
  });
}

test("legacy identity without a document token cannot uninstall a lookalike and clears once closed", () => {
  const pages = [
    { id: "1:1", url: "https://example.test/", title: "Recorded" },
    { id: "1:2", url: "https://example.test/", title: "Recorded" },
  ];
  const f = fixture(pages);
  delete f.recordings.get("1:2").documentId;
  assert.throws(() => f.context.stopAllWebmcpRecorders(), /document identity unavailable.*close/);
  assert.equal(f.recordings.size, 1);
  pages.pop();
  assert.throws(() => f.context.stopAllWebmcpRecorders(), /document identity unavailable/);
  assert.deepEqual(f.events, []);
  pages[0].url = "https://unrelated.test/";
  f.context.stopAllWebmcpRecorders();
  assert.equal(f.recordings.size, 0);
});

test("teardown still clears other closed entries when one recorder fails", () => {
  const f = fixture([{ id: "1:1", documentId: "original" }], [
    ["1:2", { site: "example.test", documentId: "original" }],
    ["1:3", { site: "closed.test", documentId: "gone" }],
  ]);
  f.fail("webmcp.uninstall", "1:1");
  assert.throws(() => f.context.stopAllWebmcpRecorders(), /recorder_stop_failed/);
  assert.deepEqual([...f.recordings.keys()], ["1:2"]);
});
