import type { Context as ElysiaContext, ElysiaConfig, ErrorHandler } from "elysia";
import type { AdapterInstanceRouteMetadata } from "@venok/http";
import type { VenokParamsFactoryInterface } from "@venok/core";
import type { Serve } from "elysia/universal";

import { Elysia, ValidationError } from "elysia";
import {
  AbstractHttpAdapter,
  BadRequestException,
  HttpException,
  HttpMethod,
  InternalServerErrorException,
  NotFoundException,
  UnsupportedMediaTypeException,
  VENOK_ADAPTER_RESPONSE,
  VENOK_ADAPTER_TRANSFORM_NATIVE_ARGS_TO_CONTEXT,
  VENOK_APPLY_ROUTES_TO_INSTANCE
} from "@venok/http";

import { ElysiaHttpParamsFactory } from "./params-factory.js";
import { ElysiaHttpErrorProxy } from "./proxy.js";

const paramsFactory = new ElysiaHttpParamsFactory();

class InternalElysiaHttpAdapter<Instance extends Elysia, Context extends [ElysiaContext]> extends AbstractHttpAdapter<Instance, Context> {
  private readonly adapterOptions: ElysiaConfig<"">;

  private getElysiaContext(ctx: Context): ElysiaContext { return ctx[0]; }

  constructor(options: ElysiaConfig<"">, instance?: Elysia) {
    const server = instance ? instance : new Elysia(options);

    // @ts-expect-error Mismatch Elysia type with Elysia type...
    super(server);

    this.adapterOptions = options;
  }

  [VENOK_ADAPTER_TRANSFORM_NATIVE_ARGS_TO_CONTEXT](...args: Context) {
    return [args[0]] as Context;
  }

  [VENOK_APPLY_ROUTES_TO_INSTANCE](routes: Map<string, AdapterInstanceRouteMetadata>) {
    // @ts-expect-error Mismatch types with VENOK_ADAPTER_RESPONSE
    this.instance.onAfterHandle((ctx) => ctx[VENOK_ADAPTER_RESPONSE]);

    for (const [path, metadata] of routes.entries()) {
      if (metadata.method === HttpMethod.SEARCH) {
        throw new Error("Elysia adapter don't support search method.");
      }

      let method:
        | "get"
        | "post"
        | "put"
        | "patch"
        | "delete"
        | "head"
        | "options"
        | "all";

      switch (metadata.method) {
        case HttpMethod.GET: method = "get"; break;
        case HttpMethod.POST: method = "post"; break;
        case HttpMethod.PUT: method = "put"; break;
        case HttpMethod.PATCH: method = "patch"; break;
        case HttpMethod.DELETE: method = "delete"; break;
        case HttpMethod.HEAD: method = "head"; break;
        case HttpMethod.OPTIONS: method = "options"; break;
        case HttpMethod.ALL: method = "all"; break;
      }

      // @ts-expect-error Mismatch types
      this.instance[method](path, metadata.handler);
    }
  }

  public addAdditionalProp(context: Context, key: string, value: any): void {
    const ctx = this.getElysiaContext(context);
    // @ts-expect-error Mismatch types
    ctx[key] = value;
  }

  public async close(): Promise<void> {
    await this.instance.stop(true);
  }

  public getParamsFactory(): VenokParamsFactoryInterface {
    return paramsFactory;
  }

  public getRequestHeaders(context: Context): Record<string, string> {
    const ctx = this.getElysiaContext(context);

    return ctx.headers as Record<string, string>;
  }

  public getRequestHostname(context: Context): string {
    const ctx = this.getElysiaContext(context);

    return ctx.request.headers.get("host") || "";
  }

  public getRequestMethod(context: Context): HttpMethod {
    const ctx = this.getElysiaContext(context);

    switch (ctx.request.method.toLowerCase()) {
      case "get": return HttpMethod.GET;
      case "post": return HttpMethod.POST;
      case "put": return HttpMethod.PUT;
      case "delete": return HttpMethod.DELETE;
      case "patch": return HttpMethod.PATCH;
      case "options": return HttpMethod.OPTIONS;
      case "head": return HttpMethod.HEAD;
      case "search": return HttpMethod.SEARCH;

      default:
        throw new InternalServerErrorException(`Unsupported HTTP method: ${ctx.request.method}`);
    }
  }

  public getRequestUrl(context: Context): string {
    const ctx = this.getElysiaContext(context);

    return ctx.request.url;
  }

  public getStatusByMethod(requestMethod: HttpMethod): number {
    switch (requestMethod) {
      case HttpMethod.GET:
      case HttpMethod.PUT:
      case HttpMethod.PATCH:
      case HttpMethod.HEAD:
      case HttpMethod.OPTIONS:
      case HttpMethod.SEARCH:
        return 200;

      case HttpMethod.POST: return 201;
      case HttpMethod.DELETE: return 204;
      default: return 200;
    }
  }

  public isResponseHandled(context: Context): boolean {
    const ctx = this.getElysiaContext(context);

    return VENOK_ADAPTER_RESPONSE in ctx;
  }

  public async listen(port: number, hostname: string, callback: (...args: any[]) => Promise<void>): Promise<void> {
    const serverOptions = this.adapterOptions.serve || {};
    const options = { ...serverOptions, port, hostname } as Partial<Serve>;

    // eslint-disable-next-line
    await this.instance.listen(options, async (server) => await callback(server));
  }

  public registerExceptionHandler(): void {
    const callback = (ctx: Parameters<ErrorHandler>[0]) => {
      const error = ctx.error;
      if (error instanceof HttpException) throw error;

      switch (ctx.code) {
        case "VALIDATION": {
          const validationError = error as ValidationError;
          const message =
            validationError.all?.map((e) => `${e.summary}`).join(", ") ||
            validationError.message ||
            "Validation failed";

          throw new BadRequestException(message);
        }

        case "INVALID_COOKIE_SIGNATURE": throw new BadRequestException("Invalid cookie signature");
        case "NOT_FOUND": throw new NotFoundException(`Cannot ${ctx.request.method} ${ctx.path}`);
        case "PARSE": throw new BadRequestException(error);

        case "INVALID_FILE_TYPE":
          throw new UnsupportedMediaTypeException(`Content-Type "${ctx.request.headers.get("content-type")}" not supported`);

        case "INTERNAL_SERVER_ERROR":
        case "UNKNOWN":
        default: {
          throw new InternalServerErrorException(error);
        }
      }
    };

    const proxyFactory = new ElysiaHttpErrorProxy();
    const handler = this.createExceptionHandler(callback);

    const proxy = proxyFactory.createProxy(callback, handler, "http");

    this.instance.onError(async (ctx) => {
      await proxy(ctx);
      // @ts-expect-error Mismatch types with VENOK_ADAPTER_RESPONSE
      return ctx[VENOK_ADAPTER_RESPONSE];
    });
  }

  public registerNotFoundHandler(): void {}

  public setResponseHeader(context: Context, name: string, value: string): void {
    const ctx = this.getElysiaContext(context);

    ctx.set.headers[name] = value;
  }

  public setResponseRedirect(context: Context, statusCode: number, url: string): any {
    const ctx = this.getElysiaContext(context);

    // @ts-expect-error Mismatch types with VENOK_ADAPTER_RESPONSE
    ctx[VENOK_ADAPTER_RESPONSE] = ctx.redirect(url, statusCode);
  }

  public setResponseReply(context: Context, result: any, statusCode: number | undefined): any {
    const ctx = this.getElysiaContext(context);

    // @ts-expect-error Mismatch types with VENOK_ADAPTER_RESPONSE
    ctx[VENOK_ADAPTER_RESPONSE] = result;
    ctx.set.status = statusCode;
  }

  public setResponseStatus(context: Context, statusCode: number): any {
    const ctx = this.getElysiaContext(context);

    ctx.set.status = statusCode;
  }
}

export class ElysiaHttpAdapter extends InternalElysiaHttpAdapter<Elysia, [ElysiaContext]> {}