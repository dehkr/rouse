import type { BindableValue } from '../types';

export const KEY_BLOCKLIST = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_CACHE_SIZE = 500;
const pathCache = new Map<string, string[]>();

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
 * Resolve a dot-notation path to a value.
 */
export function getNestedVal(obj: any, path: string | undefined): BindableValue {
  if (!obj || !path) return undefined;

  const parts = getPathParts(path);
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Set a value at a dot-notation path.
 */
export function setNestedVal(obj: any, path: string | undefined, value: any): void {
  if (!obj || typeof obj !== 'object' || !path) return;

  const parts = getPathParts(path);
  const lastKey = parts[parts.length - 1];
  
  // Early exit if final key is blocked
  if (lastKey === undefined || KEY_BLOCKLIST.has(lastKey)) return;

  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    if (KEY_BLOCKLIST.has(part)) return;

    // Convert undefined and null to empty object to allow traversal
    if (!(part in current) || current[part] == null) {
      current[part] = {};
    } else if (typeof current[part] !== 'object') {
      // Bail out if attempting to traverse through a primitive value
      console.warn(
        `[Rouse] Cannot set value at path "${path}" because "${part}" is a primitive value.`
      );
      return;
    }
    current = current[part];
  }
  current[lastKey] = value;
}