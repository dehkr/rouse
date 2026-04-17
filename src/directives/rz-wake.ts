import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import * as scheduler from '../dom/scheduler';
import type { Directive } from '../types';

export const rzWake = {
  existsOn,
  getValue,
  getDefinedValue,
  processStrategy,
} as const satisfies Directive;

function existsOn(el: Element) {
  return hasDirective(el, 'wake');
}

function getValue(el: Element) {
  return getDirectiveValue(el, 'wake');
}

function getDefinedValue(el: Element) {
  const value = getValue(el);
  if (value === null || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function processStrategy(
  el: Element,
  defaultStrategy: string,
  onWake: () => void,
) {
  const strategies = parseDirectiveValue(getDefinedValue(el) || defaultStrategy);

  let pending = strategies.length;
  if (pending === 0) {
    return onWake();
  }

  // Wake triggers only when all conditions are satisfied
  const satisfy = () => {
    pending--;
    if (pending === 0) {
      onWake();
    }
  };

  // Strategy Logic
  strategies.forEach(([strategy, param]) => {
    switch (strategy) {
      case 'load':
        return scheduler.whenLoaded(satisfy);
      case 'delay':
        return scheduler.whenDelayOver(parseInt(param, 10) || 0, satisfy);
      case 'visible':
        return scheduler.whenVisible(el, satisfy);
      case 'media':
        return scheduler.whenMediaMatches(param, satisfy);
      case 'event':
        return scheduler.whenEvent(param, satisfy);
      case 'interaction':
        return scheduler.whenInteracted(el, satisfy);
      case 'idle':
        return scheduler.whenIdle(satisfy);
      default:
        satisfy();
    }
  });
}
