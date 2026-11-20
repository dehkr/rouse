/*
 * Core's scanned directives, in the order they bind and mount. A directive gets its own
 * `rz-<slug>.ts` when it has logic beyond one helper call. Otherwise it's an entry in a
 * shared module named for what its entries are (`writers.ts`). Keep
 * `as const satisfies …Directive` on a directive literal, or the slug widens to `string`.
 *
 * Adding a directive: its slug in `DIRECTIVE_SLUGS`, in its group, then by group:
 *
 * - Bound, when it binds scope state per segment: an entry in `BOUND_DIRECTIVES`.
 * - Standalone, when it acts on triggers whether or not a scope is awake: an entry in
 *   `STANDALONE_DIRECTIVES`, or `app._addStandaloneDirective` in a plugin's `install`.
 *   A plugin-owned slug also goes in `PLUGIN_DIRECTIVES` (`core/plugins.ts`).
 * - Config, when another directive or the request pipeline reads it: a `read<Slug>`
 *   function in the reader's module, with no registration.
 * - Structural (`rz-store`, `rz-scope`): none is expected. A new one needs its own
 *   fixed step in `dom/observer.ts`.
 *
 * Plugins add standalone directives only. The binder's removal walk runs on detached
 * nodes with no app, so the bound selector must stay static.
 */
import type { BoundDirective, StandaloneDirective } from '../types';
import { rzFetch } from './rz-fetch';
import { rzModel } from './rz-model';
import { rzOn } from './rz-on';
import { rzRender } from './rz-render';
import { rzAttr, rzClass, rzHtml, rzProp, rzStyle, rzText } from './writers';

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
