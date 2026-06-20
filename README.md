# Rouse

[![npm](https://img.shields.io/npm/v/rousejs)](https://www.npmjs.com/package/rousejs)

**The JavaScript UI and state orchestrator for server-rendered HTML**

> [!WARNING]  
> **Pre-release software:** Rouse is currently in active development, unstable, and not intended for production use. Breaking changes will occur without notice.

## Motivation

Rouse is being built to bridge the gap between server-rendered HTML and reactive UIs. The goal is to deliver the performance and SEO benefits of server-side rendering (SSR) with the dynamic experience of a single page application (SPA) – without the build-step overhead or architectural complexity.

Instead of locking you into a single paradigm, Rouse gives you the flexibility to build pragmatically. You shouldn't have to fight your framework. Whether an interaction demands server-rendered HTML fragments or client-managed reactive state, Rouse handles both within a single, cohesive system.

## Key features

- **Zero build or compile step:** Import Rouse as an ES module from a CDN, or integrate it into your build pipeline with first-class TypeScript support.
- **Backend agnostic:** Pairs seamlessly with your stack of choice – Rails, Django, Laravel, Go, Express, Hono, and more.
- **Server-managed (hypermedia):** Fetch HTML fragments on any event; let the server drive targeting, redirects, and history through response headers.
- **Client-managed (reactive):** Local scopes and global stores powered by fine-grained signals, two-way binding, and optimistic updates.
- **On-demand reconciliation:** Sync client state back to the server with built-in rollback capabilities, conflict detection, and per-field dirty tracking.
- **Declarative and programmatic:** Combine the speed of expressive HTML attributes with the power of an elegant JavaScript API.
- **Advanced orchestration:** Define custom scope logic, handle fine-grained activation strategies, and cleanly hydrate third-party libraries inside isolated regions.
