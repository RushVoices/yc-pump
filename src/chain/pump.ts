// Every Pump call the site makes: launching a coin (= applying), the
// treasury's conviction buy, SOL grants, and reading live market data.
//
// Launches and buys are built with Pump's own SDK and dry-run against the
// chain before the wallet is asked to sign. If that dry run fails (for example
// Pump changed its program and the SDK hasn't caught up), the same action is
// built by PumpPortal (pumpportal.fun, via /api/pumpportal) and dry-run again.
// The wallet only ever signs a transaction that just simulated successfully.
import {
  ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  OnlinePumpSdk, PUMP_SDK, bondingCurveMarketCap, bondingCurvePda, getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";
import { signSendConfirm, simulate, v0 } from "./wallet";

const lamports = (sol: number) => new BN(Math.round(sol * LAMPORTS_PER_SOL).toString());
const priority = () => [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
];

/** Network + Pump creation fees + rent, with headroom. */
const LAUNCH_OVERHEAD_SOL = 0.03;

async function needBalance(conn: Connection, who: string, sol: number) {
  const have = (await conn.getBalance(new PublicKey(who), "confirmed")) / LAMPORTS_PER_SOL;
  if (have < sol) throw new Error(`Your wallet has ${have.toFixed(3)} SOL; this needs about ${sol.toFixed(3)} SOL. Add SOL and try again.`);
}

/** A ready-to-sign transaction from PumpPortal's local-transaction API. */
async function pumpPortal(body: Record<string, unknown>): Promise<VersionedTransaction> {
  const res = await fetch("/api/pumpportal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error || `PumpPortal returned ${res.status}`);
  }
  return VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
}

/** Tries the SDK build, falls back to PumpPortal; returns whichever simulated cleanly. */
async function buildChecked(conn: Connection, sdk: () => Promise<VersionedTransaction>, portal: () => Promise<VersionedTransaction>) {
  let sdkErr: unknown;
  try {
    const tx = await sdk();
    await simulate(conn, tx);
    return { tx, via: "pump-sdk" as const };
  } catch (e) {
    sdkErr = e;
    console.warn("Pump SDK build failed its dry run; trying PumpPortal.", e);
  }
  try {
    const tx = await portal();
    await simulate(conn, tx);
    return { tx, via: "pumpportal" as const };
  } catch (e) {
    console.warn("PumpPortal build failed too.", e);
    // The SDK error is usually the more specific one (e.g. not enough SOL).
    throw sdkErr instanceof Error ? sdkErr : e;
  }
}

export interface CoinParams {
  name: string;
  symbol: string;
  uri: string;
  devBuySol: number;
}

/**
 * Creates the coin on Pump.fun with `creator` as its creator, plus an optional
 * dev buy, in one transaction signed once by the founder's wallet.
 */
export async function launchCoin(conn: Connection, creator: string, p: CoinParams): Promise<{ mint: string; sig: string; via: string }> {
  await needBalance(conn, creator, p.devBuySol + LAUNCH_OVERHEAD_SOL);
  const mint = Keypair.generate();
  const me = new PublicKey(creator);

  const sdk = async () => {
    let ixs: TransactionInstruction[];
    if (p.devBuySol > 0) {
      const online = new OnlinePumpSdk(conn);
      const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig().catch(() => null)]);
      const quoteAmount = lamports(p.devBuySol);
      const amount = getBuyTokenAmountFromSolAmount({
        global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: NATIVE_MINT,
      });
      ixs = await PUMP_SDK.createV2AndBuyV2Instructions({
        global, mint: mint.publicKey, name: p.name, symbol: p.symbol, uri: p.uri,
        creator: me, user: me, amount, quoteAmount, mayhemMode: false, slippage: 3,
      });
    } else {
      ixs = [await PUMP_SDK.createV2Instruction({
        mint: mint.publicKey, name: p.name, symbol: p.symbol, uri: p.uri, creator: me, user: me, mayhemMode: false,
      })];
    }
    return v0(conn, creator, [...priority(), ...ixs]);
  };
  const portal = () => pumpPortal({
    publicKey: creator, action: "create", mint: mint.publicKey.toBase58(),
    tokenMetadata: { name: p.name, symbol: p.symbol, uri: p.uri },
    denominatedInSol: "true", amount: p.devBuySol, slippage: 10, priorityFee: 0.0005, pool: "pump",
  });

  const { tx, via } = await buildChecked(conn, sdk, portal);
  const sig = await signSendConfirm(conn, tx, [mint]);
  return { mint: mint.publicKey.toBase58(), sig, via };
}

/** The treasury's conviction buy: buys `sol` worth of the coin (bonding curve, or PumpSwap once graduated). */
export async function convictionBuy(conn: Connection, buyer: string, mintStr: string, sol: number): Promise<string> {
  await needBalance(conn, buyer, sol + 0.01);
  const mint = new PublicKey(mintStr);
  const user = new PublicKey(buyer);
  const sdk = async () => {
    const online = new OnlinePumpSdk(conn);
    const [global, feeConfig, state] = await Promise.all([
      online.fetchGlobal(),
      online.fetchFeeConfig().catch(() => null),
      online.fetchBuyState(mint, user, TOKEN_2022_PROGRAM_ID),
    ]);
    if (state.bondingCurve.complete) throw new Error("Graduated: buy on PumpSwap instead.");
    const quoteAmount = lamports(sol);
    const amount = getBuyTokenAmountFromSolAmount({
      global, feeConfig, mintSupply: state.bondingCurve.tokenTotalSupply, bondingCurve: state.bondingCurve,
      amount: quoteAmount, quoteMint: state.quoteMint,
    });
    const ixs = await PUMP_SDK.buyV2Instructions({
      global, bondingCurveAccountInfo: state.bondingCurveAccountInfo, bondingCurve: state.bondingCurve,
      associatedUserAccountInfo: state.associatedUserAccountInfo, mint, user, amount, quoteAmount,
      slippage: 3, tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: state.quoteTokenProgram,
    });
    return v0(conn, buyer, [...priority(), ...ixs]);
  };
  const portal = () => pumpPortal({
    publicKey: buyer, action: "buy", mint: mintStr, denominatedInSol: "true", amount: sol,
    slippage: 10, priorityFee: 0.0003, pool: "auto",
  });
  const { tx } = await buildChecked(conn, sdk, portal);
  return signSendConfirm(conn, tx);
}

/** A milestone grant: plain SOL from the reviewer's wallet to the founder. */
export async function sendGrant(conn: Connection, from: string, to: string, sol: number): Promise<string> {
  await needBalance(conn, from, sol + 0.001);
  const ix = SystemProgram.transfer({ fromPubkey: new PublicKey(from), toPubkey: new PublicKey(to), lamports: BigInt(lamports(sol).toString()) });
  const tx = await v0(conn, from, [ix]);
  await simulate(conn, tx);
  return signSendConfirm(conn, tx);
}

// ---- market data -----------------------------------------------------------------

export interface Market {
  mcapSol: number;
  progress: number; // 0..1 along the bonding curve
  graduated: boolean;
}

const INITIAL_REAL_TOKENS = 793_100_000_000_000n;

export async function fetchMarkets(conn: Connection, mints: string[]): Promise<Map<string, Market>> {
  const out = new Map<string, Market>();
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await conn.getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(new PublicKey(m))));
    infos.forEach((info, j) => {
      if (!info) return;
      const bc = PUMP_SDK.decodeBondingCurveNullable(info);
      if (!bc) return;
      const mcap = bondingCurveMarketCap({
        mintSupply: bc.tokenTotalSupply, virtualQuoteReserves: bc.virtualQuoteReserves, virtualTokenReserves: bc.virtualTokenReserves,
      });
      const left = BigInt(bc.realTokenReserves.toString());
      const progress = bc.complete ? 1 : Math.max(0, Math.min(1, 1 - Number(left) / Number(INITIAL_REAL_TOKENS)));
      out.set(chunk[j], { mcapSol: Number(mcap.toString()) / LAMPORTS_PER_SOL, progress, graduated: bc.complete });
    });
  }
  return out;
}

/** Share of total supply (0..1) the wallet holds. Used to show whether founders kept their dev-lock promise. */
export async function holdingShare(conn: Connection, owner: string, mint: string): Promise<number | null> {
  try {
    const m = new PublicKey(mint);
    const ata = getAssociatedTokenAddressSync(m, new PublicKey(owner), true, TOKEN_2022_PROGRAM_ID);
    const [bal, supply] = await Promise.all([
      conn.getTokenAccountBalance(ata).catch(() => null),
      conn.getTokenSupply(m),
    ]);
    if (!bal) return 0;
    return Number(bal.value.amount) / Number(supply.value.amount);
  } catch {
    return null;
  }
}
