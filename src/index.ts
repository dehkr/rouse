export { type RouseConfig, rouse } from './core/app';
export { uniqueKey } from './core/shared';
export { debounce, throttle } from './core/timing';
export { dispatch, on } from './dom/scheduler';
export { defineScope } from './dom/scope';
export { swap } from './dom/swapper';
export {
  computed,
  effect,
  nonReactive,
  reactive,
  signal,
  trigger,
} from './reactivity';
export type {
  BindableValue,
  HandlerCtx,
  LifecycleEvent,
  ScopeCtx,
  ScopeFn,
} from './types';
