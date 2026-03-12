# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Provide an explicit and concise way to access global stores in HTML with the `@` prefix: `rz-model="@user-state.name"`.
- New delimiters for injecting payloads into controllers and methods: `?` for URL params, `@` for store data, `#` for JSON script IDs, and `{` for inline JSON.
- Add `request` property to the app configuration to establish a baseline for Fetch API defaults (e.g., `mode`, `credentials`, `headers`).
- Add `rz-request` directive for declarative, DOM-scoped Fetch API configuration.

### Changed

- **Breaking:** Update directive parsing to require comma + white space to separate multiple values.
- **Breaking:** Rename `rz-island` directive to `rz-scope`.
- **Breaking:** Inline JSON payloads for controllers and methods now look for `{` as the delimiter instead of `#` (e.g., `rz-scope='counter{ "count": 5 }'`).
- **Breaking:** Replace `request()` with `fetch()` in programmatic API to trigger network requests while retaining lifecycle events and DOM mutations.
- Decouple `rz-fetch` execution logic into a centralized network engine to support both declarative and programmatic APIs.
- Refine fetch method resolution to follow a strict priority cascade (explicit > programmatic > global config > form attribute > default GET).
- Improve fetch lifecycle events by including helpful details when dispatched.
- Refactor the network engine to use dependency injection to avoid multiple app instances overwriting each other's network configuration.
- Update `resolvePayload` to accept a `requireObject` flag, allowing it to resolve primitive values while maintaining strict object validation for data payloads.
- Extract dot-notation path parsing logic into separate module.

### Fixed
- Prevent accidental JSON serialization of `DataView` and `TypedArray` types in request bodies by enhancing native binary type checks.
- Remove body from GET requests to prevent errors.
- Warn and dispatch `rz:fetch:error` when a request is missing a URL, instead of failing silently.
- Respect the native `method` attribute on `<form>` elements, preventing it from being overwritten by the default GET fallback.

### Removed

- **Breaking:** Remove `rz-state` directive. The new `@` prefix for accessing global stores makes it redundant.
- **Breaking:** Remove the top-level `headers` property from the app configuration. Headers can now be configured inside the new `request` object.

## [0.2.0] - 2026-03-04

### Added

- New `rz-state` directive for declarative mapping of global store data to an island's scope. Supports multiple stores and optional namespace aliasing.
- Support for controller-less islands. `rz-island` no longer requires a controller name, allowing reactive global state binding to HTML with zero JavaScript boilerplate.

### Changed

- **Breaking:** Rename `rz-use` directive to `rz-island`.
- **Breaking:** Rename RouseApp `store()` method to `addStore()`.
- Text and HTML bindings (`rz-text`, `rz-html`) now auto-format values: primitive arrays render comma-separated, objects and nested arrays as formatted JSON.
- Optimize dot-notation path parsing with a memory cache.
- Dot-notation path parsing now logs a warning and bails out instead of overwriting primitive values.

## [0.1.1] - 2026-03-01

### Added

- RouseApp `destroy()` method for manual teardown of app instances (stops timers, removes listeners, unmounts controllers, and frees memory).

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
