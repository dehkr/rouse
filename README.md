# Rouse

[![npm](https://img.shields.io/npm/v/rousejs)](https://www.npmjs.com/package/rousejs)

**A JavaScript reactivity and state-synchronization layer for server-rendered HTML.**

> [!WARNING]
> **Pre-release software:** Rouse is currently in active development, unstable, and not intended for production use. Breaking changes will occur without notice.

## Introduction

Rouse coordinates server-rendered HTML and client-side reactivity within a single, cohesive system. While SPAs put the frontend in charge and hypermedia anchors to the backend, Rouse combines the strengths of each. It's designed for applications that already render HTML on the server but need rich client-side state without adopting a full SPA architecture. Whether the server or the client drives an interaction is a per-feature decision rather than an architectural commitment.

- **Backend agnostic** – pairs with anything that returns HTML or JSON
- **Strict CSP compliance** – no `unsafe-eval` or expression evaluation in markup
- **Web standards** – no virtual DOM, built on native browser APIs
- **Buildless or bundled** – load from a CDN or install from npm, fully typed
- **Lightweight** – 20 KB gzipped with no external dependencies

## Features

### Reactive state

Model UI state in local scopes and global stores backed by [alien-signals](https://github.com/stackblitz/alien-signals), with a proxy layer for ergonomic object and array mutations.

### Native client rendering

Render dynamic lists and conditional views from reactive state with `<template>` elements. Keyed reconciliation reuses and reorders DOM instead of rebuilding it.

### Hypermedia interactions

Fetch HTML fragments – or JSON – on any event, straight from attributes. The server can steer targeting, issue redirects, and trigger client-side events through response headers.

### State synchronization

Push client state to the server and pull it back, with dirty tracking, in-flight edit protection, and automatic rollback on failure.

### Server-sent events

Stream updates from the server declaratively. Messages swap HTML, update stores, or fire named events the rest of your app can react to.

### Progressive activation

Gate any scope's activation on visibility, idle time, media queries, or custom events. Third-party scripts get an isolated mount point with lifecycle hooks and automatic cleanup.

### Declarative and programmatic

Attributes and the JavaScript API share the same engine. They mix freely. Start in markup and drop into code where you need it.

### Wiring in HTML, logic in JavaScript

Directive values are declarative: they describe paths, triggers, and targets. Logic stays in plain JavaScript, where it can be organized, typed, tested, and reused.

## Installation

Rouse ships as ES modules only, in two builds: a development build with diagnostics, and a minified production build.

### From a CDN

```html
<script type="module">
  import { rouse } from 'https://cdn.jsdelivr.net/npm/rousejs@0.14.0/dist/rouse.js';

  const app = rouse();
  app.start();
</script>
```

Swap in `rouse.min.js` for production:

```text
https://cdn.jsdelivr.net/npm/rousejs@0.14.0/dist/rouse.min.js
```

### From npm

```bash
npm install rousejs
```

```js
import { rouse } from 'rousejs';
```

Types are bundled. No additional setup for TypeScript necessary.

### Build selection

The development build (`dist/rouse.js`) warns about misused directives, missing targets, and invalid values; the production build (`dist/rouse.min.js`) strips them.

Bundlers that set the standard `development`/`production` export conditions (Vite, webpack) get the right build automatically. Tools that don't (esbuild, Rollup) resolve to the minified build by default. Import `rousejs/dev` if you want diagnostics during development. `rousejs/min` always resolves to the minified build regardless of tool.

## Getting started

Register your **scopes**, **stores**, **interceptors**, and **listeners**, then call `app.start()`.

```js
import { rouse, signal } from 'rousejs';

const app = rouse();

// Scopes: data and actions bound to a region of the page
app.scope('counter', () => {
  const count = signal(0);
  return {
    get count() {
      return count();
    },
    increment() {
      count(count() + 1);
    },
  };
});

// Stores: shared state, optionally synced with the server
app.store('prefs', { theme: 'dark' });

// Interceptors: hooks into every request, response, and error
app.interceptor('request', (config) => {
  const token = localStorage.getItem('auth-token');
  config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
  return config;
});

// Listeners: automatic cleanup, plus built-in Rouse events
app.on('ready', () => console.log('wired up'));

app.start();
```

Add Rouse directives to your markup using standard `data-*` attributes with the `rz-` prefix:

```html
<!-- Bind the counter scope -->
<div data-rz-scope="counter">
  <button data-rz-on="click: increment">Add one</button>
  <span data-rz-text="count"></span>
</div>

<!-- Declare a global store that syncs with /api/user -->
<script data-rz-store="user: /api/user" type="application/json">
  { "name": "Ada" }
</script>

<!-- Access stores anywhere in markup with the @ sigil -->
<input data-rz-model="@user.name">
<button data-rz-push="click: @user">Save</button>
```

### More about `start()`

`start()` is not an initialization step that switches Rouse on. **It scans the page.** Directives are read from the DOM at that moment and wired to whatever is registered by then. Rouse keeps watching the page and scans new elements as they're added, so registering after `start()` works for elements scanned later.

**Note:** A store declared in the initial HTML is created by the scan, so `app.stores.get('user')` returns `undefined` before `start()`.
