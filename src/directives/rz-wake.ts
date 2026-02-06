import { mountInstance } from '../dom/controller';
import { parseDirective } from '../dom/parser';
import * as scheduler from '../dom/scheduler';
import type { SetupFn } from '../types';
import { getDirective } from './prefix';

export const SLUG = 'wake' as const;

export function processWake(el: HTMLElement, setup: SetupFn, defaultStrategy: string) {
  const rawWake = getDirective(el, 'wake');
  const strategies = rawWake ? parseDirective(rawWake) : parseDirective(defaultStrategy);

  let pending = strategies.length;
  if (pending === 0) {
    return mountInstance(el, setup);
  }

  // Wake triggers only when all conditions are satisfied
  const satisfy = () => {
    pending--;
    if (pending === 0) {
      mountInstance(el, setup);
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
