/**
 * Values that can be bound to the DOM via 'data-gn-bind'.
 */
export type BindableValue =
  | string
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
export type GilliganController = Record<string, any> & {
  connect?: () => void;
  disconnect?: () => void;
};

/**
 * The context object passed into every controller setup function.
 *
 * @template P - The type of the props (data-gn-props).
 */
export type SetupContext<P extends Record<string, any> = Record<string, any>> = {
  el: HTMLElement;
  refs: Record<string, HTMLElement>;
  props: P;
  dispatch: (name: string, detail?: any) => CustomEvent;
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
) => GilliganController | Promise<GilliganController>;

/**
 * Extended Event type for events handled by 'data-gn-on'.
 * The framework injects the specific element that triggered the listener.
 *
 * @template E - The type of the element (e.g. HTMLInputElement).
 * @template D - The type of event.detail (data payload).
 */
export interface GilliganEvent<E = HTMLElement, D = any> extends CustomEvent<D> {
  gnTarget: E;
}
