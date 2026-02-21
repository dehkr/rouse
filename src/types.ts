export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean> // For class bindings
  | Record<string, string>; // For style bindings

/** Callback signature for the global event bus */
export type BusCallback<T = any> = (data?: T) => void;

/**
 * The object returned by a setup function.
 * Includes standard lifecycle hooks and any custom state/methods.
 */
export type RouseController = Record<string, any> & {
  connect?: () => void;
  disconnect?: () => void;
};

/** Custom error statuses for non-HTTP failures */
export type CustomErrorStatus =
  | 'CANCELED' // User or AbortController canceled the request
  | 'TIMEOUT' // Request exceeded timeout threshold
  | 'NETWORK_ERROR' // Fetch failed (offline, DNS, CORS, etc.)
  | 'PARSE_ERROR' // Response body couldn't be parsed
  | 'INTERNAL_ERROR'; // Unexpected error in request engine

/** HTTP status codes (2xx-5xx) or custom error status */
export type ErrorStatus = CustomErrorStatus | number;

/** Normalized error object */
export interface RequestError {
  message: string;
  status: ErrorStatus;
  original?: any;
}

export interface RequestResult<T = any> {
  data: T | null;
  error: RequestError | null;
  response: Response | null;
}

/** Check if error is a custom status (not HTTP) */
export function isCustomError(
  error: RequestError,
): error is RequestError & { status: CustomErrorStatus } {
  return typeof error.status === 'string';
}

/** Check if error is an HTTP status code */
export function isHttpError(
  error: RequestError,
): error is RequestError & { status: number } {
  return typeof error.status === 'number';
}

/** Check for specific custom error */
export function isErrorStatus<T extends CustomErrorStatus>(
  error: RequestError,
  status: T,
): error is RequestError & { status: T } {
  return error.status === status;
}

/** Check if HTTP status is in range */
export function isHttpStatusInRange(
  error: RequestError,
  min: number,
  max: number,
): error is RequestError & { status: number } {
  return typeof error.status === 'number' && error.status >= min && error.status <= max;
}

export interface RouseReqOpts extends RequestInit {
  serializeForm?: HTMLFormElement;
  onUploadProgress?: (ev: ProgressEvent) => void;
  retry?: number;
  timeout?: number;
  abortKey?: string | symbol;
  skipInterceptors?: boolean;
  triggerEl?: HTMLElement;
}

export interface NetworkInterceptors {
  onRequest?: (config: RouseReqOpts) => RouseReqOpts | Promise<RouseReqOpts>;
  onResponse?: (
    data: any,
    config: RouseReqOpts,
  ) => any | Promise<any>;
  onError?: (error: any, config: RouseReqOpts) => void;
}

/**
 * The context object passed into every controller setup function.
 * @template P - The type of the props (rz-props).
 */
export type SetupContext<P extends Record<string, any> = Record<string, any>> = {
  el: HTMLElement;
  props: P;
  dispatch: (name: string, detail?: any, options?: CustomEventInit) => CustomEvent;
  request: <T = any>(url: string, options?: RouseReqOpts) => Promise<RequestResult<T>>;
  load: (url: string) => Promise<void>;
  bus: {
    publish: (event: string, data?: any) => void;
    subscribe: (event: string, cb: BusCallback) => void;
    unsubscribe: (event: string, cb: BusCallback) => void;
  };
};

/**
 * The definition of a setup function.
 */
export type SetupFn<P extends Record<string, any> = Record<string, any>> = (
  ctx: SetupContext<P>,
) => RouseController;
