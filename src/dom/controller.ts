import { bus } from '../core/bus';
import { load } from '../net/load';
import { effect } from '../reactivity/effect';
import { effectScope } from '../reactivity/effectScope';
import type { GilliganController, GilliganEvent, SetupContext, SetupFn } from '../types';
import { dispatch } from '../utils/dispatch';
import { isElt, isInp, isSel, isTxt } from '../utils/is';
import { safeParse } from '../utils/json';
import { getNestedVal, setNestedVal } from '../utils/nested';

const REGEX_BIND_SPLIT = /\s+(?=[a-z]+(?:->|<->))/;
const REGEX_BIND_PARSE = /([a-z]+)(<->|->)(.+)/;
const REGEX_EVENT_SPLIT = /\s+/;
const REGEX_EVENT_PARSE = /([a-z]+)->(.+)/;

/**
 * Identity function for TypeScript inference.
 */
export function controller<P extends Record<string, any> = Record<string, any>>(
  fn: SetupFn<P>,
): SetupFn<P> {
  return fn;
}

/**
 * Binds the controller instance to the DOM.
 * Handles initial bindings and uses MO for dynamic updates and cleanup.
 */
function bindController(
  root: HTMLElement,
  instance: GilliganController,
  refs: Record<string, HTMLElement>,
) {
  const elementCleanups = new Map<HTMLElement, (() => void)[]>();
  const boundNodes = new WeakSet<HTMLElement>();
  const prevClasses = new WeakMap<HTMLElement, string>();

  const addCleanup = (el: HTMLElement, fn: () => void) => {
    const cleanups = elementCleanups.get(el) ?? [];
    if (!elementCleanups.has(el)) {
      elementCleanups.set(el, cleanups);
    }
    cleanups.push(fn);
  };

  // Core binding engine
  const apply = (el: HTMLElement) => {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);

    // Refs
    if (el.dataset.gnRef) {
      refs[el.dataset.gnRef] = el;
    }

    // Bindings (data-gn-bind)
    if (el.dataset.gnBind) {
      const bindings = el.dataset.gnBind.split(REGEX_BIND_SPLIT);

      bindings.forEach((binding) => {
        const match = binding.match(REGEX_BIND_PARSE);
        if (!match) return;

        const [, type, dir, key] = match;
        const isTwoWay = dir === '<->';

        // State -> DOM
        const stopEffect = effect(() => {
          const value = getNestedVal(instance, key);

          switch (type) {
            case undefined: {
              break;
            }
            case 'text': {
              // Check equality to avoid cursor jumping in contenteditable
              const strVal = String(value ?? '');
              if (el.textContent !== strVal) {
                el.textContent = strVal;
              }
              break;
            }
            case 'html': {
              const htmlVal = String(value ?? '');
              if (el.innerHTML !== htmlVal) {
                el.innerHTML = htmlVal;
              }
              break;
            }
            case 'value': {
              // Handle multi-select (array value)
              if (isSel(el) && el.multiple && Array.isArray(value)) {
                const vals = new Set(value.map(String));
                Array.from(el.options).forEach((opt) => {
                  opt.selected = vals.has(opt.value);
                });
              }
              // Handle standard inputs (string value)
              else {
                const strVal = String(value ?? '');
                // Only update if actually changed to prevent cursor jumping
                if (isInp(el)) {
                  if (el.value !== strVal) {
                    el.value = strVal;
                  }
                }
              }
              break;
            }
            case 'class': {
              // Object syntax toggles class: { 'active': bool } or { 'active bg-red: bool' }
              if (value && typeof value === 'object') {
                for (const [cls, active] of Object.entries(value)) {
                  const classes = cls.trim().split(/\s+/).filter(Boolean);

                  if (classes.length > 0) {
                    if (active) {
                      el.classList.add(...classes);
                    } else {
                      el.classList.remove(...classes);
                    }
                  }
                }
              }
              // String value swaps class safely: 'active' or 'active bg-red'
              else {
                const newClass = String(value ?? '').trim();
                const oldClass = prevClasses.get(el);

                if (oldClass) {
                  el.classList.remove(...oldClass.split(/\s+/));
                }

                if (newClass) {
                  const classes = newClass.split(/\s+/).filter(Boolean);
                  if (classes.length) {
                    el.classList.add(...classes);
                    prevClasses.set(el, newClass);
                  }
                } else {
                  prevClasses.delete(el); // Clean up if no classes remain
                }
              }
              break;
            }
            case 'style': {
              // Supports object syntax and string value
              if (value && typeof value === 'object') {
                Object.assign(el.style, value);
              } else {
                el.style.cssText = String(value ?? '').trim();
              }
              break;
            }
            default: {
              // Attribute fallback
              if (value === false || value == null) {
                el.removeAttribute(type);
              } else {
                el.setAttribute(type, value === true ? '' : String(value));
              }
            }
          }
        });

        addCleanup(el, stopEffect);

        // DOM -> state (two-way binding)
        if (isTwoWay) {
          const handler = (e: Event) => {
            const target = e.target as HTMLElement;
            let val: unknown;

            // Handle contenteditable
            if (target.isContentEditable) {
              val = target.innerText;
            }
            // Handle select elements
            else if (isSel(target)) {
              val = target.multiple
                ? Array.from(target.selectedOptions).map((o) => o.value)
                : target.value;
            }
            // Handle intput/textarea elements
            else if (isInp(target) || isTxt(target)) {
              if (isInp(target) && target.type === 'checkbox') {
                val = target.checked;
              } else if (isInp(target) && (target.type === 'number' || target.type === 'range')) {
                // Handle empty numeric inputs
                val = Number.isNaN(target.valueAsNumber) ? null : target.valueAsNumber;
              } else {
                val = target.value;
              }
            }

            setNestedVal(instance, key, val);
          };

          // Determine best event type
          const isBinary = isInp(el) && (el.type === 'checkbox' || el.type === 'radio');
          const eventType = isSel(el) || isBinary ? 'change' : 'input';

          el.addEventListener(eventType, handler);
          addCleanup(el, () => el.removeEventListener(eventType, handler));
        }
      });
    }

    // Events (data-gn-on)
    if (el.dataset.gnOn) {
      const events = el.dataset.gnOn.split(REGEX_EVENT_SPLIT);
      events.forEach((evtStr) => {
        const match = evtStr.match(REGEX_EVENT_PARSE);
        if (!match) return;

        const [, evtName, methodName] = match;
        if (!evtName || !methodName) return;
        if (typeof instance[methodName] !== 'function') return;

        const handler = (e: Event) => {
          // Inject the triggering element into the event for convenience
          (e as GilliganEvent).gnTarget = el;
          instance[methodName](e);
        };

        el.addEventListener(evtName, handler);
        addCleanup(el, () => el.removeEventListener(evtName, handler));
      });
    }
  };

  // Scan (recursive add)
  const scan = (node: HTMLElement) => {
    // Check if the node belongs to this controller to ensure encapsulation of nested islands
    const nodeOwner = node.closest('[data-gn');
    if (nodeOwner === root) {
      // Bind the node itself if it has attributes
      if (node.dataset.gnBind || node.dataset.gnOn || node.dataset.gnRef) {
        apply(node);
      }
    }
    const children = node.querySelectorAll<HTMLElement>(
      '[data-gn-bind], [data-gn-on], [data-gn-ref]',
    );
    // children.forEach(apply);
    children.forEach((child) => {
      const childOwner = child.closest('[data-gn]');
      // Only bind if the closes data-gn ancestor is this controller
      if (childOwner === root) {
        apply(child);
      }
    });
  };

  // Teardown (recursive remove)
  const teardown = (node: HTMLElement) => {
    // Clean up the node itself if it was bound
    const cleanups = elementCleanups.get(node);
    if (cleanups !== undefined) {
      cleanups.forEach((fn) => {
        fn();
      });
      elementCleanups.delete(node);
    }

    // Remove ref from refs if it points to this node
    if (node.dataset.gnRef && refs[node.dataset.gnRef] === node) {
      delete refs[node.dataset.gnRef];
    }

    // Query the detached tree to find descendants that might need cleanup
    const children = node.querySelectorAll<HTMLElement>(
      '[data-gn-bind], [data-gn-on], [data-gn-ref]',
    );
    children.forEach((child) => {
      const cleanups = elementCleanups.get(child);
      if (cleanups !== undefined) {
        cleanups.forEach((fn) => {
          fn();
        });
        elementCleanups.delete(child);
      }
      // Check if this child was a registered ref
      if (child.dataset.gnRef && refs[child.dataset.gnRef] === child) {
        delete refs[child.dataset.gnRef];
      }
    });
  };

  // Run initial scan
  scan(root);

  // Start MutationObserver to monitor nodes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (isElt(node)) {
          scan(node);
        }
      });
      m.removedNodes.forEach((node) => {
        if (isElt(node)) {
          teardown(node);
        }
      });
    });
  });

  observer.observe(root, { childList: true, subtree: true });

  // Lifecycle connection
  if (typeof instance.connect === 'function') {
    instance.connect();
  }

  // Global disconnect
  return () => {
    observer.disconnect();
    for (const [_el, fns] of elementCleanups) {
      fns.forEach((fn) => {
        fn();
      });
    }
    elementCleanups.clear();

    if (typeof instance.disconnect === 'function') {
      instance.disconnect();
    }
  };
}

/**
 * Factory to create and manage a controller instance.
 */
export function createController(
  el: HTMLElement,
  setup: SetupFn,
  loadingClass: string = 'gn-loading',
) {
  let isUnmounted = false;
  const cleanups: (() => void)[] = [];

  const handle = {
    _unmount: () => {
      if (isUnmounted) return;
      isUnmounted = true;
      cleanups.reverse().forEach((fn) => {
        fn();
      });
    },
  };

  // Gather initial refs so they are available immediately in the setup function
  const refs: Record<string, HTMLElement> = {};
  el.querySelectorAll<HTMLElement>('[data-gn-ref]').forEach((refEl) => {
    const name = refEl.dataset.gnRef ?? '';
    refs[name] = refEl;
  });

  // Parse props
  let props = {};
  try {
    if (el.dataset.gnProps) {
      props = safeParse(el.dataset.gnProps);
    }
  } catch (e) {
    console.error(`[Gilligan] Failed to parse props for`, el, e);
  }

  const context: SetupContext = {
    el,
    refs,
    props,
    dispatch: (name, detail) => dispatch(el, name, detail),
    load,
    bus: {
      publish: (event, data) => bus.publish(event, data),
      subscribe: (event, cb) => {
        const unsub = bus.subscribe(event, cb);
        cleanups.push(unsub);
      },
      unsubscribe: (event, cb) => bus.unsubscribe(event, cb),
    },
  };

  // Controller instance should have an EffectScope so any effects created
  // within it are garbage collected if controller is removed from DOM.
  const scope = effectScope();
  cleanups.push(() => scope.stop());
  const result = scope.run(() => setup(context));

  const apply = (instance: GilliganController) => {
    if (isUnmounted) return;
    // Pass refs to bindController so it can update them dynamically
    const unbindDom = bindController(el, instance, refs);
    cleanups.push(unbindDom);
  };

  // Handle sync/async setup
  if (result instanceof Promise) {
    el.classList.add(loadingClass);
    result
      .then((instance) => {
        el.classList.remove(loadingClass);
        apply(instance);
      })
      .catch((err) => {
        console.error('[Gilligan] Async setup failed:', err);
        el.classList.remove(loadingClass);
      });
  } else {
    if (result !== undefined) {
      apply(result);
    }
  }

  return handle;
}
