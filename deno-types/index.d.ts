// Deno types for Supabase edge functions
/// <reference lib="deno.ns" />

declare namespace Deno {
  export namespace env {
    export function get(key: string): string | undefined;
  }
}

export {};