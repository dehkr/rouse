import type { RouseController } from '../types';
import { SLUG as AUTOSAVE_SLUG } from './rz-autosave';
import { applyBind, SLUG as BIND_SLUG } from './rz-bind';
import { SLUG as FETCH_SLUG } from './rz-fetch';
import { applyHtml, SLUG as HTML_SLUG } from './rz-html';
import { SLUG as INSERT_SLUG } from './rz-insert';
import { SLUG as ISLAND_SLUG } from './rz-island';
import { applyModel, SLUG as MODEL_SLUG } from './rz-model';
import { attachOn, SLUG as ON_SLUG } from './rz-on';
import { SLUG as PUBLISH_SLUG } from './rz-publish';
import { SLUG as REFRESH_SLUG } from './rz-refresh';
import { SLUG as STORE_SLUG } from './rz-store';
import { applyText, SLUG as TEXT_SLUG } from './rz-text';
import { SLUG as TUNE_SLUG } from './rz-tune';
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
  | typeof AUTOSAVE_SLUG
  | typeof FETCH_SLUG
  | typeof INSERT_SLUG
  | typeof ISLAND_SLUG
  | typeof PUBLISH_SLUG
  | typeof REFRESH_SLUG
  | typeof STORE_SLUG
  | typeof TUNE_SLUG
  | typeof WAKE_SLUG;

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
  [ON_SLUG]: { multi: true, apply: attachOn },
  [TEXT_SLUG]: { multi: false, apply: applyText },
  [HTML_SLUG]: { multi: false, apply: applyHtml },
  [MODEL_SLUG]: { multi: false, apply: applyModel },
};

export { attachAutosave } from './rz-autosave';
export { applyBind } from './rz-bind';
export { cleanupFetch, handleFetch } from './rz-fetch';
export { applyHtml } from './rz-html';
export { getInsertConfig } from './rz-insert';
export { getControllerName } from './rz-island';
export { applyModel } from './rz-model';
export { attachOn } from './rz-on';
export { getPublishTopic } from './rz-publish';
export { attachRefresh } from './rz-refresh';
export { getStoreName } from './rz-store';
export { applyText } from './rz-text';
export { getTuningStrategy } from './rz-tune';
export { processWake } from './rz-wake';
