// Two pass-through routes the browser needs but can't call directly:
//  - /api/rpc: Solana JSON-RPC, limited to the methods the site uses, so the
//    RPC key stays on the server and the endpoint can't be used for anything else.
//  - /api/pumpportal: PumpPortal's local-transaction API (pumpportal.fun), used
//    only when Pump's SDK can't build a launch/buy that simulates cleanly.
import { HttpError, rpcUrl } from "./chain.js";

const RPC_METHODS = new Set([
  "getAccountInfo", "getMultipleAccounts", "getBalance", "getLatestBlockhash", "isBlockhashValid",
  "getBlockHeight", "getSlot", "getBlockTime", "simulateTransaction", "sendTransaction",
  "getSignatureStatuses", "getTransaction", "getTokenAccountBalance", "getTokenSupply",
  "getMinimumBalanceForRentExemption", "getFeeForMessage", "getEpochInfo", "getVersion", "getGenesisHash",
]);

export async function rpcProxy(body: unknown): Promise<unknown> {
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 50) throw new HttpError(400, "Bad RPC request.");
  for (const c of calls) {
    const m = (c as { method?: string })?.method;
    if (!m || !RPC_METHODS.has(m)) throw new HttpError(403, `RPC method not allowed: ${m}`);
  }
  const res = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new HttpError(502, `RPC error (${res.status}).`); }
}

export async function pumpPortalProxy(body: Record<string, unknown>): Promise<ArrayBuffer> {
  if (!body || !["create", "buy"].includes(String(body.action))) throw new HttpError(400, "Only create and buy are supported.");
  const res = await fetch(process.env.PUMPPORTAL_URL || "https://pumpportal.fun/api/trade-local", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new HttpError(502, `PumpPortal couldn't build the transaction (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.arrayBuffer();
}
