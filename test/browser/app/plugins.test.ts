import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { rouse } from '../../../src/index';
import type { RouseApp } from '../../../src/app';
import type { PluginApi, RousePlugin } from '../../../src/plugin-api';
import { sync } from '../../../src/plugins/sync';

const apps: RouseApp[] = [];
const roots: HTMLElement[] = [];

afterEach(() => {
  apps.splice(0).forEach((app) => app.destroy());
  roots.splice(0).forEach((root) => root.remove());
});

function freshRoot() {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  return root;
}

function create(plugins: RousePlugin[]) {
  const app = rouse({ root: freshRoot(), plugins });
  apps.push(app);
  return app;
}

function plugin(
  overrides: Partial<RousePlugin> = {},
): RousePlugin & { install: ReturnType<typeof vi.fn> } {
  return { name: 'sync', version: __VERSION__, install: vi.fn(), ...overrides } as any;
}

describe('plugins option', () => {
  it('installs each plugin with the app, after the stores exist', () => {
    let seen: PluginApi | undefined;
    let stores: unknown;
    const sync = plugin({
      install: (api) => {
        seen = api;
        stores = api.app.stores;
      },
    });

    const app = create([sync]);

    expect(seen?.app).toBe(app);
    expect(stores).toBe(app.stores);
    expect(app.config.plugins).toEqual([sync]);
  });

  it('installs a plugin listed twice once', () => {
    const sync = plugin();
    const app = create([sync, plugin({ install: sync.install }), sync]);

    expect(sync.install).toHaveBeenCalledTimes(1);
    expect(app.config.plugins).toEqual([sync]);
  });

  it('installs plugins with different names in order', () => {
    const order: string[] = [];
    const sync = plugin({ install: () => order.push('sync') });
    const sse = plugin({ name: 'sse', install: () => order.push('sse') });

    create([sse, sync]);

    expect(order).toEqual(['sse', 'sync']);
  });

  it('throws on a version mismatch before installing anything or claiming the root', () => {
    const root = freshRoot();
    const sse = plugin({ name: 'sse' });
    const stale = plugin({ version: '0.0.0' });

    expect(() => rouse({ root, plugins: [sse, stale] })).toThrow(
      /Plugin 'sync' is version 0\.0\.0/,
    );
    expect(sse.install).not.toHaveBeenCalled();
    expect(stale.install).not.toHaveBeenCalled();

    // The root is still free for a corrected retry
    const app = rouse({ root, plugins: [sse] });
    apps.push(app);
    expect(sse.install).toHaveBeenCalledTimes(1);
  });

  it('defaults to no plugins', () => {
    const app = rouse({ root: freshRoot() });
    apps.push(app);

    expect(app.config.plugins).toEqual([]);
  });

  it('throws when a plugin is installed with a second copy of core', () => {
    const app = create([sync]);

    expect(() => sync.install({ app, core: {} as PluginApi['core'] })).toThrow(
      /two copies of core/,
    );
  });
});

describe('directive registration', () => {
  it.each(['fetch', 'text'] as const)(
    'throws from rouse() when a plugin registers rz-%s, which core has',
    (slug) => {
      const taken = plugin({
        install: ({ app }) => app._addStandaloneDirective({ slug, mount: () => [] }),
      });

      expect(() => create([taken])).toThrow(
        `[Rouse] Directive 'rz-${slug}' is already registered in this app.`,
      );
    },
  );
});
