import { describe, expect, it } from 'vite-plus/test';
import { compileModifiers } from '../../../src/dom/modifiers';
import type { TriggerModifiers } from '../../../src/types';

const el = document.createElement('button');

const passes = (options: TriggerModifiers, event: Event) =>
  compileModifiers(el, options)(event);

const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: k, ...init });

const click = (init: MouseEventInit = {}) => new MouseEvent('click', init);

describe('compileModifiers', () => {
  it('matches a key exactly unless loose', () => {
    expect(passes({ key: 'enter' }, key('Enter'))).toBe(true);
    expect(passes({ key: 'enter' }, key('Enter', { shiftKey: true }))).toBe(false);
    expect(passes({ key: 'enter', loose: true }, key('Enter', { shiftKey: true }))).toBe(
      true,
    );
  });

  it('requires a system modifier stated with a key to be held', () => {
    expect(passes({ key: 's', ctrl: true }, key('s', { ctrlKey: true }))).toBe(true);
    expect(passes({ key: 's', ctrl: true }, key('s'))).toBe(false);
  });

  it('matches nothing with a system modifier alone on a keyboard event', () => {
    expect(passes({ ctrl: true }, key('a', { ctrlKey: true }))).toBe(false);
  });

  it('filters a mouse event on a system modifier, exactly unless loose', () => {
    expect(passes({ ctrl: true }, click({ ctrlKey: true }))).toBe(true);
    expect(passes({ ctrl: true }, click())).toBe(false);
    expect(passes({ ctrl: true }, click({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(
      passes({ ctrl: true, loose: true }, click({ ctrlKey: true, shiftKey: true })),
    ).toBe(true);
  });

  it('matches a modifier key on its own flag', () => {
    expect(passes({ key: 'shift' }, key('Shift', { shiftKey: true }))).toBe(true);
    expect(passes({ key: 'control' }, key('Control', { ctrlKey: true }))).toBe(true);
  });

  it('passes a bare trigger whatever modifiers are held', () => {
    expect(passes({}, key('a', { shiftKey: true }))).toBe(true);
    expect(passes({}, click({ metaKey: true }))).toBe(true);
  });
});
