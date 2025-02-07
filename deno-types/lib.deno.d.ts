/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  }

  export const env: Env;

  export interface ConnInfo {
    localAddr: string;
    remoteAddr: string;
  }

  export interface RequestEvent {
    request: Request;
    respondWith(response: Response | Promise<Response>): Promise<void>;
  }

  export interface ServeOptions {
    port?: number;
    hostname?: string;
    handler?: (request: Request, connInfo: ConnInfo) => Response | Promise<Response>;
    onError?: (error: unknown) => Response | Promise<Response>;
  }

  export function serve(
    handler: (request: Request, connInfo: ConnInfo) => Response | Promise<Response>,
    options?: ServeOptions,
  ): void;

  export function serve(options: ServeOptions): void;
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.7.1" {
  export interface SupabaseClient {
    storage: {
      from(bucket: string): {
        download(path: string): Promise<{ data: Blob; error: Error | null }>;
        upload(
          path: string,
          file: File | Blob,
          options?: {
            cacheControl?: string;
            upsert?: boolean;
            contentType?: string;
          },
        ): Promise<{ error: Error | null }>;
      };
    };
    functions: {
      invoke(
        functionName: string,
        options?: {
          body?: unknown;
          headers?: Record<string, string>;
        },
      ): Promise<{ data: unknown; error: Error | null }>;
    };
  }

  export function createClient(url: string, key: string): SupabaseClient;
}