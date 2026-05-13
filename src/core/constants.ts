export const STORE_PREFIX = '@';

/** List of valid HTML DOM insert methods. */
export const INSERT_METHODS = [
  'innerHTML',
  'outerHTML',
  'beforebegin',
  'afterbegin',
  'beforeend',
  'afterend',
  'delete',
] as const;

/** Represents a valid DOM insert method string. */
export type InsertMethod = (typeof INSERT_METHODS)[number];

/** Represents the parameters required to execute a DOM insertion. */
export interface InsertOperation {
  targets: Element[];
  strategy: InsertMethod;
}

/** Default insert strategy for DOM insertions when explicit value isn't provided. */
export const DEFAULT_INSERT_METHOD: InsertMethod = 'innerHTML';

/** Type guard to check if a given string is a valid {@link InsertMethod}. */
export function isInsertMethod(key: string): key is InsertMethod {
  return INSERT_METHODS.includes(key as InsertMethod);
}

/** List of valid standard HTTP methods. */
export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

/** Represents a valid HTTP method string. */
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Type guard to check if a given string is a valid {@link HttpMethod}. */
export function isHttpMethod(key: string | undefined): key is HttpMethod {
  return HTTP_METHODS.includes(key?.toUpperCase() as HttpMethod);
}

/** List of valid store patch methods. */
export const PATCH_ACTIONS = ['replace', 'merge'] as const;

/** Represents a valid store patch method string. */
export type PatchAction = (typeof PATCH_ACTIONS)[number];

/** Type guard to check if a given string is a valid {@link PatchAction}. */
export function isPatchAction(key: string | undefined): key is PatchAction {
  return PATCH_ACTIONS.includes(key?.toLowerCase() as PatchAction);
}
