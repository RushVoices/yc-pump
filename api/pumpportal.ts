// Vercel function: /api/pumpportal (see server/proxy.ts)
import { handle } from "../server/http.js";

export const POST = (req: Request) => handle("pumpportal", req);
