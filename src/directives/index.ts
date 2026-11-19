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
 * and a `selector` if it's scanned. Then register it, or it's exported and never
 * scanned:
 *
 * - Bound directive: `registerBoundDirectives` (`app.ts`).
 * - Network op: `NETWORK_DIRECTIVES` below. Each app copies it into its own
 *   `_networkDirectives` at creation; a plugin's network op is added there at install.
 * - Any other standalone directive: its own pass in `dom/observer.ts`.
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

import { rzFetch } from './rz-fetch';

/** Core's network ops, copied into each app's `_networkDirectives` at creation. */
export const NETWORK_DIRECTIVES = [rzFetch];
