/*
 * Render-context readers live here, not in `dom/renderer.ts`, so `core/` can read a
 * render context without importing from `dom/`. The renderer only creates contexts.
 */
import { getRaw } from '../reactivity/reactive';
import type { HandlerCtx, RenderContext, RenderFrame, Scope } from '../types';
import { RENDER_FRAME } from './constants';

/**
 * Reads the render frame off an instance context (if any).
 */
export function renderFrame(scope: Scope): RenderFrame | undefined {
  return (scope as RenderContext)[RENDER_FRAME];
}

/**
 * Reads the current render item off an instance context (if any).
 */
export function renderItem(scope: Scope): unknown {
  return renderFrame(scope)?.item;
}

/**
 * Resolves the state an instance context layers over, else the scope itself.
 */
export function renderParent(scope: Scope): Scope {
  return renderFrame(getRaw(scope))?.parent ?? scope;
}

/**
 * Snapshots the nearest render item + index off a binding scope for a handler
 * context. Returns null fields when the scope isn't a render instance.
 */
export function renderCtxOf(scope: Scope): HandlerCtx['render'] {
  const frame = renderFrame(scope);
  return frame
    ? { item: frame.item ?? null, index: frame.index }
    : { item: null, index: null };
}
