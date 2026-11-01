import type { HandlerCtx, RenderHandlerCtx, ScopeSetup } from '../assets/rouse/rouse.js';
import { reactive } from '../assets/rouse/rouse.js';

/**
 * Scope for a "jump to section" combobox populated from page headings.
 *
 * **Required DOM structure:**
 * - An input with `[role="combobox"]`. Uses `placeholder` when closed and `aria-label` when open.
 * - A container with `[role="listbox"]` and an `id`. Prefixes each option's generated ID.
 *
 * **Configuration:**
 * - Set `data-headings` on the host to customize heading queries. Defaults to `main :is(h2, h3)[id]`.
 *   Headings lacking an `id` attribute are skipped.
 *
 * **Navigation side effects:**
 * - Scrolls to the target heading.
 * - Updates the URL hash via `history.pushState`.
 * - Moves keyboard focus to the target heading (`tabIndex = -1`).
 * - Applies and replays the `.heading-jump-target` animation class.
 */
export const headingJump: ScopeSetup = ({ host }) => {
  const required = (role: string) => {
    const el = host.querySelector<HTMLElement>(`[role="${role}"]`);
    if (!el) {
      // Fail fast to leave the region unbound and prevent cascading directive errors
      throw new Error(
        `The 'heading-jump' scope requires [role="${role}"] inside the scope.`,
      );
    }
    return el;
  };
  const combobox = required('combobox');
  const listbox = required('listbox');

  // Cache initial static markup values prior to reactive rz-attr binding
  const placeholderClosed = combobox.getAttribute('placeholder') ?? '';
  const placeholderOpen = combobox.getAttribute('aria-label') ?? placeholderClosed;
  const selector = host.dataset.headings ?? 'main :is(h2, h3)[id]';
  const norm = (string: string) =>
    string
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  type Item = {
    heading: HTMLElement;
    id: string;
    sub: boolean;
    text: string;
    normalized: string;
  };

  const items: Item[] = [...document.querySelectorAll<HTMLElement>(selector)].map(
    (heading) => ({
      heading,
      id: `${listbox.id}-${heading.id}`,
      sub: heading.tagName === 'H3',
      text: heading.textContent.trim(),
      normalized: norm(heading.textContent),
    }),
  );

  const list = reactive({
    expanded: false,
    shown: [] as Item[],
    active: -1,
    query: '',
    get placeholder() {
      return this.expanded ? placeholderOpen : placeholderClosed;
    },
    get activeId() {
      return this.shown[this.active]?.id ?? null;
    },
  });

  /**
   * Match scoring tiers:
   *  0 = Exact prefix match
   *  1 = Word-boundary match
   *  2 = In-order fuzzy character subsequence
   * -1 = No match
   */
  function rank(text: string, query: string) {
    if (text.startsWith(query)) return 0;
    if (` ${text}`.includes(` ${query}`)) return 1;

    const letters = query.replaceAll(' ', '');
    let i = 0;
    for (const c of text) {
      if (c === letters[i]) i++;
    }

    return i === letters.length ? 2 : -1;
  }

  /**
   * Preserves document order in the list while highlighting the highest-ranked
   * match for Enter key selection.
   */
  function filter() {
    const query = norm(list.query);
    const ranked = items.map((item) => ({
      item,
      rank: query ? rank(item.normalized, query) : 0,
    }));
    const hits = ranked.filter(({ rank }) => rank >= 0);

    list.shown = hits.map(({ item }) => item);

    let best = -1;
    if (query) {
      hits.forEach(({ item, rank }, i) => {
        const b = hits[best];
        if (!b || rank < b.rank || (rank === b.rank && !item.sub && b.item.sub)) {
          best = i;
        }
      });
    }
    highlight(best);
  }

  function highlight(index: number) {
    list.active = index;
    if (list.activeId) {
      document.getElementById(list.activeId)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function open() {
    filter();
    list.expanded = true;
    listbox.scrollTop = 0;
  }

  function close() {
    list.expanded = false;
    list.query = '';
    highlight(-1);
  }

  function step(delta: number) {
    const n = list.shown.length;
    if (!n) return;
    highlight(list.active < 0 ? (delta > 0 ? 0 : n - 1) : (list.active + delta + n) % n);
  }

  function go({ heading }: Item) {
    close();
    heading.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
    if (location.hash !== `#${heading.id}`) {
      history.pushState(null, '', `#${heading.id}`);
    }
    // Shift keyboard focus to target heading so Tab navigation continues from there
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.classList.remove('heading-jump-target');
    // Force reflow so the flash animation replays on repeat jumps to the same heading
    void heading.offsetWidth;
    heading.classList.add('heading-jump-target');
  }

  return {
    list,
    open,
    close,
    filter,
    prev: () => step(-1),
    next: () => step(1),
    dismiss: ({ el }: HandlerCtx) => el.blur(),
    // No-op paired with `mousedown|prevent`, which stops the popup from blurring the combobox
    keepFocus: () => {},
    hasResults: () => list.shown.length > 0,
    selected: ({ render }: RenderHandlerCtx<Item>) => render.item.id === list.activeId,
    pick: ({ render }: RenderHandlerCtx<Item>) => go(render.item),
    pickActive: () => {
      const item = list.shown[list.active];
      if (item) go(item);
    },
    shortcut: ({ e, el }: HandlerCtx) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.isContentEditable || t.closest('input, textarea, select')) return;
      e.preventDefault();
      el.focus();
    },
  };
};
