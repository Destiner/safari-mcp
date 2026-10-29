# Everyday Safari MCP — live validation report

> **Update after authorized follow-up (2026-10-29, approximately 16:47–16:55 UTC): Amazon's end-to-end workflow now PASSes using CSS targeting.** Search submission succeeded twice, query results were verified, price-ascending sort was applied and verified, and three product titles/prices/links were read. Exact role/name `button / Go` still reproducibly fails; the API therefore is **not an all-green validation**. See §9 for the additional attempts, likely source-level cause, and cleanup. Sections 1–8 preserve the initial run rather than rewriting its failures as successes.

## 1. Run metadata and overall result

- **Date:** 2026-10-29; browser work approximately 16:23–16:35 UTC.
- **Safari:** 27.0, reported by `browser_status`; Safari supported, Automation available, JavaScript from Apple Events enabled, `issues: []`.
- **Repository commit:** `9cefc9e371a5d0760e4d15c36b6102f5586fdcd6`.
- **Server:** configured MCP server `safari`. The commit identifies the inspected checkout; the named API does not expose an independent running-server build hash.
- **Preparation:** read `README.md` and the complete operating guide at `plugins/safari-browser-use/server/src/documentation.md`; discovered and inspected all 11 everyday named-tool schemas. Read the interaction validator in `server/src/everyday-tools.mjs` to construct a server-side invalid-target test.
- **Window:** user explicitly confirmed Personal window `138652`; no profile was inferred from window order. The original selected tab was recorded in-session and remained selected. Its title, URL, and the browsing inventory are deliberately omitted here.
- **Public X profile:** user explicitly selected `https://x.com/NASA` before navigation.
- **Fixture origin:** `http://127.0.0.1:52330`, assigned using an ephemeral free port. Served only `docs/testing/fixtures/` and bound only to loopback.

**Initial-run overall: FAIL — partial end-to-end coverage.** Amazon search submission failed, so query results, filtering/sorting, and product extraction could not be completed within the one-retry limit. X profile reading, an observed permalink, and return navigation worked. Five distinct public posts were read; two scroll/read rounds produced no additional posts. All 11 requested local-fixture checks passed at the observable tool interface, with an important qualification: missing `window_id` was rejected by the client schema validator, not exercised inside the server.

No implementation code was changed, no bug fixes were attempted, and no commit or push was made.

### Named-tool coverage

**Invoked:** `browser_status`, `list_tabs`, `create_tab`, `page_info`, `get_page_content`, `page_interactions`, `wait_for_navigation`, `navigate_to_url`, `close_tab`, `release_control`.

**Schema inspected but NOT RUN:** `switch_tab`. All temporary tabs stayed in the background; changing focus solely for coverage would have been unnecessary.

Interaction types exercised: `type`, `click`, `keyPress`, `selectMenuItem`, `hover`, and `scroll`.

No `js`, `js_reset`, raw AppleScript, Playwright client, browser JavaScript execution tool, site API replay, or shell-based browser control was used. JavaScript exists only as authored fixture behavior.

## 2. Initial-run per-case results

PASS means the stated observable criterion was met, not merely that a tool returned success. BLOCKED identifies a dependency preventing execution, not necessarily a site restriction.

| ID | Case | Result | Evidence / qualification |
| --- | --- | --- | --- |
| P1 | Connection and prerequisites | PASS | Safari 27.0; all diagnostic booleans true; no issues. |
| P2 | Confirm Personal window and preserve selection | PASS | User confirmation; every successful creation explicitly targeted `138652`, `active:false`; final selection unchanged. |
| A1 | Create Amazon UK background tab | PASS | API-owned, `selected:false`, correct origin and home-page title. |
| A2 | Type search query | PASS | Searchbox and scoped read showed `USB-C cable 2m`. |
| A3 | Submit search | FAIL | Observed `Go` role/name click failed strict matching; single Enter retry reported success but did not navigate or produce results. |
| A4 | Verify query results | BLOCKED | A3 failed; remained on homepage. |
| A5 | Apply non-purchase filter/sort | BLOCKED | No results/filter surface reached; no guessed selector or alternate URL. |
| A6 | Read three product titles, prices, links | BLOCKED | Zero search-result products read; all requested fields missing. |
| A7 | Page metadata and load-state wait | PASS | `page_info` confirmed unchanged homepage; `complete` wait matched. This did not demonstrate search navigation. |
| X1 | Open approved public profile | PASS | Explicit creation and exact-URL complete wait succeeded. |
| X2 | Read at least three posts | PASS | Five distinct public post bodies read from the profile; deduplicated by post ID. |
| X3 | Scroll and check for additional posts | PASS | Two scroll/read rounds; zero new post IDs. Further/infinite loading remains unverified. |
| X4 | Open observed permalink and verify content | PASS | Observed CHAPEA post link clicked; exact URL wait and scoped article read confirmed the same content. |
| X5 | Return via `navigate_to_url` | PASS | Returned to approved profile; exact URL wait and profile description read succeeded. |
| X6 | Auxiliary region CSS root attempt | FAIL | Accessible region name did not resolve as `aria-label`; one retry using an observed `data-testid` succeeded. Locator-construction error, not evidence of a site restriction. |
| L1 | Text entry and actual value | PASS | Textbox and output both showed `safari local check`. |
| L2 | Native select and actual value | PASS | Beta marked selected; output `Selected value: beta`. |
| L3 | Hover-observable text | PASS | `Hover status: idle` → `Hover status: observed`. Synthetic hover, not native pointer/CSS-hover coverage. |
| L4 | Enter updates local status | PASS | `Enter status: received local only`; no form/network submission. |
| L5 | Scroll below initial viewport | PASS | Scroll position `0` → `2368`; bottom visibility observed; bottom marker read. |
| L6 | Delayed content change | PASS | Idle → `Delayed status: complete after 800ms`. |
| L7 | Delayed same-origin navigation and wait | PASS | Click transition, exact destination wait, destination text, and metadata agreed. |
| L8 | Missing `window_id` creates no tab | PASS | Client schema rejection; subsequent all-window listing showed no added tab. Server-side branch NOT RUN. |
| L9 | Invalid later action prevents earlier execution | PASS | Server rejected mixed selector/role target before first click; batch counter stayed zero. Positive control later incremented it to one. |
| L10 | Duplicate-labelled action does not activate either | PASS | Strict-match rejection with `completed:0`; duplicate counter stayed zero. |
| L11 | Nonexistent root fails; rootless retry succeeds | PASS | Clear zero-element error; one rootless retry returned fixture and unchanged state. |
| C1 | Close owned tabs, preserve original tab | PASS | All three created tabs closed successfully; final Personal-window listing matched original handles and selected handle. |
| C2 | Release control and stop owned server | PASS | `released:true`; owned process terminated and local port stopped accepting connections. |

## 3. Amazon UK evidence

### Procedure

1. `create_tab({window_id:"138652", url:"https://www.amazon.co.uk/", active:false})` created a background, API-owned tab, referenced below as **A**.
2. Initial `get_page_content({handle:A})` used **no root**. The relevant observed controls were `search`, searchbox **Search Amazon.co.uk**, and button **Go**.
3. `page_interactions` typed the query into the observed searchbox. A subsequent read scoped to `[role="search"]` showed the exact query value, proving entry rather than relying on `typed:true`.
4. Clicking exact role/name button **Go** returned the strict-locator error recorded in §6. A fresh search-root read still showed the query and button.
5. **Single evidence-based retry:** sent Enter to the observed searchbox. It returned `pressed:true, trusted:false`, but `page_info` still showed `https://www.amazon.co.uk/` and the homepage title. Another search-root read still showed the query, not results.
6. `wait_for_navigation({handle:A, state:"complete", timeout_ms:10000})` returned `{matched:true,state:"complete"}` for the existing homepage. A load-state match alone is not proof of a search transition.
7. Stopped this workflow without trying further clicks, alternate search URLs, direct DOM execution, or guessed filters. Closed A successfully.

### Product evidence

**Distinct query-result products actually read: 0.** Homepage recommendations were not used as substitutes.

| Requested item | Title | Price | Link |
| --- | --- | --- | --- |
| Product 1 | Missing — results not reached | Missing | Missing |
| Product 2 | Missing — results not reached | Missing | Missing |
| Product 3 | Missing — results not reached | Missing | Missing |

No CAPTCHA, login barrier, explicit rate limit, or paywall was observed as the cause. This is an interaction failure/limitation, not a demonstrated site access restriction. No basket, checkout, orders, or account page was opened.

## 4. Twitter/X evidence

### Profile reading and bounded scrolling

1. Created background tab **X** at the user-approved `https://x.com/NASA`, in the confirmed window.
2. An exact expected-URL `complete` wait succeeded. Initial reading used no root.
3. The snapshot exposed the public profile's posts, `data-testid: primaryColumn`, and `data-testid: tweet`. An attempt to scope the named region via `[aria-label="NASA’s posts"]` failed with zero matches. This was an incorrect conversion of an accessible name into a CSS attribute; accessible names do not imply literal `aria-label` attributes.
4. **Single retry:** used the explicitly observed `[data-testid="primaryColumn"]`; it succeeded. Unrelated recommendations and account chrome were excluded from evidence and were not acted upon.
5. Read five distinct public posts. Some long tool responses were display-truncated; the summaries below rely on visible returned post text, not an assumption that hidden/truncated portions had been inspected.
6. Sent scroll `delta_y:1600`, then read the same observed primary-column root. A sticky profile-header control appeared, consistent with scroll movement, but the public post set remained unchanged.
7. Sent scroll `delta_y:2000`, then read again. Still the same five IDs; **zero additional distinct posts**. These were bounded progression checks, not retries of a tool error. No explicit login/rate-limit restriction appeared. Scrolling return values alone do not establish pagination or exact scroll distance on X.

### Minimal public-post evidence

| Post key | Content summary observed |
| --- | --- |
| `2115753332958433574` | Live solar-array spacewalk announcement; scheduled start and approximate duration. |
| `2115538945844850813` | CHAPEA 2 crew's thoughts near the end of a yearlong Mars simulation, promoted through *Houston We Have a Podcast*. |
| `2115129428158087498` | Upcoming October 29 solar-array spacewalk announcement with a Halloween/spacesuit comparison. |
| `2114801524358406570` | Webb view of star formation in N159 in the Large Magellanic Cloud, described as about 161,000 light-years away. |
| `2114484649430798432` | Hunter's Moon/full-moon announcement for October 26 and explanation of the seasonal name. |

The third key was visible in its post's analytics link; no unseen permalink was fabricated or opened for it. **Total distinct posts actually read: 5**, including the pinned post once. Opening the second post again did not increase the count. These are summaries of what the public page displayed, not independently verified astronomy/news claims.

### Permalink and return

- Clicked the observed `a[href="/NASA/status/2115538945844850813"]` with `page_interactions`.
- Tool reported a same-tab transition to `https://x.com/NASA/status/2115538945844850813`.
- `wait_for_navigation` with that exact URL and `state:"complete"` succeeded.
- Read only the matching article using `[data-testid="tweet"]:has(a[href="/NASA/status/2115538945844850813"])`. The Mars/CHAPEA podcast text and associated image description matched the profile post. Replies were not used as evidence.
- Called `navigate_to_url` with the original profile URL. Exact expected-URL wait succeeded; a scoped read of the observed `[data-testid="UserDescription"]` showed the profile description. `page_info` confirmed the URL and background/API-owned status.
- X's returned title remained URL-shaped in metadata; title richness was not used as the success criterion.
- Closed X successfully. No engagement, follow, account, or message controls were activated.

## 5. Controlled fixture evidence

### Fixture design and repeatability

Retained files:

- `docs/testing/fixtures/everyday-api.html`
- `docs/testing/fixtures/everyday-api-destination.html`

The fixture was fully written **before** opening it. It contains accessible labels, visible outputs, a 2,200px spacer, scroll/viewport indicators, counters for side-effect checks, an 800ms delayed content change, and a 1,500ms delayed relative navigation. It has no external script/resource dependencies, analytics, personal data, form submission, or fetch/XHR. CSP disallows connections and form actions. The only navigation is to another local fixture page.

For a repeat run, serve the fixture directory with a loopback-only server using port `0` (an OS-assigned free port), note the selected port, then create a background tab with an explicitly confirmed `window_id`. The port recorded in this report is historical; the server is now stopped.

### Negative checks

- Before creating fixture tab **L**, attempted `create_tab` without `window_id`. Client schema validation rejected it. Comparing listings before/after showed no added tab in either window. This deliberately malformed call is the sole omission of `window_id`; every actual temporary tab creation specified it.
- Created L at `http://127.0.0.1:52330/everyday-api.html`, background/API-owned. Rootless snapshot showed all controls, both counters at zero, and initial viewport indicators.
- Submitted a two-action batch: first click **Increment batch counter**, then a click with both selector and role/name in the target. This passed the exposed structural schema but failed server semantic validation. A fresh snapshot proved `Batch count: 0`; the earlier click had not run.
- Attempted exact button/name **Duplicate action**, which appeared twice in the snapshot. Runtime rejected it with zero completed actions. A fresh snapshot proved `Duplicate count: 0`.
- Read deliberately nonexistent root `[data-testid="deliberately-nonexistent-root"]`. It failed clearly. The one retry without `root` succeeded and showed unchanged counters/state.

### Positive interactions and observed effects

One validated five-action batch performed text entry, select change, hover, text entry into the Enter field, and Enter. All targets were grounded in the current rootless fixture snapshot; option labels explicitly exposed their intended native values.

| Action | Input | Verified page evidence |
| --- | --- | --- |
| `type` on textbox **Harmless text** | `safari local check` | Textbox value and `Text value: safari local check`. |
| `selectMenuItem` on **Test choice** | `beta` | Beta selected; `Selected value: beta`. |
| `hover` on **Hover target** | — | `Hover status: observed`. |
| `type`, then `keyPress:Enter` on **Enter command** | `local only` | Textbox value and `Enter status: received local only`. |

Subsequent actions were each followed by a page-content read:

- **Scroll:** requested `delta_y:3500`. Actual observable position became `2368` (page boundary clamping), and `Bottom visibility: observed in viewport` appeared with `Bottom marker: cobalt lighthouse.` Initially the marker was already present in the ARIA snapshot despite being below the viewport; the separate viewport indicator is what proves the scroll exposed it.
- **Delayed content:** clicked **Change content after delay**. Next read showed `Delayed status: complete after 800ms`, not merely a successful click return. The intermediate pending state and precise elapsed duration were not sampled.
- **Batch positive control:** clicked **Increment batch counter** alone. Next read showed `Batch count: 1`, while `Duplicate count: 0` remained unchanged. This demonstrates that the earlier zero was not simply a nonfunctional button. Clicks also scrolled their targets into view, reflected in position changes to `116` and later `296`; these were local, non-destructive side effects.
- **Delayed navigation:** clicked **Navigate after delay**. The click reported a same-tab transition to `http://127.0.0.1:52330/everyday-api-destination.html`. Explicit exact-URL `complete` wait with `timeout_ms:10000` succeeded. Rootless destination read showed **Delayed navigation destination** and `Navigation result: arrived at the same-origin destination.` `page_info` agreed on URL/title and confirmed `selected:false`, `created_by_api:true`.

The delayed navigation had already completed by the time the click returned. This exercises successful `wait_for_navigation` after a delayed page action, but **does not establish behavior while navigation is still pending**, a timeout branch, or late asynchronous handle recovery.

The local HTTP access log contained exactly two successful GETs: the initial fixture and destination. There was no request from Enter or the other local controls. No network-inspection browser tool was used; this corroboration came from the test-owned server log and fixture design.

## 6. Exact errors, arguments, retries, and side effects

Handles below are aliases for the recorded task-owned handles: **A** = Amazon, **X** = X, **L** = local fixture. This preserves the meaningful arguments without publishing opaque session handles. No sensitive argument values are included.

### E1 — Amazon search click

Tool: `page_interactions`

```json
{"handle":"A","actions":[{"type":"click","target":{"role":"button","name":"Go"}}]}
```

Exact result:

```json
{"ok":false,"completed":0,"failed_index":0,"results":[],"error":"strict_locator: expected exactly one element"}
```

**Partial effects:** the query typed in the earlier successful call remained; this failed batch reported no completed action. Homepage/search field remained unchanged. The error does not disclose whether there were zero or multiple matches.

**One retry, after a fresh scoped read:**

```json
{"handle":"A","actions":[{"type":"keyPress","target":{"role":"searchbox","name":"Search Amazon.co.uk"},"key":"Enter"}]}
```

Returned `ok:true`, `completed:1`, result `{pressed:true,trusted:false}`. **Semantic failure:** no search navigation/results followed; URL remained the homepage. No further submission retry.

### E2 — X region scoping

Tool: `get_page_content`

```json
{"handle":"X","root":"[aria-label=\"NASA’s posts\"]"}
```

Exact error:

```text
strict mode violation: locator resolved to 0 elements
```

**Partial effects:** none observed; read-only operation. **One retry:** `{"handle":"X","root":"[data-testid=\"primaryColumn\"]"}` succeeded. Treat as a test locator-construction mistake; the snapshot supplied an accessible name, not proof of its DOM attribute source.

### E3 — Missing window ID (expected rejection)

Tool: `create_tab`

```json
{"url":"http://127.0.0.1:52330/everyday-api.html","active":false}
```

Exact client error:

```text
Validation failed for tool "mcp__safari__create_tab":
  - window_id: must have required properties window_id

Received arguments:
{
  "url": "http://127.0.0.1:52330/everyday-api.html",
  "active": false
}
```

**Partial effects:** no new tab, verified by listing. **Retry:** none for the negative test. A later valid creation was the setup for the remaining fixture cases. The malformed call did not reach the server; server-side validation remains a coverage gap.

### E4 — Invalid later batch action (expected rejection)

Tool: `page_interactions`

```json
{"handle":"L","actions":[
  {"type":"click","target":{"role":"button","name":"Increment batch counter"}},
  {"type":"click","target":{"selector":"[data-testid=\"fixture-main\"]","role":"button","name":"Increment batch counter"}}
]}
```

Exact error:

```text
invalid_arguments: target requires selector OR role and name
```

**Partial effects:** none observed; `Batch count: 0` after rejection. **Retry:** none. A later separate positive control incremented the counter, as documented above.

### E5 — Ambiguous duplicate label (expected rejection)

Tool: `page_interactions`

```json
{"handle":"L","actions":[{"type":"click","target":{"role":"button","name":"Duplicate action"}}]}
```

Exact result:

```json
{"ok":false,"completed":0,"failed_index":0,"results":[],"error":"strict_locator: expected exactly one element"}
```

**Partial effects:** neither handler activated; `Duplicate count: 0` in the post-action read. **Retry:** none; ambiguity was intentional.

### E6 — Nonexistent root (expected rejection)

Tool: `get_page_content`

```json
{"handle":"L","root":"[data-testid=\"deliberately-nonexistent-root\"]"}
```

Exact error:

```text
strict mode violation: locator resolved to 0 elements
```

**Partial effects:** none observed. **One retry:** `{"handle":"L"}` succeeded, returning the fixture and unchanged state.

## 7. Restrictions, suspected implementation issues, and gaps

### Site restrictions

- Neither site presented an explicit CAPTCHA, paywall, login barrier, or rate-limit message during tested steps. No manual login was requested or performed.
- Amazon's workflow was blocked by unsuccessful interaction, not an observed site access barrier.
- X exposed no new posts after two scrolls. The cause is **undetermined**: background rendering/virtualization, scroll behavior, or site loading could be involved. Do not label it a confirmed rate limit or confirmed implementation defect.

### Suspected implementation limitations

1. **Amazon snapshot/role-locator mismatch:** snapshot showed a search **Go** button, but exact role/name targeting failed strict matching. Hidden duplicates, zero matches, or role/name resolution differences require investigation; this run cannot distinguish them.
2. **Synthetic Enter is not proof of form submission:** `pressed:true` correctly reports event dispatch, but did not submit Amazon's search. The local event-handler fixture did respond to Enter. This distinguishes dispatch support from trusted browser-default behavior.
3. **Diagnostics lack match count:** the named strict-locator error says only “expected exactly one,” obscuring zero versus multiple matches on real sites.
4. **Privacy and output size:** required initial rootless reads returned broad page snapshots, including incidental account chrome/personalized sections; long responses were display-truncated. Those sections were not used as evidence, revisited for private details, or copied into this report. Subsequent reads used observed roots where possible. A strict no-incidental-private-content guarantee is not provided by this API's rootless snapshot contract.

### Coverage gaps and recommended follow-ups

- Reproduce the Amazon **Go** role/name issue in a separate authorized engineering run; compare snapshot semantics with locator matching and include match counts in errors. Do not claim a confirmed root cause from this run.
- After that issue is addressed or an observed working locator is established in a new run, repeat search-result verification, one filter/sort, and three product title/price/link reads. None was validated here.
- Test missing `window_id` directly at the server boundary in automated tests; this live client prevented the call from reaching it. Do not bypass client validation in this run.
- Extend controlled navigation coverage to a delay exceeding click transition observation, exact-URL timeout behavior, and pending navigation/handle recovery.
- Add bounded, privacy-preserving snapshot output or role/name root scoping, with explicit truncation and viewport information. Do not assume accessible names map to literal CSS attributes.
- Investigate X additional-post loading separately if deeper timeline coverage is needed. Five distinct posts were read here, not the entire timeline. ARIA presence is not proof that all five were simultaneously within the viewport.
- Native hover/CSS `:hover`, trusted-key default actions, switch/restore focus behavior, selected-tab closure refusal, runtime partial-batch rollback behavior, and stale-handle recovery were not tested. Invalid-batch prevalidation and zero-completed-action failures were tested; no rollback claim is made.
- No implementation build or automated suite was run: this was a live validation-only task with new static fixture/report files, not an implementation change. Handoff checks passed: fixture HTML label references/unique IDs, absence of external `src`/`href` resources, inline-script syntax via `node --check` (no execution), report fence balance, referenced fixture existence, and `git diff --check`. The tracked implementation diff remained empty.

## 8. Cleanup and retained resources

- **Amazon, X, and fixture tabs:** each closed via its original known API-owned handle, with `{closed:true}`. No stale or ownership-ambiguous task handle occurred; no `allow_existing:true` was used.
- **User tabs:** no existing tab was navigated, reloaded, inspected for page content, or closed. Initial/final listing metadata was used only for targeting, selection, and absence checks.
- **Selection:** final Personal-window listing showed the original selected handle still selected and the original handles present. No `switch_tab` was needed or used. Frontmost application/window state is not exposed by the named API and was not independently measured.
- **Control:** `release_control({})` returned `{released:true}` after all browser work.
- **HTTP server:** only the process launched for this run was terminated, after checking its command identity. Its port no longer accepted connections.
- **Resources left open by this task:** no browser tabs or listening HTTP server. The report and two fixture files remain for repeatability. Small local server PID/port/log files remain in an OS temporary directory; no raw snapshots were added to the repository. The harness may retain its own transcript/tool-output temporary files.
- **Repository:** implementation files left untouched; only this report and fixture files added. No commit or push.

## 9. Authorized Amazon follow-up

### Scope and revised result

The user explicitly authorized a few more attempts and additional data collection after discussing the first run's overly limited locator strategy. This extends the original retry budget for this follow-up only. All other safety constraints stayed in effect: named Safari tools only, background task-owned tab, no implementation changes, no purchase/account/engagement actions.

- **Date/time:** 2026-10-29, approximately 16:47–16:55 UTC.
- **Commit:** unchanged, `9cefc9e371a5d0760e4d15c36b6102f5586fdcd6`.
- `browser_status` again reported Safari 27.0 with all prerequisites available and no issues.
- `list_tabs({window_id:"138652"})` confirmed the previously user-approved window still existed with the same original selected handle. No new profile inference was made.
- Created one new background/API-owned Amazon tab with `window_id:"138652"`, `active:false`. Its handle is aliased **A2** below.
- No local server was restarted; X and the fixture were not retested.

**Revised Amazon workflow: PASS with a demonstrated CSS workaround.** The exact role/name locator remains a reproduced failure and the synthetic Enter limitation from the first run remains unresolved. The original statement that Amazon could not be completed describes only the first run, not the API's overall capability.

| Follow-up case | Result | Evidence |
| --- | --- | --- |
| Enter query using page field | PASS | Scoped snapshot showed `USB-C cable 2m`. |
| Search submission, scoped CSS button candidates | PASS | Unique preflight read showed Go; click navigated; results heading matched query. |
| Apply price-ascending sort | PASS | Opened observed sort combobox; clicked observed option; selected state and URL agreed. |
| Read three product title/price/link records | PASS | Three complete records read from results; see below. |
| Reproduce exact `button / Go` failure | FAIL | Same strict-locator error with zero completed actions. |
| Search submission, precise submit-input CSS | PASS | Unique preflight read showed Go; click navigated; results heading matched query again. |
| Auxiliary read-root selection | FAIL | Several scoping attempts failed or were ambiguous; corrected reads succeeded, all errors below. |
| Cleanup | PASS | New task tab closed; original selection preserved; control released. |

### Three additional search-action attempts

Initial reading again used **no root**. The snapshot showed the search landmark, searchbox, and Go button. A CSS preflight read combined the observed search landmark with standard DOM representations of button semantics; no Amazon class/ID was guessed:

```css
[role="search"] :is(button, [role="button"], input[type="submit"], input[type="button"], input[type="image"])
```

`get_page_content` with this root succeeded and returned exactly `button "Go"`. Because the root read itself requires one element, this established a unique target before clicking.

1. **Scoped CSS click — PASS.** Typed `USB-C cable 2m` through the named `type` action on exact role/name searchbox **Search Amazon.co.uk**; scoped search read verified the value. Clicked the preflighted CSS selector above. Returned `ok:true`, `completed:1`, same-tab transition to `https://www.amazon.co.uk/s/ref=nb_sb_noss_1`. A `complete` wait succeeded, and a fresh snapshot showed `1-16 of over 3,000 results for "USB-C cable 2m"`.
2. **Exact role/name reproduction — FAIL.** After sorting and product reading, tried `{role:"button",name:"Go"}` once more. Returned the same error as the original run, `completed:0`. A precise CSS read before and after the failed click still resolved the Go control. No search transition or other page action was observed from this failure.
3. **Precise submit-input CSS — PASS.** Used the successfully preflighted `[role="search"] input[type="submit"][value="Go"]` in a named click action. Returned `ok:true`, `completed:1`, same-tab transition to `https://www.amazon.co.uk/s/ref=nb_sb_noss`. `complete` wait and a scoped results-heading read verified the same query. This second search restored **Featured** sort, an observed benign side effect of resubmitting the query.

These are two successful search submissions using different CSS scopes and one reproduced role/name failure, not repeated blind clicks. No search URL was manually constructed or navigated to as a substitute for submission.

### Sort and result verification

Following the first successful submission:

- Clicked exact role/name combobox **Sort by:** using `page_interactions`.
- An initial heading-root read failed due to two matches; a narrower heading-with-select read returned an empty snapshot while the dropdown was open. A fresh rootless read then exposed only a dialog and listbox with the actual sort options.
- Clicked exact role/name option **Price: Low to high**. It returned a same-tab navigation; the resulting URL included `s=price-asc-rank` (tracking parameters omitted here).
- After a complete-state wait, root `:is(h1, [role="heading"][aria-level="1"]):has(select)` showed **Price: Low to high [selected]** and `1-16 of over 4,000 results for "USB-C cable 2m"`.
- `page_info` showed title **Amazon.co.uk: USB-C Cable 2m**, the search/sort URL, `selected:false`, and `created_by_api:true`.
- The change in Amazon's displayed approximate count from 3,000 to 4,000 was observed, not reconciled or treated as an exact result count.

### Three public product records

Read from the first three non-sponsored result records exposed after sorting. Prices are **exactly as displayed**, not independently verified offers or purchase recommendations. Links below preserve the observed product path while removing `/ref=...` and query tracking; these cleaned links were not separately navigated to. All requested title/price/link fields were present.

| Visible title | Displayed item price | Observed product link, tracking removed |
| --- | --- | --- |
| USB-C to USB-C Cable compatible with iPhone 15, 2m Nylon | £0.05 | [Product](https://www.amazon.co.uk/USB-C-Cable-compatible-iPhone-Nylon/dp/B0H6RF99D3) |
| 7A 100W Type C USB Cable Super-Fast Charge Cable SuitableUSB to USB C Fast Charging Cable USB Type C Data Cable USB Charger Cables Data Cord Usb3 Extension Cable Compatible phones. (Type-C-7A-2m) | £0.99 | [Product](https://www.amazon.co.uk/Super-Fast-SuitableUSB-Extension-Compatible-Type-C-7A-2m/dp/B0DJR4LVTN) |
| Portable USB C to Type-C Charging Cable 60W, White 2M | £1.79 | [Product](https://www.amazon.co.uk/FANGZESHI-Portable-Type-C-Charging-Cable/dp/B0HHSBZTNL) |

These are item prices, **not delivered totals**. No delivery destination, account information, or personalized delivery text is retained here. ARIA-readable content was verified; pixel visibility of all three items simultaneously was not independently measured. No product, basket, order, or checkout page was opened.

The first product's observed link grounded subsequent scoping. Reading its list item succeeded with:

```css
:is(li, [role~="listitem"]):has(a[href*="B0H6RF99D3"])
```

A corrected, structural parent root then returned the results area, with the first three complete product records visible in the returned output:

```css
*:has(> :is(li, [role~="listitem"]) a[href*="B0H6RF99D3"])
```

This avoided per-product exploratory loops and did not assume that a semantic ARIA `list` had a corresponding literal DOM list wrapper. Large snapshots still exceeded inline output limits; only actually returned/read records are claimed.

### Stronger diagnosis of the Go mismatch

**Live evidence:** `[role="search"] input[type="submit"][value="Go"]` resolved uniquely and produced snapshot `button "Go"`; it could be clicked successfully. Exact role/name `button / Go` failed reproducibly.

**Read-only source evidence:**

- `plugins/safari-browser-use/server/src/page-runtime.mjs`: `implicitRole()` recognizes submit inputs as buttons. Its separate `accessibleName()` checks ARIA labels, associated labels, alt/title/placeholder, and finally `textContent`, but **does not use the submit input's `value`**.
- The same file's `domSnapshot()` delegates to `dependencies.ariaSnapshot`, rather than using that simplified locator-name implementation.
- `third_party/playwright/packages/injected/src/roleUtils.ts`: the snapshot-side name computation explicitly uses `.value` for input types `button`, `submit`, and `reset`.

**Conclusion:** the source contains a real naming-rule discrepancy, and the live Amazon control is exactly the input/value shape affected by it. This is a strong, source-supported explanation for the observed snapshot/locator mismatch, rather than evidence that Amazon rejects clicks. The named error still does not expose the actual role-locator count or computed name, so those internal values were not directly measured. Running-server build identity is also not independently exposed.

Recommended fix in a separate implementation task: share consistent accessible-name/role computation between snapshots and locators, and add submit/reset/button-input parity tests plus match-count diagnostics. No implementation or test code was changed during this follow-up.

### Exact follow-up errors and partial effects

All `get_page_content` calls below used `handle:A2`. The table gives the exact `root` argument and exact returned error. These were read-only probes: no page mutation/navigation was observed from any failed read.

| ID | Tool and exact root | Exact error | Next evidence-based step |
| --- | --- | --- | --- |
| F1 | `get_page_content`, `:is(h1, [role="heading"][aria-level="1"])` | `strict mode violation: locator resolved to 2 elements` | Narrowed to heading containing select. It returned an empty snapshot while dropdown was open; rootless read exposed the actual listbox. |
| F2 | `get_page_content`, `:is(ul, ol, [role="list"]):has(a[href*="/dp/B0H6RF99D3/"])` | `strict mode violation: locator resolved to 0 elements` | Checked metadata, then loosened only the product-link substring. |
| F3 | `get_page_content`, `:is(ul, ol, [role="list"]):has(a[href*="B0H6RF99D3"])` | `strict mode violation: locator resolved to 0 elements` | Isolated the observed product links to distinguish link matching from list-wrapper assumptions. |
| F4 | `get_page_content`, `a[href*="B0H6RF99D3"]` | `strict mode violation: locator resolved to 3 elements` | Scoped to the observed list-item containing those links; succeeded. No positional `.first()` workaround. |
| F5 | `get_page_content`, `*:has(> :is(li, [role~="listitem"]):has(a[href*="B0H6RF99D3"]))` | `'*:has(> :is(li, [role~="listitem"]):has(a[href*="B0H6RF99D3"]))' is not a valid selector.` | Removed unsupported nested `:has()` by flattening to the parent selector shown above; succeeded. Test selector error, not an Amazon restriction. |

**F6 — reproduced action failure:**

Tool: `page_interactions`

```json
{"handle":"A2","actions":[{"type":"click","target":{"role":"button","name":"Go"}}]}
```

Exact result:

```json
{"ok":false,"completed":0,"failed_index":0,"results":[],"error":"strict_locator: expected exactly one element"}
```

No completed action or observed transition. After a fresh unique read, the successful retry was:

```json
{"handle":"A2","actions":[{"type":"click","target":{"selector":"[role=\"search\"] input[type=\"submit\"][value=\"Go\"]"}}]}
```

It navigated and produced matching results; it also reset the prior sort to Featured, as noted above.

One attempt to read the harness's stored, already-returned snapshot file could not expose its oversized single line: `Line 1 is 114.0KB, exceeds 50.0KB limit.` No shell extraction workaround was used. Collection continued through scoped named Safari reads instead. This was a file-output size limitation, not a browser failure.

### Follow-up cleanup and remaining gaps

- Closed A2 using its original API-owned handle: `{closed:true}`.
- Final `list_tabs({window_id:"138652"})` showed the original handle set and original selected handle, unchanged.
- Called `release_control`: `{released:true}`.
- No browser tab, local server, or other active resource left open by this follow-up. No commit or push.
- Initial Amazon results/filter/product coverage gaps are now filled at the ARIA/tool level. Remaining concerns are locator/snapshot semantic parity, snapshot size/scoping ergonomics, and the limitations already recorded for X, client-side validation, viewport proof, and delayed waits.
- This follow-up supersedes the initial recommendation to establish a working Amazon locator: one is now demonstrated twice. It does **not** erase the exact role/name failure or claim the API is fully validated.
