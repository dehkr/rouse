import { Gilligan } from './core/application';

// Make available as 'Gilligan' and the shorthand 'gn'
export { Gilligan, Gilligan as gn };

// These are available on gn/Gilligan but providing as named exports for good measure
export { controller } from './dom/controller';
export { createStore } from './reactivity/store';
export { reactive } from './reactivity/reactive';
export { effect, computed, type ReactiveEffect } from './reactivity/effect';

export type { SetupContext, SetupFn, GilliganEvent, BindableValue } from './types';
