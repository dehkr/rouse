/*
 * One signal holds the selection. Inside a binding, `isSelected` wraps its check in a
 * fresh `computed`, so a change re-runs only the bindings whose result flipped. When
 * the binding re-runs or stops, alien-signals disconnects the old `computed`. Outside a
 * binding, read the signal directly: a `computed` read with no subscriber stays linked
 * to the signal, and nothing releases it.
 *
 * Don't switch to a signal per key. A binding keeps the signal it read, so pruning the
 * map strands it, and not pruning grows the map with every key read.
 *
 * Keys are positional unless `key` names a field, matching `rz-key`. A missing field
 * value never falls back to the index, which would mix the two kinds of key.
 */
import { computed, getActiveSub, signal } from 'alien-signals';
import { warn } from '../core/diagnostics';
import { getNestedVal } from '../core/path';
import type { HandlerCtx } from '../types';
import { effect } from './effect';

/** Options for `selection()`. */
export interface SelectionOptions {
  /** Allow more than one selected item. By default, selecting an item deselects the rest. */
  multiple?: boolean;
  /**
   * Field path that identifies an item, such as `'id'`. Without it, items are identified
   * by their position in the list, so the selection stays on a position when the list
   * reorders.
   */
  key?: string;
  /** Clears the selection whenever the value this returns changes. */
  clearOn?: () => unknown;
}

/**
 * Selection state for the items of a rendered list. The item methods take the handler
 * context, so a binding or an event handler can name them directly. They work without
 * `this`.
 */
export interface Selection<Key = unknown> {
  /** Returns whether the item is selected. Re-runs a binding only when the result changes. */
  isSelected(ctx: HandlerCtx<Element>): boolean;
  /** Selects the item, or deselects it if selected. Returns whether it is now selected. */
  toggle(ctx: HandlerCtx<Element>): boolean;
  /** Selects the item. Without `multiple`, deselects the rest. */
  select(ctx: HandlerCtx<Element>): void;
  /** Deselects the item. */
  deselect(ctx: HandlerCtx<Element>): void;
  /** Deselects every item. */
  clear(): void;
  /** Replaces the selection. Without `multiple`, keeps only the last key. */
  set(keys: Iterable<Key>): void;
  /** The selected keys, in selection order. Reactive. */
  readonly keys: readonly Key[];
}

// A class instance, unlike a plain object, is left unwrapped by `reactive()`. The
// signal is a private field: as a property, a binding path could reach and write it.
class SelectionModel<Key> {
  readonly #selected: () => readonly Key[];

  constructor(selected: () => readonly Key[]) {
    this.#selected = selected;
  }

  get keys(): readonly Key[] {
    return this.#selected();
  }
}

/**
 * Tracks which items of a rendered list are selected, expanded, or active, without
 * writing that state into the list's data.
 *
 * - **Keys:** items are identified by their position in the list, or by the field that
 *   `key` names. Use a field for a list that reorders or comes from a store.
 * - **Single or multiple:** by default, selecting an item deselects the rest. Pass
 *   `multiple: true` to select items independently.
 * - **Clearing:** `clearOn` clears the selection when the value it returns changes,
 *   such as the list's source data. Called during setup, it stops with the scope.
 *
 * @param options - `multiple`, `key`, and `clearOn`.
 * @returns The selection. Return it from a scope's setup to use it in markup.
 *
 * @example
 * const days = selection({ key: 'date', clearOn: () => weather.data });
 * return { days };
 *
 * // <li data-rz-class="active: days.isSelected" data-rz-on="click: days.toggle">
 */
export function selection<Key = unknown>(options: SelectionOptions = {}): Selection<Key> {
  const { multiple, key: path, clearOn } = options;
  const selected = signal<readonly Key[]>([]);

  const keyOf = ({ el, render }: HandlerCtx<Element>): Key | undefined => {
    const key = (path ? getNestedVal(render.item, path) : render.index) as Key;
    if (key == null) {
      if (__DEV__) {
        warn(
          path
            ? `selection(): the item has no '${path}' value, so it can't be selected.`
            : `selection(): no render index outside rz-render. Call it inside an rz-render instance, or pass 'key'.`,
          el,
        );
      }
      return undefined;
    }
    return key;
  };

  // `on` forces the state; without it, the item toggles
  const update = (ctx: HandlerCtx<Element>, on?: boolean): boolean => {
    const key = keyOf(ctx);
    if (key === undefined) {
      return false;
    }
    const keys = selected();
    const was = keys.includes(key);
    const next = on ?? !was;
    if (next !== was) {
      selected(
        next ? (multiple ? [...keys, key] : [key]) : keys.filter((k) => k !== key),
      );
    }
    return next;
  };

  const clear = () => {
    selected([]);
  };

  if (clearOn) {
    effect(clearOn, clear, { defer: true });
  }

  return Object.assign(new SelectionModel<Key>(selected), {
    isSelected: (ctx: HandlerCtx<Element>) => {
      const key = keyOf(ctx);
      if (key === undefined) {
        return false;
      }
      const has = () => selected().includes(key);
      return getActiveSub() ? computed(has)() : has();
    },
    toggle: (ctx: HandlerCtx<Element>) => update(ctx),
    select: (ctx: HandlerCtx<Element>) => {
      update(ctx, true);
    },
    deselect: (ctx: HandlerCtx<Element>) => {
      update(ctx, false);
    },
    clear,
    set: (keys: Iterable<Key>) => {
      const all = [...new Set(keys)];
      selected(multiple ? all : all.slice(-1));
    },
  });
}
