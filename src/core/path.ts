import type { Scope } from '../types';
import { ITEM_PREFIX, KEY_BLOCKLIST, STORE_PREFIX } from './constants';
import { renderItem, renderParent } from './render';
import { EMPTY_SCOPE, warn } from './shared';
import type { StoreManager } from './store';

const MAX_CACHE_SIZE = 500;
const pathCache = new Map<string, string[]>();
const warnedWrites = new Set<string>();

/**
 * Dedupe per-keystroke `rz-model` repeat warnings.
 */
function warnWriteOnce(path: string, message: string): void {
  if (warnedWrites.has(path)) return;
  warnedWrites.add(path);
  warn(message);
}

function getStorePath(path: string) {
  const fullPath = path.slice(STORE_PREFIX.length);
  return { fullPath, dotIndex: fullPath.indexOf('.') };
}

/**
 * Resolve a dot-notation path to a value.
 */
export function getNestedVal<T = unknown>(
  obj: any,
  path: string | undefined,
): T | undefined {
  if (!obj || !path) return undefined;

  const parts = getPathParts(path);
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return current as T;
}

/**
 * Set a value at a dot-notation path.
 */
export function setNestedVal(obj: any, path: string | undefined, value: any): void {
  if (!obj || typeof obj !== 'object' || !path) return;

  const parts = getPathParts(path);
  const lastKey = parts[parts.length - 1];

  // Early exit if last key is on block list
  if (lastKey === undefined || KEY_BLOCKLIST.includes(lastKey)) return;

  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    if (KEY_BLOCKLIST.includes(part)) return;

    if (!(part in current) || current[part] == null) {
      // Convert to empty object to enable traversal
      current[part] = {};
    } else if (typeof current[part] !== 'object') {
      __DEV__ && warn(`Cannot write to '${path}': '${part}' is a primitive.`);
      return;
    }
    current = current[part];
  }
  current[lastKey] = value;
}

function getPathParts(path: string): string[] {
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split('.');

    // Delete oldest entry when cache is full (FIFO)
    if (pathCache.size >= MAX_CACHE_SIZE) {
      const firstKey = pathCache.keys().next().value as string;
      pathCache.delete(firstKey);
    }

    pathCache.set(path, parts);
  }

  return parts;
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

export function getRootSegment(path: string | undefined): string | undefined {
  if (!path) return;
  return getPathParts(path)[0];
}

/**
 * Resolves a path against a global store, a local scope, or a render item.
 */
export function resolveState<T = unknown>(
  path: string,
  scope: Scope,
  storeManager: StoreManager,
): T | undefined {
  // Render item
  if (path.startsWith(ITEM_PREFIX)) {
    const itemPath = path.slice(1);
    const item = renderItem(scope);
    return itemPath ? getNestedVal<T>(item, itemPath) : (item as T | undefined);
  }

  // Global store
  if (path.startsWith(STORE_PREFIX)) {
    const { fullPath, dotIndex } = getStorePath(path);

    if (dotIndex === -1) {
      return storeManager.get(fullPath) as T | undefined;
    }

    const storeName = fullPath.slice(0, dotIndex);
    const storePath = fullPath.slice(dotIndex + 1);

    return getNestedVal<T>(storeManager.get(storeName), storePath);
  }

  // Fallback to local scope state
  return getNestedVal<T>(scope, path);
}

/**
 * Writes a value to a global store, a local scope, or a render item.
 *
 * **Note:** Currently this is used exclusively as the write path for `rz-model`.
 * The warnings reflect that; they should be updated if another caller is added.
 */
export function writeState(
  path: string,
  value: unknown,
  scope: Scope,
  storeManager: StoreManager,
): void {
  // Render item
  if (path.startsWith(ITEM_PREFIX)) {
    const itemPath = path.slice(1);
    if (!itemPath) {
      __DEV__ &&
        warnWriteOnce(
          path,
          `rz-model: cannot use '${path}' because it overwrites the entire render item. Bind to a field instead.`,
        );
      return;
    }

    const item = renderItem(scope);
    if (!hasNestedKey(item, itemPath)) {
      __DEV__ &&
        warnWriteOnce(
          path,
          `rz-model: '${path}' could not be resolved. Field does not exist on the render item.`,
        );
      return;
    }

    setNestedVal(item, itemPath, value);
    return;
  }

  // Global store
  if (path.startsWith(STORE_PREFIX)) {
    const { fullPath, dotIndex } = getStorePath(path);

    if (dotIndex === -1) {
      __DEV__ &&
        warnWriteOnce(
          path,
          `rz-model: cannot use '${path}' because it overwrites the entire store. Bind to a field instead.`,
        );
      return;
    }

    const storeName = fullPath.slice(0, dotIndex);
    const storePath = fullPath.slice(dotIndex + 1);
    const storeData = storeManager.get(storeName);

    // Warns if store doesn't exist, or if key doesn't exist on store
    if (!hasNestedKey(storeData, storePath)) {
      __DEV__ &&
        warnWriteOnce(
          path,
          `rz-model: cannot resolve '${path}' on '${storeName}'. One or both may be undefined.`,
        );
      return;
    }

    setNestedVal(storeData, storePath, value);
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
