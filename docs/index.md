# Rouse

> Rouse (`rousejs` on [npm](https://www.npmjs.com/package/rousejs)) is a directive-driven reactivity and state-sync layer for server-rendered HTML. The server sends the markup; `data-rz-*` attributes bind it to reactive state, events, and network requests. Logic lives in plain JavaScript scopes and stores, never in attribute expressions. Rouse is pre-release. Source: [github.com/dehkr/rouse](https://github.com/dehkr/rouse).

## Setup

Create an app, register its scopes, stores, interceptors, and listeners, then start it. Starting scans the page and binds every directive.

```js
import { rouse } from 'rousejs';

// Config object can be passed when creating app
const app = rouse({ baseUrl: '/api', headers: { 'X-Tenant': '42' } });

app.scope('counter', () => { /* ... */ }); // props and methods for data-rz-scope="counter"
app.store('prefs', { theme: 'dark' });     // app-wide state accessed using @prefs from html
app.interceptor('request', addAuth);       // edits every request before it's sent
app.on('rz:fetch:error', showToast);       // hears lifecycle events from the whole app

app.start(); // scan the page and bind directives
```

| Config key | Default | Meaning |
| --- | --- | --- |
| `root` | `document.body` | Element or selector the app owns |
| `baseUrl` | `''` | Prefixed to relative URLs in `rz-fetch`, `rz-push`, `rz-pull`, `rz-sse`, `app.fetch`, `app.sse` |
| `headers` | `{}` | Sent with every request; a `null` value removes a header |
| `credentials` | browser's (`same-origin`) | `fetch` `credentials` for every request |
| `timeout` | `0` (none) | Abort every request after this many ms; a per-request `timeout` overrides it |
| `wake` | `ready` | Default scope activation; `rz-wake` overrides it per scope |

`start()` scans the DOM once and then watches for added nodes. Registration applies to DOM scanned afterward and never retroactively. `<script data-rz-store>` stores don't exist until `start()`. `destroy()` is terminal.

Install with `npm install rousejs`, or skip the install and import from a CDN in a `<script type="module">`: `https://cdn.jsdelivr.net/npm/rousejs@0.15.0/dist/rouse.js` (development) or `https://cdn.jsdelivr.net/npm/rousejs@0.15.0/dist/rouse.min.js` (production). Rouse ships as ES modules only. From npm, `rousejs` resolves to the minified build, or to the development build under a bundler's `development` condition; import `rousejs/dev` or `rousejs/min` to pick one. Only the development build reports authoring mistakes (`[Rouse]` console warnings).

## Syntax

Directives are `data-rz-*` attributes whose values name state, methods, and triggers. Values are literal text, never expressions.

```html
<div data-rz-scope="profile">
  <!-- Bare path: a key on the nearest scope -->
  <h2 data-rz-text="user.name"></h2>
  <!-- @store.path: a field in a store; @store::status: its read-only sync status -->
  <span data-rz-text="@cart.count" data-rz-class="busy: @cart::status.syncing"></span>
  <!-- Pairs: comma-space between them, colon-space inside each -->
  <a data-rz-attr="href: profileUrl, aria-current: isCurrent">Profile</a>
  <ul>
    <template data-rz-render="@cart.items">
      <!-- %.field: a field on the current rz-render item -->
      <li data-rz-text="%.title"></li>
    </template>
  </ul>
</div>
```

- Every directive is an attribute with the `data-rz-` prefix: `data-rz-on`, `data-rz-scope`. Bare `rz-on` is ignored.
- `@name` is a store, `@name.path` a field in it, `@name::status` its read-only status.
- A bare path (`count`, `user.name`) resolves against the nearest enclosing `data-rz-scope`.
- `%` is the current `rz-render` item, `%.field` a field on it, `%::index` / `%::position` its zero- and one-based position.
- Values are literal text: no expressions, no interpolation, no call arguments (`save(1)`, `greet{"name": "Ada"}` and `data-rz-scope='probe{...}'` are looked up as literal keys and match nothing). Put logic in a getter or method and name it; per-element parameters go in ordinary `data-*` attributes, read as `el.dataset` in a handler or `host.dataset` in a setup.
- Paths are dot paths and may index arrays: `user.name`, `@names.list.0`.
- Pairs are separated by a comma **plus whitespace** (`, `); key and value by a colon **plus whitespace** (`: `). Quote a value containing `, ` or `: ` (`'color: red'`).

## Directives

Each directive does one job: bind state to the DOM, handle an event, make a request, or route its response.

```html
<!--
On submit, POST the form's fields to its action (/todos) and append the returned
HTML to #todo-list. The fieldset is disabled while the request runs.
-->
<form
  action="/todos"
  method="post"
  data-rz-fetch="submit"
  data-rz-place="beforeend: #todo-list"
  data-rz-disable="#todo-fields"
>
  <fieldset id="todo-fields">
    <input name="title"><button>Add</button>
  </fieldset>
</form>
<ul id="todo-list"></ul>
```

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

## Trigger grammar

Event-driven directives pair a trigger (when) with a subject (what): `[trigger]: [subject]`. `rz-on`, `rz-fetch`, `rz-push`, `rz-pull`, `rz-sse`, and `rz-model` take it.

```html
<!-- Call save on click -->
<button data-rz-on="click: save">Save</button>
<!-- Call search 300 ms after typing stops; a | starts the modifiers -->
<input data-rz-on="input|debounce-[300ms]: search">
<!-- Two pairs: Escape anywhere clears; Ctrl+Enter submits -->
<input data-rz-on="keydown|window.key-[escape]: clear, keydown|ctrl.key-[enter]: submit">
<!-- Two triggers sharing one subject: either fires it -->
<a href="/panel" data-rz-on="pointerover focusin: preload">Panel</a>
```

- `data-rz-on="click: save"`: comma-space separates pairs, space separates triggers sharing a subject (`data-rz-on="pointerover focusin: preload"` fires on either).
- One `|` separates the event from dot-separated modifiers: `click|once.prevent`, `input|debounce-[300ms]: search`.
- A bracketed argument follows `-[`: `debounce-[300ms]`, `key-[enter]`, `timeout-[5s]`, `media-[(min-width: 640px)]`. One argument only; commas inside brackets are data.
- A trigger is any DOM or custom event name, including Rouse's lifecycle events (`data-rz-on="rz:fetch:success: stamp"`) and an event a server sends with `Rouse-Trigger`. Colons inside a name are fine, because only colon plus whitespace ends the trigger. Any trigger works on any of these directives: `data-rz-fetch="edit-[@filters]|debounce-[400ms]: /search"`.
- Triggers are always explicit, except on `rz-model`. A colon-less value on the network directives and `rz-on` is triggers only (`data-rz-fetch="click"` takes its URL from `href`/`action`).
- A second `|` (`click|a|b`), an empty segment (`click||once`), or a leading `|` warns and skips the trigger. An unknown modifier warns. An argument on an event that takes none is ignored.
- `rz-wake` and `rz-close` take a trigger list: the whole value is space-separated triggers, no subject. A comma there warns.

### Modifiers

| Modifier | Effect | Example |
| --- | --- | --- |
| `once` | Remove after the first fire that passes the filters | `click\|once` |
| `prevent` | `preventDefault()` | `submit\|prevent` |
| `stop` | `stopPropagation()` | `click\|stop` |
| `stop-immediate` | `stopImmediatePropagation()` | `click\|stop-immediate` |
| `capture` | Listen in the capture phase | `focus\|capture` |
| `passive` | Passive listener | `scroll\|passive` |
| `self` | Only when the element itself is the target | `click\|self` |
| `outside` | Only for events from outside the element (listens on `document`) | `click\|outside` |
| `window` | Listen on `window`; filters still apply to the element | `resize\|window` |
| `document` | Listen on `document` | `visibilitychange\|document` |
| `root` | Listen on `app.root` | `rz:fetch:success\|root` |
| `debounce`, `debounce-[wait]` | Fire after events stop for `wait` (default 300 ms) | `input\|debounce-[300ms]` |
| `throttle`, `throttle-[wait]` | Fire at most once per `wait` (default 150 ms) | `scroll\|throttle-[100]` |
| `leading` | Fire on the leading edge | `click\|throttle.leading` |
| `trailing` | Fire on the trailing edge | `click\|debounce.leading.trailing` |
| `key-[key]` | Match a `KeyboardEvent.key`, lowercase; repeatable | `keydown\|key-[enter]` |
| `ctrl`, `alt`, `shift`, `meta` | Require the key held | `keydown\|ctrl.key-[s]` |
| `loose` | Allow held keys the trigger didn't name | `keydown\|key-[enter].loose` |

- Waits: `-[300]` is ms; units `ms`, `s`, `m`.
- Edges: debounce fires trailing, throttle both. Naming `leading` or `trailing` replaces the defaults: `click|throttle.leading` is leading only, `click|debounce.leading.trailing` both.
- `key-[…]` takes any `KeyboardEvent.key` in lowercase (`key-[enter]`, `key-[arrowup]`, `key-[/]`); `key-[space]` for the spacebar. `[ ( { " '` can't be written; an unbalanced one swallows the rest of the value.
- Key matching is exact once a key or held flag is named: `keydown|key-[enter]` ignores Shift+Enter; write `keydown|shift.key-[enter]` for that. A bare `keydown` sees every key.
- A held flag alone matches nothing on a keyboard event (`keydown|meta`) and filters a mouse event (`click|ctrl`).
- Modifier keys don't auto-repeat on macOS. For "while held", pair `keydown|key-[alt]` with `keyup|key-[alt]`.

### Trigger sources

Triggers that aren't DOM events:

| Source | Fires | Example |
| --- | --- | --- |
| `ready` | Once the app is up; immediately for anything bound later | `ready: @cart` |
| `wake` | When the enclosing scope activates (see `rz-wake`), and on each reconnect | `wake: /panel` |
| `none` | Never; binds nothing | `none` |
| `timeout-[delay]` | Once, after `delay` | `timeout-[5s]` |
| `interval-[delay]` | Every `delay` | `interval-[30s]` |
| `media-[query]` | When the media query matches, now or later | `media-[(min-width: 640px)]` |
| `intersect`, `intersect-[ratio]` | Each time the element enters the viewport, at least `ratio` visible (0–1, default 0) | `intersect-[0.5]\|once` |
| `interact` | On each `pointerover` or `focusin` on the element; add `once` for the first only | `interact\|once` |
| `idle` | Once, when the browser is idle | `idle` |
| `edit-[@store]`, `edit-[@store.key]` | When the user edits the store, or that top-level key; framework writes don't count | `edit-[@cart]\|debounce-[500ms]` |
| `sse-[name]` | On a server-sent event named `name` from this element's stream or its descendants'; `sse-[message]` for unnamed messages | `sse-[done]`, `sse-[tick]\|root` |

On a source only `once`, timing, and its argument apply (`sse` also takes `root`); other modifiers are ignored without a warning.

## Scopes

A scope is a synchronous setup function that returns a plain object: the keys that bare paths in its region resolve against. It is not a component (no template, props, or re-render) and its return is **not** made reactive. Expose reactive state through getters, with a setter for `rz-model`.

```js
import { reactive, signal } from 'rousejs';

app.scope('search', ({ host, app, term }) => {
  // Reactive state; a plain `let` would render once and never update
  const query = signal('');
  const results = reactive([]);

  async function run() {
    // signal: term aborts the request if the scope is torn down mid-flight
    const { data, error } = await app.fetch(`/search?q=${encodeURIComponent(query())}`, { signal: term });
    if (!error) {
      results.splice(0, results.length, ...data.items);
    }
  }

  // Search once when half the region scrolls into view
  app.on(host, { intersect: 0.5 }, run, { once: true, signal: term });

  return {
    // Getter for reading, setter so rz-model can write
    get query() { return query(); },
    set query(v) { query(v); },
    get results() { return results; },
    run,
    clear() { query(''); },
    // Handlers get { el, e, render }; render.index is the clicked row
    remove({ render }) { results.splice(render.index, 1); },
    // Optional lifecycle hooks
    connect() {},
    disconnect() {},
  };
});
```

```html
<div data-rz-scope="search">
  <!-- Typing writes query; run fires 300 ms after typing stops; Escape anywhere clears -->
  <input data-rz-model="query" data-rz-on="input|debounce-[300ms]: run, keydown|window.key-[escape]: clear">
  <ul>
    <!-- One <li> per result, matched by id across re-renders -->
    <template data-rz-render="results" data-rz-key="id">
      <li>
        <span data-rz-text="%::position"></span>. <span data-rz-text="%.title"></span>
        <button data-rz-on="click: remove">x</button>
      </li>
    </template>
  </ul>
</div>
```

- `ScopeCtx` is `{ host, app, term, scan }`. `term` is an `AbortSignal` aborted on teardown: pass `signal: term` to `app.on`, `app.fetch`, `app.sse`, and `app.interceptor` to end them with the scope. `scan(node)` binds DOM you add by hand.
- Handlers and formatters receive `{ el, e, render: { item, index } }`. A scope or store function named in `rz-text`/`rz-attr`/etc. is called and its return value written.
- Give client-created list items a stable key once, at creation: `items.push({ id: createKey(), text })` with `data-rz-key="id"`. Never call it in a getter.
- Nested scopes are independent; share state through a store, signal through DOM events (`dispatch(el, 'name', detail)` from `rousejs`).
- Register scopes at app level with `app.scope(name, setup)`, never inside another setup.

## Stores

A store is one flat reactive object: data, getters (cached computeds; keep them pure), and methods (`this` is the store). Only plain data syncs. The root must be an object.

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
<!-- Autosaves 500 ms after the last edit; the button saves on demand -->
<script
  type="application/json"
  data-rz-store="user: /api/user"
  data-rz-push="edit-[@user]|debounce-[500ms]: @user"
>{ "name": "Ada" }</script>

<input data-rz-model="@user.name">
<button data-rz-push="click: @user" data-rz-attr="disabled: @user::status.syncing">Save</button>
<span data-rz-class="unsaved: @user::status.dirty">Unsaved changes</span>
```

- `rz-push`, `rz-pull`, and `rz-deposit` always name their store, including on the store's own script (`<script data-rz-store="feed" data-rz-sse="ready: /feed" data-rz-deposit="@feed">`). A path (`@user.profile`) is rejected: stores sync whole.
- `@name::status` is `{ syncing: false | 'push' | 'pull', error: { code, message } | null, lastSync, dirty, dirtyRoots }`.
- Server responses are applied as JSON Merge Patch (RFC 7396): absent keys stay, objects merge, arrays and primitives replace, `null` deletes the key.
- A push in progress holds later pushes and sends one follow-up when it succeeds. A failed push changes no data: the store stays dirty and `status.error` is set. Roll back yourself: `app.on('rz:push:error', () => app.stores.revert('cart'))`.
- Push sends `Content-Type: application/merge-patch+json`.
- `app.store(name, data, config?)` takes the endpoint as `config.url`, plus request options (`headers`, `timeout`, `credentials`, …). It returns the store itself, the same object `app.stores.get(name)` returns.

`app.stores` manages every store by name (it's a manager, not a record of stores):

| Method | Does |
| --- | --- |
| `get(name)` | The store, or `undefined` |
| `has(name)` | Whether it exists |
| `status(name)` | The same object as `@name::status` |
| `isDirty(name, root?)` | Unsynced edits, to the store or one top-level key |
| `dirtyRoots(name)` | Top-level keys with unsynced edits |
| `snapshot(name)` | Plain copy of the current data |
| `baseline(name)` | Plain copy of the last synced data |
| `push(name)` / `pull(name)` | Sync now; never reject, check `status` |
| `revert(name, path?)` | Back to the last synced data |
| `reset(name)` | Back to the page-load data |
| `commit(name)` | Mark the current data synced; sends nothing |
| `update(name, state)` | Replace the data and re-baseline |
| `deposit(name, payload)` | Merge a payload as JSON Merge Patch |
| `config(name, partial)` | Change the sync config |
| `remove(name)` | Delete the store |

## Render

`rz-render` repeats a `<template>` over a value. In each instance, `%` is that instance's item; bare paths and `@store` paths resolve as they do outside the template.

```html
<!-- A keyed list from a store; each row reads its item through % -->
<template data-rz-render="@todos.items" data-rz-key="id">
  <li>
    <span data-rz-text="%::position"></span>. <span data-rz-text="%.title"></span>
    <!-- Not %: falls through to the enclosing scope or a store -->
    <span data-rz-text="@todos.owner"></span>
  </li>
</template>

<!-- Boolean mode: renders the instance while the value is true -->
<template data-rz-render="@todos.isEmpty"><p>Nothing to do.</p></template>
```

| Value | Renders | `%` |
| --- | --- | --- |
| Array | One instance per item | The item, of any type |
| Plain object | One instance | The object |
| Number | `n` instances, floored; negative or non-finite renders none | The number, in every instance |
| Anything else (boolean mode) | One instance while truthy, none while falsy | The value |

- `%` is the item in array mode and the rendered value in every other mode. `%.field` needs an object; on a primitive it's `undefined`. `%::index` / `%::position` work in every mode.
- Each instance binds against its item: `%.field`, nested `%.user.name`, metadata `%::index` / `%::position` (readable anywhere in the instance, but read-only, and not item data: `rz-model` can't write them and `rz-send` doesn't send them).
- Bare paths fall through to the enclosing scope. `%` is the nearest item only; outer items aren't reachable.
- Without `rz-key`, instances are reused by position.

### Render targets

An item with a `renderTarget` field renders its instance there instead of beside the template.

```html
<!-- Each card renders into the column its renderTarget names -->
<template data-rz-render="@board.cards" data-rz-key="id">
  <article data-rz-text="%.title"></article>
</template>
<section id="todo"></section>
<section id="done"></section>

<!-- @board.cards: [{ "id": 1, "title": "Write docs", "renderTarget": "#done" }] -->
```

- A string is a selector, matched within the app root (first match). An element is used only if it's inside the app root. Otherwise the instance renders in place, with a dev warning.
- It's read once, when the instance is built. Changing `renderTarget` later doesn't move a reused instance; it moves only when the instance is rebuilt under a new key.
- Instances are appended to the target in the order they're built, and reordering the list doesn't reorder them there.
- A moved instance still binds against its item and the template's scope.
- `renderTarget` is ordinary item data, so a synced store pushes it with the item. Use a selector there; an element can't be serialized.

## Requests

An `rz-fetch` sends its element's data: the `rz-send` payload, else the element's own field, or the fields of a form or fieldset. GET and HEAD send it as query parameters; other methods send a body in the encoding you declare.

```html
<!-- GET /search?q=…: a field sends its own name and value -->
<input name="q" data-rz-fetch="input|debounce-[300ms]: /search" data-rz-place="#results">

<!-- POST a JSON body built from scope and store state; the Content-Type picks the encoding -->
<button
  data-rz-fetch="click: POST /notes"
  data-rz-send="title, @prefs"
  data-rz-headers="Content-Type: application/json"
>Save</button>

<!-- Files need multipart, declared the HTML way -->
<form action="/avatar" method="post" enctype="multipart/form-data" data-rz-fetch="submit">
  <input type="file" name="avatar"><button>Upload</button>
</form>
```

- **Payload.** `rz-send` replaces the element's own data. A field sends `{ name: value }`; a nameless field sends nothing. A form or fieldset sends its enabled fields plus the submitter's name and value, and a submitter's `formaction`, `formmethod`, and `formenctype` beat the form's. Any other element sends nothing without `rz-send`.
- **Encoding**, for methods with a body: a declared `Content-Type` (app `headers` or `rz-headers`), then `formenctype`, then `enctype`, else `application/x-www-form-urlencoded`. It's never inferred from the payload. A `Content-Type` that isn't JSON, urlencoded, or multipart sends form data under that type, with a dev warning.
- **Shape.** JSON keeps nesting and types. Form encodings flatten: arrays become repeated keys, numbers and booleans become strings, nested objects are dropped. A file needs multipart: urlencoded sends its name and JSON drops it. Each loss warns in dev.
- **`app.fetch` body.** An object is sent as JSON, `URLSearchParams` as urlencoded, and strings and native bodies (`FormData`, `Blob`, …) as is; a declared `Content-Type` wins. A body on GET or HEAD throws: pass `params`. A `body` replaces the trigger element's data, and `rz-send` is ignored with a warning.

### Overlapping requests

Every request has an abort key: the trigger element's own by default, or a shared one from `rz-request="abort-key: search"` (`abortKey` in `app.fetch`). An `app.fetch` without `triggerEl` has none unless you set it.

- A new request under a key aborts a **read** in flight under it. The old request fires `:abort`.
- While a **write** (any method but `GET`, `HEAD`, `OPTIONS`, `QUERY`) is in flight, new requests under its key are dropped, with no events. The server may already have acted on the write, so aborting it would only discard its response.
- A read that fails before any response arrives (a dropped connection) is retried once, immediately. Timeouts, cancellations, HTTP errors, and writes are never retried.

### Errors

A response's `error` is `null` on success, else `{ code, message, body?, parseError?, original? }`:

| `code` | Means |
| --- | --- |
| HTTP status (number) | Non-2xx response. `body` is the parsed error body; `parseError` is set if it didn't parse |
| `TIMEOUT` | The `timeout` elapsed |
| `CANCELED` | Aborted by a newer request or a signal (fires `:abort`, not `:error`), prevented in `:config`, or dropped by a guard |
| `NETWORK_ERROR` | No response, after the retry for reads; `original` is the thrown error |
| `PARSE_ERROR` | A 2xx body that couldn't be parsed: malformed JSON, or an event stream (open it with `rz-sse`) |
| `REDIRECTED` | The browser followed a redirect to another origin |
| `INTERNAL_ERROR` | Rouse threw unexpectedly |

## Server responses

The server answers a Rouse request with HTML or JSON, and can steer where it goes with `Rouse-*` response headers.

```http
HTTP/1.1 200 OK
Content-Type: text/html
Rouse-Place: beforeend: #log
Rouse-Trigger: entry-added

<li>Saved at 10:42</li>
```

Here the HTML is appended to `#log` whatever the trigger's `rz-place` says, and an `entry-added` event is dispatched from the trigger after `rz:fetch:success`, so `data-rz-on="entry-added: refresh"` on the trigger or an ancestor hears it.

Requests identify themselves: a fetch sends `Rouse-Request: true`; a push or pull sends `Rouse-Sync: push | pull` and `Rouse-Store: <name>`. A `null` header value in `rz-headers` drops any of them.

A fetch response is routed by content type:

- **HTML** goes to the `rz-place` targets (default: the trigger's `innerHTML`; `data-rz-place="null"` for none).
- **JSON** merges into the `rz-deposit` stores, as JSON Merge Patch. Without `rz-deposit` it goes nowhere.
- **Files** only fire `rz:fetch:success:file`.
- **Not routed:** error responses, an empty body, and an `app.fetch` without `triggerEl`, unless the server sends `Rouse-Place` or `Rouse-Deposit`. An empty body with `Rouse-Place` places `''`, so a `204` with `Rouse-Place: delete` removes the trigger.

Unnamed `rz-sse` messages route the same way, without headers.

The server can override the client with response headers. The header wins over the markup:

| Header | Effect | Applies to |
| --- | --- | --- |
| `Rouse-Place` | Replaces `rz-place` for this response, same grammar (`beforeend: #log`, `delete`). Beats `rz-place="null"` | fetch |
| `Rouse-Deposit` | Replaces `rz-deposit` for this response (`@results`) | fetch |
| `Rouse-Trigger` | Dispatches the named event from the trigger element after `:success`; `detail` is the response | fetch, push, pull |
| `Rouse-Redirect` | Navigates the page to the URL; the rest of the response is ignored | fetch |
| `Rouse-Push-Url` | `history.pushState` to the URL; same origin only | fetch |
| `Rouse-Replace-Url` | `history.replaceState` to the URL; same origin only. `Rouse-Push-Url` wins if both are sent | fetch |

A redirect the browser follows (`3xx`) navigates the page to the final URL when it's same-origin, and fails with `REDIRECTED` when it isn't.

## Programmatic API

Everything markup does is also callable from JavaScript, through the app and a few package exports.

```js
// Request through the app's config and interceptors; never throws
const { data, error } = await app.fetch('/api/user', { timeout: 5000 });

// Listen with the same modifiers as markup: keyup|ctrl.key-[arrowup]
app.on('keyup', bump, { ctrl: true, key: 'ArrowUp' });

// Insert HTML the way rz-place would
app.place('#log', '<li>Done</li>', { position: 'beforeend' });

// Add a header to every request
app.interceptor('request', (config) => {
  config.headers['X-Trace'] = crypto.randomUUID();
  return config;
});
```

| Member | Returns | Notes |
| --- | --- | --- |
| `app.scope(name, setup)` | the app | Register a scope; chainable |
| `app.store(name, data, config?)` | the store | Create a store; see Stores |
| `app.start()` | | Scan and bind; a second call warns and does nothing |
| `app.destroy()` | | Unbind everything, fire `rz:app:destroy`, end every listener and request. Terminal |
| `app.fetch(url, options?)` | `Promise<{ data, error, status, headers, response, config }>` | Never rejects |
| `app.on([target,] event, callback, options?)` | teardown | Listen until the app is destroyed or `options.signal` aborts |
| `app.place(target, html, options?)` | `boolean` | `true` if anything was placed |
| `app.sse(url, options?)` | closer | Open a stream, or join one already open at that URL |
| `app.interceptor(phase, fn, options?)` | teardown | Phase `'request'`, `'response'`, or `'error'` |
| `app.stores` | | Store manager; see Stores |
| `app.root`, `app.config`, `app.isReady` | | The root element, resolved config, and whether `rz:app:ready` has fired |

| Export | Does |
| --- | --- |
| `rouse(config?)` | Create an app (also the default export; the class is `RouseApp`) |
| `signal(value)` | A reactive value: `s()` reads, `s(v)` writes |
| `computed(fn)` | A cached derived value, read as `c()` |
| `effect(fn)` | Run `fn` now and whenever what it read changes; returns a stop function |
| `reactive(object)` | A deeply reactive proxy of the object or array |
| `dispatch(el, name, detail?, init?)` | Dispatch a bubbling `CustomEvent`; returns it |
| `createKey(prefix?)` | A key unique for the page's lifetime, for `rz-key` |

- `app.fetch` options: `method`, `body`, `headers`, `params`, `timeout`, `abortKey`, `signal`, `indicator`, `triggerEl`, `skipInterceptors`, and any other `RequestInit` field. Without `triggerEl` it reads nothing from the DOM and routes nothing (unless the server sends `Rouse-Place` / `Rouse-Deposit`).
- `app.on` target defaults to `app.root`. The event is one name or a one-key trigger-source descriptor; modifiers go in options, never in the name. `media-[(min-width: 640px)]|once` is `app.on({ media: '(min-width: 640px)' }, fn, { once: true })`; `edit-[@cart.items]` is `{ edit: 'cart.items' }` (no `@`).
- `app.place` target is an element or a selector within the app root (every match). Positions, case-sensitive: `innerHTML` (default), `outerHTML`, `beforebegin`, `afterbegin`, `beforeend`, `afterend`, `delete`.
- `app.sse` options: `triggerEl`, `withCredentials`, `signal`.

### Interceptors

Interceptors run on every fetch, push, and pull the app makes, in registration order, and may be async. `skipInterceptors: true` in `app.fetch` opts one call out; markup can't. `rz-sse` doesn't use them. Each `app.interceptor` call returns a teardown and takes `{ signal }`.

| Phase | Function | Runs |
| --- | --- | --- |
| `request` | `(config) => config` | After `:config` listeners, before sending. The return is merged into the config; a throw fails the request through the `error` phase |
| `response` | `(data, response, config) => data` | On a 2xx response, before routing. The return replaces `data` |
| `error` | `(error, config) => error` | On any failure, including HTTP errors, timeouts, and cancellations, after the retry. The return replaces `error` |

## TypeScript

Rouse ships its own types. The JavaScript API is typed end to end; markup is not: directive values are strings, so nothing checks `data-rz-text="usr.name"` against the scope.

```ts
import type { LifecycleEventMap, RenderHandlerCtx, ScopeSetup } from 'rousejs';

type Todo = { id: string; title: string };

// The type argument types host
const todos: ScopeSetup<HTMLUListElement> = ({ host }) => ({
  get count() { return host.children.length; },
  // Inside rz-render, render.item is the row's Todo
  remove({ render }: RenderHandlerCtx<Todo>) { /* render.item.id */ },
});

// app.on infers the detail from the event name
app.on('rz:fetch:error', (e) => console.warn(e.detail.status));

// Elsewhere, index LifecycleEventMap
el.addEventListener('rz:store:patch', (e) => {
  const { storeName } = (e as CustomEvent<LifecycleEventMap['rz:store:patch']>).detail;
});
```

| Type | For |
| --- | --- |
| `RouseConfig` | Options for `rouse()` |
| `ScopeSetup<E>` | A setup function; `E` types `host` |
| `ScopeCtx<E>` | The setup's argument: `{ host, app, term, scan }` |
| `HandlerCtx<E>` | A handler's argument: `{ el, e, render }` |
| `RenderHandlerCtx<Item, E>` | A handler's argument inside `rz-render`; `render.item` is `Item` |
| `BindableValue` | What a binding can write |
| `LifecycleEvent` | Union of every lifecycle event name |
| `LifecycleEventMap` | Lifecycle event name → `detail` type |

- `app.store('cart', data)` returns `data`'s type, so the store's fields, getters, and methods are typed. `app.stores.get<T>(name)` takes the type explicitly.
- `dispatch(el, name, detail)` checks `detail` when `name` is a lifecycle event.

## Lifecycle events

Rouse dispatches `rz:*` events as an app, scope, request, store, or stream changes state. Listen with `app.on` or use one as a trigger in markup.

```js
// Report failed requests from anywhere in the app
app.on('rz:fetch:error', (e) => toast(`Request failed: ${e.detail.status}`));

// Add a header to fetches from one form; config is the object that gets sent
app.on(form, 'rz:fetch:config', (e) => {
  e.detail.config.headers['X-Form'] = form.id;
});

// Cancelable: veto an HTML placement
app.on('rz:dom:place:before', (e) => {
  if (!e.detail.payload.trim()) e.preventDefault();
});
```

Every event bubbles to `app.root`. Each fires from the element it describes:

- **App** from `app.root`; **scope** from the scope's host.
- **Request** (a network operation) from the triggering element, or `app.root` without one. `rz:push:*` and `rz:pull:*` have the same events as `rz:fetch:*`, minus the per-content-type ones.
- **Destination** (what a response changed) from the store's script (else `app.root`) or the placement target (its parent for `outerHTML` / `delete`). `operation` or `source` names the cause.
- **Connection** (a stream) from the `rz-sse` element.

| Event | When | Detail |
| --- | --- | --- |
| `rz:app:start` | `start()` begins, before the scan | `{ app }` |
| `rz:app:ready` | The frame after the first scan | `{ app }` |
| `rz:app:destroy` | `destroy()` | `{ app }` |
| `rz:scope:init` | Setup returned | `{ context, instance }` |
| `rz:scope:connect` | Bindings attached, after `rz-wake` | `{ instance }` |
| `rz:scope:disconnect` | Bindings detached | `{ instance }` |
| `rz:scope:destroy` | Torn down; fires last. `instance` is for recognizing the scope, not calling it | `{ instance }` |
| `rz:fetch:config` | Before sending. **Cancelable**: prevented, nothing else fires. Edit `config` in place (absolute `url`, `method`, `headers`); it's the object sent | `{ config }`; push/pull add `storeName` |
| `rz:fetch:start` | Sent | as `:config` |
| `rz:fetch:success` | 2xx response. Exactly one of `:success`, `:error`, `:abort` fires | Fetch: the response `{ data, error, status, headers, response, config }`. Push/pull: `{ storeName, result }` |
| `rz:fetch:success:{html,json,file}` | Right after `:success`, per content type; what `rz-place` and `rz-deposit` route | the response |
| `rz:fetch:error` | Error status, network failure, or timeout | as `:success` |
| `rz:fetch:error:{html,json,file}` | Right after `:error`, per content type | the response |
| `rz:fetch:abort` | Aborted by a newer request or a signal | as `:config` |
| `rz:fetch:end` | Always last | as `:config` |
| `rz:store:patch:before` | Before a payload is applied. **Cancelable**; `payload` can be rewritten | `{ storeName, operation, data, payload }` |
| `rz:store:patch` | Payload applied | `{ storeName, operation, data, payload, response }` |
| `rz:store:patch:skipped` | An edit made during the request kept the response from applying. A deposit never skips | `{ storeName, operation, localData, serverData, response }` |
| `rz:dom:place:before` | Before placing. **Cancelable**; `payload` can be rewritten | `{ target, position, payload, source }` |
| `rz:dom:place` | Placed | `{ target, position, payload, source }` |
| `rz:sse:config` | Before the first connection, once. **Cancelable**; edit `config` in place | `{ config }` |
| `rz:sse:open` | Each successful (re)connection | `{ config }` |
| `rz:sse:message:{html,json}` | Unnamed messages, before `:message`; what `rz-place` and `rz-deposit` route | as `:message` |
| `rz:sse:message` | Every message | `{ config, event, data, raw, lastEventId }` |
| `rz:sse:error` | Connection lost. **Cancelable**: prevented, no reconnect | `{ config, attempt }` |
| `rz:sse:close` | Stream closed | `{ config, reason }` |

- Request order is always `:config` → `:start` → one of `:success` / `:error` / `:abort` → `:end`, and the request's outcome fires before any destination event (`rz:push:success` before `rz:store:patch:before`).
- Destination events fire only when something changed, so failures appear only on the request events.
- Only real network operations fire request events. `update()`, `reset()`, and triggers dropped by a guard (disconnected, disabled, a sync already running, a write in flight) fire nothing.
- A stream has no final event per message and no `:end`: it opens once and receives many messages.

## Multiple apps

Each `rouse({ root })` is self-contained: its own stores, scopes, interceptors, listeners, and config, so `@cart` in one app never reaches another app's `cart`. Use separate apps for micro-frontends or widgets that must stay isolated. One app per root; after `destroy()`, a new app can mount on the same element.

```js
// The page app owns document.body
const page = rouse();
page.start();

// Later, a widget with its own app. Constructing it first marks the root,
// so the page app skips the widget's markup when it's inserted
const root = document.createElement('div');
const widget = rouse({ root, baseUrl: '/widget-api' });
widget.store('cart', { items: [] }); // a different cart from the page's @cart
document.querySelector('#sidebar').append(root);
widget.start();
```

- Apps can nest. A page app on the default `document.body` with an embedded widget is nested. The outer app skips the inner app's markup, and a nested app mounted after the outer one started takes its markup over.
- Construct a nested app before inserting its root element, or the outer app binds that markup until the nested app exists.
- Events bubble across roots: an outer `app.on('rz:fetch:success', …)` or `sse-[name]|root` also hears the inner app's. To handle only your own app's events, check `e.target.closest('[data-rouse-app]') === app.root`.

## Silent pitfalls

These bind without error and do the wrong thing, usually nothing.

- **Modifiers need a pipe.** `click.debounce-[300ms]` is one event named `click.debounce` and never fires. Write `click|debounce-[300ms]`.
- **Render fields need a dot.** `%name` is not `%.name`. The dot-less form reads `undefined` and writes nothing.
- **Key names are exact.** `key-[entr]` never fires, and `keydown|enter` (no `key-[]`) fires on every key, with only a dev warning. `key-[ctrl]` is wrong: the key name is `control`, the held flag is `ctrl`.
- **Scope state isn't reactive by default.** A plain field or `let` returned from setup renders once and never updates; use `signal`/`reactive` behind a getter.
- **Scope listeners and requests are app-wide.** `app.on` in a scope listens on the whole app unless you pass `host` first, and lasts as long as the app without `signal: term`. `app.fetch` likewise keeps running after teardown without `signal: term`.
- **Register before scanning.** A store registered after the markup reading it was scanned stays `undefined` in those bindings for good.
- **Stream events stay local.** `sse-[name]` hears only its own element's stream and descendants. A listener beside the stream needs `sse-[name]|root`.
- **Some events fire off the element.** `visibilitychange` fires on `document`: write `visibilitychange|document`. `load|window` never fires if the app starts after load; use `ready`.
- **Streams don't wait for a lazy scope.** A stream inside a lazily woken scope opens at page load. Use `data-rz-sse="wake: /events"`.
- **Wake waits for every trigger.** `rz-wake` is AND: `interact timeout-[5s]` waits for both.
- **Wake and close need a host directive.** `rz-wake` does nothing without `rz-scope`, and `rz-close` nothing without `rz-sse`.
- **Null deletes synced fields.** In a synced store `null` deletes the key, so leave a field absent instead of `null`. A server serializer that omits empty values (Go `omitempty`) can never clear a field.
- **Placement defaults to the host.** `rz-place` defaults to the host's `innerHTML`, so a stream element without it writes every unnamed HTML message into itself. Use `data-rz-place="null"` to opt out.
- **Edit triggers watch data fields.** `edit-[@store.key]` filters on data fields. A setter writes its underlying field, so watching the accessor's key never fires.
- **CORS must allow Rouse headers.** A cross-origin server must list the `Rouse-*` headers in `Access-Control-Allow-Headers` (or sync requests fail as `Failed to fetch`) and `Access-Control-Expose-Headers` (or response headers are ignored).
- **Push isn't plain JSON.** Push bodies are `application/merge-patch+json`. A server parsing only `application/json` (Express `express.json()`) sees an empty body.
- **Streams send no headers.** `EventSource` can't set headers, so `rz-headers`, `rz-request`, and interceptors don't apply to `rz-sse`.
- **URLs can read as methods.** A relative URL spelled like an HTTP method is read as one: write `./query`, not `query`.
- **Scripts in placed HTML don't run.** `rz-place`, `Rouse-Place`, `rz-sse`, `rz-html`, and `app.place` insert HTML through `innerHTML`, which never runs `<script>`. Put behavior in a scope; the fragment's directives still bind.
