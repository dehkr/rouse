import type { RouseController } from '../types';
import type { StoreManager } from './store';
import { STORE_PREFIX } from './store';

export const KEY_BLOCKLIST = new Set(['__proto__', 'constructor', 'prototype']);

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
  if (lastKey === undefined || KEY_BLOCKLIST.has(lastKey)) return;

  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    if (KEY_BLOCKLIST.has(part)) return;

    if (!(part in current) || current[part] == null) {
      // Convert to empty object to enable traversal
      current[part] = {};
    } else if (typeof current[part] !== 'object') {
      console.warn(
        `[Rouse] Cannot set value at path "${path}" because "${part}" is a primitive value.`,
      );
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
 * Resolves a path against either a global store or a local controller.
 */
export function resolveState<T = unknown>(
  path: string,
  controller: RouseController,
  storeManager?: StoreManager,
): T | undefined {
  if (path.startsWith(STORE_PREFIX)) {
    if (!storeManager) {
      console.warn(`[Rouse] StoreManager required to resolve path: ${path}`);
      return undefined;
    }

    const { fullPath, dotIndex } = getStorePath(path);

    if (dotIndex === -1) {
      return storeManager.get(fullPath);
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
  controller: RouseController,
  storeManager?: StoreManager,
): void {
  if (path.startsWith(STORE_PREFIX)) {
    if (!storeManager) {
      console.warn(`[Rouse] StoreManager required to write to path: ${path}`);
      return;
    }

    const { fullPath, dotIndex } = getStorePath(path);

    if (dotIndex === -1) {
      console.warn(
        `[Rouse] Cannot overwrite an entire store directly via model binding: "${path}"`,
      );
      return;
    }

    const storeName = fullPath.slice(0, dotIndex);
    const nestedPath = fullPath.slice(dotIndex + 1);

    setNestedVal(storeManager.get(storeName), nestedPath, value);
    return;
  }

  // Fallback to local controller state
  setNestedVal(controller, path, value);
}

function getStorePath(path: string) {
  const fullPath = path.slice(STORE_PREFIX.length);
  return { fullPath, dotIndex: fullPath.indexOf('.') };
}
