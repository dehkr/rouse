import type { TriggerDef, TriggerSubjectPair } from '../types';
import {
  type HttpMethod,
  isHttpMethod,
  isPatchAction,
  type PatchAction,
  STORE_PREFIX,
} from './constants';
import { warn } from './shared';

export type ParsedDirectiveValue = [string, string][];

const VALUE_DELIMITER = ',';
const SEGMENT_DELIMITER = ':';
const MODIFIER_DELIMITER = '.';

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
function forEachSafeChar(
  text: string,
  callback: (index: number, char: string, fullText: string) => boolean | undefined,
): { depth: number; quote: string | null } {
  const depths: Record<BoundaryOpener, number> = { '(': 0, '{': 0, '[': 0 };
  let totalDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const prev = text[i - 1];

    // Inside a quote: look for the unescaped closing quote
    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
    }

    // Entering a new quote
    else if (char === "'" || char === '"') {
      quote = char;
    }

    // Entering a nested block (increment depth)
    else if (openers[char]) {
      depths[char as BoundaryOpener]++;
      totalDepth++;
    }

    // Exiting a block (decrement depth and validate matching pairs)
    else if (closers[char]) {
      const opener = closers[char] as BoundaryOpener;
      if (depths[opener] > 0) {
        depths[opener]--;
        totalDepth--;
      } else {
        __DEV__ && warn(`Mismatched bracket '${char}' in value: '${text}'.`);
      }
    }

    // Safe top-level character: trigger the callback
    else if (totalDepth === 0) {
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
function splitOnSafeDelimiter(
  text: string,
  delimiter: string | ((char: string) => boolean),
): string[] {
  const isDelimiter =
    typeof delimiter === 'string' ? (c: string) => c === delimiter : delimiter;

  const parts: string[] = [];
  let start = 0;

  forEachSafeChar(text, (i, char) => {
    if (isDelimiter(char)) {
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
  return index + 1 < text.length && /\s/.test(text.charAt(index + 1));
}

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
  const scanResult = forEachSafeChar(cleanedValue, (i, char) => {
    if (char === VALUE_DELIMITER && hasTrailingWhitespace(cleanedValue, i)) {
      parseSegment(cleanedValue.slice(start, i), parsed);
      start = i + 1;
    }
    return false; // keep scanning
  });

  if (scanResult.depth > 0 || scanResult.quote) {
    __DEV__ && warn(`Malformed directive value: '${value}'.`);
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

  forEachSafeChar(trimmed, (i, char, text) => {
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
  const parts = splitOnSafeDelimiter(value, MODIFIER_DELIMITER);
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
    __DEV__ &&
      warn(`Separate multi-trigger values by spaces, not commas: '${rawTriggers}'.`);
    return [];
  }

  const parts = splitOnSafeDelimiter(rawTriggers, (c) => /\s/.test(c));

  const triggers: TriggerDef[] = [];
  for (const trigger of parts) {
    const { key: event, modifiers } = parseModifiers(trigger);
    if (!event) continue;
    triggers.push({ event, modifiers });
  }

  return triggers;
}

/**
 * Splits a directive value into trigger/subject pairs:
 * `click: /users` -> `[{ trigger: click, subject: '/users' }]`.
 *
 * Space-separated triggers before the colon share the subject after it.
 * Commas separate groups. A group with no colon is a trigger with no subject,
 * so the directive handles resolving the URL/target some other way.
 */
export function parseTriggerSubjectPairs(
  value: string | null | undefined,
): TriggerSubjectPair[] {
  const pairs: TriggerSubjectPair[] = [];
  for (const [keyStr, subjectStr] of parseDirectiveValue(value)) {
    const subject = subjectStr || null;
    for (const trigger of parseTriggers(keyStr)) {
      pairs.push({ trigger, subject });
    }
  }
  return pairs;
}

/**
 * Parses a fetch subject string into an optional HTTP method and/or a URL.
 * The method is matched by vocabulary. Either may be omitted (a missing URL
 * is resolved from the element).
 */
export function parseFetchSubject(subject: string): {
  method?: HttpMethod;
  url?: string;
} {
  const ws = subject.search(/\s/);
  const head = ws === -1 ? subject : subject.slice(0, ws);

  // A leading HTTP method is split off. The rest is the URL. If a leading
  // HTTP method isn't detected, treat the entire string as the URL.
  if (isHttpMethod(head)) {
    return {
      method: head.toUpperCase() as HttpMethod,
      url: ws === -1 ? undefined : subject.slice(ws + 1).trim(),
    };
  }

  return { url: subject };
}

/**
 * Parses a store subject string into an optional patch action and store target.
 * The action is matched by vocabulary and the target by its `@` prefix. The target
 * may be omitted when used on a <script> element with the `rz-store` directive.
 *
 * Returns null when a token is neither an action nor a store reference.
 */
export function parseStoreSubject(
  subject: string,
  el?: Element,
): { action?: PatchAction; target?: string } | null {
  const ws = subject.search(/\s/);
  const head = ws === -1 ? subject : subject.slice(0, ws);

  // Leading action: everything after it is the store target
  if (isPatchAction(head)) {
    const action = head.toLowerCase() as PatchAction;
    const target = ws === -1 ? '' : subject.slice(ws + 1).trim();
    if (!target) return { action };
    if (!target.startsWith(STORE_PREFIX)) {
      __DEV__ && warn(`'${target}' is not a '@store' reference.`, el);
      return null;
    }
    return { action, target };
  }

  // No leading action: the whole subject is the store target
  if (!subject.startsWith(STORE_PREFIX)) {
    __DEV__ && warn(`'${subject}' is not a patch action or '@store' reference.`, el);
    return null;
  }
  return { target: subject };
}

/**
 * Splits a prefixed locator into its head (the segment after the single-char
 * prefix) and the nested dot-path, if any. Shared by `@` store references and
 * `#` script-id references.
 */
export function splitLocator(value: string): {
  head: string;
  nestedPath: string;
} {
  const path = value.slice(1);
  const dotIndex = path.indexOf('.');

  if (dotIndex === -1) {
    return { head: path, nestedPath: '' };
  }

  return {
    head: path.slice(0, dotIndex),
    nestedPath: path.slice(dotIndex + 1),
  };
}

/**
 * Extracts the store name and the nested path (if any) from a string value.
 */
export function parseStoreLocator(value: string): {
  storeName: string;
  nestedPath: string;
} {
  const { head, nestedPath } = splitLocator(value);
  return { storeName: head, nestedPath };
}

/**
 * Parses a CSS declaration string into [property, value] pairs.
 */
export function parseDeclarations(decl: string): Array<[string, string]> {
  return splitOnSafeDelimiter(decl, ';')
    .map((d) => {
      const [prop = '', ...rest] = splitOnSafeDelimiter(d, ':');
      return [prop.trim(), rest.join(':').trim()] as [string, string];
    })
    .filter(([prop]) => prop);
}
