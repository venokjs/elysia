import type { ContextType } from "@venok/core";

import {
  ExecutionContextHost,
  VenokExceptionsHandler,
  VenokProxy
} from "@venok/core";

export class ElysiaHttpErrorProxy extends VenokProxy {
  protected handleError<T>(exceptionsHandler: VenokExceptionsHandler, args: any[], error: T, type?: ContextType): any[] {
    const host = new ExecutionContextHost([args]);
    host.setType(type as string);
    exceptionsHandler.next(error, host);
    return args;
  }
}