/**
 * Values that can be bound to the DOM.
 */
export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean> // For class bindings
  | Record<string, string>; // For style bindings

/**
 * Callback signature for the global event bus.
 */
export type BusCallback<T = any> = (data?: T) => void;

/**
 * The object returned by a setup function.
 * Includes standard lifecycle hooks and any custom state/methods.
 */
export type RouseController = Record<string, any> & {
  connect?: () => void;
  disconnect?: () => void;
};

export interface RequestResult<T = any> {
  data: T | null;
  error: { message: string; status: number | string } | null;
  response: Response | null;
}

export interface RouseReqOpts extends RequestInit {
  serializeForm?: HTMLFormElement;
  onUploadProgress?: (ev: ProgressEvent) => void;
  retry?: number;
  timeout?: number;
  abortKey?: string | symbol;
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
 * Can be synchronous or asynchronous for dependency loading.
 */
export type SetupFn<P extends Record<string, any> = Record<string, any>> = (
  ctx: SetupContext<P>,
) => RouseController;
