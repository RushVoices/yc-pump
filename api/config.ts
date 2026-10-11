// Vercel function: /api/config (see server/core.ts)
import { handle } from "../server/http.js";

export const GET = (req: Request) => handle("config", req);
export const POST = (req: Request) => handle("config", req);
