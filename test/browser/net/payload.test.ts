import { describe, expect, it } from 'vite-plus/test';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

/** Captures the next request to `path` for any method and answers with an empty body. */
function capture(path: string, wait = 0) {
  const seen: { request?: Request; body?: string } = {};
  worker.use(
    http.all(path, async ({ request }) => {
      seen.request = request;
      seen.body = await request.text();
      await delay(wait);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return seen;
}

describe('request payloads', () => {
  it('submits a form urlencoded by default, with the submitter and without disabled fields', async () => {
    const seen = capture('/api/signup');
    const { $ } = await mount(`
      <form action="/api/signup" method="post" data-rz-fetch="submit">
        <input name="email" value="a@b.c">
        <input name="secret" value="x" disabled>
        <button name="plan" value="pro">Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();

    expect(seen.request!.method).toBe('POST');
    expect(seen.request!.headers.get('Content-Type')).toContain(
      'application/x-www-form-urlencoded',
    );
    expect(Object.fromEntries(new URLSearchParams(seen.body))).toEqual({
      email: 'a@b.c',
      plan: 'pro',
    });
  });

  it('lets the submitter’s formaction and formmethod beat the form', async () => {
    const seen = capture('/api/other');
    const { $ } = await mount(`
      <form action="/api/form" method="post" data-rz-fetch="submit">
        <button formaction="/api/other" formmethod="get" name="b" value="1">Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(seen.request!.method).toBe('GET');
    expect(new URL(seen.request!.url).searchParams.get('b')).toBe('1');
  });

  it('sends multipart when the form declares it', async () => {
    const seen = capture('/api/upload');
    const { $ } = await mount(`
      <form action="/api/upload" method="post" enctype="multipart/form-data" data-rz-fetch="submit">
        <input name="title" value="pic"><button>Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(seen.request!.headers.get('Content-Type')).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(seen.body).toContain('name="title"');
  });

  it('builds a typed JSON body from rz-send sources when the Content-Type is JSON', async () => {
    const seen = capture('/api/notes');
    const { $ } = await mount(
      `<div data-rz-scope="s">
        <button
          data-rz-fetch="click: POST /api/notes"
          data-rz-send='title, @prefs, {"page": 2}'
          data-rz-headers="Content-Type: application/json"
        >Save</button>
      </div>`,
      {
        scopes: { s: () => ({ title: 'Hi' }) },
        stores: { prefs: { dark: true, size: 3 } },
      },
    );
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(JSON.parse(seen.body!)).toEqual({ title: 'Hi', dark: true, size: 3, page: 2 });
  });

  it('sends rz-send on GET as query parameters, repeating array keys', async () => {
    const seen = capture('/api/search');
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/search" data-rz-send='{"tag": ["a", "b"], "n": 1}'>Go</button>`,
    );
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    const params = new URL(seen.request!.url).searchParams;
    expect(params.getAll('tag')).toEqual(['a', 'b']);
    expect(params.get('n')).toBe('1');
    expect(seen.body).toBe('');
  });

  it('adds rz-headers and drops a Rouse header set to null', async () => {
    const seen = capture('/api/h');
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/h" data-rz-headers="X-Tenant: 42, Rouse-Request: null" data-rz-place="null">Go</button>`,
    );
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(seen.request!.headers.get('X-Tenant')).toBe('42');
    expect(seen.request!.headers.has('Rouse-Request')).toBe(false);
  });
});

describe('in-flight state', () => {
  it('marks the indicator and disables rz-disable targets until the request ends', async () => {
    const seen = capture('/api/slow', 50);
    const { $ } = await mount(`
      <form action="/api/slow" method="post" data-rz-fetch="submit"
        data-rz-indicator="#spin" data-rz-disable="fieldset">
        <fieldset><input name="a" value="1"><button>Go</button></fieldset>
      </form>
      <span id="spin"></span>
    `);
    $('button').click();
    await expect.poll(() => $('#spin').classList.contains('rouse-request')).toBe(true);
    expect($<HTMLFieldSetElement>('fieldset').disabled).toBe(true);
    // Disabling the fieldset must not empty the payload it was read from
    await expect.poll(() => seen.body).toBe('a=1');

    await expect.poll(() => $('#spin').classList.contains('rouse-request')).toBe(false);
    expect($<HTMLFieldSetElement>('fieldset').disabled).toBe(false);
  });

  it('fails with TIMEOUT after the rz-request timeout', async () => {
    capture('/api/hang', 200);
    const codes: unknown[] = [];
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/hang" data-rz-request="timeout: 20ms">Go</button>`,
      { setup: (a) => a.on('rz:fetch:error', (e) => codes.push(e.detail.error?.code)) },
    );
    $('button').click();
    await expect.poll(() => codes).toEqual(['TIMEOUT']);
  });
});
