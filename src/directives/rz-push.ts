import type { DirectiveSlug } from '../types';
import { defineNetworkDirective } from './network-directive';
import { bindStorePairs } from './store-sync';

const SLUG = 'push' as const satisfies DirectiveSlug;

/**
 * Wires each parsed `[trigger]: [[action] \@store[.path]]` pair to push local
 * store state to the server.
 */
export const rzPush = defineNetworkDirective(SLUG, 'click: @user', (el, app, pairs) =>
  bindStorePairs(SLUG, el, app, pairs),
);
