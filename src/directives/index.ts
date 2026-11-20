/*
 * One directive per `rz-<slug>.ts`, holding everything specific to it. Shared code gets
 * a module named for what it is: a factory (`define-<what-it-makes>.ts`) or a helper
 * belonging to no single directive. A directive whose whole definition is one factory
 * call gets no file of its own: the factory's module builds it (`rz-push` and `rz-pull`,
 * in the sync plugin's `define-sync-op.ts`). A shared module needs more than one
 * consumer; with one left, fold it back. A shared grammar alone is never a reason to
 * extract. Keep `as const satisfies …Directive` on each directive object, or the slug
 * widens to `string`.
 *
 * Adding a directive: its file here, its slug in `DIRECTIVE_SLUGS`, an export below,
 * and an entry in one of the lists below if it's scanned, or it's exported and never
 * scanned:
 *
 * - Bound directive: `BOUND_DIRECTIVES`, in bind order.
 * - Standalone directive: `STANDALONE_DIRECTIVES`, in mount order. A plugin's goes
 *   through `app._addStandaloneDirective` at install instead.
 * - Structural directive (`rz-store`, `rz-scope`): its own step in `dom/observer.ts`.
 * - Config directive: nothing.
 */
export { rzAttr } from './rz-attr';
export { rzClass } from './rz-class';
export { rzDeposit } from './rz-deposit';
export { rzDisable } from './rz-disable';
export { rzFetch } from './rz-fetch';
export { rzHeaders } from './rz-headers';
export { rzHtml } from './rz-html';
export { rzIndicator } from './rz-indicator';
export { rzKey } from './rz-key';
export { rzModel } from './rz-model';
export { rzOn } from './rz-on';
export { rzPlace } from './rz-place';
export { rzProp } from './rz-prop';
export { rzRender } from './rz-render';
export { rzRequest } from './rz-request';
export { rzScope } from './rz-scope';
export { rzSend } from './rz-send';
export { rzStore } from './rz-store';
export { rzStyle } from './rz-style';
export { rzText } from './rz-text';
export { rzWake } from './rz-wake';

import { rzAttr } from './rz-attr';
import { rzClass } from './rz-class';
import { rzFetch } from './rz-fetch';
import { rzHtml } from './rz-html';
import { rzModel } from './rz-model';
import { rzOn } from './rz-on';
import { rzProp } from './rz-prop';
import { rzRender } from './rz-render';
import { rzStyle } from './rz-style';
import { rzText } from './rz-text';
import type { BoundDirective, StandaloneDirective } from '../types';

/**
 * Core's bound directives, in bind order. On one element, `rz-model` binds before
 * `rz-on`, so an `input` handler runs after `rz-model` writes the value.
 */
export const BOUND_DIRECTIVES: readonly BoundDirective[] = [
  rzAttr,
  rzClass,
  rzHtml,
  rzModel,
  rzOn,
  rzProp,
  rzRender,
  rzStyle,
  rzText,
];

/** Core's standalone directives, added to each app at creation, in mount order. */
export const STANDALONE_DIRECTIVES: readonly StandaloneDirective[] = [rzFetch];
