# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes.

## [0.1.1] - 2026-03-01

### Added

- RouseApp `destroy()` method for manual teardown of app instances (stops timers, removes listeners, unmounts controllers, and frees memory).

### Changed

- RouseApp `register()` method now supports bulk registration via object shorthand – `app.register({ counter, cart })` – in addition to single string-based registration.
- Improved runtime validation for `register()` with descriptive error messages and strict type checking for setup functions.

## [0.1.0] - 2026-02-28

Initial pre-release of RouseJS.

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
