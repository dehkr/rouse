import type { StandaloneDirective } from '../../types';
import { core } from '../core';
import { bindStorePairs } from './bind-store-pairs';

let directive: StandaloneDirective | undefined;

/** Returns the `rz-pull` directive, built once on first install and shared by every app. */
export function rzPull(): StandaloneDirective {
  directive ??= core.defineNetworkOpDirective('pull', (el, app, pairs) =>
    bindStorePairs('pull', el, app, pairs),
  );
  return directive;
}
