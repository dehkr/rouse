import { Gilligan } from './core/application';

// Make available as 'Gilligan' and the shorthand 'gn'
export { Gilligan, Gilligan as gn };

// These are available on gn/Gilligan but providing as named exports for good measure
export { controller } from './dom/controller';
export { createStore } from './core/store';
export { computed, effect, reactive} from './reactivity/';

export type { SetupContext, SetupFn, GilliganEvent, BindableValue } from './types';
