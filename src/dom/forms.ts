/** A form control that carries a value of its own. */
export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** One value a field submits: text, or a file from a file input. */
export type FieldEntry = string | File;
/**
 * A field's submitted value. A multi-select, a multiple file input, or a name shared
 * by several fields, is a list.
 */
export type FieldValue = FieldEntry | FieldEntry[];

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
    if (value !== undefined && !Array.isArray(value)) {
      pairs[name] = [value];
    }
  }

  return pairs;
}

/**
 * Reads what a trigger submits on its own: a field's value, or a form's fields plus
 * its submitter's value. Returns `null` for any other element, and for a field that
 * submits nothing. A nameless field is silent, since a field bound through
 * `rz-model` often has no name.
 */
export function readTriggerValues(
  el: Element,
  submitter: HTMLElement | null = null,
): Record<string, FieldValue> | null {
  if (isField(el)) {
    const value = readField(el);
    return value === null ? null : { [el.name]: value };
  }

  return isFieldContainer(el)
    ? { ...collectFields([el]), ...readSubmitter(submitter) }
    : null;
}

/** Reads the name and value a form's submitter adds to the submission. */
function readSubmitter(submitter: HTMLElement | null): Record<string, string> {
  const isButton =
    submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement;
  return isButton && submitter.name ? { [submitter.name]: submitter.value } : {};
}

/**
 * Reads the value a field contributes to a submission, or `null` when it contributes
 * none. A field inside a disabled fieldset still reads `disabled` as false, so the
 * check is `:disabled`, which matches what the browser leaves out.
 */
function submittedValue(field: Field): FieldValue | null {
  if (!field.name || field.matches(':disabled')) return null;

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
function appendValue(pairs: Record<string, FieldValue>, name: string, value: FieldValue) {
  const prev = pairs[name];
  pairs[name] = prev === undefined ? value : [prev, value].flat();
}
