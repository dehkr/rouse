import { controller, dispatch } from '../dom/controller';
import { load } from '../net/load';
import { effect, reactive } from '../reactivity';
import { bus } from './bus';
import { start } from './lifecycle';
import { register } from './registry';
import { createStore } from './store';

export const Rouse = {
  controller,
  reactive,
  effect,
  createStore,
  dispatch,
  bus,
  load,
  register,
  start,
};
