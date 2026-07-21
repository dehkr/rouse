import type { DirectiveSlug } from '../types';
import { defineNetworkDirective } from './network-directive';
import { bindStorePairs } from './store-sync';

const SLUG = 'pull' as const satisfies DirectiveSlug;

/**
 * Wires each parsed `[trigger]: [[action] \@store[.path]]` pair to pull server
 * state into a local store.
 */
export const rzPull = defineNetworkDirective(SLUG, 'load: @user', (el, app, pairs) =>
  bindStorePairs(SLUG, el, app, pairs),
);
