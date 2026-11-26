# Rouse

[![npm](https://img.shields.io/npm/v/rousejs)](https://www.npmjs.com/package/rousejs)

**JavaScript reactivity and state sync for server-rendered HTML.**

> [!WARNING]
> **Pre-release software:** Rouse is currently in active development, unstable, and not intended for production use. Breaking changes will occur without a deprecation cycle.

## Introduction

Rouse is for applications that render HTML on the server but need rich client-side state without adopting a full SPA architecture. It brings server-driven updates and client-side reactivity into one system: requests, events, and state share the same syntax, and a response can place markup, update a store, or both. Whether the server or the client drives an interaction is a per-feature decision, not an architectural commitment.

- **No backend contract** – Pairs with any language or framework via standard HTTP and HTML/JSON responses.
- **Direct DOM binding** – Works with server-rendered HTML. No virtual DOM, hydration step, or client-side copy of the page.
- **Strict CSP compliance** – Directive values are names, never evaluated code. No `unsafe-eval` required.
- **Buildless or bundled** – Load directly from a CDN or install from npm with bundled TypeScript definitions.
- **Zero runtime dependencies** – 19.9 KB gzipped with reactivity, networking, and stores. Store sync (3.4 KB) and server-sent events (1.8 KB) are optional plugins.

## Features

### Reactive state

Model UI state in local scopes and app-wide stores. Stores are reactive by default, while scopes opt in with a reactive proxy and signal primitives (built on [alien-signals](https://github.com/stackblitz/alien-signals), bundled in). Updates are fine-grained: only the bindings that read a changed value re-run.

### Native client rendering

Render dynamic lists and conditional views from reactive state with `<template>` elements. Keyed reconciliation reuses and reorders DOM instead of rebuilding it. Built-in selection tracking marks selected items without writing UI state into your data, and updates only the affected bindings.

### Networking

Fetch HTML fragments or JSON on any event, straight from attributes. Response headers let the server steer targeting, issue redirects, update stores, and trigger client-side events, error responses included. With the `sse` plugin, server-sent event streams work the same way: each message places HTML, updates a store, or fires a named event.

### State synchronization

With the `sync` plugin, give a store an endpoint and keep it in sync with your server over plain HTTP, with dirty tracking and protection for edits made mid-request.

### Local scopes, deferred activation

Turn any element into a scope using a setup function that returns the state and methods for the directives inside. Defer activation until the scope is needed: on visibility, user interaction, browser idle time, a media query match, or any DOM or custom event. Lifecycle hooks and built-in teardown give your code and third-party libraries a clean mount and unmount.

### Isolated apps

Create multiple apps on one page, side by side or nested. Each has its own stores, scopes, interceptors, and listeners, so micro-frontends and embedded widgets can't reach each other's state.

### Wiring in HTML, logic in JavaScript

Directive values are declarative: they describe paths, triggers, and targets. Logic stays in plain JavaScript, where it can be organized, typed, tested, and reused. Attributes and the JavaScript API share the same engine: start in markup and drop into code where you need it.

## Why Rouse?

Rouse builds on ideas from several influential tools:

- **[htmx](https://htmx.org)** showed that the server can drive the UI over plain HTTP and HTML. Rouse keeps that model and adds client-side state for interactions where it helps.
- **[Stimulus](https://stimulus.hotwired.dev)** showed that markup can wire behavior to organized, testable JavaScript. Rouse takes the same approach with scopes, and adds stores and server sync so state doesn't need a separate library.
- **[Alpine](https://alpinejs.dev)** showed how natural reactivity can feel when declared in markup. Rouse keeps reactive bindings in HTML and moves the logic to JavaScript, so strict CSP works out of the box.

The goal is a single, fast, CSP-safe library that covers the common needs of server-rendered apps in the browser.

## Installation

Rouse ships as ES modules only, in two builds: a development build with diagnostics, and a minified production build. Store sync and server-sent events are plugins, imported separately and passed to `rouse()`.

### From npm

```bash
npm install rousejs
```

```js
import { rouse } from 'rousejs';
import { sync } from 'rousejs/sync';
import { sse } from 'rousejs/sse';

const app = rouse({ plugins: [sync, sse] });
```

Types are bundled. No additional setup for TypeScript necessary.

### From a CDN

An import map states the version once. Load core and every plugin from the same version:

```html
<script type="importmap">
  {
    "imports": {
      "rousejs": "https://cdn.jsdelivr.net/npm/rousejs@0.18.0/dist/rouse.js",
      "rousejs/sync": "https://cdn.jsdelivr.net/npm/rousejs@0.18.0/dist/sync.js"
    }
  }
</script>
<script type="module">
  import { rouse } from 'rousejs';
  import { sync } from 'rousejs/sync';

  const app = rouse({ plugins: [sync] });
</script>
```

Swap in `rouse.min.js` and `sync.min.js` for production.

### Build selection

The development build (`rouse.js`, `sync.js`, `sse.js`) warns about misused directives, missing targets, invalid values, and plugin features used without their plugin. The production build (`*.min.js`) strips the warnings.

From npm, `rousejs` and its plugins resolve to the minified build. A bundler that sets the `development` condition, such as Vite in dev, picks the development build. With esbuild, pass `--conditions=development`.

## Getting started

Register your scopes, then call `app.start()` to scan the page and bind its directives.

```js
import { reactive, rouse } from 'rousejs';
import { sync } from 'rousejs/sync';

const app = rouse({ plugins: [sync] });

// A scope's setup returns the state and methods for the directives inside it
app.scope('counter', ({ host }) => {
  const state = reactive({ count: Number(host.dataset.initial) || 0 });
  return {
    state,
    increment: () => state.count++,
  };
});

app.start();
```

Directives are standard `data-*` attributes with the `rz-` prefix:

```html
<!-- Server-rendered; the scope takes over on start -->
<div data-rz-scope="counter" data-initial="5">
  <button data-rz-on="click: increment">Add one</button>
  <span data-rz-text="state.count">5</span>
</div>

<!-- A store declared in markup, synced with /api/user by the sync plugin -->
<script data-rz-store="user: /api/user" type="application/json">
  { "name": "Ada" }
</script>

<!-- @ addresses a store from HTML anywhere in the app -->
<input data-rz-model="@user.name">
<button data-rz-push="click: @user">Save</button>
```

## Documentation

The full reference is one dense page, easy for humans to scan and for coding agents to read: [rousejs.com](https://rousejs.com). Agents can fetch the Markdown source directly from [rousejs.com/index.md](https://rousejs.com/index.md).
