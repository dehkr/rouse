import { describe, expect, it, vi } from 'vite-plus/test';
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

/** A form-associated custom element that submits its `value` attribute. */
class TagInput extends HTMLElement {
  static formAssociated = true;
  internals = this.attachInternals();

  connectedCallback() {
    this.internals.setFormValue(this.getAttribute('value'));
  }
}
if (!customElements.get('rz-test-tag-input')) {
  customElements.define('rz-test-tag-input', TagInput);
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

  it('sends nothing for an unset rz-send source, without a warning', async () => {
    const seen = capture('/api/notes');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { $ } = await mount(
      `<div data-rz-scope="s">
        <button
          data-rz-fetch="click: POST /api/notes"
          data-rz-send="title, draft"
          data-rz-headers="Content-Type: application/json"
        >Save</button>
      </div>`,
      { scopes: { s: () => ({ title: 'Hi', draft: undefined }) } },
    );
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(JSON.parse(seen.body!)).toEqual({ title: 'Hi' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('adds rz-send sources to a form’s fields, and a source wins on a shared key', async () => {
    const seen = capture('/api/filter');
    const { $ } = await mount(
      `<form action="/api/filter" method="post" data-rz-fetch="submit" data-rz-send="@filters">
        <input name="q" value="shoes">
        <input name="sort" value="price">
        <button name="go" value="1">Go</button>
      </form>`,
      { stores: { filters: { sort: 'rating', size: 'm' } } },
    );
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(Object.fromEntries(new URLSearchParams(seen.body))).toEqual({
      q: 'shoes',
      sort: 'rating',
      size: 'm',
      go: '1',
    });
  });

  it('sends a field’s own value alongside its rz-send sources', async () => {
    const seen = capture('/api/search');
    const { $ } = await mount(
      `<input name="q" value="shoes" data-rz-fetch="change: /api/search" data-rz-send='{"page": 2}'>`,
    );
    $('input').dispatchEvent(new Event('change'));
    await expect.poll(() => seen.request).toBeDefined();
    const params = new URL(seen.request!.url).searchParams;
    expect(params.get('q')).toBe('shoes');
    expect(params.get('page')).toBe('2');
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

describe('form collection', () => {
  it('sends a form-associated custom element’s value', async () => {
    const seen = capture('/api/tags');
    const { $ } = await mount(`
      <form action="/api/tags" method="post" data-rz-fetch="submit">
        <rz-test-tag-input name="tags" value="a,b"></rz-test-tag-input>
        <button>Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(new URLSearchParams(seen.body).get('tags')).toBe('a,b');
  });

  it('sends values a formdata listener adds', async () => {
    const seen = capture('/api/form');
    const { $ } = await mount(`
      <form action="/api/form" method="post" data-rz-fetch="submit">
        <input name="a" value="1"><button>Go</button>
      </form>
    `);
    $('form').addEventListener('formdata', (e) => e.formData.append('b', '2'));
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(Object.fromEntries(new URLSearchParams(seen.body))).toEqual({
      a: '1',
      b: '2',
    });
  });

  it('sends a dirname field’s direction', async () => {
    const seen = capture('/api/form');
    const { $ } = await mount(`
      <form action="/api/form" method="post" data-rz-fetch="submit">
        <input name="note" value="hi" dir="rtl" dirname="note.dir">
        <button>Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(new URLSearchParams(seen.body).get('note.dir')).toBe('rtl');
  });

  it('sends an empty file part for a file input with no file selected', async () => {
    const seen = capture('/api/upload');
    const { $ } = await mount(`
      <form action="/api/upload" method="post" enctype="multipart/form-data" data-rz-fetch="submit">
        <input type="file" name="avatar"><button>Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(seen.body).toContain('name="avatar"; filename=""');
  });

  it('drops a file input with no file selected from a JSON body, without a warning', async () => {
    const seen = capture('/api/upload');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { $ } = await mount(`
      <form action="/api/upload" method="post" data-rz-fetch="submit" data-rz-headers="Content-Type: application/json">
        <input name="title" value="pic">
        <input type="file" name="avatar">
        <input type="file" name="photos" multiple>
        <button>Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(JSON.parse(seen.body!)).toEqual({ title: 'pic' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sends a list for a multi-select or a shared name, whatever is chosen', async () => {
    const seen = capture('/api/filter');
    const { $ } = await mount(`
      <form action="/api/filter" method="post" data-rz-fetch="submit" data-rz-headers="Content-Type: application/json">
        <select name="size" multiple><option selected>m</option><option>l</option></select>
        <input type="checkbox" name="color" value="red" checked>
        <input type="checkbox" name="color" value="blue">
        <input type="radio" name="ship" value="fast" checked>
        <input type="radio" name="ship" value="slow">
        <button>Go</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => seen.request).toBeDefined();
    expect(JSON.parse(seen.body!)).toEqual({ size: ['m'], color: ['red'], ship: 'fast' });
  });

  it('leaves out a submitter that isn’t one of the form’s submit buttons', async () => {
    const seen = capture('/api/form');
    const { app, $ } = await mount(`
      <form><input name="a" value="1"></form>
      <button type="button" name="b" value="2">Other</button>
    `);
    await app.fetch('/api/form', {
      method: 'POST',
      triggerEl: $('form'),
      submitter: $<HTMLButtonElement>('button'),
    });
    expect(Object.fromEntries(new URLSearchParams(seen.body))).toEqual({ a: '1' });
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

describe('invalid requests', () => {
  // Never sent: an unmocked /api/ request would fail the test in afterEach
  it('fails a GET app.fetch with a body as INVALID_REQUEST and fires :error', async () => {
    const codes: unknown[] = [];
    const { app } = await mount('', {
      setup: (a) => a.on('rz:fetch:error', (e) => codes.push(e.detail.error?.code)),
    });
    const { error } = await app.fetch('/api/never', { body: { a: 1 } });
    expect(error?.code).toBe('INVALID_REQUEST');
    expect(codes).toEqual(['INVALID_REQUEST']);
  });

  it('checks the method a :config listener sets', async () => {
    const codes: unknown[] = [];
    const { app } = await mount('', {
      setup: (a) => {
        a.on('rz:fetch:config', (e) => {
          e.detail.config.method = 'GET';
        });
        a.on('rz:fetch:error', (e) => codes.push(e.detail.error?.code));
      },
    });
    const { error } = await app.fetch('/api/never', { method: 'POST', body: { a: 1 } });
    expect(error?.code).toBe('INVALID_REQUEST');
    expect(codes).toEqual(['INVALID_REQUEST']);
  });

  it('fails an unresolvable URL before firing any event', async () => {
    const fired: string[] = [];
    const { app } = await mount('', {
      setup: (a) => {
        a.on('rz:fetch:config', (e) => fired.push(e.type));
        a.on('rz:fetch:error', (e) => fired.push(e.type));
      },
    });
    const { error } = await app.fetch('data:text/plain,hi');
    expect(error?.code).toBe('INVALID_REQUEST');
    expect(fired).toEqual([]);
  });
});
