import { describe, expect, it, vi } from 'vite-plus/test';
import type { RouseApp } from '../../../src/app';
import type { TriggerSource } from '../../../src/dom/events';
import type { StandaloneDirective } from '../../../src/types';
import { mount, nextFrame } from '../helpers/mount';

function probeDirective() {
  return {
    selector: '[data-probe]',
    initialize: vi.fn(),
    teardown: vi.fn(),
  } satisfies StandaloneDirective;
}

/** Mounts two sibling apps on `html`, with `extend` applied to the first only. */
async function twoApps(html: string, extend: (app: RouseApp) => void) {
  const first = await mount(html, { stores: { s: {} }, setup: extend });
  const second = await mount(html, { stores: { s: {} } });
  return { first, second };
}

describe('per-app tables', () => {
  it('mounts a network directive only in the app that added it', async () => {
    const probe = probeDirective();
    const { first, second } = await twoApps('<div data-probe></div>', (app) => {
      app._networkDirectives.add(probe);
    });

    expect(probe.initialize).toHaveBeenCalledTimes(1);
    expect(probe.initialize).toHaveBeenCalledWith(first.$('[data-probe]'), first.app);
    expect(second.app._networkDirectives.has(probe)).toBe(false);
  });

  it('attaches a trigger source only in the app that added it', async () => {
    const attach = vi.fn(() => null);
    const source: TriggerSource = { attach };
    const { first, second } = await twoApps('', (app) => {
      app._triggerSources.set('probe', source);
    });

    second.app.on('probe', () => {});
    expect(attach).not.toHaveBeenCalled();

    first.app.on('probe', () => {});
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('resolves a store namespace only in the app that added it', async () => {
    const html = '<span data-rz-text="@s::probe"></span>';
    const { first, second } = await twoApps(html, (app) => {
      app.stores._namespaces.set('probe', (name) => `${name} probed`);
    });

    expect(first.$('span').textContent).toBe('s probed');
    expect(second.$('span').textContent).toBe('');
  });

  it('tears down a removed element without resolving its app', async () => {
    const probe = probeDirective();
    const { $ } = await mount('<section><div data-probe></div></section>', {
      setup: (app) => app._networkDirectives.add(probe),
    });
    const el = $('[data-probe]');

    // The removed subtree is detached when the observer runs, so it can't find its app
    $('section').remove();
    await nextFrame();

    expect(probe.teardown).toHaveBeenCalledWith(el);
  });

  it('tears down a directive the app added when the app is destroyed', async () => {
    const probe = probeDirective();
    const { app, $ } = await mount('<div data-probe></div>', {
      setup: (app) => app._networkDirectives.add(probe),
    });
    const el = $('[data-probe]');

    app.destroy();

    expect(probe.teardown).toHaveBeenCalledWith(el);
  });
});
