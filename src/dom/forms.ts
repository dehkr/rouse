import { warn } from '../core/diagnostics';

/** A form control that carries a value of its own. */
export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** A field's submitted value. A multi-select, or a name shared by several fields, is a list. */
export type FieldValue = string | string[];

/** Input types a form submits only as its submitter, never as one of its fields. */
const BUTTON_TYPES = new Set(['submit', 'button', 'reset', 'image']);

export function isField(el: Element): el is Field {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

export function isFieldContainer(
  el: Element,
): el is HTMLFormElement | HTMLFieldSetElement {
  return el instanceof HTMLFormElement || el instanceof HTMLFieldSetElement;
}

/**
 * Reads the value a field submits on its own, or `null` when it submits nothing.
 * A radio reads its group's checked value.
 */
export function readField(field: Field): FieldValue | null {
  if (field.type === 'radio' && field.name) {
    const root = field.closest('form') || document;
    const checked = root.querySelector<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(field.name)}"]:checked`,
    );
    return checked ? submittedValue(checked) : null;
  }

  return submittedValue(field);
}

/**
 * Collects what a set of elements would submit, keyed by name. A form or fieldset
 * contributes its fields, and a field reached twice counts once. A name shared by
 * more than one non-radio field is always a list, so the shape follows the markup
 * rather than how many boxes are checked.
 */
export function collectFields(elements: Iterable<Element>): Record<string, FieldValue> {
  const fields = new Set<Field>();

  for (const el of elements) {
    for (const member of isFieldContainer(el) ? el.elements : [el]) {
      if (isField(member) && !BUTTON_TYPES.has(member.type)) {
        fields.add(member);
      }
    }
  }

  const pairs: Record<string, FieldValue> = {};
  const named = new Set<string>();
  const shared = new Set<string>();

  for (const field of fields) {
    if (field.name && field.type !== 'radio') {
      (named.has(field.name) ? shared : named).add(field.name);
    }

    const value = submittedValue(field);
    if (value !== null) {
      appendValue(pairs, field.name, value);
    }
  }

  for (const name of shared) {
    const value = pairs[name];
    if (typeof value === 'string') {
      pairs[name] = [value];
    }
  }

  return pairs;
}

/**
 * Collects a form's data as query parameters, the way a native GET submission
 * does, so a file input contributes its file name.
 */
export function formQueryParams(form: HTMLFormElement): Record<string, FieldValue> {
  const pairs: Record<string, FieldValue> = {};
  new FormData(form).forEach((value, key) =>
    appendValue(pairs, key, typeof value === 'string' ? value : value.name),
  );
  return pairs;
}

/**
 * Reads the value a field contributes to a submission, or `null` when it contributes
 * none. A field inside a disabled fieldset still reads `disabled` as false, so the
 * check is `:disabled`, which matches what the browser leaves out.
 */
function submittedValue(field: Field): FieldValue | null {
  if (!field.name || field.matches(':disabled')) return null;

  if (field.type === 'file') {
    __DEV__ &&
      warn(`File input '${field.name}' can't be sent as JSON. Ignoring it.`, field);
    return null;
  }

  if (
    field instanceof HTMLInputElement &&
    (field.type === 'checkbox' || field.type === 'radio') &&
    !field.checked
  ) {
    return null;
  }

  if (field instanceof HTMLSelectElement && field.multiple) {
    const values = Array.from(field.selectedOptions, (opt) => opt.value);
    return values.length ? values : null;
  }

  return field.value;
}

/** Sets `name` to `value`, collecting into a list when the name already has one. */
function appendValue(pairs: Record<string, FieldValue>, name: string, value: FieldValue) {
  const prev = pairs[name];
  pairs[name] = prev === undefined ? value : [prev, value].flat();
}
