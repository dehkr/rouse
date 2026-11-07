import type {
  CustomErrorCode,
  ErrorCode,
  FetchRequest,
  RequestError,
  RouseResponse,
} from '../types';

/**
 * Normalizes a fetch response (parses JSON/Text/Blob and flags HTTP errors).
 */
export async function normalizeResponse(
  response: Response,
  config: FetchRequest,
): Promise<RouseResponse> {
  let data: any = null;
  let error: RequestError | null = null;

  const parsedHeaders = Object.fromEntries(response.headers.entries());

  try {
    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = response.headers.get('Content-Length');
    const isEmpty =
      response.status === 204 || response.status === 205 || contentLength === '0';

    if (!isEmpty) {
      // Bail on streams to avoid the request getting hung up forever
      if (contentType.includes('text/event-stream')) {
        void response.body?.cancel();
        error = {
          message: 'Cannot read an event stream as a response. Open it with rz-sse.',
          code: 'PARSE_ERROR',
        };
      } else if (isJsonType(contentType)) {
        const text = await response.text();
        // A malformed body throws a native SyntaxError, caught below as PARSE_ERROR
        if (text) {
          data = JSON.parse(text);
        }
      } else if (contentType.includes('text/') || contentType.includes('xml')) {
        data = await response.text();
      } else {
        data = await response.blob();
      }
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    data = null;
    error = { message: errorMessage, code: 'PARSE_ERROR' };
  }

  // HTTP errors (4xx/5xx) overwrite PARSE_ERRORs here,
  // because bad JSON is usually a symptom of a server crash.
  if (!response.ok) {
    error = {
      message: response.statusText || 'Request failed',
      code: response.status,
      body: data ?? undefined,
      parseError: error?.code === 'PARSE_ERROR' ? error.message : undefined,
    };
  }

  return {
    data,
    error,
    response,
    headers: parsedHeaders,
    status: response.status,
    config,
  };
}

/**
 * Maps a thrown value to a `RequestError`. `abortCode` comes from the caller's
 * signal state; without one, the failure is a `NETWORK_ERROR`.
 */
export function mapCatchError(
  error: unknown,
  abortCode: 'CANCELED' | 'TIMEOUT' | null = null,
): RequestError {
  const code: CustomErrorCode = abortCode ?? 'NETWORK_ERROR';

  const message =
    code === 'TIMEOUT'
      ? 'Request timed out'
      : code === 'CANCELED'
        ? 'Request canceled'
        : (error instanceof Error && error.message) || 'Network error';

  return { message, code, original: error };
}

/**
 * Builds a response that carries only `error`, for a request that doesn't receive
 * an HTTP response.
 */
export function errorResponse(config: FetchRequest, error: RequestError): RouseResponse {
  return {
    data: null,
    error,
    response: null,
    headers: null,
    status: null,
    config,
  };
}

/**
 * Helper to return a structured response for early bailouts.
 */
export function fallbackResponse(
  config: FetchRequest,
  message: string,
  code: ErrorCode = 'CANCELED',
): RouseResponse {
  return errorResponse(config, { message, code });
}

export function isJsonType(val: string) {
  return val.includes('application/json') || val.includes('+json');
}

export function isFileType(data: unknown) {
  return data instanceof Blob || data instanceof ArrayBuffer;
}
