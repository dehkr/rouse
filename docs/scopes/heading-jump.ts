import type { HandlerCtx, RenderHandlerCtx, ScopeSetup } from '../assets/rouse/rouse.js';
import { reactive } from '../assets/rouse/rouse.js';

/**
 * Scope for a "jump to section" combobox that lists the page's headings.
 *
 * Inside the scope host, it needs an input with `role="combobox"` and an element with
 * `role="listbox"` and an `id`. The input's `placeholder` shows while the list is closed,
 * and its `aria-label` while it's open. The listbox's `id` prefixes each option's `id`.
 *
 * Set `data-headings` on the host to choose the headings to list. The default is
 * `main :is(h2, h3)[id]`, and headings without an `id` are skipped. Choosing a section
 * scrolls to it, updates the URL hash, focuses the heading, and adds the `toc-target`
 * class so the stylesheet can highlight it.
 * 
 */
export const headingJump: ScopeSetup = ({ host }) => {
  const required = (role: string) => {
    const el = host.querySelector<HTMLElement>(`[role="${role}"]`);
    if (!el) {
      // Throwing leaves the region unbound with a single error, rather than one for
      // each directive that lives within it.
      throw new Error(`heading-jump: no [role="${role}"] inside the host`);
    }
    return el;
  };
  const combobox = required('combobox');
  const listbox = required('listbox');

  // Read before rz-attr binds the placeholder, so this is the markup's value
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

  // 0: title prefix, 1: word prefix, 2: letters in order, -1: no match
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

  // The list keeps page order so its structure stays readable; the highlight
  // goes to the best match, so `Enter` picks it
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
    // Focus follows, so `Tab` continues from the section; `preventScroll` keeps the smooth scroll
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.classList.remove('toc-target');
    // Reflow, so landing on the same heading restarts the flash
    void heading.offsetWidth;
    heading.classList.add('toc-target');
  }

  return {
    list,
    open,
    close,
    filter,
    prev: () => step(-1),
    next: () => step(1),
    dismiss: ({ el }: HandlerCtx) => el.blur(),
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
