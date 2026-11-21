/*
 * `key-[…]` takes any `KeyboardEvent.key` value. The name, not an allow-list, keeps the
 * vocabulary open, so there's no alias table to add; `key-[space]` is the one escape.
 * Don't let `key-` accept `e.code` values. A separate `code-` argument is the additive
 * route, and would also reach the `[ ( { " '` keys the grammar can't carry.
 *
 * System modifiers are held-flag preconditions, never keys. Alone on a keyboard event
 * they match nothing; alone on a mouse event they filter. Matching is exact only when
 * the trigger states a filter, and `loose` tolerates extra held modifiers.
 *
 * Filters are inert on trigger sources; only `sse` honors a listen target. Don't
 * synthesize key repeat for modifier keys, which don't repeat on macOS.
 */
import type { RouseApp } from '../app';
import type { TriggerModifiers } from '../types';

const sysModifierMap = {
  ctrl: 'ctrlKey',
  alt: 'altKey',
  shift: 'shiftKey',
  meta: 'metaKey',
} as const;

type SystemModifierKey = keyof typeof sysModifierMap;

const SYS_MODIFIERS = Object.keys(sysModifierMap) as SystemModifierKey[];
const SYS_MODIFIER_FLAGS = Object.values(sysModifierMap);

/**
 * Normalizes the `key` option into lowercased `KeyboardEvent.key` values. The
 * parser already lowercases what it parses; this covers the programmatic surface,
 * where keys keep their real casing (`{ key: 'ArrowUp' }`).
 */
function expectedKeys(key: TriggerModifiers['key']): string[] {
  if (key === undefined) {
    return [];
  }
  return (Array.isArray(key) ? key : [key]).map((k) => k.toLowerCase());
}

/**
 * Resolves the target of the event listener.
 */
export function resolveListenerTarget(
  el: Element,
  options: TriggerModifiers,
  app: RouseApp,
): EventTarget {
  if (options.listenOn === 'window') {
    return window;
  }
  if (options.listenOn === 'document') {
    return document;
  }
  if (options.listenOn === 'root') {
    return app.root;
  }

  // To detect outside clicks, listen on the document
  if (options.outside) {
    return document;
  }

  return el;
}

/**
 * Compiles a listener's modifiers into a per-event check that applies the event
 * filters and the native-API modifiers (`prevent`, `stop`, `stopImmediate`). The check
 * returns `true` if the handler should run. Values derived from `options` are computed
 * once per listener, not per event.
 *
 * By default, modifiers are matched exactly (e.g., `key-[enter]` fires only on bare
 * Enter, not Shift+Enter). Use `loose` to allow extra modifiers.
 */
export function compileModifiers(
  el: Element,
  options: TriggerModifiers,
): (e: Event) => boolean {
  const expectedFlags = SYS_MODIFIERS.filter((m) => options[m]).map(
    (m) => sysModifierMap[m],
  );
  const keys = expectedKeys(options.key);

  return (e) => {
    if (options.self && e.target !== e.currentTarget) {
      return false;
    }

    // The instance check isn't redundant: `on()` casts its target, so `el` is a
    // `Window` for `on(window, 'click', fn, { outside: true })`.
    if (options.outside && el instanceof Element) {
      if (el.contains(e.target as Node)) {
        return false;
      }
    }

    if (e instanceof KeyboardEvent || e instanceof MouseEvent) {
      if (!expectedFlags.every((flag) => e[flag])) {
        return false;
      }

      const hasKeys = e instanceof KeyboardEvent && keys.length > 0;

      // A system modifier qualifies another key rather than filtering on its own. A
      // keyboard trigger without a `key` option has nothing to qualify, so it's inert.
      // A mouse event still filters on it (`click|ctrl`).
      if (e instanceof KeyboardEvent && expectedFlags.length > 0 && !hasKeys) {
        return false;
      }

      // Exact matching only applies when the trigger asks for specific keys or
      // modifiers. A bare trigger shouldn't be blocked by a held `shift` or `ctrl`.
      if (!options.loose && (expectedFlags.length > 0 || hasKeys)) {
        // Pressing a modifier key sets its own flag, so it isn't an extra modifier
        // unless the trigger asked for it. Allows `keydown|key-[shift]` to work.
        // A modifier's `KeyboardEvent.key` is its option name, except `Control`
        const pressed = e instanceof KeyboardEvent ? e.key.toLowerCase() : '';
        const selfFlag =
          sysModifierMap[(pressed === 'control' ? 'ctrl' : pressed) as SystemModifierKey];

        const pressedModifiers = SYS_MODIFIER_FLAGS.filter(
          (key) => e[key] && (key !== selfFlag || expectedFlags.includes(key)),
        );

        if (pressedModifiers.length !== expectedFlags.length) {
          return false;
        }
      }

      if (e instanceof KeyboardEvent && hasKeys) {
        const pressedKey = e.key.toLowerCase();
        const pressedCode = e.code.toLowerCase();

        const isMatch = keys.some((expected) => {
          if (!expected) {
            return false;
          }
          if (pressedKey === expected) {
            return true;
          }

          // Fallback to fix macOS 'alt' dead key
          if (expected.length === 1) {
            if (expected === ' ') {
              return pressedCode === 'space';
            }
            return pressedCode === `key${expected}` || pressedCode === `digit${expected}`;
          }

          return false;
        });

        if (!isMatch) {
          return false;
        }
      }
    }

    // Native API
    if (options.prevent) {
      e.preventDefault();
    }
    if (options.stop) {
      e.stopPropagation();
    }
    if (options.stopImmediate) {
      e.stopImmediatePropagation();
    }

    return true;
  };
}
