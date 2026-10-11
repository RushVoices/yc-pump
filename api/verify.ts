// Vercel function: /api/verify (see server/core.ts)
import { handle } from "../server/http.js";

export const GET = (req: Request) => handle("verify", req);
export const POST = (req: Request) => handle("verify", req);
