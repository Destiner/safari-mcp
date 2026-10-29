import assert from "node:assert/strict";
import test from "node:test";

import { Window } from "happy-dom";

import {
  runPageOperation
} from "../plugins/safari-browser-use/server/src/page-runtime.mjs";
import {
  buildPlaywrightAriaSnapshot
} from "../scripts/build-playwright-aria-snapshot.mjs";

const snapshotBundle = await buildPlaywrightAriaSnapshot();

test("builds a compact browser injection payload", () => {
  assert.ok(
    snapshotBundle.length < 70_000,
    `expected less than 70000 bytes, got ${snapshotBundle.length}`
  );
});

function createSnapshotPage(html) {
  const window = new Window({ url: "https://example.com/form" });
  window.document.documentElement.style.visibility = "visible";
  window.document.body.innerHTML = html;
  window.eval(
    snapshotBundle +
      "\nwindow.__sbuAriaSnapshot = " +
      "SBUPlaywrightAriaSnapshot.snapshot;"
  );
  const dependencies = {
    ariaSnapshot: window.__sbuAriaSnapshot
  };
  delete window.__sbuAriaSnapshot;

  return {
    window,
    snapshot(params = {}) {
      return runPageOperation(
        window.document,
        window,
        "playwright.domSnapshot",
        params,
        dependencies
      );
    }
  };
}

test("returns a Playwright-style YAML snapshot", () => {
  const page = createSnapshotPage(`
    <label for="email">Email address</label>
    <input id="email">
    <button>Continue</button>
  `);

  assert.equal(
    page.snapshot(),
    [
      "- text: Email address",
      '- textbox "Email address"',
      '- button "Continue"'
    ].join("\n")
  );
});

for (const [description, html, name, displayedValue] of [
  ["submit value", '<input id="target" type="submit" value="Go">', "Go"],
  ["reset value", '<input id="target" type="reset" value="Clear">', "Clear"],
  ["button value", '<input id="target" type="button" value="Continue">', "Continue"],
  ["normalized value", '<input id="target" type="SUBMIT" value="  Go   now  ">', "Go now"],
  ["default submit", '<input id="target" type="submit" title="Ignored">', "Submit"],
  ["default reset", '<input id="target" type="reset" value="   ">', "Reset"],
  ["button title fallback", '<input id="target" type="button" title="Details">', "Details"],
  ["unnamed button", '<input id="target" type="button">', ""],
  ["ARIA label priority", '<input id="target" type="submit" value="Go" aria-label="Search">', "Search", "Go"],
  ["referenced label priority", '<span id="label">Search site</span><input id="target" type="submit" value="Go" aria-labelledby="label">', "Search site", "Go"],
  ["value before associated label and title", '<label for="target">Not the name</label><input id="target" type="submit" value="Go" title="Also not the name">', "Go"]
]) {
  test(`input button snapshot/locator parity: ${description}`, t => {
    const page = createSnapshotPage(html);
    t.after(() => page.window.happyDOM.abort());
    const locator = [{ type: "role", role: "button", name, exact: true }];
    const execute = (method, params) => runPageOperation(
      page.window.document, page.window, method, params
    );

    assert.equal(
      page.snapshot({ root: "#target" }),
      (name ? `- button "${name}"` : "- button") +
        (displayedValue ? `: ${displayedValue}` : "")
    );
    assert.equal(execute("playwright.locator.count", { locator }), 1);

    let clicks = 0;
    page.window.document.getElementById("target").addEventListener("click", () => clicks++);
    execute("playwright.locator.click", { locator });
    assert.equal(clicks, 1);
  });
}

test("input button locators use the current value without naming textboxes from values", t => {
  const page = createSnapshotPage(`
    <input id="target" type="submit" value="Old name">
    <input id="text" value="Not a label">
  `);
  t.after(() => page.window.happyDOM.abort());
  page.window.document.getElementById("target").value = "New name";
  const count = (role, name) => runPageOperation(
    page.window.document, page.window, "playwright.locator.count",
    { locator: [{ type: "role", role, name, exact: true }] }
  );

  assert.equal(page.snapshot({ root: "#target" }), '- button "New name"');
  assert.equal(count("button", "New name"), 1);
  assert.equal(count("button", "Old name"), 0);
  assert.equal(count("textbox", "Not a label"), 0);
});

test("renders stable locator metadata as YAML properties", () => {
  const page = createSnapshotPage(`
    <section data-testid="product-card">
      <a href="/buy" data-testid="buy-link">Buy now</a>
    </section>
  `);

  assert.equal(
    page.snapshot(),
    [
      "- generic:",
      "  - /data-testid: product-card",
      '  - link "Buy now":',
      "    - /url: /buy",
      "    - /data-testid: buy-link"
    ].join("\n")
  );
});

test("scopes a DOM snapshot to one strict locator", () => {
  const page = createSnapshotPage(`
    <nav><a href="/home">Home</a></nav>
    <main data-testid="results">
      <h1>Products</h1>
      <button>Buy</button>
    </main>
  `);

  assert.equal(
    page.snapshot({
      locator: [{ type: "testId", testId: "results" }]
    }),
    [
      "- main:",
      "  - /data-testid: results",
      '  - heading "Products" [level=1]',
      '  - button "Buy"'
    ].join("\n")
  );
});

test("renders semantic hierarchy, values, and states", () => {
  const page = createSnapshotPage(`
    <main>
      <h1>Checkout</h1>
      <ul aria-label="Steps">
        <li>Address</li>
        <li>Payment</li>
      </ul>
      <input aria-label="Email" value="ada@example.com">
      <label><input type="checkbox" checked>Remember me</label>
      <button disabled>Pay</button>
    </main>
  `);

  assert.equal(
    page.snapshot(),
    [
      "- main:",
      '  - heading "Checkout" [level=1]',
      '  - list "Steps":',
      "    - listitem: Address",
      "    - listitem: Payment",
      '  - textbox "Email": ada@example.com',
      '  - checkbox "Remember me" [checked]',
      "  - text: Remember me",
      '  - button "Pay" [disabled]'
    ].join("\n")
  );
});

test("excludes hidden and collapsed content", () => {
  const page = createSnapshotPage(`
    <div style="display: none"><button>CSS hidden</button></div>
    <div aria-hidden="true"><button>ARIA hidden</button></div>
    <details>
      <summary>Summary</summary>
      <button>Collapsed action</button>
    </details>
    <button>Visible</button>
  `);

  assert.equal(
    page.snapshot(),
    ["- group: Summary", '- button "Visible"'].join("\n")
  );
});

test("walks open shadow roots and slots", () => {
  const page = createSnapshotPage(`
    <div id="host">Projected action</div>
  `);
  const host = page.window.document.querySelector("#host");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <nav aria-label="Primary">
      <button><slot></slot></button>
    </nav>
  `;
  Object.defineProperty(host.firstChild, "assignedSlot", {
    value: shadow.querySelector("slot")
  });

  assert.equal(
    page.snapshot(),
    [
      '- navigation "Primary":',
      '  - button "Projected action"'
    ].join("\n")
  );
});

test("includes same-origin iframe content", () => {
  const page = createSnapshotPage(`
    <iframe srcdoc="<h2>Frame title</h2><button>Frame action</button>">
    </iframe>
  `);
  page.window.document.querySelector("iframe")
    .contentDocument.documentElement.style.visibility = "visible";

  assert.equal(
    page.snapshot(),
    [
      "- iframe:",
      '  - heading "Frame title" [level=2]',
      '  - button "Frame action"'
    ].join("\n")
  );
});
