// Injected-wallet support (Phantom, Solflare, Backpack all expose this shape).
import {
  Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { messageFor, type SignedAction, type SignedRequest } from "../../shared/app";

interface InjectedWallet {
  publicKey: PublicKey | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends VersionedTransaction>(tx: T): Promise<T>;
  signMessage(msg: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
}

declare global {
  interface Window {
    phantom?: { solana?: InjectedWallet };
    solflare?: InjectedWallet;
    backpack?: InjectedWallet;
    solana?: InjectedWallet;
  }
}

let wallet: InjectedWallet | null = null;
let pubkey: string | null = null;
const listeners = new Set<(k: string | null) => void>();

const provider = (): InjectedWallet | null =>
  window.phantom?.solana ?? window.solflare ?? window.backpack ?? window.solana ?? null;

export const hasWallet = () => !!provider();
export const walletKey = () => pubkey;
export const onWallet = (f: (k: string | null) => void) => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => listeners.forEach((f) => f(pubkey));

export async function connectWallet(silent = false): Promise<string> {
  const p = provider();
  if (!p) throw new Error("No Solana wallet found. Install Phantom, Solflare or Backpack.");
  const res = await p.connect(silent ? { onlyIfTrusted: true } : undefined);
  wallet = p;
  pubkey = new PublicKey((res?.publicKey ?? p.publicKey)!.toString()).toBase58();
  emit();
  return pubkey;
}

export async function disconnectWallet() {
  await wallet?.disconnect().catch(() => {});
  wallet = null;
  pubkey = null;
  emit();
}

export async function ensureWallet(): Promise<string> {
  return pubkey ?? connectWallet();
}

/** Has the wallet sign the human-readable message for `action` (see shared/app.ts). */
export async function signAction(action: SignedAction): Promise<SignedRequest> {
  const signer = await ensureWallet();
  const ts = Date.now();
  const msg = await messageFor(action, signer, ts);
  const out = await wallet!.signMessage(new TextEncoder().encode(msg), "utf8");
  const sig = out instanceof Uint8Array ? out : out.signature;
  return { payload: action, signer, ts, signature: bs58.encode(sig) };
}

// ---- transactions -------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Builds a v0 transaction paid by `payer`. */
export async function v0(conn: Connection, payer: string, ixs: TransactionInstruction[]): Promise<VersionedTransaction> {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: new PublicKey(payer), recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return new VersionedTransaction(msg);
}

/** Turns program logs into one readable sentence. */
function explain(err: unknown, logs: string[] | null | undefined): string {
  const all = (logs ?? []).join("\n");
  if (/insufficient lamports|insufficient funds|0x1\b/i.test(all) || JSON.stringify(err ?? "").includes("InsufficientFundsForRent"))
    return "Your wallet doesn't have enough SOL for this (network fees, rent and any buy).";
  if (/AccountNotFound/.test(JSON.stringify(err ?? ""))) return "Your wallet has no SOL on this network yet.";
  const line = [...(logs ?? [])].reverse().find((l) => /Error|failed|panicked/i.test(l));
  return line ? line.replace(/^Program log: /, "").slice(0, 220) : `Simulation failed: ${JSON.stringify(err)}`;
}

/**
 * Dry-runs `tx` against the chain without needing signatures. Throws a readable
 * error if it would fail, so the wallet is never asked to sign a dud.
 */
export async function simulate(conn: Connection, tx: VersionedTransaction): Promise<void> {
  const res = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  if (res.value.err) throw new Error(explain(res.value.err, res.value.logs));
}

/**
 * Wallet signs first (it may add its own safety instructions), then the extra
 * keypairs (e.g. the new mint) sign the final message. Sends, re-broadcasts
 * every 2 s, and polls until confirmed or the blockhash expires.
 */
export async function signSendConfirm(conn: Connection, tx: VersionedTransaction, extraSigners: Keypair[] = []): Promise<string> {
  await ensureWallet();
  const signed = await wallet!.signTransaction(tx);
  if (extraSigners.length) signed.sign(extraSigners);
  const raw = signed.serialize();
  const sig = bs58.encode(signed.signatures[0]);
  const blockhash = signed.message.recentBlockhash;
  await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
  let last = Date.now();
  for (;;) {
    await sleep(1200);
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error(`The transaction failed on chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    if (!(await conn.isBlockhashValid(blockhash, { commitment: "confirmed" })).value) {
      const again = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
      if (again && !again.err) return sig;
      throw new Error("The network didn't pick up the transaction in time. Nothing was charged; try again.");
    }
    if (Date.now() - last > 2000) { last = Date.now(); conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {}); }
  }
}
