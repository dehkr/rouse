import { registry } from '../core/registry';
import { processWake } from '../directives';
import { getDirective, hasDirective, selector } from '../directives/prefix';
import { unmountInstance } from '../dom/controller';
import { isElement } from './utils';

// Initialize element
export function initElement(el: HTMLElement, defaultWake: string) {
  const rawName = getDirective(el, 'use');
  if (!rawName) return;

  const name = rawName.trim();

  const setup = registry[name];
  if (!setup) {
    console.warn(`[Rouse] Controller "${name}" is not registered.`);
    return;
  }

  processWake(el, setup, defaultWake);
}

// Watch for elements with controller (rz-use) attribute
export function initObserver(wake: string) {
  const sel = selector('use');

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.removedNodes.forEach((node) => {
        if (isElement(node)) {
          if (hasDirective(node, 'use')) {
            unmountInstance(node);
          }
          node.querySelectorAll<HTMLElement>(sel).forEach(unmountInstance);
        }
      });
      m.addedNodes.forEach((node) => {
        if (isElement(node)) {
          if (hasDirective(node, 'use')) {
            initElement(node, wake);
          }
          node.querySelectorAll<HTMLElement>(sel).forEach((el) => {
            initElement(el, wake);
          });
        }
      });
    });
  });
}
