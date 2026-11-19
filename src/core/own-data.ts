/**
 * Returns true if `obj[key]` is a serializable own data property. Excludes
 * accessors (get/set) and function-valued properties. `clone`, `patchState`, and
 * the sync plugin's `deepEqual` share it, so all three agree on what counts as
 * state worth snapshotting, diffing, or writing back. Change what counts here,
 * never at a call site.
 */
export function isOwnDataProp(obj: object, key: string): boolean {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc) return false;
  if (desc.get || desc.set) return false;
  if (typeof desc.value === 'function') return false;
  return true;
}
