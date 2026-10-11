// Vercel function: /api/applications (see server/core.ts)
import { handle } from "../server/http.js";

export const GET = (req: Request) => handle("applications", req);
export const POST = (req: Request) => handle("applications", req);
