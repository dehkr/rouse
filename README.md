# Rouse

[![npm](https://img.shields.io/npm/v/rousejs)](https://www.npmjs.com/package/rousejs)

**The JavaScript UI and state orchestrator for server-rendered HTML**

> [!WARNING]  
> **Pre-release software:** Rouse is currently in active development, unstable, and not intended for production use. Breaking changes will occur without notice.

## Motivation

Rouse is being designed to seamlessly coordinate server-rendered HTML and client-side reactive state within a single system. The goal: harness the performance and SEO benefits of server-side rendering (SSR) while delivering the dynamic experience of a single-page application (SPA).

Instead of locking you into a fixed paradigm, Rouse provides the flexibility to develop the way you want. You shouldn't have to work around your framework. Bring your own backend. Use a build step or go buildless. Let the server drive or keep state on the client – it's a local, reversible decision rather than an upfront architectural commitment. Made for the pragmatic web.

## Key features

- **Server-managed (hypermedia):** Fetch HTML fragments on any event; let the server drive targeting, redirects, and history through response headers.
- **Client-managed (reactive):** Model UI state with local scopes and global stores powered by reactive signals and a proxy layer for ergonomic object/array mutations.
- **On-demand reconciliation:** Sync client state back to the server with built-in rollback capabilities, conflict detection, and per-field dirty tracking.
- **Native rendering:** Render `<template>` elements from reactive state, with keyed diffing that reuses and reorders DOM instead of rebuilding it.
- **Declarative and programmatic:** Combine the simplicity of expressive HTML attributes with the power of an elegant JavaScript API.
- **Advanced orchestration:** Define custom scope logic, handle fine-grained activation strategies, and cleanly hydrate third-party libraries inside isolated regions.
- **Zero build or compile step:** Import Rouse as an ES module from a CDN, or integrate it into your build pipeline with first-class TypeScript support.
- **Backend agnostic:** Pair naturally with your stack of choice – Rails, Django, Laravel, Go, Express, Hono, and more.
