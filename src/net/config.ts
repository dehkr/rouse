import type { NetworkInterceptors } from '../types';

let globalBaseUrl = '';
let globalHeaders: HeadersInit = {};
let interceptors: NetworkInterceptors = {};

export function configureClient(config: {
  baseUrl?: string;
  headers?: HeadersInit;
  interceptors?: NetworkInterceptors;
}) {
  if (config.baseUrl) {
    globalBaseUrl = config.baseUrl.replace(/\/$/, '');
  }
  if (config.headers) {
    globalHeaders = { ...globalHeaders, ...config.headers };
  }
  if (config.interceptors) {
    interceptors = { ...interceptors, ...config.interceptors };
  }
}

export function getClientConfig() {
  return {
    baseUrl: globalBaseUrl,
    headers: globalHeaders,
    interceptors,
  };
}
