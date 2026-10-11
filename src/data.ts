// One interface over the two backends: the real API (live mode) and a
// browser-only demo store (no RPC configured, starts empty), so every page works either way.
import { Keypair } from "@solana/web3.js";
import {
  type Application, type ApplicationInput, type SignedAction, type SignedRequest, type Status,
  DEAL, avgScore, batchFor, validate,
} from "../shared/app";
import { isLive } from "./chain/config";
import { walletKey } from "./chain/wallet";

export interface SiteConfig {
  admins: string[];
  persistent: boolean;
  chainChecks: boolean;
  deal: typeof DEAL;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}
const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// ---- demo store ---------------------------------------------------------------

// v2: the demo now starts empty (v1 held sample projects).
const KEY = "ycpump-demo-v2";
const DEMO_ME = "DemoFounder1111111111111111111111111111111";

function load(): Application[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Application[];
  } catch { /* start empty */ }
  return [];
}
function save(list: Application[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* demo only */ }
}

const demo = {
  async config(): Promise<SiteConfig> {
    return { admins: [walletKey() ?? DEMO_ME], persistent: false, chainChecks: false, deal: DEAL };
  },
  async list() { return load().sort((a, b) => b.createdAt - a.createdAt); },
  async get(mint: string) { return load().find((a) => a.mint === mint) ?? null; },
  async submit(req: SignedRequest) {
    const input = (req.payload as { body: ApplicationInput }).body;
    const problems = validate(input);
    if (problems.length) throw new Error(problems.map((p) => p.message).join(" "));
    const list = load();
    if (list.some((a) => a.mint === input.mint)) throw new Error("This coin already has an application.");
    const now = Date.now();
    const app: Application = {
      ...input, status: "submitted", batch: batchFor(now), createdAt: now, signature: req.signature,
      verified: false, funding_txs: [], updates: [], history: [{ at: now, status: "submitted", by: input.founder }],
    };
    list.push(app);
    save(list);
    return app;
  },
  async review(req: SignedRequest) {
    const list = load();
    const p = req.payload;
    const app = list.find((a) => a.mint === p.mint);
    if (!app) throw new Error("No application for that coin.");
    const now = Date.now();
    if (p.action === "update") {
      app.updates.unshift({ text: p.body.text, link: p.body.link, at: now });
    } else if (p.action === "status") {
      const s = p.body.scores;
      if ((p.body.status === "approved" || p.body.status === "rejected")) {
        if (!s || Object.values(s).some((v) => !(v >= 1 && v <= 5))) throw new Error("Score all five areas 1–5 before deciding.");
        if (p.body.status === "approved" && avgScore(s) < DEAL.approveThreshold) throw new Error(`Approval needs an average score of ${DEAL.approveThreshold} or more.`);
        if ((p.body.notes ?? "").trim().length < 20) throw new Error("Write at least a sentence of public notes explaining the decision.");
        app.review = { scores: s, notes: p.body.notes!.trim(), reviewer: req.signer, at: now };
      }
      app.status = p.body.status;
      app.history.push({ at: now, status: p.body.status, by: req.signer });
    } else if (p.action === "fund") {
      app.funding_txs.push({ ...p.body, at: now });
      if (app.status !== "funded") { app.status = "funded"; app.history.push({ at: now, status: "funded", by: req.signer }); }
    }
    save(list);
    return app;
  },
  async upload(form: FormData) {
    const file = form.get("file") as File;
    const image = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Couldn't read the image."));
      r.readAsDataURL(file);
    });
    return { uri: "demo://metadata", image };
  },
  reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

// ---- public interface --------------------------------------------------------------

export const backend = {
  demoSigner: DEMO_ME,
  config: (): Promise<SiteConfig> => (isLive() ? api("config") : demo.config()),
  list: (): Promise<Application[]> => (isLive() ? api("applications") : demo.list()),
  get: (mint: string): Promise<Application | null> =>
    isLive() ? api<Application>(`application?mint=${encodeURIComponent(mint)}`).catch(() => null) : demo.get(mint),
  submit: (req: SignedRequest): Promise<Application> => (isLive() ? post("applications", req) : demo.submit(req)),
  review: (req: SignedRequest): Promise<Application> => (isLive() ? post("review", req) : demo.review(req)),
  upload: (form: FormData): Promise<{ uri: string; image: string }> =>
    isLive() ? api("upload", { method: "POST", body: form }) : demo.upload(form),
  resetDemo: demo.reset,
};

/** In demo mode actions are "signed" by a placeholder so nobody needs a wallet to try the flow. */
export function demoSign(action: SignedAction): SignedRequest {
  return { payload: action, signer: walletKey() ?? DEMO_ME, ts: Date.now(), signature: "demo" };
}

export const fakeMint = () => Keypair.generate().publicKey.toBase58();
export const fakeSig = () => Keypair.generate().publicKey.toBase58() + Keypair.generate().publicKey.toBase58().slice(0, 44);

export const STATUS_LABEL: Record<Status, string> = {
  submitted: "Applied",
  reviewing: "In review",
  approved: "Backed",
  funded: "Backed + funded",
  rejected: "Not selected",
};
export const isBacked = (s: Status) => s === "approved" || s === "funded";
