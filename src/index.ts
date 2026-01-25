import { Gilligan } from './core/application';

export { Gilligan, Gilligan as gn };

export { controller } from './dom/controller';
export { createStore } from './core/store';
export { computed, effect, reactive} from './reactivity';

export type { SetupContext, SetupFn, GilliganEvent, BindableValue } from './types';
