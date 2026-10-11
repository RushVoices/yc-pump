// Every API route, independent of the host. `api/*.ts` adapts these to
// Vercel; vite.config.ts adapts them to the dev server.
import {
  type Application, type SignedRequest, type Status, DEAL, avgScore, batchFor, validate,
} from "../shared/app.js";
import { getApp, listApps, persistent, putApp } from "./db.js";
import { HttpError, admins, checkFundingTx, checkSignature, cluster, conn, pumpCreator } from "./chain.js";
import { pumpPortalProxy, rpcProxy } from "./proxy.js";
import { pinMetadata } from "./ipfs.js";

export interface Reply {
  status: number;
  body: unknown;
  /** Binary response (sent as application/octet-stream instead of JSON). */
  raw?: ArrayBuffer;
}

const ok = (body: unknown): Reply => ({ status: 200, body });

/** Fields a reviewer may move an application between. `funded` is reached only by recording a funding tx. */
const REVIEW_MOVES: Record<Status, Status[]> = {
  submitted: ["reviewing", "approved", "rejected"],
  reviewing: ["approved", "rejected", "submitted"],
  approved: ["rejected", "reviewing"],
  funded: [],
  rejected: ["reviewing"],
};

/** Strips nothing today; one place to hide fields if the record grows private ones. */
const publicView = (a: Application) => a;

export async function route(name: string, method: string, query: URLSearchParams, body: unknown): Promise<Reply> {
  try {
    switch (`${method} ${name}`) {
      case "GET config":
        return ok({ admins: [...admins], persistent, chainChecks: !!conn, deal: DEAL, cluster, treasury: process.env.TREASURY || process.env.VITE_TREASURY || "" });
      case "POST rpc":
        return ok(await rpcProxy(body));
      case "POST pumpportal":
        return { status: 200, body: null, raw: await pumpPortalProxy(body as Record<string, unknown>) };
      case "GET applications":
        return ok((await listApps()).map(publicView));
      case "GET application": {
        const a = await getApp(query.get("mint") ?? "");
        if (!a) throw new HttpError(404, "No application for that coin.");
        return ok(publicView(a));
      }
      case "GET verify":
        return ok(await verify(query.get("mint") ?? ""));
      case "POST applications":
        return ok(await submit(body as SignedRequest));
      case "POST review":
        return ok(await review(body as SignedRequest));
      case "POST upload":
        return ok(await pinMetadata(body as FormData));
      default:
        return { status: 404, body: { error: "Not found" } };
    }
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: (e as Error).message || "Server error" } };
  }
}

/** Public trust check: anyone (a wallet, a bot, another site) can ask whether a coin is YC Pump backed. */
async function verify(mint: string) {
  const a = await getApp(mint);
  if (!a) return { mint, backed: false, status: null };
  const backed = a.status === "approved" || a.status === "funded";
  return {
    mint,
    backed,
    status: a.status,
    batch: a.batch,
    name: a.coin.name,
    symbol: a.coin.symbol,
    founder: a.founder,
    fundedSol: a.funding_txs.reduce((s, t) => s + t.sol, 0),
    score: a.review ? Number(avgScore(a.review.scores).toFixed(2)) : null,
  };
}

async function submit(req: SignedRequest): Promise<Application> {
  if (req?.payload?.action !== "apply") throw new HttpError(400, "Bad request.");
  const input = req.payload.body;
  if (input.mint !== req.payload.mint || input.founder !== req.signer) throw new HttpError(400, "The application must be signed by the founder wallet.");
  await checkSignature(req);

  const problems = validate(input);
  if (problems.length) throw new HttpError(400, problems.map((p) => p.message).join(" "));

  // Launching the coin is the application: only the wallet that created the
  // coin on Pump can apply with it.
  let verified = false;
  if (conn) {
    const creator = await pumpCreator(input.mint);
    if (!creator) throw new HttpError(400, "That coin isn't on Pump yet. Wait a few seconds and resubmit.");
    if (creator !== input.founder) throw new HttpError(403, "Only the wallet that launched this coin can apply with it.");
    verified = true;
  }

  const now = Date.now();
  const app: Application = {
    ...input,
    status: "submitted",
    batch: batchFor(now),
    createdAt: now,
    signature: req.signature,
    verified,
    funding_txs: [],
    updates: [],
    history: [{ at: now, status: "submitted", by: input.founder }],
  };
  if (!(await putApp(app, { create: true }))) throw new HttpError(409, "This coin already has an application.");
  return app;
}

async function review(req: SignedRequest): Promise<Application> {
  const p = req?.payload;
  if (!p || !["status", "fund", "update"].includes(p.action)) throw new HttpError(400, "Bad request.");
  await checkSignature(req);
  const app = await getApp(p.mint);
  if (!app) throw new HttpError(404, "No application for that coin.");
  const now = Date.now();

  if (p.action === "update") {
    if (req.signer !== app.founder) throw new HttpError(403, "Only the founder can post updates.");
    const text = String(p.body.text ?? "").trim();
    if (text.length < 10 || text.length > 1000) throw new HttpError(400, "Updates are 10–1000 characters.");
    const link = p.body.link?.trim();
    if (link && !/^https?:\/\//.test(link)) throw new HttpError(400, "Links must start with https://");
    if (app.updates.some((u) => now - u.at < 60_000)) throw new HttpError(429, "One update a minute.");
    app.updates.unshift({ text, link, at: now });
    await putApp(app);
    return app;
  }

  if (!admins.has(req.signer)) throw new HttpError(403, "That wallet isn't a YC Pump reviewer.");

  if (p.action === "status") {
    const next = p.body.status;
    if (!REVIEW_MOVES[app.status].includes(next)) throw new HttpError(400, `Can't move from ${app.status} to ${next}.`);
    if (next === "approved" || next === "rejected") {
      const s = p.body.scores;
      if (!s || Object.values(s).some((v) => !(v >= 1 && v <= 5))) throw new HttpError(400, "Score all five areas 1–5 before deciding.");
      if (next === "approved" && avgScore(s) < DEAL.approveThreshold) throw new HttpError(400, `Approval needs an average score of ${DEAL.approveThreshold} or more.`);
      const notes = String(p.body.notes ?? "").trim();
      if (notes.length < 20) throw new HttpError(400, "Write at least a sentence of public notes explaining the decision.");
      app.review = { scores: s, notes: notes.slice(0, 2000), reviewer: req.signer, at: now };
    }
    app.status = next;
    app.history.push({ at: now, status: next, by: req.signer });
    await putApp(app);
    return app;
  }

  if (p.action !== "fund") throw new HttpError(400, "Bad request.");
  if (app.status !== "approved" && app.status !== "funded") throw new HttpError(400, "Approve the application before funding it.");
  const { kind, sol, sig, note } = p.body;
  if (!(sol > 0 && sol <= 1000)) throw new HttpError(400, "Funding amount looks wrong.");
  if (app.funding_txs.some((t) => t.sig === sig)) throw new HttpError(409, "That transaction is already recorded.");
  await checkFundingTx(sig, req.signer, kind === "curve-buy" ? app.mint : app.founder);
  app.funding_txs.push({ kind, sol, sig, at: now, note: note?.slice(0, 200) });
  if (app.status !== "funded") {
    app.status = "funded";
    app.history.push({ at: now, status: "funded", by: req.signer });
  }
  await putApp(app);
  return app;
}
