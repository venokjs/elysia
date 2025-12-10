import type { ElysiaHttpAdapter } from "./http/adapter.js";

import { HttpConfig } from "@venok/http";

declare global {
  interface HttpAppOptions {
    listenCallback?: (server: Bun.Server<unknown>) => Promise<void>;
    callback: (app: HttpConfig<ElysiaHttpAdapter>) => void;
    adapter: ElysiaHttpAdapter;
  }
}

export { ElysiaHttpAdapter } from "./http/adapter.js";