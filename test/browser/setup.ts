import { HttpNetworkFrame } from 'msw/experimental';
import { afterAll, afterEach, beforeAll } from 'vite-plus/test';
import { unmountAll } from './helpers/mount';
import { API_PREFIX, worker } from './helpers/network';

const unhandled: string[] = [];

beforeAll(async () => {
  await worker.start({
    quiet: true,
    // Only API requests are checked: Vitest loads its own modules through the same
    // service worker, and those must pass through.
    onUnhandledFrame: ({ frame, defaults }) => {
      if (!(frame instanceof HttpNetworkFrame)) return;
      const { request } = frame.data;
      if (new URL(request.url).pathname.startsWith(API_PREFIX)) {
        unhandled.push(`${request.method} ${request.url}`);
        defaults.error();
      }
    },
  });
});

afterEach(() => {
  unmountAll();
  worker.resetHandlers();
  if (unhandled.length > 0) {
    const list = unhandled.splice(0).join(', ');
    throw new Error(`Unmocked request(s): ${list}. Add a handler with worker.use().`);
  }
});

afterAll(async () => {
  await worker.stop();
});
