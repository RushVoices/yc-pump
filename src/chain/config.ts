// Site configuration. The site is LIVE when its API answers (it was deployed
// with the server code, e.g. on Vercel); a static copy with no API runs as a
// self-contained demo. VITE_DEMO=1 forces the demo.
export const env = {
  cluster: "mainnet-beta" as "devnet" | "mainnet-beta",
  /** Browser RPC: VITE_RPC_URL if set, else the site's own /api/rpc proxy. */
  rpcUrl: import.meta.env.VITE_RPC_URL || "",
  treasury: import.meta.env.VITE_TREASURY || "",
};

let live = false;
export const isLive = () => live;

/** Asks the API what it is. Call once before rendering. */
export async function initMode(): Promise<void> {
  if (import.meta.env.VITE_DEMO === "1") return;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) return;
    const cfg = (await res.json()) as { cluster?: string; treasury?: string };
    if (!cfg || typeof cfg !== "object" || !("deal" in cfg)) return;
    live = true;
    if (cfg.cluster === "devnet") env.cluster = "devnet";
    if (cfg.treasury && !env.treasury) env.treasury = cfg.treasury;
    if (!env.rpcUrl) env.rpcUrl = `${location.origin}/api/rpc`;
  } catch { /* static hosting: demo */ }
}

const q = () => (env.cluster === "devnet" ? "?cluster=devnet" : "");
export const explorerTx = (sig: string) => `https://solscan.io/tx/${sig}${q()}`;
export const explorerAddr = (a: string) => `https://solscan.io/account/${a}${q()}`;
export const pumpUrl = (mint: string) => `https://pump.fun/coin/${mint}`;
