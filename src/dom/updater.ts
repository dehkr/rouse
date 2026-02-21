import type { BindableValue } from '../types';
import { isInput, isSelect, isTextArea } from './utils';

const prevClasses = new WeakMap<HTMLElement, string>();

/**
 * Handles innerText updates.
 */
export function updateText(el: HTMLElement, value: BindableValue) {
  // Check equality to avoid cursor jumping in contenteditable
  const strVal = String(value ?? '');
  if (el.textContent !== strVal) {
    el.textContent = strVal;
  }
}

/**
 * Handles innerHTML updates.
 */
export function updateHtml(el: HTMLElement, value: BindableValue) {
  const htmlVal = String(value ?? '');
  if (el.innerHTML !== htmlVal) {
    el.innerHTML = htmlVal;
  }
}

/**
 * Handles setting value of modelable elements.
 */
export function updateValue(el: HTMLElement, value: BindableValue) {
  // Text of elements with `contenteditable` attribute are modelable
  if (el.isContentEditable) {
    const strVal = String(value ?? '');
    if (el.innerText !== strVal) {
      el.innerText = strVal;
    }
    return;
  }

  // Handle input/select elements
  const input = el as HTMLInputElement | HTMLSelectElement;

  if (input.type === 'checkbox') {
    input.checked = !!value;
  } else if (input.type === 'radio') {
    input.checked = input.value === String(value);
  } else if (isSelect(input) && input.multiple && Array.isArray(value)) {
    // Handle multi-select (array value)
    const vals = new Set(value.map(String));
    Array.from(input.options).forEach((opt) => {
      opt.selected = vals.has(opt.value);
    });
  } else {
    // Handle standard inputs (string value)
    const strVal = String(value ?? '');
    // Only update if actually changed to prevent cursor jumping
    if (isInput(input) || isTextArea(input)) {
      if (input.value !== strVal) {
        input.value = strVal;
      }
    }
  }
}

/**
 * Returns current value of HTML element.
 */
export function getValue(el: HTMLElement): BindableValue {
  // Text of elements with `contenteditable` attribute are modelable
  if (el.isContentEditable) {
    return el.innerText;
  }

  const input = el as HTMLInputElement | HTMLSelectElement;

  if (input.type === 'checkbox') {
    return (input as HTMLInputElement).checked;
  }
  if (input.type === 'number' || input.type === 'range') {
    return Number.isNaN(input.valueAsNumber) ? null : input.valueAsNumber;
  }
  if (isSelect(input) && input.multiple) {
    return Array.from(input.selectedOptions).map((o) => o.value);
  }

  return input.value;
}

/**
 * Handles class attribute updates.
 * Object syntax toggles class: { 'active': bool } or { 'active bg-red: bool' }.
 * String value swaps class w/out replacing existing classes: 'active' or 'active bg-red'.
 */
export function updateClass(el: HTMLElement, value: BindableValue) {
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
  } else {
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
      prevClasses.delete(el);
    }
  }
}

/**
 * Handles style attribute updates. Supports object syntax and string value.
 */
export function updateStyle(el: HTMLElement, value: BindableValue) {
  if (value && typeof value === 'object') {
    Object.assign(el.style, value);
  } else {
    el.style.cssText = String(value ?? '').trim();
  }
}

/**
 * Handles generic attribute updates.
 */
export function updateAttr(el: HTMLElement, attr: string, value: BindableValue) {
  if (value === false || value == null) {
    el.removeAttribute(attr);
  } else {
    el.setAttribute(attr, value === true ? '' : String(value));
  }
}
