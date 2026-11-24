import { warn } from '../core/diagnostics';

/** A form control that carries a value of its own. */
export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** One value a field submits: text, or a file from a file input. */
type FieldEntry = string | File;
/**
 * A field's submitted value. A multi-select, a multiple file input, or a name shared
 * by several fields, is a list.
 */
type FieldValue = FieldEntry | FieldEntry[];
type FieldValues = Record<string, FieldValue>;

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

/** Returns true for a field a form submits as one of its fields. */
function isSubmittable(el: Element): el is Field {
  return isField(el) && !BUTTON_TYPES.has(el.type);
}

/**
 * Reads the value a field submits on its own, or `null` when it submits nothing.
 * A radio reads its group's checked value.
 */
function readField(field: Field): FieldValue | null {
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
 * contributes its fields, and a field reached twice counts once. Only native field
 * values contribute. Form-associated custom elements, `dirname` values, and
 * `formdata` listener entries come only from `FormData` on a form.
 */
export function collectFields(elements: Iterable<Element>): FieldValues {
  const fields = new Set<Field>();

  for (const el of elements) {
    for (const member of isFieldContainer(el) ? el.elements : [el]) {
      if (isSubmittable(member)) {
        fields.add(member);
      }
    }
  }

  const pairs: FieldValues = {};

  for (const field of fields) {
    const value = submittedValue(field);
    if (value === null) {
      continue;
    }
    appendValue(pairs, field.name, value);
  }

  return withListShape(pairs, fields);
}

/**
 * Reads what a trigger submits on its own: a field's value, a fieldset's fields, or a
 * form's entries with its submitter's. Returns `null` for any other element, and for
 * a field that submits nothing. A nameless field is silent, since a field bound
 * through `rz-model` often has no name.
 */
export function readTriggerValues(
  el: Element,
  submitter: HTMLElement | null = null,
): FieldValues | null {
  if (isField(el)) {
    const value = readField(el);
    return value === null ? null : { [el.name]: value };
  }

  if (el instanceof HTMLFormElement) {
    return readForm(el, submitter);
  }

  return el instanceof HTMLFieldSetElement ? collectFields([el]) : null;
}

/**
 * Reads a form's entries through `FormData`, as native submission builds them, so
 * form-associated custom elements, `dirname`, and `formdata` listeners contribute.
 */
function readForm(form: HTMLFormElement, submitter: HTMLElement | null): FieldValues {
  const pairs: FieldValues = {};

  for (const [name, value] of formDataOf(form, submitter)) {
    appendValue(pairs, name, value);
  }

  return withListShape(pairs, Array.from(form.elements).filter(isSubmittable));
}

/**
 * Builds a form's `FormData` with its submitter. `FormData` throws for an element that
 * isn't one of the form's submit buttons, before any `formdata` listener runs. The
 * form is then sent without that element, with a dev warning.
 */
function formDataOf(form: HTMLFormElement, submitter: HTMLElement | null): FormData {
  if (!submitter) {
    return new FormData(form);
  }

  try {
    return new FormData(form, submitter);
  } catch {
    if (__DEV__) {
      warn(
        `'submitter' isn't a submit button of the form. Sending the form without it.`,
        submitter,
      );
    }
    return new FormData(form);
  }
}

/**
 * Wraps a value in a list when its name always submits one: a multi-select, a
 * multiple file input, or a name shared by more than one non-radio field. The shape
 * then follows the markup rather than how many options are chosen.
 */
function withListShape(pairs: FieldValues, fields: Iterable<Field>): FieldValues {
  const named = new Set<string>();
  const lists = new Set<string>();

  for (const field of fields) {
    if (!field.name || field.type === 'radio') {
      continue;
    }

    const multiple =
      field instanceof HTMLSelectElement
        ? field.multiple
        : field instanceof HTMLInputElement && field.type === 'file' && field.multiple;

    if (multiple || named.has(field.name)) {
      lists.add(field.name);
    }
    named.add(field.name);
  }

  for (const name of lists) {
    const value = pairs[name];
    if (value !== undefined && !Array.isArray(value)) {
      pairs[name] = [value];
    }
  }

  return pairs;
}

/**
 * Reads the value a field contributes to a submission, or `null` when it contributes
 * none. A field inside a disabled fieldset still reads `disabled` as false, so the
 * check is `:disabled`, which matches what the browser leaves out.
 */
function submittedValue(field: Field): FieldValue | null {
  if (!field.name || field.matches(':disabled')) {
    return null;
  }

  if (field instanceof HTMLInputElement) {
    if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) {
      return null;
    }
    if (field.type === 'file') {
      const files = Array.from(field.files ?? []);
      if (!files.length) {
        return null;
      }
      return field.multiple ? files : (files[0] ?? null);
    }
  }

  if (field instanceof HTMLSelectElement && field.multiple) {
    const values = Array.from(field.selectedOptions, (opt) => opt.value);
    return values.length ? values : null;
  }

  return field.value;
}

/** Sets `name` to `value`, collecting into a list when the name already has one. */
function appendValue(pairs: FieldValues, name: string, value: FieldValue) {
  const prev = pairs[name];
  pairs[name] = prev === undefined ? value : [prev, value].flat();
}
