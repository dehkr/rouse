import type { StandaloneDirective } from '../../types';
import { core } from '../core';
import { bindStorePairs } from './bind-store-pairs';

let directive: StandaloneDirective | undefined;

/** Returns the `rz-push` directive, built once on first install and shared by every app. */
export function rzPush(): StandaloneDirective {
  directive ??= core.defineNetworkOpDirective('push', (el, app, pairs) =>
    bindStorePairs('push', el, app, pairs),
  );
  return directive;
}
