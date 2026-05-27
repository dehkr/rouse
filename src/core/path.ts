import type { Controller } from '../types';
import { KEY_BLOCKLIST, STORE_PREFIX } from './constants';
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
 * Returns true if every segment of a dot-notation path is present on `obj`.
 */
export function hasNestedPath(obj: unknown, path: string | undefined): boolean {
  if (obj == null || typeof obj !== 'object' || !path) return false;

  const parts = getPathParts(path);
  let current: any = obj;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return false;
    if (!(part in current)) return false;
    current = current[part];
  }

  return true;
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
 * Resolves a path against either a global store or a local controller.
 */
export function resolveState<T = unknown>(
  path: string,
  controller: Controller,
  storeManager?: StoreManager,
): T | undefined {
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
    const nestedPath = fullPath.slice(dotIndex + 1);

    return getNestedVal<T>(storeManager.get(storeName), nestedPath);
  }

  // Fallback to local controller state
  return getNestedVal<T>(controller, path);
}

/**
 * Writes a value to either a global store or a local controller.
 */
export function writeState(
  path: string,
  value: unknown,
  controller: Controller,
  storeManager?: StoreManager,
): void {
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
    const nestedPath = fullPath.slice(dotIndex + 1);

    setNestedVal(storeManager.get(storeName), nestedPath, value);
    return;
  }

  // Fallback to local controller state
  if (controller === EMPTY_SCOPE) {
    warn(`'${path}' used outside controller scope. Use '@' to target a store.`);
    return;
  }

  setNestedVal(controller, path, value);
}

function getStorePath(path: string) {
  const fullPath = path.slice(STORE_PREFIX.length);
  return { fullPath, dotIndex: fullPath.indexOf('.') };
}
