import { getRaw } from '../reactivity/reactive';
import type { HandlerCtx, RenderContext, RenderMeta, Scope } from '../types';
import { ITEM_KEY, ITEM_META_KEY, RENDER_PARENT } from './constants';

/**
 * Reads the current render item off an instance context (if any).
 */
export function renderItem(scope: Scope): unknown {
  return (scope as RenderContext)[ITEM_KEY];
}

/**
 * Reads the render metadata off an instance context (if any).
 */
export function renderMeta(scope: Scope): RenderMeta | undefined {
  return (scope as RenderContext)[ITEM_META_KEY];
}

/**
 * Resolves the state an instance context layers over, else the scope itself.
 */
export function renderParent(scope: Scope): Scope {
  return (getRaw(scope) as RenderContext)[RENDER_PARENT] ?? scope;
}

/**
 * Snapshots the nearest render item + index off a binding scope for a handler
 * context. Returns null fields when the scope isn't a render instance.
 */
export function renderCtxOf(scope: Scope): HandlerCtx['render'] {
  const meta = renderMeta(scope);
  return meta
    ? { item: meta.item ?? null, index: meta.index }
    : { item: null, index: null };
}
