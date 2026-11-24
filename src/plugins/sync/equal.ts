import { isOwnDataProp, isPlainObject, toJSONValue } from '../../core/serializable';

/**
 * Compares two values for deep equality, as `clone()` copies them: `toJSON()` applied,
 * any other non-plain object read as `{}`, and the properties `clone()` strips skipped.
 * A value always compares equal to its own clone.
 */
export function deepEqual(a: any, b: any, seen = new WeakMap<object, any>()): boolean {
  a = asCloned(a);
  b = asCloned(b);

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

  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Only arrays and plain objects are left, so a mismatch is array against object
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // Arrays: match JSON behavior by converting functions/undefined to null
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

  // Objects
  let validKeysA = 0;
  for (const key in a) {
    if (!isOwnDataProp(a, key)) {
      continue;
    }
    const valA = a[key];
    if (valA !== undefined) {
      validKeysA++;
      if (!Object.hasOwn(b, key)) {
        return false;
      }
      if (!deepEqual(valA, b[key], seen)) {
        return false;
      }
    }
  }

  // Count valid keys in B to ensure no extra serializable keys exist
  let validKeysB = 0;
  for (const key in b) {
    if (!isOwnDataProp(b, key)) {
      continue;
    }
    const valB = b[key];
    if (valB !== undefined) {
      validKeysB++;
    }
  }

  return validKeysA === validKeysB;
}

/**
 * Returns `val` as `clone()` copies it, one level deep. A fresh `{}` per value, since a
 * shared one would collide in `seen`.
 */
function asCloned(val: unknown): unknown {
  const json = toJSONValue(val);
  const isOther =
    json !== null &&
    typeof json === 'object' &&
    !Array.isArray(json) &&
    !isPlainObject(json);
  return isOther ? {} : json;
}
