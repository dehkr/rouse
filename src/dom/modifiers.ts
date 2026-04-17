import { getApp } from '../core/app';

const keyMap: Record<string, string> = {
  enter: 'Enter',
  esc: 'Escape',
  space: ' ',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  tab: 'Tab',
  delete: 'Delete',
  backspace: 'Backspace',
};

const sysModifierMap = {
  ctrl: 'ctrlKey',
  alt: 'altKey',
  shift: 'shiftKey',
  meta: 'metaKey',
} as const;

type SystemModifierKey = keyof typeof sysModifierMap;
type ModifierPropertyKey = (typeof sysModifierMap)[SystemModifierKey];

/**
 * Maps modifiers to native AddEventListenerOptions.
 */
export function getListenerOptions(modifiers: string[]): AddEventListenerOptions {
  return {
    capture: modifiers.includes('capture'),
    once: modifiers.includes('once'),
    passive: modifiers.includes('passive'),
  };
}

/**
 * Resolves the target of the event listener.
 */
export function resolveListenerTarget(el: Element, modifiers: string[]): EventTarget {
  if (modifiers.includes('window')) {
    return window;
  }
  if (modifiers.includes('document')) {
    return document;
  }
  if (modifiers.includes('root')) {
    return getApp(el)?.root || el;
  }

  // To detect outside clicks, listen on the document
  if (modifiers.includes('outside')) {
    return document;
  }

  return el;
}

/**
 * Applies event modifiers and determines if the handler should execute.
 * By default, modifiers are matched exactly (e.g., `.enter` fires only on bare Enter,
 * not Shift+Enter). Use `.loose` to allow extra modifiers.
 *
 * @returns `true` if the handler should execute, `false` otherwise
 */
export function applyModifiers(
  e: Event,
  target: EventTarget,
  modifiers: string[],
): boolean {
  // Target/UI filtering
  if (modifiers.includes('self') && e.target !== e.currentTarget) {
    return false;
  }

  if (modifiers.includes('outside') && target instanceof HTMLElement) {
    if (target.contains(e.target as Node)) {
      return false;
    }
  }

  // System modifier and key checks
  if (e instanceof KeyboardEvent || e instanceof MouseEvent) {
    const expectedSysModifiers = modifiers.filter(
      (m): m is SystemModifierKey => m in sysModifierMap,
    );

    // Check required modifiers are pressed
    for (const mod of expectedSysModifiers) {
      const key = sysModifierMap[mod] as ModifierPropertyKey;
      if (!e[key]) {
        return false;
      }
    }

    // Matches the exact modifiers by default unless `.loose` is specified
    const allowExtras = modifiers.includes('loose');

    if (!allowExtras) {
      const allModifierKeys = Object.values(sysModifierMap) as ModifierPropertyKey[];
      const pressedModifiers = allModifierKeys.filter((key) => e[key]);

      if (pressedModifiers.length !== expectedSysModifiers.length) {
        return false;
      }
    }
  }

  // Key filtering
  if (e instanceof KeyboardEvent) {
    const pressedKey = e.key.toLowerCase();
    const pressedCode = e.code.toLowerCase();

    // Find if any modifier matches the key pressed
    const isMatch = modifiers.some((m) => {
      const expected = keyMap[m]?.toLowerCase() || m.toLowerCase();

      if (pressedKey === expected) return true;

      // Fallback to fix macOS 'alt' dead key
      if (expected.length === 1) {
        if (expected === ' ' && pressedCode === 'space') return true;

        return pressedCode === `key${expected}` || pressedCode === `digit${expected}`;
      }

      return false;
    });

    const hasKeyModifier = modifiers.some((m) => keyMap[m] || m.length === 1);
    if (hasKeyModifier && !isMatch) {
      return false;
    }
  }

  // Native API
  if (modifiers.includes('prevent')) {
    e.preventDefault();
  }
  if (modifiers.includes('stop')) {
    e.stopPropagation();
  }
  if (modifiers.includes('stop-immediate')) {
    e.stopImmediatePropagation();
  }

  return true;
}
