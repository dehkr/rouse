export interface RouseHeaders {
  redirect: string | null;
  target: string | null;
  trigger: string | null;
  pushUrl: string | null;
  replaceUrl: string | null;
}

/**
 * Extracts server-driven flow control headers from the normalized response headers.
 */
export function extractRouseHeaders(
  headers: Record<string, string> | null,
): RouseHeaders {
  return {
    redirect: headers?.['rouse-redirect'] || null,
    target: headers?.['rouse-target'] || null,
    trigger: headers?.['rouse-trigger'] || null,
    pushUrl: headers?.['rouse-push-url'] || null,
    replaceUrl: headers?.['rouse-replace-url'] || null,
  };
}
