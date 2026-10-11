// Vercel function: /api/rpc (see server/proxy.ts)
import { handle } from "../server/http.js";

export const POST = (req: Request) => handle("rpc", req);
