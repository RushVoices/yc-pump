// The application record, its validation, and the messages founders and
// reviewers sign. Shared by the browser (src/) and the API (server/), so both
// sides check exactly the same rules.

export type Status = "submitted" | "reviewing" | "approved" | "funded" | "rejected";

export const CATEGORIES = ["AI", "DePIN", "Infra", "DevTools", "DeFi", "Consumer", "Gaming", "Hardware", "Other"] as const;
export const STAGES = ["Idea", "Prototype", "Live product", "Revenue"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Stage = (typeof STAGES)[number];

export interface Founder {
  name: string;
  role: string;
  x?: string;
  github?: string;
  linkedin?: string;
}

export interface Milestone {
  title: string;
  deliverable: string;
  weeks: number;
}

/** What the founder fills in. Everything here is signed by the founder's wallet. */
export interface ApplicationInput {
  mint: string;
  founder: string;
  launchSig: string;
  coin: {
    name: string;
    symbol: string;
    image: string;
    uri: string;
    description: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    devBuySol: number;
  };
  team: {
    founders: Founder[];
    fullTime: boolean;
    knownFor: string;
    impressive: string;
  };
  project: {
    oneLiner: string;
    category: Category;
    stage: Stage;
    problem: string;
    solution: string;
    whyNow: string;
    competitors: string;
    traction: string;
    demoUrl?: string;
    repoUrl?: string;
  };
  funding: {
    askSol: number;
    useOfFunds: string;
    milestones: Milestone[];
    tokenRationale: string;
    commitments: { devLock: boolean; publicUpdates: boolean; openSource: boolean };
  };
}

export interface Scores {
  team: number;
  product: number;
  market: number;
  traction: number;
  token: number;
}

export interface Review {
  scores: Scores;
  notes: string;
  reviewer: string;
  at: number;
}

export interface FundingTx {
  kind: "curve-buy" | "grant";
  sol: number;
  sig: string;
  at: number;
  note?: string;
}

export interface Update {
  text: string;
  link?: string;
  at: number;
}

export interface Application extends ApplicationInput {
  status: Status;
  batch: string;
  createdAt: number;
  signature: string;
  /** True when the API confirmed on-chain that `founder` created `mint` on Pump. */
  verified: boolean;
  review?: Review;
  funding_txs: FundingTx[];
  updates: Update[];
  history: { at: number; status: Status; by: string }[];
}

// ---- deal terms (shown in the docs and enforced by the API) -----------------

export const DEAL = {
  maxAskSol: 50,
  convictionBuySol: 5,
  minMilestones: 2,
  maxMilestones: 5,
  devLockDays: 90,
  treasuryLockDays: 180,
  approveThreshold: 3.5,
};

/** Batches run by season: W (Jan–Apr), S (May–Aug), F (Sep–Dec). */
export function batchFor(t: number): string {
  const d = new Date(t);
  const m = d.getUTCMonth();
  const season = m < 4 ? "W" : m < 8 ? "S" : "F";
  return `${season}${String(d.getUTCFullYear()).slice(2)}`;
}

export const avgScore = (s: Scores) => (s.team + s.product + s.market + s.traction + s.token) / 5;

// ---- validation ---------------------------------------------------------------

const isUrl = (s?: string) => !s || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(s);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface Problem {
  field: string;
  message: string;
}

/** Blocking problems: the API refuses an application that has any. */
export function validate(a: ApplicationInput, opts: { requireChain?: boolean } = {}): Problem[] {
  const p: Problem[] = [];
  const need = (field: string, ok: boolean, message: string) => { if (!ok) p.push({ field, message }); };

  if (opts.requireChain !== false) {
    need("mint", B58.test(a.mint), "Missing coin address.");
    need("founder", B58.test(a.founder), "Missing founder wallet.");
    need("launchSig", !!a.launchSig, "Missing launch transaction.");
  }

  const c = a.coin;
  need("coin.name", c.name.trim().length >= 2 && c.name.length <= 32, "Coin name: 2–32 characters.");
  need("coin.symbol", /^[A-Za-z0-9$]{2,10}$/.test(c.symbol), "Ticker: 2–10 letters or digits.");
  need("coin.description", c.description.trim().length >= 20 && c.description.length <= 500, "Coin description: 20–500 characters.");
  need("coin.website", isUrl(c.website), "Website must be a full https:// link.");
  need("coin.devBuySol", c.devBuySol >= 0 && c.devBuySol <= 10, "Dev buy: 0–10 SOL.");

  const t = a.team;
  need("team.founders", t.founders.length >= 1 && t.founders.length <= 6, "List 1–6 founders.");
  t.founders.forEach((f, i) => {
    need(`team.founders.${i}.name`, f.name.trim().length >= 2, `Founder ${i + 1}: add a name.`);
    need(`team.founders.${i}.role`, f.role.trim().length >= 2, `Founder ${i + 1}: add a role.`);
    need(`team.founders.${i}.contact`, !!(f.x || f.github || f.linkedin), `Founder ${i + 1}: add at least one of X, GitHub or LinkedIn.`);
    need(`team.founders.${i}.github`, isUrl(f.github), `Founder ${i + 1}: GitHub must be a full link.`);
    need(`team.founders.${i}.linkedin`, isUrl(f.linkedin), `Founder ${i + 1}: LinkedIn must be a full link.`);
  });
  need("team.impressive", words(t.impressive) >= 15, "Most impressive thing you've built: at least 15 words.");

  const pr = a.project;
  need("project.oneLiner", pr.oneLiner.trim().length >= 10 && pr.oneLiner.length <= 90, "One-liner: 10–90 characters.");
  need("project.problem", words(pr.problem) >= 25, "Problem: at least 25 words.");
  need("project.solution", words(pr.solution) >= 25, "Solution: at least 25 words.");
  need("project.whyNow", words(pr.whyNow) >= 10, "Why now: at least 10 words.");
  need("project.traction", words(pr.traction) >= 5, "Progress so far: at least 5 words (\"nothing yet\" is a fine answer if it's true, but say what you've done).");
  need("project.demoUrl", isUrl(pr.demoUrl), "Demo must be a full link.");
  need("project.repoUrl", isUrl(pr.repoUrl), "Repo must be a full link.");

  const f = a.funding;
  need("funding.askSol", f.askSol > 0 && f.askSol <= DEAL.maxAskSol, `Ask: between 0 and ${DEAL.maxAskSol} SOL.`);
  need("funding.useOfFunds", words(f.useOfFunds) >= 15, "Use of funds: at least 15 words.");
  need("funding.milestones", f.milestones.length >= DEAL.minMilestones && f.milestones.length <= DEAL.maxMilestones, `Add ${DEAL.minMilestones}–${DEAL.maxMilestones} milestones.`);
  f.milestones.forEach((m, i) => {
    need(`funding.milestones.${i}`, m.title.trim().length >= 3 && words(m.deliverable) >= 5 && m.weeks >= 1 && m.weeks <= 52, `Milestone ${i + 1}: title, a deliverable of 5+ words, and 1–52 weeks.`);
  });
  need("funding.tokenRationale", words(f.tokenRationale) >= 20, "Why a token: at least 20 words.");
  need("funding.commitments.devLock", f.commitments.devLock, `You must commit to not selling dev tokens for ${DEAL.devLockDays} days.`);
  return p;
}

/**
 * 0–100 "application strength": not a decision, a nudge. Rewards the things
 * reviewers weigh: specifics, proof (links, traction), a full team, sensible
 * milestones, and an honest token rationale.
 */
export function strength(a: ApplicationInput): { score: number; tips: string[] } {
  const tips: string[] = [];
  let s = 0;
  const add = (pts: number, ok: boolean, tip: string) => { if (ok) s += pts; else tips.push(tip); };
  const pr = a.project;
  add(8, words(pr.problem) >= 60, "Make the problem concrete: who has it, how often, what it costs them.");
  add(8, words(pr.solution) >= 60, "Describe how the product works, not just what it is.");
  add(6, /\d/.test(pr.traction), "Put numbers in your progress: users, commits, revenue, waitlist.");
  add(10, !!pr.demoUrl, "Link a demo. A 60-second video beats a paragraph.");
  add(10, !!pr.repoUrl, "Link a repo. Reviewers read code.");
  add(6, words(pr.whyNow) >= 25, "Why now? Name the change that makes this possible today.");
  add(6, words(pr.competitors) >= 15, "Name competitors and what you understand that they don't.");
  add(8, a.team.founders.length >= 2, "Solo founders can get in, but a co-founder strengthens the application.");
  add(8, a.team.fullTime, "Reviewers favour teams working on this full time.");
  add(6, a.team.founders.every((f) => !!f.github), "Add a GitHub for every founder.");
  add(6, words(a.team.impressive) >= 40, "Say more about the most impressive thing you've built.");
  add(6, a.funding.milestones.length >= 3, "Three milestones shows a plan, not a wish.");
  add(6, words(a.funding.tokenRationale) >= 50, "Explain what the token does inside the product.");
  add(3, a.funding.commitments.publicUpdates, "Commit to public updates.");
  add(3, a.funding.commitments.openSource, "Open-source commitments earn trust.");
  return { score: Math.min(100, s), tips };
}

// ---- signed messages ----------------------------------------------------------

/** JSON with sorted keys, so the browser and the API hash identical bytes. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SignedAction =
  | { action: "apply"; mint: string; body: ApplicationInput }
  | { action: "status"; mint: string; body: { status: Status; scores?: Scores; notes?: string } }
  | { action: "fund"; mint: string; body: { kind: FundingTx["kind"]; sol: number; sig: string; note?: string } }
  | { action: "update"; mint: string; body: { text: string; link?: string } };

/** The exact text a wallet signs for an action. Shown to the signer in their wallet. */
export async function messageFor(a: SignedAction, signer: string, ts: number): Promise<string> {
  const digest = await sha256Hex(stableStringify(a.body));
  return [
    `YC Pump: ${a.action}`,
    `coin: ${a.mint}`,
    `signer: ${signer}`,
    `digest: ${digest}`,
    `time: ${ts}`,
  ].join("\n");
}

export interface SignedRequest {
  payload: SignedAction;
  signer: string;
  ts: number;
  /** base58 ed25519 signature over messageFor(payload, signer, ts). */
  signature: string;
}
