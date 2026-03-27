import type { RouseController } from '../types';
import { SLUG as AUTOSAVE_SLUG } from './rz-autosave';
import { attachBind, SLUG as BIND_SLUG } from './rz-bind';
import { SLUG as FETCH_SLUG } from './rz-fetch';
import { attachHtml, SLUG as HTML_SLUG } from './rz-html';
import { SLUG as INSERT_SLUG } from './rz-insert';
import { attachModel, SLUG as MODEL_SLUG } from './rz-model';
import { attachOn, SLUG as ON_SLUG } from './rz-on';
import { attachPublish, SLUG as PUBLISH_SLUG } from './rz-publish';
import { SLUG as REFRESH_SLUG } from './rz-refresh';
import { SLUG as REQUEST_SLUG } from './rz-request';
import { SLUG as SCOPE_SLUG } from './rz-scope';
import { SLUG as STORE_SLUG } from './rz-store';
import { attachText, SLUG as TEXT_SLUG } from './rz-text';
import { SLUG as TRIGGER_SLUG } from './rz-trigger';
import { SLUG as WAKE_SLUG } from './rz-wake';

// Directive types that are bound to DOM by attacher
export type DomDirectiveSlug =
  | typeof BIND_SLUG
  | typeof HTML_SLUG
  | typeof MODEL_SLUG
  | typeof ON_SLUG
  | typeof PUBLISH_SLUG
  | typeof TEXT_SLUG;

// Directive types used mainly for config
export type ConfigDirectiveSlug =
  | typeof AUTOSAVE_SLUG
  | typeof FETCH_SLUG
  | typeof INSERT_SLUG
  | typeof SCOPE_SLUG
  | typeof REQUEST_SLUG
  | typeof REFRESH_SLUG
  | typeof STORE_SLUG
  | typeof TRIGGER_SLUG
  | typeof WAKE_SLUG;

export type DirectiveSlug = DomDirectiveSlug | ConfigDirectiveSlug;

type Cleanup = (() => void) | void;

interface SimpleDirective {
  multi: false;
  attach: (el: HTMLElement, inst: RouseController, val: string) => Cleanup;
}

interface MultiDirective {
  multi: true;
  attach: (
    el: HTMLElement,
    inst: RouseController,
    val1: string,
    val2: string,
    modifiers: string[],
  ) => Cleanup;
}

export type DirectiveDef = SimpleDirective | MultiDirective;

/**
 * Registry of "active" directives that run during DOM attachment.
 */
export const DOM_DIRECTIVES: Record<DomDirectiveSlug, DirectiveDef> = {
  [BIND_SLUG]: { multi: true, attach: attachBind },
  [ON_SLUG]: { multi: true, attach: attachOn },
  [PUBLISH_SLUG]: { multi: true, attach: attachPublish },
  [TEXT_SLUG]: { multi: false, attach: attachText },
  [HTML_SLUG]: { multi: false, attach: attachHtml },
  [MODEL_SLUG]: { multi: false, attach: attachModel },
};

export { attachAutosave } from './rz-autosave';
export { attachBind } from './rz-bind';
export { getFetchDirective } from './rz-fetch';
export { attachHtml } from './rz-html';
export { getInsertConfig } from './rz-insert';
export { attachModel } from './rz-model';
export { attachOn } from './rz-on';
export { attachPublish } from './rz-publish';
export { attachRefresh } from './rz-refresh';
export { getRequestConfig } from './rz-request';
export { getControllerName } from './rz-scope';
export { getStoreName } from './rz-store';
export { attachText } from './rz-text';
export { getFetchTriggers } from './rz-trigger';
export { processWake } from './rz-wake';
