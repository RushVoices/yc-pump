// Application storage. Uses Upstash Redis (REST) when UPSTASH_REDIS_REST_URL
// and UPSTASH_REDIS_REST_TOKEN are set — Vercel's KV integration provides
// exactly these as KV_REST_API_URL / KV_REST_API_TOKEN, which also work.
// Without them it keeps everything in memory, which is fine for `npm run dev`
// but is wiped whenever a serverless instance restarts.
import type { Application } from "../shared/app.js";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = (mint: string) => `ycp:app:${mint}`;
const INDEX = "ycp:apps";

export const persistent = !!(url && token);

async function redis<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(url!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Storage error: ${body.error ?? res.status}`);
  return body.result as T;
}

const memory = new Map<string, Application>();

export async function getApp(mint: string): Promise<Application | null> {
  if (!persistent) return memory.get(mint) ?? null;
  const raw = await redis<string | null>("GET", KEY(mint));
  return raw ? (JSON.parse(raw) as Application) : null;
}

export async function putApp(a: Application, opts: { create?: boolean } = {}): Promise<boolean> {
  if (!persistent) {
    if (opts.create && memory.has(a.mint)) return false;
    memory.set(a.mint, a);
    return true;
  }
  const args: (string | number)[] = ["SET", KEY(a.mint), JSON.stringify(a)];
  if (opts.create) args.push("NX");
  const ok = await redis<string | null>(...args);
  if (!ok) return false;
  if (opts.create) await redis("ZADD", INDEX, a.createdAt, a.mint);
  return true;
}

export async function listApps(): Promise<Application[]> {
  if (!persistent) return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
  const mints = await redis<string[]>("ZRANGE", INDEX, 0, 499, "REV");
  if (!mints.length) return [];
  const raws = await redis<(string | null)[]>("MGET", ...mints.map(KEY));
  return raws.filter((r): r is string => !!r).map((r) => JSON.parse(r) as Application);
}
