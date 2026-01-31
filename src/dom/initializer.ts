import { unmountInstance } from '../dom/controller';
import { registry } from '../core/registry';
import { processWake } from '../directives';
import { isElement } from './utils';

// Initialize element
export function initElement(el: HTMLElement, defaultWake: string) {
  const rawName = el.dataset.rz;
  if (!rawName) return;

  const name = rawName.trim();

  const setup = registry[name];
  if (!setup) {
    console.warn(`[Rouse] Controller "${name}" is not registered.`);
    return;
  }

  processWake(el, setup, defaultWake);
}

// Watch for elements with controller (data-rz) attribute
export function initObserver(wake: string) {
  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.removedNodes.forEach((node) => {
        if (isElement(node)) {
          if (node.dataset.rz) {
            unmountInstance(node);
          }
          node.querySelectorAll<HTMLElement>('[data-rz]').forEach(unmountInstance);
        }
      });
      m.addedNodes.forEach((node) => {
        if (isElement(node)) {
          if (node.dataset.rz) {
            initElement(node, wake);
          }
          node.querySelectorAll<HTMLElement>('[data-rz]').forEach((el) => {
            initElement(el, wake);
          });
        }
      });
    });
  });
}
