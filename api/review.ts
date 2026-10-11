// Vercel function: /api/review (see server/core.ts)
import { handle } from "../server/http.js";

export const GET = (req: Request) => handle("review", req);
export const POST = (req: Request) => handle("review", req);
