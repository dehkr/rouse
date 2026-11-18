import type { RousePlugin } from 'rousejs';

/** Opens server-sent event streams. Install with `rouse({ plugins: [sse] })`. */
export const sse: RousePlugin = {
  name: 'sse',
  version: __VERSION__,
  install() {},
};
