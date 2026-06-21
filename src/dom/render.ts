/**
 * Registry of elements that are roots of an `rz-render` instance subtree.
 *
 * The element binder consults this so a scope's scan, global mounting, and
 * removal-teardown all skip render-managed subtrees. `rz-render` binds those
 * itself with per-instance item context; without this guard the parent scope
 * would re-bind them against the wrong state (no `%` context, double-bound).
 */
const renderOwned = new WeakSet<Element>();

/**
 * Mark an element as the root of an `rz-render` instance subtree.
 */
export function markRenderOwned(el: Element): void {
  renderOwned.add(el);
}

/**
 * Release an element when its `rz-render` instance is torn down.
 */
export function unmarkRenderOwned(el: Element): void {
  renderOwned.delete(el);
}

/**
 * Whether an element is a render-owned instance root.
 */
export function isRenderOwned(el: Element): boolean {
  return renderOwned.has(el);
}
