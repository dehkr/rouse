# AGENTS.md

Guidance for coding agents working in this repository.

## Commands

```bash
npm run build    # Build dist/ with tsup (ESM, standard + minified)
npm run check    # biome check
npm run types    # Type-check with tsc --noEmit
```

**No test runner is configured.** Verification is type-check + manual smoke (scratch HTML in a browser). Don't claim "tests pass" — say what you actually verified.

## What Rouse is

A directive-driven reactivity layer for server-rendered HTML, shipped as one ESM library. The server renders the page; `data-rz-*` attributes wire it up:

- **Scopes** (`rz-scope`) attach a setup function to a DOM region and expose its state and methods to the directives inside.
- **Stores** (`<script data-rz-store>`, `app.store()`) are named, app-wide state that can sync with a server endpoint (push/pull).
- **Directives** bind state to the DOM (`rz-text`, `rz-model`, `rz-render`, …), handle events (`rz-on`), and make requests (`rz-fetch`), routing responses into the DOM (`rz-place`) or stores (`rz-deposit`).
- **`RouseApp`** (`rouse(config)`) owns one root element; `start()` scans it, `destroy()` ends it.

Directives are authored as `data-rz-<slug>` and named `rz-<slug>` everywhere else (filenames, `DirectiveSlug`, diagnostic labels); `core/attributes.ts` is the only place the prefix is spelled.

## Layout

**A module's contract is in a header comment at the top of the file that owns it. Read it before changing the file** — it holds the rules that fail silently and the decisions not to reverse.

- **`src/core/`** — `app.ts` (`RouseApp`), `store.ts` (stores and sync), parsers (`parser.ts`), diagnostics, constants, timing. State addressing is split by dependency weight: `path.ts` (dot paths) → `state.ts` (`clone`, `deepEqual`, `patchState`; a leaf) → `resolve.ts` (`@store` / `%` / scope resolution).
- **`src/dom/`** — scope lifecycle (`scope.ts`), binding and ownership (`binder.ts`), scan passes (`observer.ts`), trigger sources, `app.on`, and `rz-wake` gates (`events.ts`), key modifiers (`modifiers.ts`), rendering (`renderer.ts`), payload routing, placement.
- **`src/net/`** — `request()` and interceptors (`request.ts`), the fetch engine (`fetch-engine.ts`), the request lifecycle (`lifecycle.ts`), payloads, the SSE engine (`sse-engine.ts`).
- **`src/directives/`** — one directive per `rz-<slug>.ts`, plus factories and shared helpers. Layout rules in the header of `index.ts`.
- **`src/reactivity/`** — thin wrappers around alien-signals.
- **`src/types.ts`** — shared interfaces.

**Dependency direction:** `app.ts` and `store.ts` orchestrate and may import from `dom/` and `net/`; nothing else in `core/` does. DOM-aware helpers that `core/` needs live in `core/`.

Three directive shapes, picked by where the directive lives: **`BoundDirective`** (scanned by the binder, mounts in a scope or globally), **`StandaloneDirective`** (`initialize`/`teardown`, works anywhere, including on a store script), **`ConfigDirective`** (`getConfig`, read on demand, no registration).

**[docs/index.md](docs/index.md)** is the user-facing reference, written for LLMs: one dense page covering syntax, the trigger grammar, events, and silent pitfalls. Keep it dense. A change to user-visible behavior updates it.

## Design rules

Apply these before adding or moving a config key, a directive, or a syntactic device.

1. **One home per key, and the home is whatever the key describes.** Ask what it configures, not where it's convenient to write. A second spelling is rejected with a warning pointing at the home, never left working. Each syntactic device has one job (`@` addresses a store, `%` a render item).
2. **Delete the question rather than answer it.** A rule written to manage a collision between two mechanisms is a smell; first check whether one mechanism can go. Prescribe a value only where Rouse owns both ends of the exchange (push's verb and body, yes; a fetch's encoding, no: declare it). Don't offer a knob that can't change an outcome.
3. **Fail as early as the mechanism allows:** compile error, then init warning, then request-time warning, never silence. Start allow-lists narrow; adding a key later is non-breaking, removing one isn't.
4. **The server owns the truth about the server.** Client config is a guess about an endpoint; a response header (`Rouse-Place`, `Rouse-Deposit`, `Rouse-Trigger`) is the answer for one response and wins.

Where they meet: rule 2 goes before rule 4 (check whether a question needs an authority before naming one). Keep a default only if someone who knows HTML and HTTP but not Rouse would predict it, and require a value only when that removes a branch, fallback, or opt-out. Warn about ambiguity, not history, and never on markup whose intent is obvious. Break a rule only by changing it explicitly; an unstated exception is a second spelling.

## Conventions

### Diagnostics

The header of `src/core/diagnostics.ts` has the bare `err` sites and the message style.


- **Every `warn()` / `err()` is written `__DEV__ && warn(...)`**, and diagnostic-only state (latches, counters, message values) is gated with it. `if (__DEV__) { … }` is the one alternative, for stranded bookkeeping; `__DEV__ ? x : y` for a value in expression position. A bare call ships its message in the min build.
- **Gate authoring diagnostics; never gate a failure that can first occur in production.** If the same markup could fail for one user and not another, the report ships.
- **Throws are never gated or labeled.** Route them through `fail()` (`core/diagnostics.ts`).
- **`warn`/`err`/`fail` prepend `[Rouse]`.** Directive-facing messages start with an `rz-<slug>:` label and a lowercase word; shared internals stay unlabeled. `el` goes last.

### Comments and JSDoc

- **Local comments only for a non-obvious *why*.** Never narrate the code or record history; that goes in the commit message.
- **Module headers are plain `/* */` blocks before the imports**, at most ~30 lines, holding only rules the code can't show. Never `/** */`, which ships in `rouse.d.ts`.
- **Tag `@internal`** on a non-`private` member of a public class that exists only for other modules; the underscore alone doesn't strip it from `rouse.d.ts`. A tagged member must not appear in a public signature.
- **Public-API JSDoc** (`RouseApp`, `rouse`, exported reactivity helpers) is written for a reader in an editor tooltip: no internal vocabulary, no em dashes. Internal JSDoc is one to three lines, verb-first.

### Naming and layout

- **`cleanup` vs `teardown`.** A `cleanup` is one undo unit (or a `cleanups` array); a `teardown` is the hook that runs them. Per-element registries are `elementCleanups`.
- **Loops:** `for...of` when the body has control flow, `await`, or `yield` (converting the interceptor chains or array iterators to `forEach` breaks them silently); `forEach` for a single unconditional call; `map`/`flatMap` to build an array, never push from a loop. Point-free `forEach(fn)` only for standalone one-parameter functions.
- **Closed vocabularies live in `core/constants.ts`** as array + type + guard (`HTTP_METHODS` / `HttpMethod` / `isHttpMethod`). A guard normalizes case only when the vocabulary has one canonical case, and its consumers then normalize their output too.

### Parsing and config

- **`parseDirectiveValue` yields `[key, string | null]`**: bare key → `null`, `key: ''` → `''`, dangling colon → warns and skips. Flag-style consumers coalesce with `?? ''`; consumers where "no value" matters branch on `null`. Decide which camp a new consumer is in.
- **Config directive values are literal text**, with objects as inline JSON through `safeJSONParse`. `@` and `%` address state, never a payload; dynamic values belong in a scope, a store, or an interceptor. `rz-send` is the exception: its value is a list of data sources.

### Coordinated changes

Each spans files and breaks quietly if done partially.

- **Adding a directive** — see the header of `src/directives/index.ts`.
- **Adding a request-config key** — the field on `BaseRequestConfig` (both paths) or `FetchConfig` (fetch only), plus an entry in `rz-request`'s `KEYS` if it should be reachable from HTML. A store-only key goes on `SyncPolicy` with a read in `StoreManager._request`.
- **Adding an interceptor phase** — extend `InterceptorPhase` (`types.ts`), add its `Set` to `RouseApp._interceptors` and initialize it, add an `app.interceptor()` overload, and add the execution site in `request()`.
- **Adding a lifecycle event** — extend the `LifecycleEvent` union, add the `LifecycleEventMap` entry, and add a detail type, sharing fields through a `Base*` interface. A new request family also needs a `RequestLifecycleOptions` member; see the header of `src/net/lifecycle.ts`. Then list the event in `docs/index.md`.
- **Adding a trigger source** — see the header of `src/dom/events.ts`.

### Project posture

- **Pre-release.** Getting the API right outranks shipping. Breaking changes ship without a deprecation cycle; clean breaks beat compatibility shims. Propose additions and removals on their merits.
- **Config is read-only after construction.** The `readonly` modifier is the only enforcement; don't add runtime freezing.
