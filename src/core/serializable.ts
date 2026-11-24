/*
 * The one definition of serializable data. `clone`, `patchState`, and the sync
 * plugin's `deepEqual` read it, so they agree on what a snapshot keeps, a diff
 * compares, and a write copies, and a value always compares equal to its own clone.
 * Change what counts here, never at a call site.
 *
 * Plugins import this module directly (the allow-list in `vite.config.ts`), so each
 * plugin bundles its own copy. Keep it stateless: module state would exist twice.
 */

/**
 * Returns true if `obj[key]` is a serializable own data property. Excludes
 * accessors (get/set) and function-valued properties.
 */
export function isOwnDataProp(obj: object, key: string): boolean {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) {
    return false;
  }
  if (desc.get || desc.set) {
    return false;
  }
  if (typeof desc.value === 'function') {
    return false;
  }
  return true;
}

/**
 * Checks that a value is a plain JavaScript object (POJO).
 * Excludes Arrays, Dates, Maps, and custom class instances.
 */
export function isPlainObject(val: unknown): val is Record<string, any> {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);

  // Matches {} (Object.prototype) and Object.create(null)
  return proto === null || proto === Object.prototype;
}

/**
 * Returns what JSON serialization encodes for `val`: the result of its `toJSON()`, so
 * a `Date` becomes its ISO string, or `val` itself.
 *
 * Plain objects and arrays are returned as they are. They're copied field by field,
 * which strips methods, `toJSON` included, and reading `toJSON` through a reactive
 * proxy would track a key that never changes.
 */
export function toJSONValue(val: unknown): unknown {
  if (
    val === null ||
    typeof val !== 'object' ||
    Array.isArray(val) ||
    isPlainObject(val)
  ) {
    return val;
  }
  const { toJSON } = val as { toJSON?: unknown };
  return typeof toJSON === 'function' ? toJSON.call(val) : val;
}
