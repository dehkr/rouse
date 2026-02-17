import { Rouse } from './core';

export { Rouse };

export { createStore } from './core/store';
export { controller } from './dom/controller';
export { request } from './net/request';
export { computed, effect, reactive, signal, trigger } from './reactivity';

export type { BindableValue, SetupContext, SetupFn } from './types';

if (typeof window !== 'undefined') {
  (window as any).Rouse = Rouse;
}
