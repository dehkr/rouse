// Prevent prototype pollution
const KEY_BLOCKLIST = new Set(['__proto__', 'constructor', 'prototype']);

/** Resolve a dot-notation path to a value */
export function getNestedVal(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return current;
}

/** Set a value at a dot-notation path */
export function setNestedVal(obj: any, path: string, value: any): void {
  if (!obj || !path) return;

  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (KEY_BLOCKLIST.has(part)) return;

    // Auto-initialize missing parts or overwrite primitive types to allow traversal
    if (!(part in current) || typeof current[part] !== 'object' || current[part] == null) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastKey = parts[parts.length - 1];
  if (!KEY_BLOCKLIST.has(lastKey)) {
    current[lastKey] = value;
  }
}
