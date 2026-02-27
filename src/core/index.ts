import { controller } from '../dom/controller';
import { dispatch } from '../dom/utils';
import { effect, reactive } from '../reactivity';
import { createApp } from './app';

export const Rouse = {
  createApp,
  controller,
  reactive,
  effect,
  dispatch,
};
