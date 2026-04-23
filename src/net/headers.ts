export interface RouseHeaders {
  redirect: string | null;
  target: string | null;
  trigger: string | null;
}

/**
 * Extracts Server-Driven Flow Control headers from the normalized response headers.
 */
export function extractRouseHeaders(
  headers: Record<string, string> | null,
): RouseHeaders {
  return {
    redirect: headers?.['rouse-redirect'] || null,
    target: headers?.['rouse-target'] || null,
    trigger: headers?.['rouse-trigger'] || null,
  };
}
