import { describe, expect, it, vi } from 'vite-plus/test';
import type { RouseApp } from '../../../src/app';
import type { TriggerSource } from '../../../src/dom/events';
import type { DirectiveSlug, StandaloneDirective, VoidFn } from '../../../src/types';
import { mount, nextFrame } from '../helpers/mount';

/** A standalone directive on a slug core doesn't mount, with one cleanup per element. */
function probeDirective(slug: DirectiveSlug = 'close') {
  const cleanup = vi.fn();
  const directive = {
    slug,
    mount: vi.fn((): VoidFn[] => [cleanup]),
  } satisfies StandaloneDirective;
  return { directive, cleanup };
}

const PROBE = '<div data-rz-close="click: a"></div>';

/** Mounts two sibling apps on `html`, with `extend` applied to the first only. */
async function twoApps(html: string, extend: (app: RouseApp) => void) {
  const first = await mount(html, { stores: { s: {} }, setup: extend });
  const second = await mount(html, { stores: { s: {} } });
  return { first, second };
}

describe('per-app tables', () => {
  it('mounts a standalone directive only in the app that added it', async () => {
    const { directive } = probeDirective();
    const { first, second } = await twoApps(PROBE, (app) => {
      app._addStandaloneDirective(directive);
    });

    expect(directive.mount).toHaveBeenCalledTimes(1);
    expect(directive.mount).toHaveBeenCalledWith(first.$('div'), first.app, [
      { trigger: { event: 'click', options: {} }, subject: 'a' },
    ]);
    expect(second.app._standaloneDirectives.has('close')).toBe(false);
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
    const { directive, cleanup } = probeDirective();
    const { $ } = await mount(`<section>${PROBE}</section>`, {
      setup: (app) => app._addStandaloneDirective(directive),
    });

    // The removed subtree is detached when the observer runs, so it can't find its app
    $('section').remove();
    await nextFrame();

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('tears down a directive the app added when the app is destroyed', async () => {
    const { directive, cleanup } = probeDirective();
    const { app } = await mount(PROBE, {
      setup: (app) => app._addStandaloneDirective(directive),
    });

    app.destroy();

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('tears down every standalone directive on a removed element, in mount order', async () => {
    const torn: string[] = [];
    const directive = (slug: DirectiveSlug): StandaloneDirective => ({
      slug,
      mount: () => [() => torn.push(slug)],
    });
    const { $ } = await mount(
      '<section><div data-rz-close="click: a" data-rz-key="click: b"></div></section>',
      {
        setup: (app) => {
          app._addStandaloneDirective(directive('close'));
          app._addStandaloneDirective(directive('key'));
        },
      },
    );

    $('section').remove();
    await nextFrame();

    expect(torn).toEqual(['close', 'key']);
  });
});
