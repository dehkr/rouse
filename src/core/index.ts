import { controller } from '../dom/controller';
import { dispatch } from '../dom/utils';
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
  register,
  start,
};
