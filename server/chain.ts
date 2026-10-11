// On-chain and signature checks the API runs before it trusts anything.
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import { messageFor, type SignedRequest } from "../shared/app.js";

/** mainnet-beta unless CLUSTER=devnet. */
export const cluster = process.env.CLUSTER === "devnet" ? "devnet" : "mainnet-beta";
/** Your RPC (Helius, Triton, QuickNode…) via RPC_URL; the public endpoint otherwise (rate-limited). */
export const rpcUrl = process.env.RPC_URL || process.env.VITE_RPC_URL ||
  (cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com");
export const conn: Connection | null = new Connection(rpcUrl, "confirmed");

export const admins = new Set(
  (process.env.ADMIN_WALLETS || "").split(",").map((s) => s.trim()).filter(Boolean),
);

// Pump's bonding curve: 8-byte discriminator, five u64 reserves/supply,
// `complete` (bool) at 48, then `creator` (pubkey) at 49..81. Read directly
// because the Pump SDK's ESM build doesn't load in Node.
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const bondingCurvePda = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM_ID)[0];

const MAX_AGE_MS = 10 * 60 * 1000;

/** Throws unless `req.signature` is `req.signer`'s signature over the action, made in the last 10 minutes. */
export async function checkSignature(req: SignedRequest): Promise<void> {
  if (Math.abs(Date.now() - req.ts) > MAX_AGE_MS) throw new HttpError(400, "That signature has expired. Sign again.");
  const msg = await messageFor(req.payload, req.signer, req.ts);
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), bs58.decode(req.signature), new PublicKey(req.signer).toBytes());
  } catch { ok = false; }
  if (!ok) throw new HttpError(401, "The wallet signature doesn't match.");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Who created `mint` on Pump, read from its bonding curve. Retries briefly,
 * because a coin launched seconds ago may not be visible to every RPC node yet.
 */
export async function pumpCreator(mint: string): Promise<string | null> {
  if (!conn) return null;
  const pda = bondingCurvePda(new PublicKey(mint));
  for (let i = 0; i < 5; i++) {
    const info = await conn.getAccountInfo(pda);
    if (info) {
      if (!info.owner.equals(PUMP_PROGRAM_ID) || info.data.length < 81) return null;
      return new PublicKey(info.data.subarray(49, 81)).toBase58();
    }
    await sleep(1500);
  }
  return null;
}

/**
 * Confirms a funding transaction landed, succeeded, was signed by `payer`, and
 * touched `mustInclude` (the coin for a curve buy, the founder for a grant).
 */
export async function checkFundingTx(sig: string, payer: string, mustInclude: string): Promise<void> {
  if (!conn) return;
  let tx = null;
  for (let i = 0; i < 5 && !tx; i++) {
    tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) await sleep(1500);
  }
  if (!tx) throw new HttpError(400, "Couldn't find that transaction on chain.");
  if (tx.meta?.err) throw new HttpError(400, "That transaction failed on chain.");
  const msg = tx.transaction.message;
  const keys = msg.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  const signers = keys.slice(0, msg.header.numRequiredSignatures);
  if (!signers.includes(payer)) throw new HttpError(400, "That transaction wasn't signed by the reviewer's wallet.");
  if (!keys.includes(mustInclude)) throw new HttpError(400, "That transaction doesn't involve this project.");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
