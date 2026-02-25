import { registry } from '../core/registry';
import { coreStore } from '../core/store';
import { applyAutosync, applyRefetch, processWake } from '../directives';
import { getDirective, hasDirective, selector } from '../directives/prefix';
import { mountInstance, unmountInstance } from '../dom/controller';
import { isElement, resolvePayload, splitInjection } from './utils';

const storeCleanups = new WeakMap<HTMLScriptElement, Array<() => void>>();

/**
 * Initializes a controller element by parsing its directive, resolving its 
 * setup function from the registry, and mounting the reactive instance.
 * Honors the specified `wake` strategy before executing the mount.
 * 
 * @param el - The DOM element containing the `rz-use` directive.
 * @param defaultWake - The fallback wake strategy if the element doesn't specify one.
 */
export function initControllerElement(el: HTMLElement, defaultWake: string) {
  const raw = getDirective(el, 'use');
  if (!raw) return;

  const { key: name, rawPayload } = splitInjection(raw);

  const setup = registry[name];
  if (!setup) {
    console.warn(`[Rouse] Controller "${name}" is not registered.`);
    return;
  }

  processWake(el, defaultWake, () => {
    // Lazy JSON parse
    const props = resolvePayload(rawPayload) || {};
    mountInstance(el, setup, props);
  });
}

/**
 * Bootstraps a global reactive store from a `<script>` tag. 
 * Initializes the reactive data registry and attaches any declared 
 * networking behaviors (`rz-autosync`, `rz-refetch`).
 * 
 * @param script - The `<script>` element containing the JSON state and directives.
 */
function initStoreElement(script: HTMLScriptElement) {
  if (storeCleanups.has(script)) return;

  coreStore.initScript(script);

  const cleanups: Array<() => void> = [];

  // Attach behaviors and save their cleanup functions
  const autoCleanup = applyAutosync(script);
  if (autoCleanup) {
    cleanups.push(autoCleanup);
  }

  const refetchCleanup = applyRefetch(script);
  if (refetchCleanup) {
    cleanups.push(refetchCleanup);
  }

  storeCleanups.set(script, cleanups);
}

/**
 * Cleanup script elements when removed from the DOM
 */
function cleanupStoreElement(script: HTMLScriptElement) {
  const cleanups = storeCleanups.get(script);
  if (cleanups) {
    cleanups.forEach((cleanup) => cleanup());
    storeCleanups.delete(script);
  }
}

/**
 * Watches for new controller (rz-use) and store (rz-store) elements
 */
export function initObserver(wake: string) {
  const sel = selector('use');
  const storeSel = `script${selector('store')}`;

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {

      // Added
      m.addedNodes.forEach((node) => {
        if (isElement(node)) {
          // Check for stores
          if (node.tagName === 'SCRIPT' && hasDirective(node, 'store')) {
            initStoreElement(node as HTMLScriptElement);
          }
          node.querySelectorAll<HTMLScriptElement>(storeSel).forEach(initStoreElement);

          // Check for controllers
          if (hasDirective(node, 'use')) {
            initControllerElement(node, wake);
          }
          node.querySelectorAll<HTMLElement>(sel).forEach((el) => {
            initControllerElement(el, wake);
          });
        }
      });

      // Removed
      m.removedNodes.forEach((node) => {
        if (isElement(node)) {
          // Cleanup removed store scripts
          if (node.tagName === 'SCRIPT' && hasDirective(node, 'store')) {
            cleanupStoreElement(node as HTMLScriptElement);
          }
          node.querySelectorAll<HTMLScriptElement>(storeSel).forEach(cleanupStoreElement);

          // Cleanup removed controllers
          if (hasDirective(node, 'use')) {
            unmountInstance(node);
          }
          node.querySelectorAll<HTMLElement>(sel).forEach(unmountInstance);
        }
      });
    });
  });
}
