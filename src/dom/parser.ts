export type ParsedVal = [string, string, string[]][];

/**
 * Handles string splitting for directive values.
 * 
 * rz-wake="visible, media: (min-width: 600px)" is parsed to:
 * [['visible', ''], ['media', '(min-width: 600px)']]
 * 
 * Values with modifiers (e.g. rz-tune="debounce.trailing: 500") are parsed to:
 * [['debounce', '500', ['trailing']]]
 */
export function parseDirective(value: string): ParsedVal {
  if (!value) return [];

  const parsed: ParsedVal = [];
  let start = 0;

  // Scan for commas
  const scanResult = scan(value, (i, char) => {
    if (char === ',') {
      parseSegment(value.slice(start, i), parsed);
      start = i + 1;
      // Keep scanning
      return false;
    }
  });

  if (scanResult && (scanResult.depth > 0 || scanResult.quote)) {
    console.warn(`[Rouse] Malformed directive value: "${value}"`);
  }

  // Process the final segment
  parseSegment(value.slice(start), parsed);

  console.log(parsed);
  return parsed;
}

/**
 * Parse a single segment into [key, value, [modifiers]].
 */
function parseSegment(segment: string, acc: ParsedVal) {
  const trimmed = segment.trim();
  if (!trimmed) return;

  let splitIndex = -1;

  // Scan for the first colon followed by whitespace
  scan(trimmed, (i, char, text) => {
    if (char === ':') {
      // Check for whitespace character after the colon
      const charAfterColon = text.charAt(i + 1);
      if (i + 1 < text.length && /\s/.test(charAfterColon)) {
        splitIndex = i;
        // Stop scanning after finding the first separator
        return true;
      }
    }
  });

  const processKey = (str: string, val: string) => {
    const [key, ...modifiers] = str.split('.');
    if (key) {
      acc.push([key, val, modifiers]);
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

/**
 * Iterates through text and fires callback when safe (i.e. not inside
 * quotes or parentheses).
 */
function scan(
  text: string,
  callback: (index: number, char: string, fullText: string) => boolean | undefined,
) {
  let depth = 0;
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
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      // At the top level so fire callback
      const shouldStop = callback(i, char, text);
      if (shouldStop) return;
    }
  }
  return { depth, quote };
}

function isInQuotes(val: string) {
  if (val.length < 2) return false;
  const first = val[0];
  const last = val[val.length - 1];
  return (first === '"' || first === "'") && first === last;
}
