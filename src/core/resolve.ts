import type { Scope } from '../types';
import { ITEM_PREFIX, isItemNamespace, STORE_PREFIX } from './constants';
import { warn } from './diagnostics';
import { parseDataSourcePath } from './parser';
import { getNestedVal, getPathParts, setNestedVal } from './path';
import { renderItem, renderMeta, renderParent } from './render-context';
import type { StoreManager } from './store';

export const EMPTY_SCOPE = {} as Scope;
const warnedWrites = new Set<string>();

/**
 * Resolves a path against a global store, a local scope, or a render item.
 */
export function resolveState<T = unknown>(
  path: string,
  scope: Scope,
  storeManager: StoreManager,
): T | undefined {
  const isItem = path.startsWith(ITEM_PREFIX);

  // Fallback to local scope state
  if (!isItem && !path.startsWith(STORE_PREFIX)) {
    return getNestedVal<T>(scope, path);
  }

  const { source, namespace, nestedPath } = parseDataSourcePath(path);

  // The item has no name, so anything between `%` and the path is unresolvable
  if (isItem && source) return undefined;

  let resolved: unknown;
  if (isItem) {
    resolved = namespace ? resolveItemNamespace(namespace, scope) : renderItem(scope);
  } else {
    resolved = namespace
      ? resolveStoreNamespace(source, namespace, storeManager)
      : storeManager.get(source);
  }

  return nestedPath ? getNestedVal<T>(resolved, nestedPath) : (resolved as T | undefined);
}

/**
 * Resolves the `::` namespace of a render item reference. `index` is the
 * instance's zero-based position, `position` starts at one.
 */
function resolveItemNamespace(namespace: string, scope: Scope) {
  const meta = renderMeta(scope);
  if (!meta || !isItemNamespace(namespace)) {
    return undefined;
  }

  return namespace === 'index' ? meta.index : meta.index + 1;
}

/**
 * Resolves the `::` namespace of a store reference. `status` is the only store
 * namespace defined. The status object is reactive, so nested reads track per field.
 */
function resolveStoreNamespace(
  storeName: string,
  namespace: string,
  storeManager: StoreManager,
) {
  return namespace !== 'status' ? undefined : storeManager.status(storeName);
}

/**
 * Writes a value to a global store, a local scope, or a render item.
 *
 * **Note:** Currently this is used exclusively as the write path for `rz-model`.
 * The warnings reflect that. They should be updated if another caller is added.
 */
export function writeState(
  path: string,
  value: unknown,
  scope: Scope,
  storeManager: StoreManager,
): void {
  const isItem = path.startsWith(ITEM_PREFIX);

  // Render item or global store
  if (isItem || path.startsWith(STORE_PREFIX)) {
    const { source, namespace, nestedPath } = parseDataSourcePath(path);
    if (isItem && source) return;

    if (namespace) {
      __DEV__ &&
        warnWriteOnce(
          path,
          `rz-model: cannot write to '${path}'. The '${namespace}' namespace is read-only.`,
        );
      return;
    }

    if (!nestedPath) {
      __DEV__ &&
        warnWriteOnce(
          path,
          `rz-model: cannot use '${path}' because it overwrites the entire ${isItem ? 'render item' : 'store'}. Bind to a field instead.`,
        );
      return;
    }

    const target = isItem ? renderItem(scope) : storeManager.get(source);

    // Warns if the item field, the store, or the store key doesn't exist
    if (!hasNestedKey(target, nestedPath)) {
      __DEV__ &&
        warnWriteOnce(
          path,
          isItem
            ? `rz-model: '${path}' could not be resolved. Field does not exist on the render item.`
            : `rz-model: cannot resolve '${path}' on '${source}'. One or both may be undefined.`,
        );
      return;
    }

    setNestedVal(target, nestedPath, value);
    return;
  }

  // Fallback to local scope state
  if (renderParent(scope) === EMPTY_SCOPE) {
    __DEV__ &&
      warnWriteOnce(
        path,
        `rz-model: '${path}' used outside of a scope. Use '@' to target a store.`,
      );
    return;
  }

  if (!hasNestedKey(scope, path)) {
    __DEV__ && warnWriteOnce(path, `rz-model: '${path}' does not exist on the scope.`);
    return;
  }

  setNestedVal(scope, path, value);
}

/**
 * Checks if `path` resolves to an existing key on `obj`. Guards `writeState` against
 * `rz-model` writes to non-existent fields. `setNestedVal` would otherwise create
 * them. Server-driven creates bypass `writeState`, so they're unaffected.
 */
function hasNestedKey(obj: unknown, path: string): boolean {
  const parts = getPathParts(path);
  let current = obj as any;

  for (let i = 0; i < parts.length - 1; i++) {
    if (current == null || typeof current !== 'object') {
      return false;
    }
    current = current[parts[i] as string];
  }

  return (
    current != null &&
    typeof current === 'object' &&
    (parts[parts.length - 1] as string) in current
  );
}

/**
 * Dedupes per-keystroke `rz-model` repeat warnings.
 */
function warnWriteOnce(path: string, message: string): void {
  if (warnedWrites.has(path)) return;
  warnedWrites.add(path);
  warn(message);
}
