import type { Scope } from '../types';
import { ITEM_PREFIX, KEY_BLOCKLIST, STORE_PREFIX } from './constants';
import { renderItem, renderParent } from './render';
import { EMPTY_SCOPE, warn } from './shared';
import type { StoreManager } from './store';

const MAX_CACHE_SIZE = 500;
const pathCache = new Map<string, string[]>();

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
      warn(`Cannot write to '${path}': '${part}' is a primitive.`);
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
  storeManager?: StoreManager,
): T | undefined {
  // Render item
  if (path.startsWith(ITEM_PREFIX)) {
    const itemPath = path.slice(1);
    const item = renderItem(scope);
    return itemPath ? getNestedVal<T>(item, itemPath) : (item as T | undefined);
  }

  // Global store
  if (path.startsWith(STORE_PREFIX)) {
    if (!storeManager) {
      warn(`StoreManager required to resolve '${path}'.`);
      return undefined;
    }

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
 */
export function writeState(
  path: string,
  value: unknown,
  scope: Scope,
  storeManager?: StoreManager,
): void {
  // Render item
  if (path.startsWith(ITEM_PREFIX)) {
    const itemPath = path.slice(1);
    if (!itemPath) {
      warn(`Cannot overwrite entire render item via model binding: '${path}'.`);
      return;
    }
    setNestedVal(renderItem(scope), itemPath, value);
    return;
  }

  // Global store
  if (path.startsWith(STORE_PREFIX)) {
    if (!storeManager) {
      warn(`StoreManager required to write to '${path}'.`);
      return;
    }

    const { fullPath, dotIndex } = getStorePath(path);

    if (dotIndex === -1) {
      warn(`Cannot overwrite entire store via model binding: '${path}'.`);
      return;
    }

    const storeName = fullPath.slice(0, dotIndex);
    const storePath = fullPath.slice(dotIndex + 1);

    setNestedVal(storeManager.get(storeName), storePath, value);
    return;
  }

  // Fallback to local scope state
  if (renderParent(scope) === EMPTY_SCOPE) {
    warn(`'${path}' used outside scope. Use '@' to target a store.`);
    return;
  }

  setNestedVal(scope, path, value);
}

function getStorePath(path: string) {
  const fullPath = path.slice(STORE_PREFIX.length);
  return { fullPath, dotIndex: fullPath.indexOf('.') };
}
