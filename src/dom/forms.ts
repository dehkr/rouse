import { warn } from '../core/diagnostics';

/** A form control that carries a value of its own. */
export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** A field's submitted value. A multi-select, or a name repeated in a container, is a list. */
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
 * Collects the fields a form or fieldset would submit, keyed by name. A repeated
 * name collects into a list.
 */
export function collectFields(
  container: HTMLFormElement | HTMLFieldSetElement,
): Record<string, FieldValue> {
  const pairs: Record<string, FieldValue> = {};

  for (const el of container.elements) {
    if (!isField(el) || BUTTON_TYPES.has(el.type)) continue;

    const value = submittedValue(el);
    if (value !== null) {
      appendValue(pairs, el.name, value);
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
    return Array.from(field.selectedOptions, (opt) => opt.value);
  }

  return field.value;
}

/** Sets `name` to `value`, collecting into a list when the name already has one. */
function appendValue(pairs: Record<string, FieldValue>, name: string, value: FieldValue) {
  const prev = pairs[name];
  pairs[name] = prev === undefined ? value : [prev, value].flat();
}
