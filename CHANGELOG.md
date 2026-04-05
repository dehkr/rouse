# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes.

## [0.5.0] - 2026-04-05

### Added

- Add support for declarative timing modifiers (e.g., `.debounce`, `.throttle.500ms`, `.leading`) for `rz-on`.
- Export `debounce` and `throttle` utilities for programmatic use.
- Add `rz-trigger` directive to provide explicit event triggers with modifiers for `rz-fetch`.
- Add support for `none` value for `rz-trigger` to register fetch configuration on an element without binding DOM event listeners.
- Add synthetic `poll` event (e.g., `poll.30s`) for event-driven network directives (`rz-trigger`, `rz-refresh`).
- Expand programmatic `fetch` configuration options with new capabilities:
  - `params` for query string serialization (e.g., `ctx.fetch('/api/search', { params: { q: 'test' } })`).
  - `mutate` flag (set to `false` by default) to prevent automatic DOM insertion of HTML responses.
- Add `rz-source` directive for declarative configuration of store endpoints.
- Add `stopImmediate` event modifier to trigger `stopImmediatePropogation()`.
- Add support for `ms`, `s`, and `m` suffixes (e.g., `timeout: 10s`).
- Export `on` utility for programmatic event listening and modifier support. Available as a global import and in controller context (`ctx.on()`) where it includes automatic listener cleanup.
- Inject `abortSignal` into controllers (`ctx.abortSignal`). This signal automatically aborts when the controller disconnects, making it easy to cancel background tasks and prevent memory leaks.

### Changed

- **Breaking:** Rename `createApp()` to `rouse()` for framework initialization.
- **Breaking:** Rename `appRoot` to `root` in controller context for API consistency.
- **Breaking:** Update `rz-fetch` and `rz-autosave` syntax to use comma-separated values.
- **Breaking:** Update `rz-autosave` to accept an HTTP method and debounce override (e.g., `rz-autosave="PUT, 800ms"`).
- **Breaking:** Refactor global configuration into a domain-driven schema (`timing`, `network`, `ui`): 
  - Move fetch defaults to `app.config.network.fetch` and restrict properties to `headers`, `credentials`, and `mode`.
  - Remove global `retry` and `timeout` settings; these can be configured per-request.
- Auto-inject controller `AbortSignal` into `ctx.fetch()` options to automatically cancel background requests when a controller disconnects.
- Update `rz-refresh` to support any event trigger with modifiers, defaulting to window focus and network reconnection.

### Removed

- **Breaking:** Remove `rz-tune` directive. Transfer network options (`retries`, `timeout`, `abortKey`) to `rz-request` and event triggers (including `poll`) to `rz-trigger`.
- **Breaking:** Remove the event bus and `rz-publish` directive.
- **Breaking:** Remove XHR fallback support; Rouse now exclusively uses the native Fetch API.

## [0.4.0] - 2026-03-18

### Added

- Expose the root element of app instances in controllers via `ctx.appRoot`.
- Add lifecycle DOM events for applications and controllers:
  - **App:** `rz:app:start`, `rz:app:ready`, and `rz:app:destroy`
  - **Controllers:** `rz:controller:init`, `rz:controller:connect`, `rz:controller:disconnect`, and `rz:controller:destroy`
- Add support for declarative event modifiers in the `rz-on` directive:
  - **Event control:** `.prevent`, `.stop`, `.once`, `.passive`, `.capture`
  - **Target filtering:** `.self`, `.outside`, `.window`, `.document`, `.root`
  - **Keyboard keys:** `.enter`, `.esc`, `.space`, `.up`, `.down`, `.left`, `.right`, `.tab`, `.delete`, `.backspace`, plus any single character (e.g., `.a`, `.1`)
  - **System modifiers:** `.ctrl`, `.alt`, `.shift`, `.meta`
  - **Matching mode:** All modifiers are matched exactly by default (e.g., `.enter` fires only on bare Enter, not Shift+Enter). Use `.loose` to match when additional modifier keys are pressed.

### Changed

- **Breaking:** Rebuild `rz-publish` as a standalone event-broadcasting directive, decoupled from `rz-fetch`. This allows for native DOM event support and custom payloads independent of network requests.

### Fixed

- Prevent erroneous splitting of inline JSON in directive values by ignoring commas located within curly braces.
- Fix a bug where fetching binary files (like images or PDFs) corrupted the data by coercing the response to text.

## [0.3.0] - 2026-03-11

### Added

- Enable explicit access to global stores in HTML with the `@` prefix: `rz-model="@user-state.name"`.
- Introduce new delimiters for passing data into controllers and methods: `?` for URL params and `@` for store data.
- Support a `request` property in the app configuration to establish Fetch API defaults (e.g., `mode`, `credentials`, `headers`).
- Add the `rz-request` directive for declarative, DOM-scoped Fetch API configuration.

### Changed

- **Breaking:** Update directive parsing to require a comma and white space to separate multiple values.
- **Breaking:** Rename `rz-island` directive to `rz-scope`.
- **Breaking:** Remove the `#` delimiter for inline JSON payloads. Use the JSON object directly after the name: `rz-scope='counter{ "count": 5 }'`.
- **Breaking:** Replace `request()` with `fetch()` in programmatic API to trigger network requests while retaining lifecycle events and DOM mutations.
- Decouple `rz-fetch` execution logic into a centralized network engine to support both declarative and programmatic APIs.
- Refine fetch method resolution to follow a strict priority cascade for configuration.
- Improve fetch lifecycle events by including helpful details when dispatched.
- Refactor the network engine to use dependency injection to avoid multiple app instances overwriting each other's network configuration.
- Extract dot-notation path parsing logic into separate module.

### Fixed

- Prevent accidental JSON serialization of `DataView` and `TypedArray` types in request bodies by enhancing binary type checks.
- Prevent GET requests from including a body to avoid server-side errors.
- Warn and dispatch `rz:fetch:error` when a request is missing a URL instead of failing silently.
- Respect the native `method` attribute on `<form>` elements.

### Removed

- **Breaking:** Remove `rz-state` directive. The new `@` prefix for accessing global stores makes it redundant.
- **Breaking:** Remove top-level `headers` property from app configuration (moved to `request` object).

## [0.2.0] - 2026-03-04

### Added

- Add `rz-state` directive for declarative mapping of global store data to an island's scope. Supports multiple stores and optional namespace aliasing.
- Add support for controller-less islands. `rz-island` no longer requires a controller name, allowing reactive global state binding to HTML with zero JavaScript boilerplate.

### Changed

- **Breaking:** Rename `rz-use` directive to `rz-island`.
- **Breaking:** Rename RouseApp `store()` method to `addStore()`.
- Text and HTML bindings (`rz-text`, `rz-html`) now auto-format values: primitive arrays render comma-separated, objects and nested arrays as formatted JSON.
- Optimize dot-notation path parsing with a memory cache.
- Dot-notation path parsing now logs a warning and bails out instead of overwriting primitive values.

## [0.1.1] - 2026-03-01

### Added

- Add RouseApp `destroy()` method for manual teardown of app instances (stops timers, removes listeners, unmounts controllers, and frees memory).

### Changed

- RouseApp `register()` method now supports bulk registration via object shorthand: `app.register({ counter, cart })`.
- Improve runtime validation for `register()` with descriptive error messages and strict type checking for setup functions.

## [0.1.0] - 2026-02-28

First pre-release of RouseJS.

### Added

- Support for multiple isolated app instances on the same page.
- Declarative HTML API for binding data and behavior to elements.
- Controllers with fine-grained activation strategies.
- Configurable data fetching with support for both HTML and JSON.
- Event bus for message routing between islands.
- Signal-based reactivity via [alien-signals](https://github.com/stackblitz/alien-signals#readme).
- Reactive proxy layer that wraps signals for ergonomic object and array state.
- Global state management with reactive stores.
- Optimistic UI updates with automatic rollbacks.
