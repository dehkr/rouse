import type { RouseController } from '../types';
import { applyBind, SLUG as BIND_SLUG } from './rz-bind';
import { SLUG as FETCH_SLUG } from './rz-fetch';
import { applyHtml, SLUG as HTML_SLUG } from './rz-html';
import { SLUG as METHOD_SLUG } from './rz-method';
import { applyModel, SLUG as MODEL_SLUG } from './rz-model';
import { applyOn, SLUG as ON_SLUG } from './rz-on';
import { SLUG as PROPS_SLUG } from './rz-props';
import { SLUG as SWAP_SLUG } from './rz-swap';
import { SLUG as TARGET_SLUG } from './rz-target';
import { applyText, SLUG as TEXT_SLUG } from './rz-text';
import { SLUG as USE_SLUG } from './rz-use';
import { SLUG as WAKE_SLUG } from './rz-wake';

// Directive types that are bound to DOM by attacher
export type DomDirectiveSlug =
  | typeof BIND_SLUG
  | typeof HTML_SLUG
  | typeof MODEL_SLUG
  | typeof ON_SLUG
  | typeof TEXT_SLUG;

// Directive types used mainly for config
export type ConfigDirectiveSlug =
  | typeof FETCH_SLUG
  | typeof METHOD_SLUG
  | typeof PROPS_SLUG
  | typeof SWAP_SLUG
  | typeof TARGET_SLUG
  | typeof USE_SLUG
  | typeof WAKE_SLUG;

// Union type of all directives
export type DirectiveSlug = DomDirectiveSlug | ConfigDirectiveSlug;

type Cleanup = (() => void) | void;

interface SimpleDirective {
  multi: false;
  apply: (el: HTMLElement, inst: RouseController, val: string) => Cleanup;
}

interface MultiDirective {
  multi: true;
  apply: (el: HTMLElement, inst: RouseController, val1: string, val2: string) => Cleanup;
}

export type DirectiveDef = SimpleDirective | MultiDirective;

/**
 * Registry of "active" directives that run during DOM attachment.
 */
export const DOM_DIRECTIVES: Record<DomDirectiveSlug, DirectiveDef> = {
  [BIND_SLUG]: { multi: true, apply: applyBind },
  [ON_SLUG]: { multi: true, apply: applyOn },
  [TEXT_SLUG]: { multi: false, apply: applyText },
  [HTML_SLUG]: { multi: false, apply: applyHtml },
  [MODEL_SLUG]: { multi: false, apply: applyModel },
};

export { applyBind } from './rz-bind';
export { handleFetch } from './rz-fetch';
export { applyHtml } from './rz-html';
export { getMethod } from './rz-method';
export { applyModel } from './rz-model';
export { applyOn } from './rz-on';
export { getProps } from './rz-props';
export { getSwap } from './rz-swap';
export { getTarget } from './rz-target';
export { applyText } from './rz-text';
export { getControllerName } from './rz-use';
export { processWake } from './rz-wake';
