export const STORE_PREFIX = '@';
export const ITEM_PREFIX = '%';
export const KEY_BLOCKLIST = ['__proto__', 'constructor', 'prototype'];

/** Carries the current render item on an `rz-render` instance context. */
export const ITEM_KEY: unique symbol = Symbol(__DEV__ ? 'rz.item' : '');
/** Carries per-instance render metadata (`index`, `key`). */
export const ITEM_META_KEY: unique symbol = Symbol(__DEV__ ? 'rz.itemMeta' : '');
/** Points an instance context back at the scope/store state it layers over. */
export const RENDER_PARENT: unique symbol = Symbol(__DEV__ ? 'rz.renderParent' : '');

/** List of valid DOM placement positions. */
export const PLACE_POSITIONS = [
  'innerHTML',
  'outerHTML',
  'beforebegin',
  'afterbegin',
  'beforeend',
  'afterend',
  'delete',
] as const;

/** Represents a valid DOM placement position. */
export type PlacePosition = (typeof PLACE_POSITIONS)[number];

/** Represents the parameters required to place content into the DOM. */
export interface PlaceOperation {
  targets: Element[];
  position: PlacePosition;
}

/** Default position for DOM placement when an explicit value isn't provided. */
export const DEFAULT_PLACE_POSITION: PlacePosition = 'innerHTML';

/** Type guard to check if a given string is a valid PlacePosition. */
export function isPlacePosition(key: string): key is PlacePosition {
  return PLACE_POSITIONS.includes(key as PlacePosition);
}

/** List of valid standard HTTP methods. */
export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'QUERY',
] as const;

/** Represents a valid HTTP method string. */
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Type guard to check if a given string is a valid HttpMethod. */
export function isHttpMethod(key: string | undefined): key is HttpMethod {
  return HTTP_METHODS.includes(key?.toUpperCase() as HttpMethod);
}

/**
 * Methods RFC 9110 defines as safe, plus `QUERY` (RFC 10008). A safe request is a
 * read, so sending it twice can't cause a second side effect.
 */
export const SAFE_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'QUERY',
] as const satisfies readonly HttpMethod[];

/** Represents a safe HTTP method string. */
export type SafeMethod = (typeof SAFE_METHODS)[number];

/** Type guard to check if a given string is a safe HTTP method. */
export function isSafeMethod(key: string | undefined): key is SafeMethod {
  return SAFE_METHODS.includes(key?.toUpperCase() as SafeMethod);
}

/**
 * Bare trigger modifiers that set a boolean `TriggerOptions` field. Each names
 * its field directly except `stop-immediate`, whose kebab-case declarative
 * spelling maps to the camelCase `stopImmediate` at the parse site.
 */
export const FLAG_MODIFIERS = [
  'once',
  'capture',
  'passive',
  'outside',
  'self',
  'loose',
  'ctrl',
  'alt',
  'shift',
  'meta',
  'prevent',
  'stop',
  'stop-immediate',
  'leading',
  'trailing',
] as const;

export type FlagModifier = (typeof FLAG_MODIFIERS)[number];

export const isFlagModifier = (val: string): val is FlagModifier =>
  (FLAG_MODIFIERS as readonly string[]).includes(val);

/** Modifiers naming a host for the listener other than the element itself. */
export const LISTEN_TARGETS = ['window', 'document', 'root'] as const;

export type ListenTarget = (typeof LISTEN_TARGETS)[number];

export const isListenTarget = (val: string): val is ListenTarget =>
  (LISTEN_TARGETS as readonly string[]).includes(val);
