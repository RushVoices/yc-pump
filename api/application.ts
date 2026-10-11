// Vercel function: /api/application (see server/core.ts)
import { handle } from "../server/http.js";

export const GET = (req: Request) => handle("application", req);
export const POST = (req: Request) => handle("application", req);
