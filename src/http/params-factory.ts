import type { VenokParamsFactoryInterface } from "@venok/core";
import type { Context as ElysiaHttpContext } from "elysia";

import { isUndefined } from "@venok/core";
import { ElysiaFile } from "elysia";
import { HttpParamtypes } from "@venok/http";

type IPHeaders =
  | "x-real-ip"
  | "x-client-ip"
  | "cf-connecting-ip"
  | "fastly-client-ip"
  | "x-cluster-client-ip"
  | "x-forwarded"
  | "forwarded-for"
  | "forwarded"
  | "appengine-user-ip"
  | "true-client-ip"
  | "cf-pseudo-ipv4"
  | (string & {});

const headersToCheck: IPHeaders[] = [
  "x-real-ip", // Nginx proxy/FastCGI
  "x-client-ip", // Apache https://httpd.apache.org/docs/2.4/mod/mod_remoteip.html#page-header
  "cf-connecting-ip", // Cloudflare
  "fastly-client-ip", // Fastly
  "x-cluster-client-ip", // GCP
  "x-forwarded", // General Forwarded
  "forwarded-for", // RFC 7239
  "forwarded", // RFC 7239
  "x-forwarded", // RFC 7239
  "appengine-user-ip", // GCP
  "true-client-ip", // Akamai and Cloudflare
  "cf-pseudo-ipv4", // Cloudflare
  "fly-client-ip", // Fly.io
];

export class ElysiaHttpParamsFactory implements VenokParamsFactoryInterface<HttpParamtypes> {
  public exchangeKeyForValue(
    key: HttpParamtypes | string,
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    data: string | object | any,
    args: [[ElysiaHttpContext]]
  ): any {
    const [ctx] = args[0];

    switch (key) {
      case HttpParamtypes.CONTEXT: return args[0];
      // @ts-expect-error Mismatch types
      case HttpParamtypes.BODY: return data && ctx.body ? ctx.body[data as string] : ctx.body;
      case HttpParamtypes.QUERY: return data ? ctx.query[data] : ctx.query;
      case HttpParamtypes.PARAM: return data ? ctx.params[data] : ctx.params;
      case HttpParamtypes.HEADERS: return data ? ctx.headers[data.toLowerCase()] : ctx.headers;
      case HttpParamtypes.HOST: {
        const hosts = (ctx as any).hosts || {};
        return data ? hosts[data] : hosts;
      }

      // @ts-expect-error Mismatch types
      case HttpParamtypes.FILE: return ctx.body && ctx.body[data] || null;
      // @ts-expect-error Mismatch types
      case HttpParamtypes.FILES: return ctx.body && ctx.body[data] || null;

      case HttpParamtypes.MULTIPLE_FILES: {
        if (!ctx.body) return null;

        if (!isUndefined(data) && Array.isArray(data) && data.length) {
          return Object
            .entries(ctx.body)
            .map(([k, v]) => {
              if ((data as { field: string }[]).some(({ field }) => field === k)) {
                if (Array.isArray(v) && v.length && v[0] instanceof ElysiaFile) return v;
                if (v instanceof ElysiaFile) return v;
              }
            })
            .filter(Boolean);
        }

        return Object
          .entries(ctx.body)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .map(([_, v]) => {
            if (Array.isArray(v) && v.length && v[0] instanceof ElysiaFile) return v;
            if (v instanceof ElysiaFile) return v;
          })
          .filter(Boolean);
      }

      case HttpParamtypes.IP: {
        const headers = ctx.request.headers;

        let clientIP: string | undefined | null = null;
        for (const header of headersToCheck) {
          clientIP = headers.get(header);
          if (clientIP) break;
        }

        if (clientIP) return clientIP;
        return null;
      }

      default: return null as any;
    }
  }
}