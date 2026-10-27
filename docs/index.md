# Rouse

> Rouse (`rousejs` on npm) is a directive-driven reactivity and state-sync layer for server-rendered HTML. The server sends the markup; `data-rz-*` attributes bind it to reactive state, events, and network requests. Logic lives in plain JavaScript scopes and stores, never in attribute expressions. Rouse is pre-release and not HTMX or Alpine: don't guess their syntax (`hx-*`, `x-data`, `@click`, `{{ }}`, inline JS expressions all do nothing here).

## Setup

```js
import { rouse, signal, computed, effect, reactive, dispatch, createKey } from 'rousejs';

const app = rouse({ headers: { 'X-Tenant': '42' } }); // root defaults to document.body
app.scope('counter', () => { /* ... */ });
app.store('prefs', { theme: 'dark' });
app.start(); // scans the page; register before this
```

`RouseConfig`: `root`, `baseUrl`, `headers` (a `null` value removes a header), `credentials`, `timeout` (ms), `wake` (default scope activation). `start()` scans the DOM once and then watches for added nodes; registration applies to DOM scanned afterward and never retroactively. `<script data-rz-store>` stores don't exist until `start()`. `destroy()` is terminal.

## Spelling

- Every directive is an attribute with the `data-rz-` prefix: `data-rz-on`, `data-rz-scope`. Bare `rz-on` is ignored.
- `@name` is a store, `@name.path` a field in it, `@name::status` its read-only status.
- A bare path (`count`, `user.name`) resolves against the nearest enclosing `data-rz-scope`.
- `%` is the current `rz-render` item, `%.field` a field on it, `%::index` / `%::position` its zero- and one-based position.
- Values are literal text: no expressions, no interpolation, no call arguments (`save(1)`, `greet{"name": "Ada"}` and `data-rz-scope='probe{...}'` are not defined names). Put logic in a getter or method and name it; per-element parameters go in ordinary `data-*` attributes, read as `el.dataset` in a handler or `host.dataset` in a setup.
- Paths are dot paths and may index arrays: `user.name`, `@names.list.0`.
- Pairs are separated by a comma **plus whitespace** (`, `); key and value by a colon **plus whitespace** (`: `). Quote a value containing `, ` or `: ` (`'color: red'`).

## Trigger grammar

`rz-on`, `rz-fetch`, `rz-push`, `rz-pull`, `rz-sse`, and `rz-model` take `[trigger]: [subject]`.

- `data-rz-on="click: save"`: comma-space separates pairs, space separates triggers sharing a subject (`data-rz-on="pointerover focusin: preload"` fires on either).
- One `|` separates the event from dot-separated modifiers: `click|once.prevent`, `input|debounce-[300ms]: search`.
- A bracketed argument follows `-[`: `debounce-[300ms]`, `key-[enter]`, `timeout-[5s]`, `media-[(min-width: 640px)]`. One argument only; commas inside brackets are data.
- A trigger is any DOM or custom event name, including Rouse's own (`data-rz-on="rz:fetch:success: stamp"`) and an event a server sends with `Rouse-Trigger`. Colons inside a name are fine, because only colon plus whitespace ends the trigger. Any trigger works on any of these directives: `data-rz-fetch="edit-[@filters]|debounce-[400ms]: /search"`.
- Triggers are always explicit, except on `rz-model`. A colon-less value on the network directives and `rz-on` is triggers only (`data-rz-fetch="click"` takes its URL from `href`/`action`).
- A second `|` (`click|a|b`), an empty segment (`click||once`), or a leading `|` warns and skips the trigger. An unknown modifier warns. An argument on an event that takes none is ignored.
- `rz-wake` and `rz-close` take a trigger list: the whole value is space-separated triggers, no subject. A comma there warns.

**Modifiers:** `once`, `capture`, `passive`, `self`, `outside` (events from outside the element; listens on `document`), `prevent`, `stop`, `stop-immediate`, `window` / `document` / `root` (listen there instead; filters still apply to the element), `debounce` / `throttle` (optional wait: `-[300]` = ms, `-[300ms]`, `-[5s]`, `-[1m]`; defaults 300 / 150 ms), `leading`, `trailing`, `key-[…]` (repeatable), `ctrl` / `alt` / `shift` / `meta` (held-key flags), `loose` (tolerate extra held keys).

- Edges: debounce fires trailing, throttle both. Naming `leading` or `trailing` replaces the defaults: `click|throttle.leading` is leading only, `click|debounce.leading.trailing` both.
- `key-[…]` takes any `KeyboardEvent.key` in lowercase (`key-[enter]`, `key-[arrowup]`, `key-[/]`); `key-[space]` for the spacebar. `[ ( { " '` can't be written; an unbalanced one swallows the rest of the value.
- Key matching is exact once a key or held flag is named: `keydown|key-[enter]` ignores Shift+Enter; write `keydown|shift.key-[enter]` for that. A bare `keydown` sees every key.
- A held flag alone matches nothing on a keyboard event (`keydown|meta`) and filters a mouse event (`click|ctrl`).
- Modifier keys don't auto-repeat on macOS. For "while held", pair `keydown|key-[alt]` with `keyup|key-[alt]`.

**Trigger sources** (beyond DOM events): `ready` (app is up, or immediately when bound later), `wake` (enclosing scope activated), `none`, `timeout-[5s]`, `interval-[30s]`, `media-[query]`, `intersect` / `intersect-[0.5]`, `interact` (first pointerover or focusin), `idle`, `edit-[@store]` / `edit-[@store.root]` (user edited the store), `sse-[name]` (named server-sent event; `sse-[message]` for unnamed ones). On a source only `once`, timing, and its argument apply (`sse` also takes `root`); other modifiers are ignored without a warning.

## Directives

| Directive | Purpose | Example |
| --- | --- | --- |
| `rz-scope` | Bind a registered scope to a region; empty value = anonymous boundary | `data-rz-scope="search"` |
| `rz-wake` | Defer scope activation until **all** listed triggers fire (AND) | `data-rz-wake="intersect timeout-[2s]"` |
| `rz-text` | Write state as text | `data-rz-text="@user.name"` |
| `rz-html` | Write state as HTML (unsanitized) | `data-rz-html="previewHtml"` |
| `rz-attr` | Set attributes; `false`/null removes, `true` sets empty. Not `class` or `style`: use `rz-class` / `rz-style` | `data-rz-attr="href: profileUrl, aria-expanded: open"` |
| `rz-prop` | Set DOM properties, type preserved | `data-rz-prop="checked: done, items: @cart.items"` |
| `rz-class` | Toggle the classes on the left by the state on the right, or write a class string or `{ class: bool }` object from a bare path | `data-rz-class="active selected: isChosen"`, `data-rz-class="themeClass"` |
| `rz-style` | Toggle a quoted declaration, set one property, or write a declaration string or object from a bare path | `data-rz-style="'color: red; font-weight: bold': hasError, background: @theme.color"` |
| `rz-model` | Two-way bind an input, textarea, select (`multiple` gives an array), checkbox, radio, or `contenteditable`; default trigger, resolved once at bind, `input` (text, textarea, `contenteditable`) or `change` (select, checkbox, radio). Custom elements bind `.value` and need an explicit trigger | `data-rz-model="query"`, `data-rz-model="value-changed: @names.list.0"` |
| `rz-on` | Call a scope or store method on a trigger | `data-rz-on="click: save, submit: send"` |
| `rz-render` | On a `<template>`: render an array (per item), number (n copies), object (once), or boolean (if) | `<template data-rz-render="@todos.items">` |
| `rz-key` | Stable key for `rz-render` lists that reorder or refetch | `data-rz-key="id"` |
| `rz-fetch` | Request on a trigger; subject is `[METHOD] URL` (default GET), either part optional (`submit: PUT` keeps the form's `action`) | `data-rz-fetch="click: POST /todos"` |
| `rz-place` | Where an HTML response goes: `position: selector`, a selector, a position, or `null`. Default: host `innerHTML` | `data-rz-place="beforeend: #log"` |
| `rz-deposit` | Merge a JSON response into whole stores | `data-rz-deposit="@results"` |
| `rz-send` | Payload: scope paths, `@store`/`@store.field`, `%`/`%.field`, inline JSON, `selector: <css>` | `data-rz-send='query, @filters, {"page": 2}'` |
| `rz-headers` | Request headers for a fetch, or on a store script for its sync; `null` removes | `data-rz-headers="X-Tenant: 42"` |
| `rz-request` | Fetch options: `timeout`, `abort-key`, `credentials`, `keepalive`, `redirect`, `cache` | `data-rz-request="timeout: 5s, keepalive"` |
| `rz-indicator` | Elements that get the `rouse-request` class in flight (default: the trigger; `null` = none) | `data-rz-indicator="#spinner"` |
| `rz-disable` | Elements disabled in flight; empty = the host. A `<form>` can't be disabled: name its `<fieldset>` | `data-rz-disable` |
| `rz-store` | On `<script type="application/json">`: declare a store, optional sync endpoint | `data-rz-store="cart: /api/cart"` |
| `rz-push` | Send the whole store (`PATCH`, JSON Merge Patch body) | `data-rz-push="click: @cart"` |
| `rz-pull` | Refresh the whole store (`GET`) | `data-rz-pull="ready interval-[30s]: @cart"` |
| `rz-sse` | Open an `EventSource`; one stream per element | `data-rz-sse="ready: /events"` |
| `rz-close` | Triggers that close that element's stream (OR) | `data-rz-close="sse-[done]"` |

Method is only ever in the `rz-fetch` subject (or a form's `method` / a button's `formmethod`), never in `rz-request`. `rz-headers`, `rz-request`, and `rz-send` apply to fetch triggers only.

```html
<form data-rz-fetch="submit" action="/todos" method="post" data-rz-place="beforeend: #todo-list" data-rz-disable="#todo-fields">
  <fieldset id="todo-fields"><input name="title"><button>Add</button></fieldset>
</form>
<ul id="todo-list"></ul>
```

## Stores

A store is one flat object: data, getters (cached computeds; keep them pure), and methods (`this` is the store). Only plain data syncs. The root must be an object.

```js
const cart = app.store('cart', {
  items: [],
  get total() { return this.items.reduce((s, i) => s + i.price, 0); },
  clear() { this.items = []; },
}, { url: '/api/cart' });

cart.items.push({ id: 1, price: 5 }); // local only; the store now reads dirty
await app.stores.push('cart');        // PATCH /api/cart with the whole store

// or save on every edit instead of calling push yourself:
app.on({ edit: 'cart' }, () => app.stores.push('cart'), { debounce: 500 });
```

```html
<script type="application/json" data-rz-store="user: /api/user">{ "name": "Ada" }</script>
<input data-rz-model="@user.name">
<button data-rz-push="click: @user" data-rz-attr="disabled: @user::status.syncing">Save</button>
<span data-rz-class="unsaved: @user::status.dirty">Unsaved changes</span>
<div data-rz-push="edit-[@user]|debounce-[500ms]: @user"></div> <!-- autosave -->
```

- `rz-push`, `rz-pull`, and `rz-deposit` always name their store, including on the store's own script (`<script data-rz-store="feed" data-rz-sse="ready: /feed" data-rz-deposit="@feed">`). A path (`@user.profile`) is rejected: stores sync whole.
- `@name::status` is `{ syncing: false | 'push' | 'pull', error: { code, message } | null, lastSync, dirty, dirtyRoots }`.
- Server responses are applied as JSON Merge Patch (RFC 7396): absent keys stay, objects merge, arrays and primitives replace, `null` deletes the key.
- A push in progress holds later pushes and sends one follow-up when it succeeds. A failed push changes no data: the store stays dirty and `status.error` is set. Roll back yourself: `app.on('rz:push:error', () => app.stores.revert('cart'))`.
- JS (`app.stores`, not a record): `get(name)`, `has`, `status`, `isDirty(name, root?)`, `dirtyRoots`, `snapshot`, `baseline`, `push(name)` / `pull(name)` (never reject), `revert(name, path?)` (to last synced), `reset` (to page-load state), `commit` (mark current data synced, sends nothing), `update(name, state)` (replace and re-baseline), `deposit(name, payload)`, `config(name, partial)`, `remove`.
- Sync requests carry `Rouse-Sync` and `Rouse-Store` headers and push sends `Content-Type: application/merge-patch+json`.

## Scopes

A scope is a synchronous setup function that returns a plain object: the names its region's directives resolve. It is not a component (no template, props, or re-render) and its return is **not** made reactive. Expose reactive state through getters, with a setter for `rz-model`.

```js
app.scope('search', ({ host, app, term }) => {
  const query = signal('');
  const results = reactive([]);

  async function run() {
    const { data, error } = await app.fetch(`/search?q=${encodeURIComponent(query())}`, { signal: term });
    if (!error) results.splice(0, results.length, ...data.items);
  }

  app.on(host, { intersect: 0.5 }, run, { once: true, signal: term });

  return {
    get query() { return query(); },
    set query(v) { query(v); },
    get results() { return results; },
    run,
    clear() { query(''); },
    remove({ render }) { results.splice(render.index, 1); },
    connect() {}, disconnect() {}, // optional lifecycle hooks
  };
});
```

```html
<div data-rz-scope="search">
  <input data-rz-model="query" data-rz-on="input|debounce-[300ms]: run, keydown|window.key-[escape]: clear">
  <ul>
    <template data-rz-render="results" data-rz-key="id">
      <li><span data-rz-text="%::position"></span>. <span data-rz-text="%.title"></span>
        <button data-rz-on="click: remove">x</button></li>
    </template>
  </ul>
</div>
```

- `ScopeCtx` is `{ host, app, term, scan }`. `term` is an `AbortSignal` aborted on teardown: pass `signal: term` to `app.on`, `app.fetch`, `app.sse`, and `app.interceptor` to end them with the scope. `scan(node)` binds DOM you add by hand.
- Handlers and formatters receive `{ el, e, render: { item, index } }` (types `HandlerCtx`, `RenderHandlerCtx<Item>`, `ScopeSetup`, `ScopeCtx` are exported). A scope or store function named in `rz-text`/`rz-attr`/etc. is called and its return value written.
- Give client-created list items a stable key once, at creation: `items.push({ id: createKey(), text })` with `data-rz-key="id"`. Never call it in a getter.
- Nested scopes are independent; share state through a store, signal through DOM events (`dispatch(el, 'name', detail)` from `rousejs`).
- Register scopes at app level with `app.scope(name, setup)`, never inside another setup.

## Render

`rz-render` lives on a `<template>`. Each instance binds against its item: `%.field`, nested `%.user.name`, metadata `%::index` / `%::position` (readable anywhere in the instance, but read-only, and not item data: `rz-model` can't write them and `rz-send` doesn't send them). Names that aren't `%` fall through to the enclosing scope. Bare `%` is the item in array and object modes and `undefined` in boolean and number modes. `%` is the nearest item only; outer items aren't reachable. Without `rz-key`, instances are reused by position.

## Programmatic API

- `app.fetch(url, { method, body, headers, params, timeout, signal, indicator, triggerEl, skipInterceptors, ...RequestInit })` → `Promise<{ data, error, status, headers, response, config }>`; never rejects. Without `triggerEl` it reads nothing from the DOM and routes nothing (unless the server sends `Rouse-Place` / `Rouse-Deposit`).
- `app.on([target,] event, callback, options?)`: target defaults to `app.root`. The event is one name or a one-key trigger-source descriptor; modifiers go in options, never in the name. `data-rz-on="keyup|ctrl.key-[arrowup]: bump"` is `app.on('keyup', bump, { ctrl: true, key: 'ArrowUp' })`; `media-[(min-width: 640px)]|once` is `app.on({ media: '(min-width: 640px)' }, fn, { once: true })`; `edit-[@cart.items]` is `{ edit: 'cart.items' }` (no `@`). Returns a teardown.
- `app.place(target, html, { position })`: target is an element or a selector within the app root (every match). Positions, case-sensitive: `innerHTML` (default), `outerHTML`, `beforebegin`, `afterbegin`, `beforeend`, `afterend`, `delete`.
- `app.sse(url, { triggerEl, withCredentials, signal })` returns a closer.
- `app.interceptor('request' | 'response' | 'error', fn, { signal })`; a request interceptor returns the config.
- Server response headers: `Rouse-Place`, `Rouse-Deposit` (override routing), `Rouse-Trigger` (dispatch an event), `Rouse-Redirect`, `Rouse-Push-Url`, `Rouse-Replace-Url`. `Rouse-Trigger` is honored on success by fetch, push, and pull; the rest are fetch-only.

## Events

All bubble to `app.root`. App and scope: `rz:app:{start,ready,destroy}`, `rz:scope:{init,connect,disconnect,destroy}`. The rest fall on three axes, each fired from the element it describes:

- **Request**, from the triggering element (`app.root` without one): `rz:{fetch,push,pull}:{config,start,abort,success,error,end}`, always `:config` → `:start` → one of `:abort` / `:success` / `:error` → `:end`. `:config` is cancelable (prevented = nothing else fires, `:end` included); its `detail.config` is the object sent (absolute `url`, `method`, `headers`), editable there, and the same object is on every request event and `response.config`. Fetch's `:success` / `:error` detail is the response (`e.detail.data`, `e.detail.error`); push and pull wrap it as `{ storeName, result }`. Fetch also fires `rz:fetch:{success,error}:{html,json,file}` by content type. Only real network operations fire these: `update()`, `reset()`, and triggers a guard drops (disconnected, disabled, sync already running, write in flight) emit nothing.
- **Destination**, from what changed: `rz:store:patch:before` → `rz:store:patch` or `rz:store:patch:skipped`, from the store's script (else `app.root`), `detail.operation` ∈ `push` / `pull` / `fetch` / `sse`; `rz:dom:place:before` → `rz:dom:place`, from the target (its parent for `outerHTML` / `delete`), `detail.source` ∈ `fetch` / `sse` / `programmatic`. `:before` is cancelable and `detail.payload` can be rewritten; prevented = nothing after it. `:skipped`: an edit made during the request kept the response from applying (a deposit never skips). These fire only when a destination changed, so there's no error event here; failures are on the request axis, whose terminal event fires first (`rz:push:success` before `rz:store:patch:before`).
- **Connection**, from the stream element: `rz:sse:config` (cancelable, once; reconnects don't repeat it), `:open`, `:message` (unnamed messages fire `rz:sse:message:{html,json}` first, already placed or deposited), `:error`, `:close`. One open, many messages, no terminal: not the request contract. `:error` is cancelable; preventing it stops reconnecting.

## Multiple apps

Each `rouse({ root })` is self-contained: its own stores, scopes, interceptors, listeners, and config, so `@cart` in one app never reaches another app's `cart`. Use separate apps for micro-frontends or widgets that must stay isolated. One app per root; after `destroy()`, a new app can mount on the same element.

- Apps can nest. A page app on the default `document.body` with an embedded widget is nested. The outer app skips the inner app's markup, and a nested app mounted after the outer one started takes its markup over.
- Construct a nested app before inserting its root element, or the outer app binds that markup until the nested app exists.
- Events bubble across roots: an outer `app.on('rz:fetch:success', …)` or `sse-[name]|root` also hears the inner app's. To handle only your own app's events, check `e.target.closest('[data-rouse-app]') === app.root`.

## Silent pitfalls

These bind without error and do the wrong thing, usually nothing.

1. **Modifiers need `|`.** `click.debounce-[300ms]` is one event named `click.debounce` and never fires.
2. **`%name` is not `%.name`.** The dot-less form reads `undefined` and writes nothing.
3. **`key-[entr]` never fires**, and `keydown|enter` (no `key-[]`) fires on every key, with only a dev warning. `key-[ctrl]` is wrong: the key name is `control`, the held flag is `ctrl`.
4. **Scope state must be reactive.** A plain field or `let` returned from setup renders once and never updates; use `signal`/`reactive` behind a getter.
5. **`app.on` in a scope listens on the whole app** unless you pass `host` first, and lasts as long as the app without `signal: term`. `app.fetch` likewise keeps running after teardown without `signal: term`.
6. **Register before scanning.** A store registered after the markup reading it was scanned stays `undefined` in those bindings for good.
7. **`sse-[name]` hears only its own element's stream and descendants.** A listener beside the stream needs `sse-[name]|root`.
8. **`visibilitychange` fires on `document`**: write `visibilitychange|document`. `load|window` never fires if the app starts after load; use `ready`.
9. **A stream inside a lazily woken scope opens at page load.** Use `data-rz-sse="wake: /events"`.
10. **`rz-wake` is AND** (`interact timeout-[5s]` waits for both). `rz-wake` and `rz-close` alone do nothing without `rz-scope` / `rz-sse`.
11. **`null` deletes in a synced store.** Don't store `null` in a synced field (use absent); a server serializer that omits empty values (Go `omitempty`) never clears a field.
12. **`rz-place` defaults to the host's `innerHTML`.** A stream element without `rz-place` writes every unnamed HTML message into itself; use `data-rz-place="null"` to opt out.
13. **`edit-[@store.key]` filters on data fields.** A setter writes its underlying field, so watching the accessor's name never fires.
14. **Cross-origin servers must list `Rouse-*` headers** in `Access-Control-Allow-Headers` (sync requests fail as `Failed to fetch`) and `Access-Control-Expose-Headers` (response headers are ignored).
15. **Push bodies are `application/merge-patch+json`.** Servers parsing only `application/json` (Express `express.json()`) see an empty body.
16. **`EventSource` sends no headers**: `rz-headers`, `rz-request`, and interceptors don't apply to `rz-sse`.
17. **A relative URL spelled like a method is read as one**: write `./query`, not `query`.
