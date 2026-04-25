import { parseDirectiveValue } from '../core/parser';
import {
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
} from '../core/shared';
import type { Directive } from '../types';

export interface ValidateConfig {
  field: string;
  errorClass: string | null;
  errorStyle: string | null;
}

export const rzValidate = {
  existsOn: (el: Element) => hasDirective(el, 'validate'),
  getValue: (el: Element) => getDirectiveValue(el, 'validate'),
  getDefinedValue: (el: Element) => getDefinedDirectiveValue(el, 'validate'),
  getConfig,
} as const satisfies Directive;

/**
 * Parses `rz-validate="email, class: text-red, style: 'border: 1px solid red'"`
 */
function getConfig(el: Element): ValidateConfig | null {
  const val = getDefinedDirectiveValue(el, 'validate');
  if (!val) return null;

  const parsed = parseDirectiveValue(val);
  if (parsed.length === 0) return null;

  let field = '';
  let errorClass: string | null = null;
  let errorStyle: string | null = null;

  for (const [key, value] of parsed) {
    if (key === 'class') {
      errorClass = value;
    } else if (key === 'style') {
      errorStyle = value;
    } else if (!field) {
      field = key; // The first key without a match is the field name
    }
  }

  return field ? { field, errorClass, errorStyle } : null;
}
