import type { CustomErrorStatus, RequestError, RequestResult } from '../types';

/**
 * Normalizes a fetch response (parses JSON/Text/Blob and flags HTTP errors).
 */
export async function normalizeResponse(response: Response): Promise<RequestResult> {
  let data: any = null;
  let error: RequestError | null = null;

  try {
    // Safety check to make sure the body hasn't been consumed
    if (response.bodyUsed) {
      return {
        data: null,
        error: { message: 'Stream already consumed', status: 'INTERNAL_ERROR' },
        response,
      };
    }

    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = response.headers.get('Content-Length');
    const isEmpty =
      response.status === 204 || response.status === 205 || contentLength === '0';

    if (!isEmpty) {
      if (contentType.includes('application/json')) {
        const text = await response.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            // Throw so the outer catch block flags it as a PARSE_ERROR
            throw new Error('Invalid JSON response');
          }
        }
      } else if (contentType.includes('text/')) {
        data = await response.text();
      } else {
        // Safe binary fallback for images, PDFs, etc.
        data = await response.blob();
      }
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    data = null;
    error = { message: errorMessage, status: 'PARSE_ERROR' };
  }

  // HTTP errors (4xx/5xx) overwrite PARSE_ERRORs here,
  // because bad JSON is usually a symptom of a server crash
  if (!response.ok) {
    error = {
      message: response.statusText || 'Request failed',
      status: response.status,
    };
  }

  return { data, error, response };
}

/**
 * Maps native DOM exceptions into standardized RequestError objects.
 */
export function mapCatchError(err: any, isMainAborted: boolean): RequestError {
  const isAbort = err.name === 'AbortError';

  // Distinguish between timeout and explicit cancel
  const status: CustomErrorStatus = isAbort
    ? isMainAborted
      ? 'CANCELED'
      : 'TIMEOUT'
    : 'NETWORK_ERROR';

  const message =
    status === 'TIMEOUT'
      ? 'Request timed out'
      : status === 'CANCELED'
        ? 'Request canceled'
        : err.message || 'Network Error';

  return { message, status, original: err };
}
