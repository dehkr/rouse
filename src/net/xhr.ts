/**
 * XHR implementation for progress support.
 */
export function xhrRequest(
  url: string,
  method: string,
  headers: Headers,
  body: any,
  onProgress: (ev: ProgressEvent) => void,
  timeout: number,
  signal: AbortSignal | null,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);

    if (timeout > 0) {
      xhr.timeout = timeout;
    }

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    // Helper to prevent memory leaks
    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    headers.forEach((val, key) => {
      xhr.setRequestHeader(key, val);
    });

    if (xhr.upload) {
      xhr.upload.onprogress = onProgress;
    }

    xhr.onload = () => {
      cleanup();
      resolve(
        new Response(xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: new Headers({
            'Content-Type': xhr.getResponseHeader('Content-Type') || 'text/plain',
          }),
        }),
      );
    };

    xhr.onerror = () => {
      cleanup();
      reject(new TypeError('Network Error'));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new DOMException('Request timed out', 'AbortError'));
    };

    xhr.send(body);
  });
}
