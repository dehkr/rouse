import { RouseApp } from '../core/app';
import { directiveSelector, queryTargets, uniqueKey } from '../core/shared';
import { rzValidate, type ValidateConfig } from '../directives/rz-validate';
import type { RouseResponse } from '../types';
import { is } from './utils';

const originalStyles = new WeakMap<Element, string>();
const ERROR_FLAG = 'data-rouse-err';

/**
 * Initializes the global form validation engine.
 * Listens to network lifecycle events to automatically map granular JSON errors
 * to UI inputs, manage ARIA attributes, and handle optimistic clearing.
 */
export function initFormValidationEngine(app: RouseApp, signal: AbortSignal) {
  const appConfig = app.config;

  const sweepForm = (e: Event) => {
    const triggerEl = e.target as Element;
    const form = is(triggerEl, 'Form') ? triggerEl : triggerEl.closest('form');
    if (!form) return;

    clearFormErrors(form, appConfig.ui.errorClass);
  };

  app.root.addEventListener('rz:fetch:start', sweepForm, { signal });

  const handleValidation = (e: Event) => {
    const { detail, target } = e as CustomEvent<RouseResponse>;
    const { error } = detail;
    if (!error?.validation) return;

    const triggerEl = target as Element;
    const form = is(triggerEl, 'Form') ? triggerEl : triggerEl.closest('form');
    if (!form) return;

    const globalErrorClass = appConfig.ui.errorClass;

    const validateEls = queryTargets(form, directiveSelector(rzValidate.slug));
    let firstInvalidInput: HTMLElement | null = null;

    for (const el of validateEls) {
      const valConfig = rzValidate.getConfig(el);
      if (!valConfig) continue;

      const errorMsg = error.validation[valConfig.field];
      if (!errorMsg) continue;

      el.textContent = String(errorMsg).trim();
      el.setAttribute(ERROR_FLAG, 'true');

      if (!el.id) {
        el.id = `rouse-err-${valConfig.field}-${uniqueKey()}`;
      }

      const inputs = getInputsForField(form, valConfig.field);
      if (inputs.length === 0) continue;

      if (!firstInvalidInput) {
        firstInvalidInput = inputs.item(0);
      }

      // Group-level abort controller for optimistic clearing
      const ac = new AbortController();
      const clearOptimistic = () => {
        clearFieldErrors(inputs, el, globalErrorClass, valConfig);
        ac.abort();
      };

      for (const input of inputs) {
        // Apply ARIA
        input.setAttribute('aria-invalid', 'true');
        const existingAria = input.getAttribute('aria-describedby');
        const ariaTokens = new Set(existingAria ? existingAria.split(/\s+/) : []);
        ariaTokens.add(el.id);
        input.setAttribute('aria-describedby', Array.from(ariaTokens).join(' '));

        // Apply classes
        if (globalErrorClass) {
          input.classList.add(...globalErrorClass.split(/\s+/));
        }
        if (valConfig.errorClass) {
          input.classList.add(...valConfig.errorClass.split(/\s+/));
        }

        // Apply styles
        if (valConfig.errorStyle) {
          if (!originalStyles.has(input)) {
            originalStyles.set(input, input.getAttribute('style') || '');
          }

          let safeStyle = valConfig.errorStyle.trim();

          // Ensure new styles are closed off
          if (!safeStyle.endsWith(';')) {
            safeStyle += ';';
          }

          // Ensure existing styles are closed off to prevent concatenation bugs
          const styles = input.style.cssText;
          const separator = styles && !styles.endsWith(';') ? '; ' : '';

          input.style.cssText += `${separator}${safeStyle}`;
        }

        // Attach optimistic clearing
        input.addEventListener('input', clearOptimistic, { signal: ac.signal });
        input.addEventListener('change', clearOptimistic, { signal: ac.signal });
      }
    }

    // Auto-focus
    if (firstInvalidInput) {
      firstInvalidInput.focus();
    }
  };

  app.root.addEventListener('rz:fetch:error:json', handleValidation, { signal });
}

/**
 * Locates all `rz-validate` elements within the form and resets their associated inputs.
 */
function clearFormErrors(form: Element, globalErrorClass?: string) {
  const validateEls = queryTargets(form, directiveSelector(rzValidate.slug));
  for (const el of validateEls) {
    if (!el.hasAttribute(ERROR_FLAG)) continue;

    const valConfig = rzValidate.getConfig(el);
    if (!valConfig) continue;

    const inputs = getInputsForField(form, valConfig.field);
    clearFieldErrors(inputs, el, globalErrorClass, valConfig);
  }
}

/**
 * Clears the error state for a specific field group.
 * Removes validation text, error classes, and `aria-invalid` flags, while
 * safely restoring the input's original inline styles and `aria-describedby` tokens.
 */
function clearFieldErrors(
  inputs: Iterable<HTMLElement>,
  validateEl: Element,
  globalErrorClass?: string,
  valConfig?: ValidateConfig,
) {
  validateEl.textContent = '';
  validateEl.removeAttribute(ERROR_FLAG);

  for (const input of inputs) {
    input.removeAttribute('aria-invalid');

    // Remove ARIA
    const existingAria = input.getAttribute('aria-describedby');
    if (existingAria) {
      const ariaTokens = new Set(existingAria.split(/\s+/));
      ariaTokens.delete(validateEl.id);
      if (ariaTokens.size > 0) {
        input.setAttribute('aria-describedby', Array.from(ariaTokens).join(' '));
      } else {
        input.removeAttribute('aria-describedby');
      }
    }

    if (globalErrorClass) {
      input.classList.remove(...globalErrorClass.split(/\s+/));
    }

    if (valConfig?.errorClass) {
      input.classList.remove(...valConfig.errorClass.split(/\s+/));
    }

    if (originalStyles.has(input)) {
      const ogStyle = originalStyles.get(input) ?? '';

      if (ogStyle) {
        input.setAttribute('style', ogStyle);
      } else {
        input.removeAttribute('style');
      }
      originalStyles.delete(input);
    }
  }
}

/**
 * Helper to query inputs. Prioritizes standard 'name' attributes for
 * form serialization parity, falling back to 'id' if necessary.
 */
function getInputsForField(form: Element, field: string): NodeListOf<HTMLElement> {
  const escaped = CSS.escape(field);
  let inputs = form.querySelectorAll<HTMLElement>(`[name="${escaped}"]`);

  if (inputs.length === 0) {
    inputs = form.querySelectorAll<HTMLElement>(`[id="${escaped}"]`);
  }

  return inputs;
}
