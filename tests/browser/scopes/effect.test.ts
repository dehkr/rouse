import { signal } from 'alien-signals';
import { describe, expect, it, vi } from 'vite-plus/test';
import { effect, reactive } from '../../../src/index';
import { mount } from '../helpers/mount';

/** Records each `apply` value and each run of an effect created inside `apply`. */
function probe() {
  const source = reactive({ n: 0 });
  const inner = signal(0);
  const applied = vi.fn();
  const innerRuns = vi.fn();
  const start = () =>
    effect(
      () => source.n,
      (n) => {
        applied(n);
        effect(() => innerRuns(inner()));
      },
    );
  return { source, inner, applied, innerRuns, start };
}

describe('split effect in a scope', () => {
  it('stops with the scope, along with effects created in apply, when created during setup', async () => {
    const p = probe();
    const { $ } = await mount(`<section data-rz-scope="s"></section>`, {
      scopes: {
        s: () => {
          p.start();
          return {};
        },
      },
    });

    expectRunning(p);

    $('section').remove();
    await expect.poll(() => isStopped(p)).toBe(true);
  });

  it('stops with the scope, along with effects created in apply, when created in connect()', async () => {
    const p = probe();
    const { $ } = await mount(`<section data-rz-scope="s"></section>`, {
      scopes: {
        s: () => ({
          connect() {
            p.start();
          },
        }),
      },
    });

    expectRunning(p);

    $('section').remove();
    await expect.poll(() => isStopped(p)).toBe(true);
  });
});

/** Asserts that the effect and the child its latest `apply` created both run. */
function expectRunning(p: ReturnType<typeof probe>) {
  p.source.n = 1;
  expect(p.applied).toHaveBeenLastCalledWith(1);
  p.innerRuns.mockClear();
  p.inner(1);
  expect(p.innerRuns).toHaveBeenCalledOnce();
}

/** Writes both sources and reports whether neither the effect nor its child ran. */
function isStopped(p: ReturnType<typeof probe>) {
  p.applied.mockClear();
  p.innerRuns.mockClear();
  p.source.n++;
  p.inner(p.inner() + 1);
  return p.applied.mock.calls.length === 0 && p.innerRuns.mock.calls.length === 0;
}
