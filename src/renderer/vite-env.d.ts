/// <reference types="vite/client" />

import type { MarHelperApi } from '../shared/models';

declare global {
  interface Window {
    marHelper: MarHelperApi;
  }
}

export {};
