import type { RousePlugin, RouseSse } from 'rousejs';
import { setCore } from './core';
import { openBoundStream } from './engine';
import { rzSse } from './rz-sse';
import { sseSource } from './trigger';

declare module 'rousejs' {
  interface RouseApp {
    /**
     * Opens a server-sent events stream, or joins one already open at the same URL.
     * The stream closes when the app is destroyed, when `options.signal` aborts, or
     * when the returned closer is called. Inside a scope, pass `signal: term` to close
     * it with the scope. Requires the `sse` plugin.
     *
     * @example
     * const close = app.sse('/api/feed');
     * app.on('rz:sse:message:html', (e) => app.place(feedEl, e.detail.data, { position: 'beforeend' }));
     */
    sse: RouseSse;
  }
}

/**
 * Opens server-sent event streams: `rz-sse`, `rz-close`, the `sse-[name]` trigger,
 * and `app.sse()`. Install with `rouse({ plugins: [sse] })`.
 */
export const sse: RousePlugin = {
  name: 'sse',
  version: __VERSION__,
  install({ app, core }) {
    setCore(core);

    app._networkDirectives.add(rzSse());
    app._triggerSources.set('sse', sseSource);

    // Released when the app-lifetime signal or the caller's signal aborts
    app.sse = (resource, options = {}) =>
      openBoundStream(app, resource, options, app._bindSignal(options.signal));
  },
};
