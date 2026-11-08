import { setupWorker } from 'msw/browser';

export { delay, HttpResponse, http } from 'msw';
export { sse } from 'msw/sse';

/** Request paths under this prefix must be mocked; an unmocked one fails the test. */
export const API_PREFIX = '/api/';

/** One MSW worker per test file. Add handlers per test with `worker.use(...)`. */
export const worker = setupWorker();
