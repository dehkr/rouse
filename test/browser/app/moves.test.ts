import { afterEach, describe, expect, it } from 'vite-plus/test';
import type { RouseApp } from '../../../src/app';
import { rouse } from '../../../src/index';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount, nextFrame } from '../helpers/mount';

type MountArgs = Parameters<typeof mount>;
type Started = 'source' | 'destination';

/** Apps created outside `mount()`, destroyed after each test. */
const created: RouseApp[] = [];

afterEach(() => {
  for (const app of created.splice(0)) {
    app.destroy();
    app.root.remove();
  }
});

/** Mounts two sibling apps, starting `first` first. */
async function mountPair(first: Started, source: MountArgs, destination: MountArgs) {
  if (first === 'source') {
    const s = await mount(...source);
    return { source: s, destination: await mount(...destination) };
  }
  const d = await mount(...destination);
  return { source: await mount(...source), destination: d };
}

async function moveBoundElement(first: Started) {
  const { source, destination } = await mountPair(
    first,
    [
      `<span data-rz-text="@label.text"></span>`,
      { stores: { label: { text: 'source' } } },
    ],
    [
      `<section data-rz-scope="s"></section>`,
      { scopes: { s: () => ({}) }, stores: { label: { text: 'destination' } } },
    ],
  );
  const span = source.$('span');

  destination.$('section').append(span);
  await nextFrame();

  source.app.stores.get('label')!.text = 'source, edited';
  destination.app.stores.get('label')!.text = 'destination, edited';
  expect(span.textContent).toBe('destination, edited');
}

async function moveFetchTrigger(first: Started) {
  let served = 0;
  worker.use(
    http.get('/api/ping', () => {
      served++;
      return new HttpResponse('pong');
    }),
  );
  const sent: Started[] = [];
  const recordAs = (name: Started) => ({
    setup: (a: RouseApp) =>
      a.interceptor('request', () => {
        sent.push(name);
      }),
  });
  const { source, destination } = await mountPair(
    first,
    [
      `<button data-rz-fetch="click: /api/ping" data-rz-place="null"></button>`,
      recordAs('source'),
    ],
    [`<div></div>`, recordAs('destination')],
  );
  const button = source.$('button');

  destination.$('div').append(button);
  await nextFrame();
  button.click();

  await expect.poll(() => served, { timeout: 500 }).toBe(1);
  expect(sent).toEqual(['destination']);
}

async function moveScopeHost(first: Started) {
  const { source, destination } = await mountPair(
    first,
    [
      `<div data-rz-scope="s"><span data-rz-text="name"></span></div>`,
      { scopes: { s: () => ({ name: 'source' }) } },
    ],
    [`<section></section>`, { scopes: { s: () => ({ name: 'destination' }) } }],
  );
  const host = source.$('div');

  destination.$('section').append(host);
  await nextFrame();

  expect(host.querySelector('span')!.textContent).toBe('destination');
}

// A move between apps is a removal from the source app and an insertion into the
// destination app. Each case runs in both start orders, since an observer per app
// would apply the two halves of the move in start order.
describe('an element moved to another app', () => {
  it('binds a bound element in the destination scope, source started first', () =>
    moveBoundElement('source'));

  it('binds a bound element in the destination scope, destination started first', () =>
    moveBoundElement('destination'));

  it('mounts a standalone directive in the destination app, source started first', () =>
    moveFetchTrigger('source'));

  it('mounts a standalone directive in the destination app, destination started first', () =>
    moveFetchTrigger('destination'));

  it('creates the scope from the destination registry, source started first', () =>
    moveScopeHost('source'));

  it('creates the scope from the destination registry, destination started first', () =>
    moveScopeHost('destination'));

  it('binds an element moved into an app that starts in the same task', async () => {
    const { app: source, $ } = await mount(`<span data-rz-text="@label.text"></span>`, {
      stores: { label: { text: 'source' } },
    });
    const root = document.createElement('div');
    document.body.append(root);
    const late = rouse({ root });
    created.push(late);
    late.store('label', { text: 'late' });
    const span = $('span');

    root.append(span);
    late.start();
    await nextFrame();

    source.stores.get('label')!.text = 'source, edited';
    late.stores.get('label')!.text = 'late, edited';
    expect(span.textContent).toBe('late, edited');
  });

  it('fires the events of a request in flight from the app that sent it', async () => {
    worker.use(
      http.get('/api/slow', async () => {
        await delay(50);
        return new HttpResponse('done');
      }),
    );
    const heard: Started[] = [];
    const listenAs = (name: Started) => ({
      setup: (a: RouseApp) => a.on('rz:fetch:end', () => heard.push(name)),
    });
    const { source, destination } = await mountPair(
      'source',
      [
        `<button data-rz-fetch="click: /api/slow" data-rz-place="null"></button>`,
        listenAs('source'),
      ],
      [`<div></div>`, listenAs('destination')],
    );
    const button = source.$('button');

    button.click();
    destination.$('div').append(button);

    await expect.poll(() => heard).toEqual(['source']);
  });
});

describe('a nested app whose root moves inside the outer app', () => {
  it('mounts the nested app again where its root lands', async () => {
    const { $ } = await mount(
      `<div id="inner"><div data-rz-scope="s"><span data-rz-text="run"></span></div></div>
       <section></section>`,
    );
    let runs = 0;
    const inner = rouse({ root: $<HTMLElement>('#inner') });
    created.push(inner);
    inner.scope('s', () => ({ run: ++runs }));
    inner.start();
    await nextFrame();

    $('section').append($('#inner'));
    await nextFrame();

    expect($('#inner span').textContent).toBe('2');
  });
});
