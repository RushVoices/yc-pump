import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Serves /api/* from server/core.ts during `npm run dev`, so no Vercel CLI is needed locally. */
function devApi(): Plugin {
  return {
    name: "ycpump-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const m = req.url?.match(/^\/api\/([a-z]+)/);
        if (!m) return next();
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const request = new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers,
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
        });
        let response: Response;
        try {
          const { handle } = await server.ssrLoadModule("/server/http.ts");
          response = await handle(m[1], request);
        } catch (e) {
          console.error(e);
          response = Response.json({ error: (e as Error).message }, { status: 500 });
        }
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server code reads process.env; give it the same .env the browser gets.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [nodePolyfills({ include: ["buffer", "crypto", "stream", "util"] }), devApi()],
    build: { target: "es2020" },
  };
});
