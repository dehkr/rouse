import { Rouse } from './core';

export { Rouse };

export { controller } from './dom/controller';
export { http } from './net/fetch';
export { createStore } from './core/store';
export { computed, effect, reactive } from './reactivity';

export type { SetupContext, SetupFn, BindableValue } from './types';

if (typeof window !== 'undefined') {
  (window as any).Rouse = Rouse;
}
