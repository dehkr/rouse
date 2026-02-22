import type { CustomErrorStatus, RequestError, RequestResult } from '../types';

/**
 * Normalizes a fetch response (parses JSON/Text and flags HTTP errors).
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

    const text = await response.text();
    const contentType = response.headers.get('Content-Type') || '';

    if (contentType.includes('application/json') && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    data = null;
    error = { message: errorMessage, status: 'PARSE_ERROR' };
  }

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
