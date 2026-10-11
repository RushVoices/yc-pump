// Cached site data: applications, config and live market numbers.
import { Connection } from "@solana/web3.js";
import type { Application } from "../shared/app";
import { backend, isBacked, type SiteConfig } from "./data";
import { env, isLive } from "./chain/config";
import { fetchMarkets, type Market } from "./chain/pump";
import { walletKey } from "./chain/wallet";

/** Set by initState() once the mode is known. ES module bindings update for every importer. */
export let conn: Connection | null = null;
export function initState() {
  // No websocket: confirmations are polled (see wallet.ts), so a plain HTTP proxy is enough.
  if (isLive()) conn = new Connection(env.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: false });
}

export const state = {
  apps: [] as Application[],
  config: null as SiteConfig | null,
  markets: new Map<string, Market>(),
  loaded: false,
};

export async function loadAll(): Promise<void> {
  const [apps, config] = await Promise.all([backend.list(), state.config ? Promise.resolve(state.config) : backend.config()]);
  state.apps = apps;
  state.config = config;
  state.loaded = true;
  if (conn && apps.length) {
    try { state.markets = await fetchMarkets(conn, apps.map((a) => a.mint)); } catch { /* keep last */ }
  }
}

/** Replaces one application in the cache after an action. */
export function upsert(a: Application) {
  const i = state.apps.findIndex((x) => x.mint === a.mint);
  if (i >= 0) state.apps[i] = a; else state.apps.unshift(a);
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Live market data, or stable made-up numbers in demo mode. */
export function market(a: Application): Market | null {
  if (conn) return state.markets.get(a.mint) ?? null;
  const r = hash(a.mint);
  const boost = isBacked(a.status) ? 2.4 : a.status === "rejected" ? 0.6 : 1;
  const mcapSol = 28 + r * 140 * boost;
  return { mcapSol, progress: Math.min(1, (mcapSol - 28) / 390), graduated: mcapSol > 418 };
}

export function isAdmin(): boolean {
  if (!isLive()) return true; // demo: everyone can try the review desk
  const me = walletKey();
  return !!me && !!state.config?.admins.includes(me);
}
