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
export function resolveListenerTarget(el: HTMLElement, modifiers: string[]): EventTarget {
  if (modifiers.includes('window')) {
    return window;
  }
  if (modifiers.includes('document')) {
    return document;
  }
  if (modifiers.includes('root')) {
    return getApp(el)?.root || el;
  }

  // To detect outside clicks, we must listen on the document
  // Or window or root if specified
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
export function applyModifiers(e: Event, el: HTMLElement, modifiers: string[]): boolean {
  // Target/UI filtering
  if (modifiers.includes('self') && e.target !== e.currentTarget) {
    return false;
  }
  if (modifiers.includes('outside') && el.contains(e.target as Node)) {
    return false;
  }

  // Native API
  if (modifiers.includes('prevent')) {
    e.preventDefault();
  }
  if (modifiers.includes('stop')) {
    e.stopPropagation();
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
    const specifiedKeys = modifiers
      .map((m) => {
        const mapped = keyMap[m];
        if (mapped) {
          return mapped.toLowerCase();
        }
        return m.length === 1 ? m.toLowerCase() : null;
      })
      .filter((k): k is string => k !== null);

    // Ensure the pressed key matches the specified one
    if (specifiedKeys.length > 0 && !specifiedKeys.includes(e.key.toLowerCase())) {
      return false;
    }
  }

  return true;
}
