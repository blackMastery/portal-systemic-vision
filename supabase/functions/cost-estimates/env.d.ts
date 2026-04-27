/** Minimal typings for Supabase Edge (Deno) — runtime provides full API */
declare const Deno: {
  serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  env: {
    get(key: string): string | undefined;
  };
};
