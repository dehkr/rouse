# Rouse

> Rouse (`rousejs` on [npm](https://www.npmjs.com/package/rousejs)) is a directive-driven reactivity and state-sync layer for server-rendered HTML. The server sends the markup; `data-rz-*` attributes bind it to reactive state, events, and network requests. Logic lives in plain JavaScript scopes and stores, never in attribute expressions. Rouse is pre-release. Source: [github.com/dehkr/rouse](https://github.com/dehkr/rouse).

## Setup

Create an app, register its scopes, stores, interceptors, and listeners, then start it. Starting scans the page and binds every directive.

```js
import { rouse } from 'rousejs';

// Creates the app with config; config is read-only after creation
const app = rouse({
  root: '#app',
  baseUrl: '/api',
  headers: { 'X-Tenant': '42' },
});

app.scope('counter', () => { /* ... */ }); // defines the API inside data-rz-scope="counter"
app.store('prefs', { theme: 'dark' });     // app-wide state, addressed as @prefs in HTML
app.interceptor('request', addAuth);       // edits every request before it's sent
app.on('rz:fetch:error', showToast);       // hears lifecycle events from the whole app

app.start(); // scans the root and binds directives
```

`start()` scans the DOM once and then watches for added nodes. Registration applies to DOM scanned afterward and never retroactively. `<script data-rz-store>` stores don't exist until `start()`. `destroy()` is terminal.

Install with `npm install rousejs`, or skip the install and import from a CDN in a `<script type="module">`: `https://cdn.jsdelivr.net/npm/rousejs@0.16.0/dist/rouse.js` (development) or `https://cdn.jsdelivr.net/npm/rousejs@0.16.0/dist/rouse.min.js` (production). Rouse ships as ES modules only.

- npm `rousejs` -> minified build; under a bundler's `development` condition -> development build.
- `rousejs/dev` and `rousejs/min` pick one explicitly.
- Only the development build logs `[Rouse]` authoring warnings.

### Config options

Options passed to `rouse()`. Every key is optional.

| Config key | Default | Meaning |
| --- | --- | --- |
| `root` | `document.documentElement` | Element or selector the app owns |
| `baseUrl` | `''` | Prefixed to relative URLs in `rz-fetch`, `rz-push`, `rz-pull`, `rz-sse`, `app.fetch`, `app.sse` |
| `headers` | `{}` | Sent with every request; a `null` value removes a header |
| `credentials` | browser's (`same-origin`) | `fetch` `credentials` for every request |
| `timeout` | `0` (none) | Abort every request after this many ms; a per-request `timeout` overrides it |
| `wake` | `ready` | Default scope activation; `rz-wake` overrides it per scope |

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
- Values are literal text: no expressions, interpolation, or call arguments. `save(1)` is looked up as a literal key and matches nothing. Put logic in a getter or method and name it.
- Per-element parameters go in ordinary `data-*` attributes, read as `el.dataset` in a handler or `host.dataset` in a setup.
- Pairs are separated by a comma **plus whitespace** (`, `); key and value by a colon **plus whitespace** (`: `). Quote a value containing `, ` or `: ` (`'color: red'`). `rz-disable` and `rz-indicator` are the exceptions: each takes its whole value as one selector list, so `data-rz-disable="#e1, #e2"` needs no quotes.

### Addressing

How a directive value names state.

| Form | Resolves to | Example |
| --- | --- | --- |
| Bare path | A key on the nearest enclosing `data-rz-scope` | `count`, `user.name` |
| `@name` | A store | `@cart` |
| `@name.path` | A field in a store | `@cart.items` |
| `@name::status` | The store's read-only sync status | `@cart::status.syncing` |
| `%` | The current `rz-render` item | `%` |
| `%.path` | A field on the current item | `%.title` |
| `%::index`, `%::position` | The item's zero-based and one-based position | `%::position` |

- Paths are dot paths and may index arrays: `user.name`, `@names.list.0`.

## Directives

Each directive does one job: bind state to the DOM, handle an event, make a request, or route its response.

```html
<!--
The todos scope activates on the first hover or focus inside the section.
The button starts disabled, so nothing submits until the scope binds isEmpty.
On submit, POST the form's fields to its action (/todos) and append the returned
HTML to #todo-list. The fieldset is disabled while the request runs.
-->
<section data-rz-scope="todos" data-rz-wake="interact">
  <form
    action="/todos"
    method="post"
    data-rz-fetch="submit"
    data-rz-place="beforeend: #todo-list"
    data-rz-disable="#todo-fields"
  >
    <fieldset id="todo-fields">
      <!-- todos exposes title and isEmpty -->
      <input name="title" data-rz-model="title">
      <button disabled data-rz-attr="disabled: isEmpty">Add</button>
    </fieldset>
  </form>
  <ul id="todo-list"></ul>
</section>
```

### All directives

Every directive, its job, and a typical value.

| Directive | Purpose | Example |
| --- | --- | --- |
| `rz-scope` | Bind a registered scope to a region; empty value = anonymous boundary | `data-rz-scope="search"` |
| `rz-wake` | Defer scope activation until **all** listed triggers fire (AND) | `data-rz-wake="intersect timeout-[2s]"` |
| `rz-text` | Write state as text | `data-rz-text="@user.name"` |
| `rz-html` | Write state as HTML (unsanitized) | `data-rz-html="previewHtml"` |
| `rz-attr` | Set attributes; `false`/null removes, `true` sets empty; on `aria-*`, booleans write `"true"`/`"false"`. Not `class` or `style`: use `rz-class` / `rz-style` | `data-rz-attr="href: profileUrl, aria-expanded: open"` |
| `rz-prop` | Set DOM properties, type preserved | `data-rz-prop="checked: done, items: @cart.items"` |
| `rz-class` | Toggle the classes on the left by the state on the right, or write a class string or `{ class: bool }` object from a bare path | `data-rz-class="active selected: isChosen"`, `data-rz-class="themeClass"` |
| `rz-style` | Toggle a quoted declaration, set one property, or write a declaration string or object from a bare path | `data-rz-style="'color: red; font-weight: bold': hasError, background: @theme.color"` |
| `rz-model` | Two-way bind an input, textarea, select (`multiple` gives an array), checkbox, radio, or `contenteditable`. Default trigger, resolved at bind: `input` for text, textarea, and `contenteditable`; `change` for select, checkbox, and radio. Custom elements bind `.value` and need an explicit trigger | `data-rz-model="query"`, `data-rz-model="value-changed: @names.list.0"` |
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

Event-driven directives pair a **trigger** (when) with a **subject** (what): `[trigger]: [subject]`. `rz-on`, `rz-fetch`, `rz-push`, `rz-pull`, `rz-sse`, and `rz-model` take it.

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

Modifiers follow the `|` and chain with dots. They filter a trigger, time it, or change where it listens.

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

## Reactivity

Every binding is an effect: it re-runs when a value it read changes, and only then. Stores are reactive already. Scope state is reactive only when the setup builds it from these functions, exported from `rousejs`.

```js
import { computed, effect, reactive, signal } from 'rousejs';

const count = signal(0);                                   // count() reads, count(1) writes
const form  = reactive({ name: '', tags: [] });            // deep proxy; mutate in place
const label = computed(() => `${form.name} (${count()})`); // cached; label() reads
const stop  = effect(() => console.log(label()));          // runs now and after each change
```

- Writing the value a signal or key already holds triggers nothing.
- `reactive()` proxies plain objects and arrays only. `Map`, `Set`, `Date`, and class instances are returned unproxied, and changes inside them update nothing.
- Nested objects become reactive on first read. `reactive(x)` always returns the same proxy, and passing a proxy returns it unchanged.
- Getters on a reactive object are cached computeds, as in stores. Keep them pure.
- Array mutators (`push`, `splice`, `sort`, …) notify once per call. Callbacks of `map`, `find`, `forEach`, … receive reactive items.
- Reactivity lives in the proxy and the signal, not in values read out of them. `const { name } = form`, or a returned field set to `count()`, is a snapshot. Expose a getter instead.
- An `effect` created during setup or in `connect()` stops with the scope. One created later (in a handler, a timer, or after an `await`) runs until stopped: `term.addEventListener('abort', effect(fn))`.
- A function returned from an `effect` callback is its cleanup. It runs before each re-run and on stop, and reads inside it aren't tracked: `effect(() => { const id = setInterval(tick, state.delay); return () => clearInterval(id); })`.

### Reactivity API

The reactivity functions exported from `rousejs`.

| Function | Returns | Use for |
| --- | --- | --- |
| `signal(value)` | A signal: `s()` reads, `s(v)` writes | A single value, exposed through a scope getter (plus a setter if `rz-model` writes it) |
| `reactive(object)` | A deep proxy of a plain object or array | Objects and lists, returned from a scope as-is and mutated in place |
| `computed(fn)` | A cached derived value, read as `c()` | Derived values. Recomputes only after a value `fn` read changes. Keep `fn` pure |
| `effect(fn)` | A stop function | Side effects that follow state. Runs `fn` now and whenever what it read changes. A function `fn` returns runs as cleanup before each re-run and on stop |

## Scopes

A scope is a synchronous setup function that returns a plain object: the keys that bare paths in its region resolve against. A scope is not a component: no template, props, or re-render. The returned object is **not** made reactive: build its state from `signal` and `reactive` (see [Reactivity](#reactivity)).

```js
import { reactive, signal } from 'rousejs';

app.scope('search', ({ host, app, term }) => {
  // A signal is read through a getter; add a setter if rz-model writes it
  const query = signal('');
  // Reactive objects and arrays track themselves; return them as-is
  const results = reactive([]);

  async function run() {
    // signal: term aborts the request if the scope is torn down mid-flight
    const { data, error } = await app.fetch(`/search?q=${encodeURIComponent(query())}`, {
      signal: term,
    });
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
    results,
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
  <input 
    data-rz-model="query"
    data-rz-on="input|debounce-[300ms]: run, keydown|window.key-[escape]: clear"
  >
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

- A returned `reactive` object or array is the same proxy for the scope's lifetime. Mutate it in place (`results.splice(…)`, `rz-model="form.name"`); assigning a new value to the key isn't reactive.
- Nested scopes are independent; share state through a store, signal through DOM events (`dispatch(el, 'name', detail)` from `rousejs`).
- Register scopes at app level with `app.scope(name, setup)`, never inside another setup.

### Setup context

The setup function receives `{ host, app, term, scan }` (`ScopeCtx`).

| Member | Is | Use it to |
| --- | --- | --- |
| `host` | The `rz-scope` element | Read `host.dataset` parameters, or target `app.on(host, …)` |
| `app` | The app the scope is mounted in | Call `app.fetch`, `app.on`, `app.stores`, … |
| `term` | An `AbortSignal`, aborted on teardown | Pass `signal: term` to `app.on`, `app.fetch`, `app.sse`, and `app.interceptor` so they end with the scope |
| `scan(node)` | A function | Bind directives in a subtree you inserted, now instead of on the next observer pass. Safe to repeat. A node outside this scope's region is ignored |

### Handler context

Scope and store methods called from directives receive `{ el, e, render }` (`HandlerCtx`).

| Member | Is |
| --- | --- |
| `el` | The element the directive is bound to |
| `e` | The triggering event. For a function called by a binding (`rz-text`, `rz-attr`, …), a synthetic `CustomEvent` |
| `render` | `{ item, index }` of the enclosing `rz-render` instance; both `null` outside one |

- A scope or store function named in `rz-text`, `rz-attr`, … is called with the handler context, and its return value is written.

### Lifecycle hooks

`connect()` and `disconnect()` are optional methods on the returned object. Both are called with `this` as that object and no arguments.

| Hook | Runs | Order |
| --- | --- | --- |
| `connect()` | Once per instance, after the region's directives bind | setup -> `rz:scope:init` -> bind -> `connect()` -> `rz:scope:connect` |
| `disconnect()` | On teardown: the host leaves the DOM, or `app.destroy()` | `term` aborts -> bindings detach -> `disconnect()` -> `rz:scope:disconnect` -> `rz:scope:destroy` |

- Use `connect()` for work that needs bound DOM: measuring, focusing, or mounting a third-party widget. Setup runs before any directive binds.
- With `rz-wake`, `connect()` waits for activation. Setup waits too.
- Prefer `signal: term` for cleanup. It also covers a setup that throws partway, which runs neither hook. Keep `disconnect()` for undo work `term` can't reach, such as a widget's own `destroy()`.
- Moving the host is a removal and an insertion: the instance tears down and setup runs again. State that must survive a move belongs in a store.
- A throwing hook is logged; the mount or teardown still completes.

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
<button
  data-rz-push="click: @user"
  data-rz-attr="disabled: @user::status.syncing"
>Save</button>
<span data-rz-class="unsaved: @user::status.dirty">Unsaved changes</span>
```

- `rz-push`, `rz-pull`, and `rz-deposit` always name their store, including on the store's own script (`<script data-rz-store="feed" data-rz-sse="ready: /feed" data-rz-deposit="@feed">`). A path (`@user.profile`) is rejected: stores sync whole.
- Server responses are applied as JSON Merge Patch (RFC 7396): absent keys stay, objects merge, arrays and primitives replace, `null` deletes the key.
- A push in progress holds later pushes and sends one follow-up when it succeeds. A failed push changes no data: the store stays dirty and `status.error` is set. Roll back yourself: `app.on('rz:push:error', () => app.stores.revert('cart'))`.
- Push sends `Content-Type: application/merge-patch+json`.
- `app.store(name, data, config?)` takes the endpoint as `config.url`, plus request options (`headers`, `timeout`, `credentials`, …). It returns the store itself, the same object `app.stores.get(name)` returns.

### Store status

`@name::status` in markup, `app.stores.status(name)` in JavaScript. Reactive and read-only.

| Field | Value |
| --- | --- |
| `syncing` | `'push'` or `'pull'` while one is in flight, else `false` |
| `error` | `{ code, message }` from the last failed push or pull, else `null`. Cleared when the next one starts |
| `lastSync` | Timestamp (ms) of the last time the store took in server data, else `0` |
| `dirty` | `true` while the store holds edits the server hasn't confirmed |
| `dirtyRoots` | An object keyed by each top-level key with unsynced edits (`dirtyRoots.items`), not an array |

### Declarative stores

A `<script type="application/json" data-rz-store="name: /endpoint">` declares a store when it's scanned: at `start()`, or when inserted later. The body is the initial data and must be a JSON object; an empty body starts the store as `{}`. Invalid JSON logs an error, in production too, and creates no store.

The script element is the store's declaration. Replacing it with a new script of the same name re-declares the store:

- **Data.** The new body replaces the data and becomes the new `reset()` and `revert()` target. Unsaved edits are discarded, and the store reads clean.
- **Config.** The endpoint and headers come from the new script. A missing endpoint or `rz-headers` clears that setting, including headers set in JS. Other options (`timeout`, `credentials`, …) are kept.
- **Empty body.** The data is kept; only the config is replaced.

```html
<!-- A server re-render swaps the script; the store re-seeds from the new body -->
<script type="application/json" data-rz-store="cart: /api/cart">
  { "items": [] }
</script>
```

- Removing the script leaves the store registered. Only `app.stores.remove(name)` deletes a store.
- A second script with the same name, while the first is still in the page, is ignored with a dev warning. So is a script for a store created with `app.store()`.
- Bindings follow the store, not the script: the same `@cart` paths keep updating across a re-declaration.

### Store manager methods

`app.stores` manages every store by name. It's a manager, not a record of stores.

| Method | Returns | Notes |
| --- | --- | --- |
| `get(name)` | The store, or `undefined` | The same reactive object `@name` reads in markup and `app.store()` returns. Writes through it update bindings and mark the store dirty |
| `has(name)` | `true` if the store exists | A `<script data-rz-store>` store exists only after `start()` |
| `status(name)` | The store's status, or `undefined` | The same reactive object as `@name::status`; see [Store status](#store-status) |
| `isDirty(name, root?)` | `true` if the store, or one top-level key, has unsynced edits | `root` is a top-level key (`'items'`), not a path. Updates a microtask after an edit |
| `dirtyRoots(name)` | Array of top-level keys with unsynced edits; empty when clean | A copy: changing it doesn't affect the status |
| `snapshot(name)` | Plain, non-reactive deep copy of the current data | Data fields only: getters and methods are dropped, and non-plain objects (`Date`, `Map`) become `{}` with a dev warning. Safe to serialize |
| `baseline(name)` | Plain, non-reactive deep copy of the last synced data | What `revert()` restores and dirty checks compare against. Same copy rules as `snapshot()` |
| `push(name)` / `pull(name)` | `Promise<void>`; never rejects | Syncs now; check `status(name).error` for the outcome. A push during another push waits and sends once |
| `revert(name, path?)` | `true` if anything changed | Restores the last synced data. With `path`, restores one field or branch |
| `reset(name)` | | Restores the initial data: from creation, the last `update()`, or the last re-declared script. The store then reads clean |
| `commit(name)` | | Marks the current data synced; sends nothing. Use it when the data reached the server another way |
| `update(name, state)` | The store | Replaces the data; it becomes the new `reset()` and `revert()` target, and the store reads clean. Sends nothing |
| `deposit(name, payload)` | `false` if the store is missing or a listener canceled | Merges a payload as JSON Merge Patch, the way `rz-deposit` does. The payload's keys become synced; other unsaved edits stay |
| `config(name, partial)` | | Merges `partial` into the sync config (`url`, `headers`, `timeout`, …) |
| `remove(name)` | | Deletes the store. Existing references keep working but stop syncing and firing `edit` triggers |

## Render

`rz-render` repeats a `<template>` over a value. In each instance, `%` is that instance's item; bare paths and `@store` paths resolve as they do outside the template.

```html
<!-- A keyed list from a store; each row reads its item through % -->
<template data-rz-render="@todos.items" data-rz-key="id">
  <li>
    <span data-rz-text="%::position"></span>. <span data-rz-text="%.title"></span>
    <!-- Stores are reachable and bare paths fall through to the enclosing scope -->
    <span data-rz-text="@todos.owner"></span>
  </li>
</template>

<!-- Boolean mode: renders the instance while the value is true -->
<template data-rz-render="@todos.isEmpty"><p>Nothing to do.</p></template>
```

### Render modes

What `rz-render` renders for each kind of value, and what `%` holds in each instance.

| Value | Renders | `%` |
| --- | --- | --- |
| Array | One instance per item | The item, of any type |
| Plain object | One instance | The object |
| Number | `n` instances, floored; negative or non-finite renders none | The number, in every instance |
| Anything else (boolean mode) | One instance while truthy, none while falsy | The value |

- `%` is the item in array mode and the rendered value in every other mode. `%.field` needs an object; on a primitive it's `undefined`. `%::index` / `%::position` work in every mode.
- Each instance binds against its item: `%.field`, nested `%.user.name`. Metadata (`%::index`, `%::position`) is readable anywhere in the instance but read-only and not item data: `rz-model` can't write it and `rz-send` doesn't send it.
- Bare paths fall through to the enclosing scope. `%` is the nearest item only; outer items aren't reachable.

### Keys

`rz-key` on the `<template>` names a field on each item, as a dot path without `%` (`id`, `user.id`). Instances are matched to items by that value across re-renders.

- Without `rz-key`, instances are matched by position. DOM state (focus, input values, a running transition) stays at its index when items reorder. Key any list that reorders, filters, or is refetched.
- An item whose key is missing or `null` is keyed by position, with a dev warning.
- An item whose key repeats an earlier item's isn't rendered, with only a dev warning.
- Give client-created items a key once, at creation: `items.push({ id: createKey(), text })`. Never call `createKey()` in a getter.

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

An `rz-fetch` sends its element's data. Payload precedence: `rz-send` -> the element's own field -> a form's or fieldset's enabled fields. GET and HEAD send it as query parameters; other methods send a body in the encoding you declare.

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
- **Encoding**, for methods with a body. Precedence: `Content-Type` header (app `headers` or `rz-headers`) -> button `formenctype` -> form `enctype` -> `application/x-www-form-urlencoded`. Never inferred from the payload. A `Content-Type` that isn't JSON, urlencoded, or multipart sends form data under that type, with a dev warning.
- **`app.fetch` body.** An object is sent as JSON, `URLSearchParams` as urlencoded, and strings and native bodies (`FormData`, `Blob`, …) as is; a declared `Content-Type` wins. A body on GET or HEAD throws: pass `params`. A `body` replaces the trigger element's data, and `rz-send` is ignored with a warning.

### Body encoding

How each payload value is sent under each encoding. GET and HEAD query parameters follow the urlencoded column.

| Value | JSON | urlencoded | multipart |
| --- | --- | --- | --- |
| String | Kept | Kept | Kept |
| Number, boolean | Kept, typed | String | String |
| Array | Kept | Repeated keys | Repeated keys |
| Nested object | Kept | Dropped, with a dev warning | Dropped, with a dev warning |
| `null`, `undefined` | `null` kept; an `undefined` key is omitted | Dropped | Dropped |
| File | Dropped, with a dev warning | Its name, with a dev warning | Sent |

### Request options

Per-request options, written as `rz-request` pairs in markup or `app.fetch` options in JavaScript.

| `rz-request` key | `app.fetch` option | Effect |
| --- | --- | --- |
| `timeout` | `timeout` | Abort after this long: a duration in markup (`5s`, `300`), ms in JS. Overrides the app `timeout` |
| `abort-key` | `abortKey` | Share an abort key with other requests; see [Overlapping requests](#overlapping-requests) |
| `credentials` | `credentials` | `fetch` `credentials`: `omit`, `same-origin`, `include` |
| `keepalive` | `keepalive` | Let the request outlive the page. A bare key is `true` |
| `redirect` | `redirect` | `fetch` `redirect`: `follow`, `error`, `manual` |
| `cache` | `cache` | `fetch` `cache` mode: `no-store`, `reload`, … |

- Any other `rz-request` key warns and is ignored. The method goes in the `rz-fetch` subject, headers in `rz-headers`, and the indicator in `rz-indicator`.

### Overlapping requests

Every request has an abort key: the trigger element's own by default, or a shared one from `rz-request="abort-key: search"` (`abortKey` in `app.fetch`). An `app.fetch` without `triggerEl` has none unless you set it.

| In flight under the key | A new request under it |
| --- | --- |
| A read (`GET`, `HEAD`, `OPTIONS`, `QUERY`) | Aborts it; the old request fires `:abort` |
| A write (any other method) | Is dropped, with no events |

- A write isn't aborted because the server may already have acted on it, so aborting would only discard its response.

## Server responses

The server answers a Rouse request with HTML or JSON, and can steer where it goes with `Rouse-*` response headers.

```http
HTTP/1.1 200 OK
Content-Type: text/html
Rouse-Place: beforeend: #log
Rouse-Trigger: entry-added

<li>Saved at 10:42</li>
```

`Rouse-Place` appends the HTML to `#log`, overriding the trigger's `rz-place`. `Rouse-Trigger` dispatches `entry-added` from the trigger after `rz:fetch:success`. A `data-rz-on="entry-added: refresh"` on the trigger or an ancestor hears it.

### Response routing

How Rouse routes a fetch response from markup, by content type. Code can take any response itself, from the `app.fetch` result or the event in the last column, and merge JSON into a store with `app.stores.deposit(name, data)`.

| Response | Goes to | Event |
| --- | --- | --- |
| HTML | The `rz-place` targets (default: the trigger's `innerHTML`; `data-rz-place="null"` for none) | `rz:fetch:success:html` |
| JSON | The `rz-deposit` stores, merged as JSON Merge Patch. Nowhere without `rz-deposit` | `rz:fetch:success:json` |
| File | Nowhere | `rz:fetch:success:file` |

- **Not routed:** error responses, an empty body, and an `app.fetch` without `triggerEl`, unless the server sends `Rouse-Place` or `Rouse-Deposit`. An empty body with `Rouse-Place` places `''`, so a `204` with `Rouse-Place: delete` removes the trigger. See [Errors](#errors) for routing error responses.
- Unnamed `rz-sse` messages route the same way, without headers.

### Response headers

The server can override the client with response headers. The header wins over the markup.

| Header | Effect | Applies to |
| --- | --- | --- |
| `Rouse-Place` | Replaces `rz-place` for this response, same grammar (`beforeend: #log`, `delete`). Beats `rz-place="null"` | fetch |
| `Rouse-Deposit` | Replaces `rz-deposit` for this response (`@results`) | fetch |
| `Rouse-Trigger` | Dispatches the named event from the trigger element after `:success`; `detail` is the response | fetch, push, pull |
| `Rouse-Redirect` | Navigates the page to the URL; the rest of the response is ignored | fetch |
| `Rouse-Push-Url` | `history.pushState` to the URL; same origin only | fetch |
| `Rouse-Replace-Url` | `history.replaceState` to the URL; same origin only. `Rouse-Push-Url` wins if both are sent | fetch |

A redirect the browser follows (`3xx`) navigates the page to the final URL when it's same-origin, and fails with `REDIRECTED` when it isn't.

### Request headers

Headers Rouse sends, so the server can tell its requests apart.

| Header | Value | Sent by |
| --- | --- | --- |
| `Rouse-Request` | `true` | Every request |
| `Rouse-Sync` | `push` or `pull` | Push and pull |
| `Rouse-Store` | The store's name | Push and pull |
| `Accept` | `application/json, text/html, image/svg+xml, */*;q=0.8` | Every request |

- A `null` value in `rz-headers`, app `headers`, or `app.fetch` `headers` drops any of them.
- A push also sends `Content-Type: application/merge-patch+json`.

## Errors

A failed request never rejects. It resolves with `error` set and fires `rz:fetch:error` (`rz:push:error`, `rz:pull:error` for sync). Error responses skip `rz-place` and `rz-deposit`: a 4xx/5xx body reaches the page only if the server routes it with a header or your code renders it.

### Error codes

`error` is `null` on success, else `{ code, message, body?, parseError?, original? }`. `code` identifies the failure.

| `code` | Means |
| --- | --- |
| HTTP status (number) | Non-2xx response. `body` is the parsed error body; `parseError` is set if it didn't parse |
| `TIMEOUT` | The `timeout` elapsed |
| `CANCELED` | Aborted by a newer request or a signal (fires `:abort`, not `:error`), prevented in `:config`, or dropped by a guard |
| `NETWORK_ERROR` | No response; `original` is the thrown error |
| `PARSE_ERROR` | A 2xx body that couldn't be parsed: malformed JSON, or an event stream (open it with `rz-sse`) |
| `REDIRECTED` | The browser followed a redirect to another origin |
| `INTERNAL_ERROR` | Rouse threw unexpectedly |

### Handling strategies

Pick by who owns the error UI. Strategies can be combined: a server-routed form error and an app-wide toast can handle the same response.

| Strategy | Mechanism | Fits |
| --- | --- | --- |
| Server-routed | `Rouse-Place` or `Rouse-Deposit` on the error response | Server-rendered error HTML, field validation; no client code |
| Trigger-local | `data-rz-on="rz:fetch:error: showError"` on the trigger or an ancestor | One form or widget |
| App-wide | `app.on('rz:fetch:error', fn)` | Toasts, logging, redirect to login on `401` |
| Interceptor | `app.interceptor('error', fn)` | Normalize or rewrite `error` for every fetch, push, and pull |
| Inline | `const { error } = await app.fetch(…)` | Code that calls `app.fetch` |
| Store sync | `@name::status.error`, `rz:push:error`, `rz:pull:error` | Failed push or pull |

```html
<!-- Field validation: a 422 JSON body deposits per-field messages -->
<script type="application/json" data-rz-store="form-errors">{}</script>

<form action="/signup" method="post" data-rz-fetch="submit">
  <input name="email" data-rz-class="invalid: @form-errors.email">
  <p data-rz-text="@form-errors.email"></p>
  <button>Sign up</button>
</form>
```

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/json
Rouse-Deposit: @form-errors

{ "email": "Enter a valid email address." }
```

```js
// App-wide: e.detail is the full response; data is the parsed error body
app.on('rz:fetch:error', (e) => {
  const { error, data } = e.detail;
  if (error.code === 401) location.assign('/login');
  else toast(error.message);
});

// Interceptor: listeners and app.fetch callers see the returned error
app.interceptor('error', (error) => {
  if (error.code === 'TIMEOUT') {
    error.message = 'The server took too long to respond.';
  }
  return error;
});
```

- **Clear field errors.** Send every field on each response, with `""` for valid ones, and send `Rouse-Deposit` on the success response too. A field left out keeps its old message.
- **Typed sub-events.** `rz:fetch:error:html` and `rz:fetch:error:json` fire right after `rz:fetch:error`, filtered by the error body's content type.
- **Bubbling.** Error events bubble to `app.root`, so one listener on a container handles every trigger inside it.
- **Order.** Error interceptors run before any error event.
- **Cancellations aren't errors.** `CANCELED` from a newer request or a signal fires `:abort`, not `:error`, so it needs no error UI.

## Interceptors

Interceptors edit every fetch, push, and pull the app makes. They run in registration order, may be async, and each receives the previous one's result. `rz-sse` doesn't use them.

```js
// Request: add auth to every request; editing config in place needs no return
app.interceptor('request', async (config) => {
  config.headers.Authorization = `Bearer ${await getToken()}`;
});

// Response: unwrap an envelope before routing; the return replaces data
app.interceptor('response', (data) => data?.result ?? data);

// In a scope: removed when the scope tears down
app.interceptor('error', logError, { signal: term });
```

- **Throws.** A throw in a `request` or `response` interceptor fails the request as `NETWORK_ERROR`, with the thrown error as `original`, and runs the `error` phase. The request is never re-sent.
- **`config`** is the object that's sent: the same one `:config` listeners edit and `response.config` carries. `url` is absolute. A push or pull carries `Rouse-Sync` and `Rouse-Store` in `config.headers`.
- **Interceptor or `:config` listener.** A listener can be limited to a subtree and can cancel with `preventDefault()`, but runs synchronously. An interceptor applies to every request and can await.
- **Opt-out.** `skipInterceptors: true` in `app.fetch` skips every phase for that call. Markup can't opt out.
- **Lifetime.** `app.interceptor` returns a teardown and takes `{ signal }`. In a scope, pass `signal: term`.

### Interceptor phases

What each phase receives, when it runs, and what its return does.

| Phase | Function | Runs | Return |
| --- | --- | --- | --- |
| `request` | `(config) => config \| void` | After `:config` listeners, before sending | Merged into the config. Optional |
| `response` | `(data, response, config) => data` | On a 2xx response, before routing | Replaces `data`. Required |
| `error` | `(error, config) => error` | On any failure, including HTTP errors, timeouts, and cancellations | Replaces `error`. Required |

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

### Event origins

Every event bubbles to `app.root`. Each fires from the element it describes. Once that element has left the DOM, the event fires from `app.root` instead, and the field in the last column names the element.

| Category | Events | Fires from | Identified by |
| --- | --- | --- | --- |
| App | `rz:app:*` | `app.root` | |
| Scope | `rz:scope:*` | The scope's host | `host` (`context.host` on `:init`) |
| Request (a network operation) | `rz:fetch:*`, `rz:push:*`, `rz:pull:*` | The trigger element, else `app.root` | `config.triggerEl` (`result.config.triggerEl` on push/pull `:success` / `:error`); push/pull also `storeName` |
| Destination (what a response changed) | `rz:store:patch*`, `rz:dom:place*` | The store's script (else `app.root`), or the placement target (its parent for `outerHTML` / `delete`) | `storeName`, `target` |
| Connection (a stream) | `rz:sse:*` | The `rz-sse` element | `config.triggerEl` |

- `rz:push:*` and `rz:pull:*` have the same events as `rz:fetch:*`, minus the per-content-type ones.
- A destination event's `operation` or `source` names the cause.

### All lifecycle events

Every `rz:*` event, when it fires, and its `detail`.

| Event | When | Detail |
| --- | --- | --- |
| `rz:app:start` | `start()` begins, before the scan | `{ app }` |
| `rz:app:ready` | The frame after the first scan | `{ app }` |
| `rz:app:destroy` | `destroy()` | `{ app }` |
| `rz:scope:init` | Setup returned | `{ context, instance }` |
| `rz:scope:connect` | Bindings attached, after `rz-wake` | `{ instance, host }` |
| `rz:scope:disconnect` | Bindings detached | `{ instance, host }` |
| `rz:scope:destroy` | Torn down; fires last. `instance` is for recognizing the scope, not calling it | `{ instance, host }` |
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

### App members

Methods and properties on the app that `rouse()` returns.

| Member | Returns | Notes |
| --- | --- | --- |
| `app.scope(name, setup)` | The app | Registers a scope; chainable |
| `app.store(name, data, config?)` | The store | Creates a store; see [Stores](#stores) |
| `app.start()` | | Scans and binds; a second call warns and does nothing |
| `app.destroy()` | | Unbinds everything, fires `rz:app:destroy`, and ends every listener and request. Terminal |
| `app.fetch(url, options?)` | `Promise<{ data, error, status, headers, response, config }>`; never rejects | Sends a request through the app's config and interceptors |
| `app.on([target,] event, callback, options?)` | A teardown function | Listens until the app is destroyed or `options.signal` aborts |
| `app.place(target, html, options?)` | `true` if anything was placed | Inserts HTML the way `rz-place` does |
| `app.sse(url, options?)` | A close function | Opens a stream, or joins one already open at that URL |
| `app.interceptor(phase, fn, options?)` | A teardown function | Adds an interceptor; phase is `'request'`, `'response'`, or `'error'`. See [Interceptors](#interceptors) |
| `app.stores` | The store manager | See [Store manager methods](#store-manager-methods) |
| `app.root` | The root element | Resolved from `config.root` at creation. Every event bubbles to it, and `app.on` listens on it by default |
| `app.config` | The resolved config | Read-only after creation. Per-request options go in `rz-request`, `app.fetch` options, or a `request` interceptor |
| `app.isReady` | `true` once `rz:app:ready` has fired | `false` until the frame after the first scan. Once it's `true`, a `ready` trigger fires immediately |

- `app.fetch` options: `method`, `body`, `headers`, `params`, `timeout`, `abortKey`, `signal`, `indicator`, `triggerEl`, `skipInterceptors`, and any other `RequestInit` field. Without `triggerEl` it reads nothing from the DOM and routes nothing (unless the server sends `Rouse-Place` / `Rouse-Deposit`).
- `app.on` target defaults to `app.root`. The event is one name or a one-key trigger-source descriptor; modifiers go in options, never in the name. `media-[(min-width: 640px)]|once` is `app.on({ media: '(min-width: 640px)' }, fn, { once: true })`; `edit-[@cart.items]` is `{ edit: 'cart.items' }` (no `@`).
- `app.place` target is an element or a selector within the app root (every match). Positions, case-sensitive: `innerHTML` (default), `outerHTML`, `beforebegin`, `afterbegin`, `beforeend`, `afterend`, `delete`.
- `app.sse` options: `triggerEl`, `withCredentials`, `signal`.

### Package exports

Named exports from `rousejs`.

| Export | Returns | Notes |
| --- | --- | --- |
| `rouse(config?)` | An app (`RouseApp`) | Also the default export. One app per root |
| `signal(value)` | A signal: `s()` reads, `s(v)` writes | See [Reactivity API](#reactivity-api) |
| `computed(fn)` | A cached derived value, read as `c()` | See [Reactivity API](#reactivity-api) |
| `effect(fn)` | A stop function | See [Reactivity API](#reactivity-api) |
| `reactive(object)` | A deep proxy of a plain object or array | See [Reactivity API](#reactivity-api) |
| `dispatch(el, name, detail?, init?)` | The `CustomEvent` | Dispatches a bubbling event from `el`. Use it to signal between nested scopes |
| `createKey(prefix?)` | A key unique for the page's lifetime | For `rz-key` on client-created items. Assign it once at creation, never in a getter |

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

### Exported types

Import these with `import type { … } from 'rousejs'`.

| Type | For |
| --- | --- |
| `RouseConfig` | Options for `rouse()` |
| `ScopeSetup<E>` | A setup function; `E` types `host` |
| `ScopeCtx<E>` | The setup's argument; see [Setup context](#setup-context) |
| `HandlerCtx<E>` | A handler's argument; see [Handler context](#handler-context) |
| `RenderHandlerCtx<Item, E>` | `HandlerCtx` narrowed for a handler bound only inside `rz-render`: `render.item` is `Item`, `render.index` is never `null`. Same object at runtime |
| `BindableValue` | What a binding can write |
| `LifecycleEvent` | Union of every lifecycle event name |
| `LifecycleEventMap` | Lifecycle event name → `detail` type |

- `app.store('cart', data)` returns `data`'s type, so the store's fields, getters, and methods are typed. `app.stores.get<T>(name)` takes the type explicitly.
- `dispatch(el, name, detail)` checks `detail` when `name` is a lifecycle event.

## Multiple apps

Each `rouse({ root })` is self-contained: its own stores, scopes, interceptors, listeners, and config, so `@cart` in one app never reaches another app's `cart`. Use separate apps for micro-frontends or widgets that must stay isolated. One app per root; after `destroy()`, a new app can mount on the same element.

```js
// The page app owns the whole document
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

- Apps can nest. A page app on the default `document.documentElement` with an embedded widget is nested. The outer app skips the inner app's markup, and a nested app mounted after the outer one started takes its markup over.
- Construct a nested app before inserting its root element, or the outer app binds that markup until the nested app exists.
- Events bubble across roots: an outer `app.on('rz:fetch:success', …)` or `sse-[name]|root` also hears the inner app's. To handle only your own app's events, check `e.target.closest('[data-rouse-app]') === app.root`.

## Silent pitfalls

These fail without an error, at most a dev warning. Most do nothing; some do the wrong thing.

- **Modifiers need a pipe.** `click.debounce-[300ms]` is one event named `click.debounce` and never fires. Write `click|debounce-[300ms]`.
- **Render fields need a dot.** `%name` is not `%.name`. The dot-less form reads `undefined` and writes nothing.
- **Key names are exact.** `key-[entr]` never fires, and `keydown|enter` (no `key-[]`) fires on every key, with only a dev warning. `key-[ctrl]` is wrong: the key name is `control`, the held flag is `ctrl`.
- **Scope state isn't reactive by default.** A plain field or `let` returned from setup renders once and never updates; use a `signal` behind a getter, or return a `reactive` object directly.
- **Only plain objects and arrays are reactive.** `reactive()` returns `Map`, `Set`, `Date`, and class instances unproxied, so changes inside them never update bindings.
- **Late effects outlive the scope.** An `effect` created in a handler, a timer, or after an `await` isn't stopped on teardown. Stop it when `term` aborts.
- **A returned function is a cleanup.** A concise arrow that evaluates to a function, such as `effect(() => state.onSave)`, calls it before every re-run and on stop. Use a block body.
- **Duplicate keys drop items.** An item whose `rz-key` value repeats an earlier item's isn't rendered, with only a dev warning.
- **Interceptors must return.** A `response` or `error` interceptor's return replaces `data` or `error`, so returning nothing sets it to `undefined`.
- **Scope listeners and requests are app-wide.** `app.on` in a scope listens on the whole app unless you pass `host` first, and lasts as long as the app without `signal: term`. `app.fetch` likewise keeps running after teardown without `signal: term`.
- **A removed element doesn't hear its own teardown.** Removing an element fires its remaining events (`rz:scope:disconnect`, `rz:scope:destroy`, the teardown `rz:sse:close`, an in-flight request's terminal events) from `app.root`. A listener on the element or a removed ancestor misses them. Use `app.on` and match `e.detail.host` or `e.detail.config.triggerEl`. Inside a scope, clean up with `term` instead.
- **A removed trigger's response still lands.** Removing a trigger doesn't cancel its request, so a slow response can overwrite newer content in a shared target. Give competing triggers a shared `rz-request="abort-key: …"`.
- **Register before scanning.** A store registered after the markup reading it was scanned stays `undefined` in those bindings for good.
- **Stream events stay local.** `sse-[name]` hears only its own element's stream and descendants. A listener beside the stream needs `sse-[name]|root`.
- **Some events fire off the element.** `visibilitychange` fires on `document`: write `visibilitychange|document`. `load|window` never fires if the app starts after load; use `ready`.
- **Network directives don't wait for a lazy scope.** `rz-fetch`, `rz-pull`, `rz-push`, and `rz-sse` inside a scope with `rz-wake` start at page load. Use the `wake` trigger: `data-rz-sse="wake: /events"`.
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
