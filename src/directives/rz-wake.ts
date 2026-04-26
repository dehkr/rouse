import { parseDirectiveValue } from '../core/parser';
import {
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
} from '../core/shared';
import * as scheduler from '../dom/scheduler';
import type { Directive, DirectiveSlug } from '../types';

const SLUG = 'wake' as const satisfies DirectiveSlug;

export const rzWake = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getDefinedValue: (el: Element) => getDefinedDirectiveValue(el, SLUG),
  processStrategy,
} as const satisfies Directive;

function processStrategy(el: Element, defaultStrategy: string, onWake: () => void) {
  const strategies = parseDirectiveValue(
    getDefinedDirectiveValue(el, SLUG) || defaultStrategy,
  );

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
