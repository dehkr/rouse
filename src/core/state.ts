import { isPlainObject, warn } from './shared';

/**
 * Deep object cloner that enforces serializable state and
 * protects against circular references.
 */
export function clone<T>(obj: T, seen = new WeakMap(), path = 'root'): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Circular reference protection
  if (seen.has(obj as any)) {
    return seen.get(obj as any);
  }

  // Arrays
  // JSON converts functions/undefined to null to preserve indexes.
  // This also normalizes sparse arrays (holes become null).
  if (Array.isArray(obj)) {
    const arr = [] as any[];
    seen.set(obj as any, arr);
    for (let i = 0; i < obj.length; i++) {
      const val = obj[i];
      // Pass path + index for array debugging
      arr[i] =
        typeof val === 'function' || val === undefined
          ? null
          : clone(val, seen, `${path}[${i}]`);
    }
    return arr as unknown as T;
  }

  // Catch complex objects before network sync
  if (!isPlainObject(obj)) {
    warn(
      `Non-serializable data found in store at '${path}'. Complex objects (Maps, Classes, etc.) cannot be synced or rolled back safely.`,
    );
    return {} as T;
  }

  // Objects
  // JSON completely strips properties that are functions or undefined.
  const result = {} as Record<string, any>;
  seen.set(obj as any, result);

  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const val = (obj as Record<string, any>)[key];
      if (typeof val !== 'function' && val !== undefined) {
        result[key] = clone(val, seen, `${path}.${key}`);
      }
    }
  }

  return result as T;
}

/**
 * Performant deep equality check with circular reference protection.
 * Ignores non-serializable properties (functions/undefined) to align with clone().
 */
export function deepEqual(a: any, b: any, seen = new WeakMap<object, any>()): boolean {
  if (a === b) {
    return true;
  }

  // Handle NaN !== NaN
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isNaN(a) &&
    Number.isNaN(b)
  ) {
    return true;
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  // Circular reference protection
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Fast path: constructor check
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Arrays: match JSON behavior (functions/undefined become null)
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      const valA = typeof a[i] === 'function' || a[i] === undefined ? null : a[i];
      const valB = typeof b[i] === 'function' || b[i] === undefined ? null : b[i];
      if (!deepEqual(valA, valB, seen)) {
        return false;
      }
    }
    return true;
  }

  // Objects: O(N) traversal, ignoring non-serializable keys without allocating arrays
  let validKeysA = 0;
  for (const key in a) {
    if (Object.hasOwn(a, key)) {
      const valA = a[key];
      if (typeof valA !== 'function' && valA !== undefined) {
        validKeysA++;
        if (!Object.hasOwn(b, key)) {
          return false;
        }
        if (!deepEqual(valA, b[key], seen)) {
          return false;
        }
      }
    }
  }

  // Count valid keys in B to ensure no extra serializable keys exist
  let validKeysB = 0;
  for (const key in b) {
    if (Object.hasOwn(b, key)) {
      const valB = b[key];
      if (typeof valB !== 'function' && valB !== undefined) {
        validKeysB++;
      }
    }
  }

  return validKeysA === validKeysB;
}

/**
 * Replaces or merges the state of a reactive target with the source payload.
 * - 'replace': Strict overwrite. Deletes missing keys.
 * - 'merge': Deep merges plain objects. Strictly overwrites arrays and primitives.
 */
export function patchState(
  target: Record<string, any>,
  source: Record<string, any>,
  action: 'replace' | 'merge' = 'replace',
) {
  // Replace
  if (action === 'replace') {
    for (const key of Object.keys(target)) {
      if (!Object.hasOwn(source, key)) delete target[key];
    }
    Object.assign(target, source);
    return;
  }

  // Merge
  for (const [sourceKey, sourceVal] of Object.entries(source)) {
    const targetVal = target[sourceKey];

    // If both source and target are plain objects, deep merge recursively
    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      patchState(targetVal, sourceVal, 'merge');
    } else {
      // Strict replace for arrays, primitives, or mismatched types
      target[sourceKey] = sourceVal;
    }
  }
}
