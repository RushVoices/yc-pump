// Vercel function: /api/upload (see server/core.ts)
import { handle } from "../server/http.js";

export const GET = (req: Request) => handle("upload", req);
export const POST = (req: Request) => handle("upload", req);
