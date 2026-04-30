import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'validate' as const satisfies DirectiveSlug;

export const rzValidate = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<ValidateConfig | null>;

// =======================================================================================

export interface ValidateConfig {
  field: string;
  errorClass: string | null;
  errorStyle: string | null;
}

const KEYS = {
  FIELD: 'field',
  ERROR_CLASS: 'error-class',
  ERROR_STYLE: 'error-style',
} as const;

const VALID_KEYS = Object.values(KEYS);
const configCache = new WeakMap<Element, ValidateConfig | null>();

/**
 * Parses `rz-validate="field: email, class: text-red, style: 'border: 1px solid red'"`
 * Value without a key is assumed to be the field name/id: `rz-validate="email"`
 */
function getConfig(el: Element): ValidateConfig | null {
  if (configCache.has(el)) {
    return configCache.get(el) || null;
  }

  const val = getDirectiveValue(el, SLUG)?.trim();
  
  if (!val) {
    configCache.set(el, null);
    return null;
  }

  const parsed = parseDirectiveValue(val);
  if (parsed.length === 0) {
    configCache.set(el, null);
    return null;
  }

  let field = '';
  let errorClass: string | null = null;
  let errorStyle: string | null = null;

  for (const [key, value] of parsed) {
    if (key === KEYS.ERROR_CLASS) {
      errorClass = value;
    } else if (key === KEYS.ERROR_STYLE) {
      errorStyle = value;
    } else if (key === KEYS.FIELD) {
      field = value;
    } else if (!field) {
      field = key;
    } else {
      warn(
        `Unknown key used for rz-validate: '${key}'. Allowed keys: '${VALID_KEYS.join("', '")}'.`,
      );
    }
  }

  // Cache result so subsequent calls during the lifecycle skip the loop
  const result = field ? { field, errorClass, errorStyle } : null;
  configCache.set(el, result);

  return result;
}
