// Kept import-free: the build embeds this module in the JXA runtime.
export function everydayToolDefinitions() {
  const string = { type: "string", minLength: 1, maxLength: 4096 };
  const boolean = { type: "boolean" };
  const windowId = { type: "string", pattern: "^[1-9][0-9]*$", maxLength: 20 };
  const handle = { type: "string", minLength: 1, maxLength: 120 };
  const url = { ...string, format: "http-url" };
  const object = (properties, required = []) => ({
    type: "object", properties, required, additionalProperties: false
  });
  const target = object({ selector: string, role: string, name: string });
  const action = (type, properties, required) => object({
    type: { type: "string", enum: [type] }, ...properties
  }, ["type", ...required]);
  const actions = [
    action("click", { target }, ["target"]),
    action("type", { target, text: { type: "string", maxLength: 10000 } }, ["target", "text"]),
    action("keyPress", { target, key: { ...string, enum: ["Enter", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] } }, ["target", "key"]),
    action("hover", { target }, ["target"]),
    action("selectMenuItem", { target, value: string }, ["target", "value"]),
    action("scroll", { delta_x: { type: "number", minimum: -10000, maximum: 10000 }, delta_y: { type: "number", minimum: -10000, maximum: 10000 } }, ["delta_y"])
  ];
  const page = properties => ({ handle, ...properties });
  return [
    ["browser_status", "Diagnose Safari Apple Events and page scripting support.", object({}), true],
    ["list_tabs", "List tabs with session handles, window IDs and selected state. Read failures are errors, not an empty list.", object({ window_id: windowId }), true],
    ["create_tab", "Create a tab in an explicit window; background unless active is true. Does not enable WebMCP recording.", object({ window_id: windowId, url, active: boolean }, ["window_id"]), false],
    ["switch_tab", "Select a handled tab and bring its Safari window forward.", object(page({}), ["handle"]), false],
    ["close_tab", "Close a non-selected API-created tab. Existing tabs require allow_existing. Selected tabs are never closed.", object(page({ allow_existing: boolean }), ["handle"]), false],
    ["navigate_to_url", "Navigate an explicitly handled tab to an HTTP(S) URL.", object(page({ url }), ["handle", "url"]), false],
    ["page_info", "Read the handled tab's title, URL, window and selected state.", object(page({}), ["handle"]), true],
    ["get_page_content", "Return a Playwright ARIA snapshot, optionally scoped to a CSS root; not HTML or Markdown.", object(page({ root: string }), ["handle"]), true],
    ["page_interactions", "Run 1–20 validated actions in order; targeted actions require one unique CSS or exact role/name match. Type appends text; scroll uses page offsets; hover and keys are synthetic DOM events. Runtime failures report partial progress without retries.", object(page({ actions: { type: "array", minItems: 1, maxItems: 20, items: { oneOf: actions } } }), ["handle", "actions"]), false],
    ["wait_for_navigation", "Wait for interactive/complete load state, optionally an exact expected HTTP(S) URL. No implicit page.", object(page({ state: { type: "string", enum: ["interactive", "complete"] }, expected_url: url, timeout_ms: { type: "integer", minimum: 1, maximum: 30000 } }), ["handle"]), true],
    ["release_control", "Release the browser control indicator and recorders; keeps session handles.", object({}), false]
  ].map(([name, description, inputSchema, readOnlyHint]) => ({ name, description, inputSchema, annotations: { readOnlyHint } }));
}

export function validateEverydayValue(value, schema, path = "arguments") {
  const fail = () => { throw new Error("invalid_arguments: " + path); };
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(candidate => {
      try { validateEverydayValue(value, candidate, path); return true; } catch (_) { return false; }
    });
    if (matches.length !== 1) fail();
    return;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail();
    if (Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(schema.properties, key))) fail();
    if ((schema.required || []).some(key => !Object.prototype.hasOwnProperty.call(value, key))) fail();
    for (const key of Object.keys(value)) validateEverydayValue(value[key], schema.properties[key], path + "." + key);
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail();
    value.forEach((item, index) => validateEverydayValue(item, schema.items, path + "[" + index + "]"));
  } else {
    if (schema.type === "integer" ? !Number.isInteger(value) : typeof value !== schema.type) fail();
    if (typeof value === "number" && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) fail();
    if (typeof value === "string") {
      if (value.length < (schema.minLength || 0) || value.length > (schema.maxLength || Infinity)) fail();
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail();
      // No credentials, whitespace, empty hosts or script schemes. JXA has no URL global.
      if (schema.format === "http-url") {
        if (!/^https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?(?:[/?#][^\s\\]*)?$/i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) fail();
        const port = /^https?:\/\/(?:\[[^\]]+\]|[^/:?#]+):([0-9]+)/i.exec(value);
        if (port && Number(port[1]) > 65535) fail();
      }
    }
    if (schema.enum && !schema.enum.includes(value)) fail();
  }
}

export function createEverydayTools(adapter) {
  const definitions = everydayToolDefinitions();
  let entries = [];
  let next = 0;
  // Unique across reset and reconnect; the coordinates never form part of a handle.
  const session = adapter.sessionId || (Date.now().toString(36) + Math.random().toString(36).slice(2));
  const windowOf = tab => String(tab.id).split(":")[0];
  function invalidate(entry, message) {
    entry.valid = false;
    throw new Error("stale_tab_handle: " + message);
  }
  // Apple Events exposes coordinates, not immutable IDs. Never follow a URL to another
  // coordinate; an indistinguishable replacement at the same coordinate is undetectable.
  const topology = (identity, tabs) => tabs.filter(tab => windowOf(tab) === identity.windowId).map(tab => ({
    id: String(tab.id), url: String(tab.url || ""), title: String(tab.title || "")
  }));
  function resolve(entry, tabs, expectedUrl, navigationWait = false) {
    if (!entry || !entry.valid) throw new Error("stale_tab_handle: unknown or invalid handle");
    const identity = entry.identity;
    const metadata = tabs.find(tab => String(tab.id) === identity.id);
    const current = topology(identity, tabs);
    const previous = identity.everydayTopology;
    const consistent = previous && current.length === previous.length && current.every((tab, index) =>
      tab.id === previous[index].id && (tab.id === identity.id ||
        tab.url === previous[index].url && tab.title === previous[index].title));
    const unchanged = metadata && String(metadata.url || "") === identity.url && String(metadata.title || "") === identity.title;
    if (!metadata || (!unchanged && !((expectedUrl && String(metadata.url || "") === expectedUrl || identity.everydayNavigating) && consistent)) ||
        (navigationWait && !consistent)) {
      invalidate(entry, "coordinate, fingerprint or navigation topology changed; relist tabs (index shifts may invalidate handles)");
    }
    Object.assign(identity, { title: String(metadata.title || ""), url: String(metadata.url || ""), everydayTopology: current });
    return metadata;
  }
  function add(metadata, created) {
    const page = adapter.makeTab(metadata);
    page._identity.everyday = true;
    const entry = { handle: "tab_" + session + "_" + (++next), identity: page._identity, page, created, valid: true };
    entries.push(entry);
    return entry;
  }
  function describe(entry, metadata) {
    return { handle: entry.handle, window_id: windowOf(metadata), title: metadata.title, url: metadata.url, selected: metadata.selected, created_by_api: entry.created };
  }
  function locator(page, target) {
    return target.selector !== undefined ? page.playwright.locator(target.selector) : page.playwright.getByRole(target.role, { name: target.name, exact: true });
  }
  function validateTarget(target) {
    if (!target) return;
    const css = typeof target.selector === "string";
    if (css ? target.role !== undefined || target.name !== undefined : typeof target.role !== "string" || typeof target.name !== "string") {
      throw new Error("invalid_arguments: target requires selector OR role and name");
    }
  }
  function call(name, args) {
    const definition = definitions.find(tool => tool.name === name);
    if (!definition) throw new Error("Unknown tool: " + name);
    validateEverydayValue(args, definition.inputSchema);
    if (args.actions) args.actions.forEach(action => validateTarget(action.target));
    // Validation is deliberately outside the try: invalid calls must not touch Safari, even to release it.
    try {
      if (adapter.beginOperation) adapter.beginOperation();
      if (name === "browser_status") return adapter.doctor();
      if (name === "release_control") return adapter.release();
      if (name === "list_tabs") {
        const tabs = adapter.listTabs();
        for (const entry of entries.filter(item => item.valid)) {
          try { resolve(entry, tabs); } catch (_) { /* Invalid entries stay invalid. */ }
        }
        return { tabs: tabs.filter(tab => !args.window_id || windowOf(tab) === args.window_id).map(metadata => {
          let entry = entries.find(item => item.valid && item.identity.id === String(metadata.id));
          if (!entry) entry = add(metadata, false);
          entry.identity.everydayTopology = topology(entry.identity, tabs);
          return describe(entry, metadata);
        }) };
      }
      if (name === "create_tab") {
        const metadata = adapter.openTab({ windowId: args.window_id, active: args.active === true });
        const entry = add(metadata, true);
        try {
          entry.identity.everydayTopology = topology(entry.identity, adapter.listTabs());
          if (args.url) entry.page.goto(args.url);
          return { ...describe(entry, resolve(entry, adapter.listTabs())), created: true };
        } catch (error) {
          // Creation already happened. Never hide its handle behind a thrown navigation error.
          let latest = metadata;
          try { latest = resolve(entry, adapter.listTabs()); } catch (_) { /* Keep the handle, even if now stale. */ }
          entry.identity.everydayNavigating = false;
          try { adapter.release(); } catch (_) { /* Preserve the creation result. */ }
          return { ...describe(entry, latest), created: true, ok: false, error: error.message || String(error) };
        }
      }
      const entry = entries.find(item => item.handle === args.handle);
      const metadata = resolve(entry, adapter.listTabs(), name === "wait_for_navigation" ? args.expected_url : undefined, name === "wait_for_navigation");
      if (name === "page_info") return describe(entry, metadata);
      if (name === "switch_tab") { adapter.switchTab(metadata); return { switched: true, handle: entry.handle }; }
      if (name === "close_tab") {
        if (!entry.created && args.allow_existing !== true) throw new Error("close_refused: existing tab requires allow_existing:true");
        if (metadata.selected !== false) throw new Error("close_refused: selected tab or unknown selected state");
        entry.page.close(); entry.valid = false; return { closed: true };
      }
      if (name === "navigate_to_url") { entry.page.goto(args.url); return describe(entry, resolve(entry, adapter.listTabs())); }
      if (name === "get_page_content") return { format: "aria", snapshot: entry.page.playwright.domSnapshot({ root: args.root }) };
      if (name === "wait_for_navigation") {
        const options = { state: args.state || "complete", timeoutMs: args.timeout_ms || 10000 };
        try {
          if (args.expected_url) {
            entry.page.playwright.waitForURL(args.expected_url, { exact: true, timeoutMs: options.timeoutMs });
            entry.identity.everydayExpectedUrl = args.expected_url;
          }
          return entry.page.playwright.waitForLoadState(options);
        } finally {
          delete entry.identity.everydayExpectedUrl;
        }
      }
      const results = [];
      for (let index = 0; index < args.actions.length; index++) {
        try {
          resolve(entry, adapter.listTabs());
          const action = args.actions[index];
          const target = action.target && locator(entry.page, action.target);
          if (target) {
            const count = target.count();
            if (count !== 1) {
              throw new Error(
                "strict_locator: expected exactly one element; resolved to " + count + " elements"
              );
            }
          }
          let result;
          if (action.type === "click") result = target.click();
          if (action.type === "type") result = target.type(action.text);
          if (action.type === "keyPress") result = target.press(action.key);
          if (action.type === "hover") result = target.hover();
          if (action.type === "selectMenuItem") result = target.selectOption(action.value);
          if (action.type === "scroll") result = entry.page.playwright.scrollBy(action.delta_x || 0, action.delta_y);
          results.push({ index, result });
        } catch (error) {
          try { adapter.release(); } catch (_) { /* Preserve the action error. */ }
          return { ok: false, completed: results.length, failed_index: index, results, error: error.message || String(error) };
        }
      }
      return { ok: true, completed: results.length, results };
    } catch (error) {
      for (const entry of entries) entry.identity.everydayNavigating = false;
      try { adapter.release(); } catch (_) { /* Preserve the operation error. */ }
      throw error;
    }
  }
  return { definitions, call, reset() { entries = []; } };
}
