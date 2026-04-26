import { getNestedVal, KEY_BLOCKLIST } from './path';
import { isPlainObject, warn } from './shared';
import { parseStoreLocator, StoreManager } from './store';

/**
 * Parse JSON with recursive check that blocks prototype pollution keys.
 */
function safeJSONParse(text: string): unknown {
  return JSON.parse(text, (key, value) => {
    if (KEY_BLOCKLIST.has(key)) {
      warn(`Blocked forbidden key in JSON: '${key}'.`);
      return undefined;
    }
    return value;
  });
}

/**
 * Resolves a payload string into a JavaScript value. Uses heuristics to determine
 * if the payload is inline JSON, a DOM ID, a global store, or URL params.
 *
 * @param requireObject - If true (default), enforces that the resolved value is an object.
 */
export function resolveProps(
  input: string | undefined | null,
  storeManager?: StoreManager,
  requireObject = true,
): Record<string, any> | undefined {
  const value = input?.trim();
  if (!value) return undefined;

  let resolvedValue: any;

  // Store data
  if (value.startsWith('@')) {
    if (!storeManager) {
      warn(`Cannot resolve '${value}' because StoreManager is missing.`);
      return undefined;
    }

    const { storeName, nestedPath } = parseStoreLocator(value);
    const storeData = storeManager.get(storeName);

    if (storeData === undefined) {
      warn(`Store '${storeName}' not found. Cannot resolve props '${value}'.`);
      return undefined;
    }

    resolvedValue = nestedPath ? getNestedVal(storeData, nestedPath) : storeData;
  }

  // URL query params
  else if (value.startsWith('?')) {
    const params = new URLSearchParams(value.slice(1));
    resolvedValue = Object.fromEntries(params.entries());
  }

  // DOM script ID
  else if (value.startsWith('#')) {
    const id = value.slice(1);
    const el = document.getElementById(id);
    if (el && el instanceof HTMLScriptElement && el.type === 'application/json') {
      const content = el.textContent?.trim();
      if (content) {
        try {
          resolvedValue = safeJSONParse(content);
        } catch (e) {
          warn(`Invalid JSON in #${id}.`, e);
        }
      }
    } else {
      warn(`#${id} must be a <script type="application/json">.`);
    }
  }

  // Inline JSON object ({)
  else if (value.startsWith('{')) {
    try {
      resolvedValue = safeJSONParse(value);
    } catch (e) {
      warn(`Invalid inline JSON.`, e);
    }
  }

  // Final check
  if (resolvedValue !== undefined) {
    if (!requireObject || isPlainObject(resolvedValue)) {
      return resolvedValue;
    }
    warn(`Invalid payload: '${value}'. Data must resolve to an object.`);
  }

  return undefined;
}

/**
 * Splits an injection string into its key and raw payload components.
 * Supports ?, #, @, and { as payload delimiters.
 */
export function splitInjection(raw: string): {
  key: string;
  rawPayload: string | undefined;
} {
  // Find the first index of ?, #, @, or { starting after the first character.
  // This accomodates store keys like '@my-store.method{ "id": 234 }'
  const matchIndex = raw.substring(1).search(/[?#@{]/);

  if (matchIndex === -1) {
    return { key: raw.trim(), rawPayload: undefined };
  }

  const i = matchIndex + 1;
  return {
    key: raw.slice(0, i).trim(),
    rawPayload: raw.slice(i).trim(),
  };
}
