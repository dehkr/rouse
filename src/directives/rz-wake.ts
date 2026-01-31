import type { SetupFn } from '../types';
import { mountInstance } from '../dom/controller';
import * as scheduler from '../dom/scheduler';

export function processWake(el: HTMLElement, setup: SetupFn, defaultStrategy: string) {
  const wakeAttr = el.dataset.rzWake || defaultStrategy;
  const strategies = wakeAttr.split(
    /\s+(?=(?:load|visible|idle|interaction|delay|media|event))/,
  );

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
  strategies.forEach((str: string) => {
    // const [strategy, ...rest] = str.split('->');
    // const param = rest.join('->');
    const [strategy, param = ''] = str.split('->');

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
