// Deno type definitions for Supabase edge functions
/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />

declare global {
  namespace Deno {
    export namespace env {
      export function get(key: string): string | undefined;
    }
  }
}

export {};