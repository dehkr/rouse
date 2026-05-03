import type { TriggerDef } from '../types';
import { warn } from './shared';

export type ParsedDirectiveValue = [string, string][];

const VALUE_DELIMITER = ',';
const PAIR_DELIMITER = ':';
const MODIFIER_DELIMITER = '.';

/**
 * Utility for parsing a value that might have modifiers.
 *
 * `click.debounce.400ms` returns `{ key: 'click', modifiers: ['debounce', '400ms']}`
 */
export function parseModifiers(value: string): { key: string; modifiers: string[] } {
  const dotIndex = value.indexOf(MODIFIER_DELIMITER);
  if (dotIndex !== -1) {
    const key = value.slice(0, dotIndex);
    const modifiers = value.slice(dotIndex + 1).split(MODIFIER_DELIMITER);
    return { key, modifiers };
  }

  return { key: value, modifiers: [] };
}

/**
 * Handles parsing raw directive values into an array of trigger definitions.
 */
export function parseTriggers(value: string | null | undefined): TriggerDef[] {
  const rawTriggers = value?.trim();
  if (!rawTriggers) return [];

  const triggers: TriggerDef[] = [];
  const parsed = rawTriggers.split(/\s+/);

  for (const trigger of parsed) {
    const { key: event, modifiers } = parseModifiers(trigger);
    if (event) {
      triggers.push({ event, modifiers });
    }
  }

  return triggers;
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
  if (!value || !cleanedValue) return [];

  // Strip trailing commas from directive strings before processing to
  // allow for trailing commas in multi-line formatting in HTML.
  if (cleanedValue.endsWith(',')) {
    cleanedValue = cleanedValue.slice(0, -1).trim();
  }
  
  const parsed: ParsedDirectiveValue = [];
  let start = 0;

  // Scan for values separated by comma + space
  const scanResult = scan(cleanedValue, (i, char) => {
    if (char === VALUE_DELIMITER) {
      if (hasTrailingWhiteSpace(cleanedValue, i)) {
        parseSegment(cleanedValue.slice(start, i), parsed);
        start = i + 1;
        // Keep scanning
        return false;
      }
    }
  });

  if (scanResult && (scanResult.depth > 0 || scanResult.quote)) {
    warn(`Malformed directive value: '${value}'`);
  }

  // Process the final segment
  parseSegment(cleanedValue.slice(start), parsed);

  return parsed;
}

/**
 * Parse a single segment into [key, value].
 */
function parseSegment(segment: string, acc: ParsedDirectiveValue) {
  const trimmed = segment.trim();
  if (!trimmed) return;

  let splitIndex = -1;

  // Scan for the first colon followed by whitespace
  scan(trimmed, (i, char, text) => {
    if (char === PAIR_DELIMITER) {
      if (hasTrailingWhiteSpace(text, i)) {
        splitIndex = i;
        // Stop scan after finding the first separator
        return true;
      }
    }
  });

  const processKey = (str: string, val: string) => {
    if (str) {
      acc.push([str, val]);
    }
  };

  if (splitIndex !== -1) {
    const rawKey = trimmed.slice(0, splitIndex).trim();
    let val = trimmed.slice(splitIndex + 1).trim();
    if (isInQuotes(val)) {
      val = val.slice(1, -1);
    }
    processKey(rawKey, val);
  } else {
    // Key-only directive values
    processKey(trimmed, '');
  }
}

const openers: Record<string, boolean> = { '(': true, '{': true, '[': true };
const closers: Record<string, string> = { ')': '(', '}': '{', ']': '[' };

type BoundaryOpener = '(' | '{' | '[';

/**
 * Iterates through text and fires callback when safe (i.e. not inside
 * quotes, parentheses, or curly braces).
 */
function scan(
  text: string,
  callback: (index: number, char: string, fullText: string) => boolean | undefined,
) {
  const depths: Record<BoundaryOpener, number> = { '(': 0, '{': 0, '[': 0 };
  let totalDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const prev = text[i - 1];

    // If inside a quote, check for matching closing quote
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
      }
    } else if (totalDepth === 0) {
      const shouldStop = callback(i, char, text);
      if (shouldStop) return { depth: totalDepth, quote };
    }
  }

  return { depth: totalDepth, quote };
}

function isInQuotes(val: string) {
  if (val.length < 2) return false;
  const first = val[0];
  const last = val[val.length - 1];

  return (first === '"' || first === "'") && first === last;
}

function hasTrailingWhiteSpace(text: string, index: number) {
  return index + 1 < text.length && /\s/.test(text.charAt(index + 1));
}
