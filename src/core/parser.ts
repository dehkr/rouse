import type { TriggerDef, TriggerSubjectPair } from '../types';
import {
  isHttpMethod,
  isPatchAction,
  STORE_PREFIX,
  type HttpMethod,
  type PatchAction,
} from './constants';
import { warn } from './shared';

export type ParsedDirectiveValue = [string, string][];

const VALUE_DELIMITER = ',';
const SEGMENT_DELIMITER = ':';
const MODIFIER_DELIMITER = '.';

const WHITESPACE_RE = /\s/;
const SUBJECT_RE = /^(\S+)\s+(.+)$/;
const FETCH_URL_PREFIX_RE = /^(\/|\.\.?\/|https?:\/\/|\?)/;

const openers: Record<string, boolean> = { '(': true, '{': true, '[': true };
const closers: Record<string, string> = { ')': '(', '}': '{', ']': '[' };

type BoundaryOpener = '(' | '{' | '[';

/**
 * Iterates through text and fires a callback for each character that is safe
 * (i.e. not inside quotes, parentheses, curly braces, or square brackets).
 *
 * Returns the final scan state, which can be used to detect malformed input
 * (e.g. unclosed brackets or quotes).
 *
 * Per-type depth counters are maintained to catch mismatched bracket pairs
 * such as `(]`. A mismatch is warned and the closer is ignored.
 */
function scan(
  text: string,
  callback: (index: number, char: string, fullText: string) => boolean | undefined,
): { depth: number; quote: string | null } {
  const depths: Record<BoundaryOpener, number> = { '(': 0, '{': 0, '[': 0 };
  let totalDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const prev = text[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (openers[char]) {
      depths[char as BoundaryOpener]++;
      totalDepth++;
    } else if (closers[char]) {
      const opener = closers[char] as BoundaryOpener;
      if (depths[opener] > 0) {
        depths[opener]--;
        totalDepth--;
      } else {
        warn(`Mismatched bracket '${char}' in value: '${text}'`);
      }
    } else if (totalDepth === 0) {
      if (callback(i, char, text)) {
        return { depth: totalDepth, quote };
      }
    }
  }

  return { depth: totalDepth, quote };
}

/**
 * Splits `text` on every unescaped occurrence of `delimiter` at depth 0,
 * returning the resulting segments. Empty segments are excluded.
 *
 * Centralises the start-pointer / slice / remainder pattern that would
 * otherwise be repeated across every parsing function.
 */
function scanSplit(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;

  scan(text, (i, char) => {
    if (char === delimiter) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    return false;
  });

  parts.push(text.slice(start));

  return parts.filter((p) => p.length > 0);
}

/**
 * Check if a string is enclosed in matching quotation marks.
 */
function isInQuotes(val: string) {
  if (val.length < 2) return false;
  const first = val[0];
  const last = val[val.length - 1];

  return (first === '"' || first === "'") && first === last;
}

/**
 * Strips matching outer quotes from a string and trims the result.
 */
function stripQuotes(val: string) {
  if (isInQuotes(val)) {
    return val.slice(1, -1).trim();
  }
  return val;
}

function hasTrailingWhitespace(text: string, index: number) {
  return index + 1 < text.length && WHITESPACE_RE.test(text.charAt(index + 1));
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/**
 * Handles string splitting for directive values.
 *
 * rz-wake="visible, media: (min-width: 600px)" is parsed to:
 * [['visible', ''], ['media', '(min-width: 600px)']]
 */
export function parseDirectiveValue(
  value: string | null | undefined,
): ParsedDirectiveValue {
  let cleanedValue = value?.trim();
  if (!cleanedValue) return [];

  // Strip trailing commas to allow for multi-line HTML formatting.
  if (cleanedValue.endsWith(',')) {
    cleanedValue = cleanedValue.slice(0, -1).trim();
  }

  const parsed: ParsedDirectiveValue = [];
  let start = 0;

  // Scan for values separated by comma + space
  const scanResult = scan(cleanedValue, (i, char) => {
    if (char === VALUE_DELIMITER && hasTrailingWhitespace(cleanedValue, i)) {
      parseSegment(cleanedValue.slice(start, i), parsed);
      start = i + 1;
    }
    return false; // keep scanning
  });

  if (scanResult.depth > 0 || scanResult.quote) {
    warn(`Malformed directive value: '${value}'`);
  }

  // Final segment
  parseSegment(cleanedValue.slice(start), parsed);

  return parsed;
}

/**
 * Parse a single segment into a [key, value] pair and push it onto `acc`.
 */
function parseSegment(segment: string, acc: ParsedDirectiveValue): void {
  const trimmed = segment.trim();
  if (!trimmed) return;

  let splitIndex = -1;

  scan(trimmed, (i, char, text) => {
    if (char === SEGMENT_DELIMITER && hasTrailingWhitespace(text, i)) {
      splitIndex = i;
      return true; // stop at first valid separator
    }
    return false; // otherwise keep scanning
  });

  if (splitIndex !== -1) {
    const key = stripQuotes(trimmed.slice(0, splitIndex).trim());
    const val = stripQuotes(trimmed.slice(splitIndex + 1).trim());
    if (key) acc.push([key, val]);
  } else {
    const key = stripQuotes(trimmed);
    if (key) acc.push([key, '']);
  }
}

/**
 * Utility for parsing a value that might have modifiers.
 * Safely extracts modifiers, ignoring dots inside quotes or boundaries.
 *
 * - `click.debounce.400ms` returns `{ key: 'click', modifiers: ['debounce', '400ms']}`
 * - `media.(max-width < 600px)` returns `{ key: 'media', modifiers: ['(max-width < 600px)']}`
 */
export function parseModifiers(value: string): { key: string; modifiers: string[] } {
  const parts = scanSplit(value, MODIFIER_DELIMITER);
  const [key = '', ...modifiers] = parts;
  return { key, modifiers };
}

/**
 * Handles parsing raw directive values into an array of trigger definitions.
 * Splits on whitespace, ignoring spaces inside quotes or boundaries.
 */
export function parseTriggers(value: string | null | undefined): TriggerDef[] {
  let rawTriggers = value?.trim();
  if (!rawTriggers) return [];

  rawTriggers = stripQuotes(rawTriggers);

  if (rawTriggers.includes(',')) {
    warn(`Separate multi-trigger values by spaces, not commas: '${rawTriggers}'.`);
    return [];
  }

  const parts: string[] = [];
  let start = 0;

  // Split on whitespace only when depth is 0
  scan(rawTriggers, (i, char, text) => {
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (start !== i) {
        parts.push(text.slice(start, i));
      }
      start = i + 1;
    }
    return false; // keep scanning
  });

  if (start < rawTriggers.length) {
    const remaining = rawTriggers.slice(start);
    if (remaining) {
      parts.push(remaining);
    }
  }

  const triggers: TriggerDef[] = [];
  for (const trigger of parts) {
    const { key: event, modifiers } = parseModifiers(trigger);
    if (event) {
      triggers.push({ event, modifiers });
    }
  }

  return triggers;
}

/**
 * Parses directive values shaped as `[trigger]: [subject]` pairs.
 *
 * Combines `parseDirectiveValue` (comma-separated groups) with `parseTriggers`
 * (space-separated triggers within a group). Triggers in the same group share
 * the group's subject.
 *
 * Within a no-colon segment, `looksLikeSubject(segment)` decides whether to
 * treat the segment as a subject (`{ trigger: null, subject }`) or as a
 * trigger (one or more `{ trigger, subject: null }` pairs). `null` on either
 * side means "use the directive's default" — consumers resolve it.
 *
 * Pass `() => false` to preserve legacy "no colon means trigger only" behavior.
 */
export function parseTriggerSubjectPairs(
  value: string | null | undefined,
  subjectDetector: (s: string) => boolean,
): TriggerSubjectPair[] {
  const trimmed = value?.trim();
  if (trimmed == null) return [];
  if (trimmed === '') {
    return [{ trigger: null, subject: null }];
  }

  const pairs: TriggerSubjectPair[] = [];

  for (const [keyStr, subjectStr] of parseDirectiveValue(value)) {
    if (subjectStr) {
      // Trigger: Subject
      for (const trigger of parseTriggers(keyStr)) {
        pairs.push({ trigger, subject: subjectStr });
      }
    } else if (subjectDetector(keyStr)) {
      // Subject only
      pairs.push({ trigger: null, subject: keyStr });
    } else {
      // Trigger only
      for (const trigger of parseTriggers(keyStr)) {
        pairs.push({ trigger, subject: null });
      }
    }
  }

  return pairs;
}

/**
 * Parse HTTP method and URL from string value like 'GET /users/api'.
 */
export function parseUrlSubject(value: string | undefined | null): {
  method?: HttpMethod;
  url?: string;
} {
  const trimmed = value?.trim();
  if (!trimmed) return {};
  if (isHttpMethod(trimmed)) {
    return { method: trimmed.toUpperCase() as HttpMethod };
  }

  const match = trimmed.match(SUBJECT_RE);

  if (match) {
    const [, initial, rest] = match;
    if (isHttpMethod(initial)) {
      return { method: initial.toUpperCase() as HttpMethod, url: rest };
    }
  }

  return { url: trimmed };
}

/**
 * Check if the value starts with a URL-shaped prefix or its leading
 * whitespace-split token is a known HTTP method.
 *
 * Otherwise treated as a trigger by `parseTriggerSubjectPairs`.
 */
export function looksLikeUrlSubject(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (FETCH_URL_PREFIX_RE.test(trimmed) || trimmed.startsWith(STORE_PREFIX)) {
    return true;
  }

  const firstToken = trimmed.split(/\s+/, 1)[0];
  return isHttpMethod(firstToken);
}

/**
 * Parse optional action prefix and target from a store subject.
 */
export function parseStoreSubject(value: string | undefined | null): {
  action?: PatchAction;
  target?: string;
} {
  const trimmed = value?.trim();
  if (!trimmed) return {};
  if (isPatchAction(trimmed)) {
    return { action: trimmed.toLowerCase() as PatchAction };
  }

  const match = trimmed.match(SUBJECT_RE);

  if (match) {
    const [, initial, rest] = match;
    if (isPatchAction(initial)) {
      return { action: initial.toLowerCase() as PatchAction, target: rest };
    }
  }

  return { target: trimmed };
}

/**
 * Subject if the value starts with the store prefix or its leading
 * whitespace-split token is a known store action.
 *
 * Otherwise treated as a trigger by `parseTriggerSubjectPairs`.
 */
export function looksLikeStoreSubject(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(STORE_PREFIX)) return true;

  const firstToken = trimmed.split(/\s+/, 1)[0];
  return isPatchAction(firstToken);
}

/**
 * Extracts the store name and the nested path (if any) from a string value.
 */
export function parseStoreLocator(value: string): {
  storeName: string;
  nestedPath: string;
} {
  const path = value.slice(STORE_PREFIX.length);
  const dotIndex = path.indexOf('.');

  if (dotIndex === -1) {
    return { storeName: path, nestedPath: '' };
  }

  return {
    storeName: path.slice(0, dotIndex),
    nestedPath: path.slice(dotIndex + 1),
  };
}
