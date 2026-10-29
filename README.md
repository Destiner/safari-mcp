# Safari MCP

**Control your existing Safari tabs and signed-in sessions with AI agents — no browser extension or companion app required.**

[![macOS](https://img.shields.io/badge/macOS-required-black)](https://www.apple.com/macos/)
[![Safari](https://img.shields.io/badge/Safari-27%20experimental-blue)](https://www.apple.com/safari/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Destiner/safari-mcp)](https://github.com/Destiner/safari-mcp)

An independent fork of [Safari Browser Use](https://github.com/citrolabs/safari-browser-use)
by CitroLabs. This is **not Apple's native Safari MCP server**.

## Overview

Safari MCP gives MCP-compatible agents, including **pi, Codex, and Claude Code**,
control of the Safari tabs you already have open. It preserves your current
sessions and logins, with named tools for everyday browsing and a synchronous
JavaScript REPL as an escape hatch.

It connects through the Apple Events support built into macOS.
Plugin mode does not require Node.js, npm, a Safari extension, a companion app,
Xcode, or an Apple Developer certificate. The Skill-only mode uses the Node.js
runtime available to the agent to preserve its script session between calls.

> [!NOTE]
> **Fork: experimental Safari 27 support.** This fork of
> [citrolabs/safari-browser-use](https://github.com/citrolabs/safari-browser-use)
> permits Safari 27 to keep using Apple Events and existing signed-in tabs.
> Reading an existing tab, navigating a new tab in a specific window, and
> retaining a website login across bridge restarts were verified on Safari 27.0.
> Amazon, X, and controlled fixture results are documented in the
> [live test report](docs/testing/everyday-api-live-report.md), including known
> limitations and workarounds. Safari 28+ remains blocked.
>
> Apple's native `safaridriver --mcp` is a separate option, but in our Safari 27.0
> test it used a separate login session that did not survive a server restart.
>
> The installation commands below are upstream instructions. To use this fork
> with pi, clone `Destiner/safari-mcp` and register its bundled server:
>
> ```sh
> pi mcp add safari --exposure deferred -- /usr/bin/osascript -l JavaScript "$PWD/plugins/safari-browser-use/dist/safari-repl.jxa.js"
> ```
>
> Run that command from this checkout, then use `/reload` in pi. No build is
> required for the committed bundle. After source changes, regenerate both
> bundled runtimes and run the test suite using the scripts in `package.json`.
>
> With multiple profiles, confirm the intended window before browsing and pass
> its `windowId` when creating tabs. Window IDs are not persistent profile names,
> and this bridge does not enforce isolation between profiles.

## Everyday MCP API

Safari MCP exposes an Apple-style everyday API over the existing Safari
session. It is not a drop-in replacement for Apple's native MCP server:

- **Connection:** `browser_status`, `release_control`
- **Tabs:** `list_tabs`, `create_tab`, `switch_tab`, `close_tab`
- **Pages:** `navigate_to_url`, `page_info`, `get_page_content`
- **Actions:** `page_interactions`, `wait_for_navigation`
- **Escape hatch:** the original `js` and `js_reset`

New tabs require an explicit `window_id`; page operations require an opaque
session `handle`. Confirm the intended profile/window instead of assuming that
the current window is Personal or Work. `get_page_content` returns an ARIA
snapshot, not native Safari's Markdown/HTML extraction. Screenshots and network
inspection are not included.

Named tools do not automatically record or probe site APIs. Selected tabs cannot
be closed, and user-owned tabs require explicit permission. Handles fail closed
when tab coordinates or URL/title fingerprints change; relist instead of guessing.
They expire when the connection or REPL resets. Safari does not expose immutable
tab IDs, so indistinguishable replacements cannot be detected.

See the [operating guide](plugins/safari-browser-use/server/src/documentation.md#everyday-mcp-tools)
for schemas, examples, partial-failure behavior, and cleanup rules. The original
plugin/skill REPL interface below remains available.

## Demo

<p align="center">
  <img src="plugins/safari-browser-use/assets/safari-browser-use-demo.png" width="100%" alt="Safari Browser Use controlling an existing Safari tab with a visible perimeter glow and fake cursor"/>
</p>

<p align="center"><em>An AI agent inspecting an existing Safari tab with the visible control indicator enabled.</em></p>

## Upstream plugin installation

The following commands install CitroLabs' original Safari Browser Use, **not
this fork**. For Safari MCP, use the local bundled-server setup above. Internal
`plugins/safari-browser-use` paths and plugin IDs are retained for compatibility.

### 1. Plugin — one-line prompt with client routing

Paste this one-line prompt into a supported agent. It names the concrete route
for each client, so the agent must not assume that every client has the same
plugin installer:

```text
Install Safari Browser Use from https://github.com/citrolabs/safari-browser-use using the current client's plugin installer when supported: use `codex plugin marketplace add` then `codex plugin add` for Codex, `claude plugin marketplace add` then `claude plugin install` for Claude Code, `copilot plugin install citrolabs/safari-browser-use:plugins/safari-browser-use` for GitHub Copilot CLI, `codebuddy plugin marketplace add` then `codebuddy plugin install` for CodeBuddy or WorkBuddy, `qoder plugins marketplace add` then `qoder plugins install safari-browser-use` for Qoder, import this GitHub repository as an Agent Plugin/Power through Kiro's Add Custom Power flow for Kiro, and use the documented local checkout for Cursor; verify the result instead of claiming success. Stop after installation, then tell me whether to reload plugins or start a new session and give me one example request.
```

This is one routing prompt, not one universal shell command. Kiro requires a
user-visible Power import, and Cursor currently uses the local checkout below;
the agent must report those steps rather than claim that a background install
already happened.

### 2. Skill — one-line command

For agents that do not support plugins, install the standalone `control-safari`
Skill:

```sh
npx skills add citrolabs/safari-browser-use --skill control-safari -g
```

Select the target agent when prompted, then start a new agent session. This
installs the script-driven Skill without the MCP plugin.

### Manual plugin commands

<details>
<summary><strong>Codex</strong></summary>

```sh
codex plugin marketplace add citrolabs/safari-browser-use
codex plugin add safari-browser-use@citrolabs
```

Start a new Codex task after installation.

</details>

<details>
<summary><strong>Claude Code</strong></summary>

```sh
claude plugin marketplace add citrolabs/safari-browser-use --scope user
claude plugin install safari-browser-use@citrolabs --scope user
```

Run `/reload-plugins` after installation.

</details>

<details>
<summary><strong>GitHub Copilot CLI</strong></summary>

```sh
copilot plugin install citrolabs/safari-browser-use:plugins/safari-browser-use
```

Start a new Copilot CLI session after installation.

</details>

<details>
<summary><strong>CodeBuddy / WorkBuddy</strong></summary>

```sh
codebuddy plugin marketplace add citrolabs/safari-browser-use
codebuddy plugin install safari-browser-use@citrolabs
```

Run `/reload-plugins` after installation.

</details>

<details>
<summary><strong>Qoder</strong></summary>

```sh
qoder plugins marketplace add citrolabs/safari-browser-use
qoder plugins install safari-browser-use
```

Run `/plugins reload` or start a new Qoder CLI session after installation.

</details>

<details>
<summary><strong>Kiro</strong></summary>

Kiro loads the root Agent Plugins package as a Power. In **Kiro → Powers → Add
Custom Power**, choose **Import power from GitHub** and enter:

```text
https://github.com/citrolabs/safari-browser-use
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Until the plugin is available in Cursor Marketplace, install it from a local
checkout:

```sh
git clone --depth 1 https://github.com/citrolabs/safari-browser-use.git
mkdir -p "$HOME/.cursor/plugins/local"
cp -R safari-browser-use/plugins/safari-browser-use "$HOME/.cursor/plugins/local/"
```

Restart Cursor after installation.

</details>

## First-Time Setup

Before using browser automation, enable JavaScript from Apple Events in Safari.
Safari MCP cannot inspect or interact with web pages while this setting
is disabled.

1. Open **Safari Settings → Advanced**, then enable
   **Show features for web developers**.

<p align="center">
  <img src="plugins/safari-browser-use/assets/safari-setting-1.png" width="820" alt="Enable Show features for web developers in Safari Advanced settings"/>
</p>

2. Open **Safari Settings → Developer → Automation**, then enable
   **Allow JavaScript from Apple Events**.

<p align="center">
  <img src="plugins/safari-browser-use/assets/safari-setting-2.png" width="820" alt="Enable Allow JavaScript from Apple Events in Safari Developer settings"/>
</p>

Safari also asks for macOS Automation permission the first time the plugin
controls it. Approve that request only when you intend to let the current
client automate Safari.

## Quick Start

Open Safari, then ask your agent:

> Use Safari MCP to inspect my current Safari tab and summarize the
> page. Do not click or type anything.

The agent checks the connection, selects the active tab, and reads a structured
DOM snapshot. Variables persist between JavaScript cells until the transport
session is reset.

Selecting or operating a tab adds a non-interactive perimeter glow and visible
fake cursor to the controlled page. They share one control lifecycle: both are
removed with `browser.release()` when the task ends and clear automatically
after 60 seconds without tab activity. Navigation-capable operations restore
the indicator in the new page before the same browser call returns.

## Highlights

| Feature | What it provides |
| --- | --- |
| 🌐 Existing Safari session | Work with your open tabs, cookies, and signed-in state |
| ⚡ Persistent synchronous REPL | Reuse variables and browser state across tool calls |
| 🎭 Playwright-style API | Locate elements by role, label, text, test ID, or attribute |
| 📡 Site API Tools (WebMCP) | Task tabs learn the page's JSON APIs automatically, rank them by the data they return, point out which endpoint backs the visible list, and publish read endpoints as tools |
| ✨ Visible control indicator | See a perimeter glow and fake cursor while AI control is active |
| 🔌 Plugin and Skill-only modes | Use native plugins or the standalone Agent Skill |
| 🛡️ Deliberate interactions | Inspect first, target unique elements, and verify every action |

## Safety

Safari MCP can inspect and interact with pages through your existing
browser session. Consequential actions—such as sending a message, submitting a
form, making a purchase, changing account settings, or deleting data—require
clear user authorization.

The control glow makes active automation visible, while `browser.release()`,
REPL reset, server shutdown, and the inactivity lease ensure that control does
not remain attached indefinitely.

## Support

Found a bug or have an idea? Open an
[issue](https://github.com/Destiner/safari-mcp/issues) in this fork.
For upstream development, see [CitroLabs' original project](https://github.com/citrolabs/safari-browser-use).

<div align="center">

**Built for humans who want AI agents to work with the browser they already use.**

</div>

## License

Safari MCP is available under the [MIT License](LICENSE), retaining the original
Safari Browser Use attribution. Bundled Playwright code has its own
[license and notices](third_party/playwright/README.md).
