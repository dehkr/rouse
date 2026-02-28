# Rouse

[![npm](https://img.shields.io/npm/v/rousejs)](https://www.npmjs.com/package/rousejs)

**Lightweight JavaScript orchestrator for server-rendered HTML**

> [!WARNING]  
> This is a pre-release version. It is unstable and not intended for production use. Breaking changes may occur without notice.

## Motivation

Rouse is being built to bridge the gap between server-rendered HTML and reactive UIs. The goal is to deliver the performance and SEO benefits of SSR with the dynamic, responsive experience of an SPA – without the overhead or complexity.

## What it does

Rouse orchestrates behavior on top of your existing server-rendered HTML:

- **Wake up controllers** with fine-grained activation strategies
- **Fetch data** in response to user events or configurable polling
- **Route messages** between isolated islands via the event bus
- **Surgically update the DOM** using reactive signals
- **Sync client and server** with optimistic updates and rollbacks
- **Manage global state** declaratively with reactive stores

Designed as a lightweight, no-regrets solution for the vast majority of web projects that don't need a full SPA. You get reactive UIs without abandoning your backend framework or adopting client-side state management complexity.
