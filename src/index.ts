import { Rouse } from './core';

export { controller } from './dom/controller';
export { request } from './net/request';
export { computed, effect, reactive, signal, trigger } from './reactivity';
export type { BindableValue, SetupContext, SetupFn } from './types';
export { Rouse };

if (typeof window !== 'undefined') {
  (window as any).Rouse = Rouse;
}
