// The application form. Launching the coin and filing the application are one
// flow: upload metadata → create the coin on Pump → sign the application →
// submit. If anything fails after the coin exists, the draft remembers the
// coin so the founder can resubmit without launching again.
import {
  CATEGORIES, DEAL, STAGES, strength, validate, type ApplicationInput, type Problem,
} from "../../shared/app";
import { backend, demoSign, fakeMint, fakeSig } from "../data";
import { env, explorerTx, isLive, pumpUrl } from "../chain/config";
import { launchCoin } from "../chain/pump";
import { ensureWallet, signAction, walletKey } from "../chain/wallet";
import { conn, upsert } from "../state";
import { $, $$, errMsg, esc, modal, short, stepper, toast } from "../ui";

type Draft = Omit<ApplicationInput, "mint" | "founder" | "launchSig">;
interface Saved {
  draft: Draft;
  step: number;
  visited: number;
  imageData?: string;
  /** Set once the coin exists on chain, so a failed submit never relaunches. */
  pending?: { mint: string; launchSig: string; founder: string; uri: string; image: string };
}

const KEY = "ycpump-draft-v1";

function blank(): Draft {
  return {
    coin: { name: "", symbol: "", image: "", uri: "", description: "", twitter: "", telegram: "", website: "", devBuySol: 0.5 },
    team: { founders: [{ name: "", role: "", x: "", github: "", linkedin: "" }], fullTime: true, knownFor: "", impressive: "" },
    project: { oneLiner: "", category: "AI", stage: "Prototype", problem: "", solution: "", whyNow: "", competitors: "", traction: "", demoUrl: "", repoUrl: "" },
    funding: {
      askSol: 20, useOfFunds: "",
      milestones: [{ title: "", deliverable: "", weeks: 4 }, { title: "", deliverable: "", weeks: 10 }],
      tokenRationale: "",
      commitments: { devLock: false, publicUpdates: true, openSource: false },
    },
  };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch { /* fresh */ }
  return { draft: blank(), step: 0, visited: 0 };
}
function persist(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {
    // Most likely the image is too big for storage: keep everything else.
    try { localStorage.setItem(KEY, JSON.stringify({ ...s, imageData: undefined })); } catch { /* ignore */ }
  }
}

// Empty optional strings become undefined so the signed body is clean.
function clean(d: Draft): Draft {
  const o = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  return {
    coin: { ...d.coin, name: d.coin.name.trim(), symbol: d.coin.symbol.trim().toUpperCase(), description: d.coin.description.trim(), twitter: o(d.coin.twitter), telegram: o(d.coin.telegram), website: o(d.coin.website) },
    team: { ...d.team, founders: d.team.founders.map((f) => ({ name: f.name.trim(), role: f.role.trim(), x: o(f.x), github: o(f.github), linkedin: o(f.linkedin) })), knownFor: d.team.knownFor.trim(), impressive: d.team.impressive.trim() },
    project: { ...d.project, demoUrl: o(d.project.demoUrl), repoUrl: o(d.project.repoUrl) },
    funding: { ...d.funding, milestones: d.funding.milestones.map((m) => ({ title: m.title.trim(), deliverable: m.deliverable.trim(), weeks: Number(m.weeks) })) },
  };
}

// ---- path helpers for name="a.b.0.c" inputs ------------------------------------------

function getPath(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o);
}
function setPath(o: unknown, path: string, v: unknown) {
  const ks = path.split(".");
  const last = ks.pop()!;
  const parent = ks.reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o) as Record<string, unknown>;
  parent[last] = v;
}

// ---- field renderers ----------------------------------------------------------------

interface FieldOpts {
  type?: "text" | "textarea" | "url" | "number" | "select" | "checkbox";
  hint?: string;
  placeholder?: string;
  rows?: number;
  minWords?: number;
  maxLength?: number;
  options?: readonly string[];
  step?: string;
  min?: number;
  max?: number;
  req?: boolean;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function field(d: Draft, label: string, name: string, o: FieldOpts = {}): string {
  const v = getPath(d, name);
  const id = `f-${name.replace(/\./g, "-")}`;
  const t = o.type ?? "text";
  const req = o.req ? '<span class="req" aria-hidden="true">*</span>' : '<span class="opt">optional</span>';
  let input: string;
  if (t === "textarea") {
    input = `<textarea id="${id}" name="${name}" rows="${o.rows ?? 4}" placeholder="${esc(o.placeholder ?? "")}" ${o.maxLength ? `maxlength="${o.maxLength}"` : ""}>${esc(v)}</textarea>${o.minWords ? `<span class="wc" data-min="${o.minWords}">${words(String(v ?? ""))} / ${o.minWords}+ words</span>` : ""}`;
  } else if (t === "select") {
    input = `<select id="${id}" name="${name}">${o.options!.map((x) => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
  } else if (t === "checkbox") {
    return `<label class="check" data-field="${name}"><input type="checkbox" name="${name}" ${v ? "checked" : ""}><span>${label}${o.hint ? `<small>${o.hint}</small>` : ""}</span></label>`;
  } else {
    input = `<input id="${id}" name="${name}" type="${t}" value="${esc(v)}" placeholder="${esc(o.placeholder ?? "")}" ${o.maxLength ? `maxlength="${o.maxLength}"` : ""} ${o.step ? `step="${o.step}"` : ""} ${o.min !== undefined ? `min="${o.min}"` : ""} ${o.max !== undefined ? `max="${o.max}"` : ""}>`;
  }
  return `<div class="field" data-field="${name}"><label for="${id}">${label} ${req}</label>${o.hint ? `<p class="hint">${o.hint}</p>` : ""}${input}<p class="err" hidden></p></div>`;
}

// ---- steps ---------------------------------------------------------------------------

const STEPS = [
  { title: "Team", prefix: "team." },
  { title: "Product", prefix: "project." },
  { title: "Funding", prefix: "funding." },
  { title: "Coin", prefix: "coin." },
  { title: "Launch", prefix: "" },
];

function stepTeam(d: Draft): string {
  return `
  <h2>Who's building this?</h2>
  <p class="lead">Reviewers back people first. Link the profiles that show your work.</p>
  ${d.team.founders.map((f, i) => `
    <fieldset class="founder"><legend>Founder ${i + 1}${i > 0 ? ` <button type="button" class="linkbtn" data-rm-founder="${i}">Remove</button>` : ""}</legend>
      <div class="row2">${field(d, "Name", `team.founders.${i}.name`, { req: true, maxLength: 60 })}${field(d, "Role", `team.founders.${i}.role`, { req: true, placeholder: "CEO, CTO, design…", maxLength: 40 })}</div>
      <div class="row3">${field(d, "X", `team.founders.${i}.x`, { type: "url", placeholder: "https://x.com/…" })}${field(d, "GitHub", `team.founders.${i}.github`, { type: "url", placeholder: "https://github.com/…" })}${field(d, "LinkedIn", `team.founders.${i}.linkedin`, { type: "url", placeholder: "https://linkedin.com/in/…" })}</div>
      <p class="err" data-err="team.founders.${i}.contact" hidden></p>
    </fieldset>`).join("")}
  ${d.team.founders.length < 6 ? '<button type="button" class="btn ghost sm add" id="addFounder">+ Add co-founder</button>' : ""}
  <p class="err" data-err="team.founders" hidden></p>
  ${field(d, "Is everyone working on this full time?", "team.fullTime", { type: "checkbox", hint: "Part-time teams can apply; say when you'll go full time in the next answer." })}
  ${field(d, "How long have the founders known each other, and how did you meet?", "team.knownFor", { type: "textarea", rows: 2 })}
  ${field(d, "What's the most impressive thing you've built or achieved?", "team.impressive", { type: "textarea", req: true, minWords: 15, hint: "Not necessarily in crypto. Be specific: what it was, what you did, what happened." })}`;
}

function stepProduct(d: Draft): string {
  return `
  <h2>What are you building?</h2>
  <p class="lead">Write for a smart reader who knows nothing about your space. Plain words beat buzzwords.</p>
  ${field(d, "One-liner", "project.oneLiner", { req: true, maxLength: 90, placeholder: "A marketplace for spare laptop GPUs to run open-model inference.", hint: "What it does, in under 90 characters." })}
  <div class="row2">${field(d, "Category", "project.category", { type: "select", options: CATEGORIES, req: true })}${field(d, "Stage", "project.stage", { type: "select", options: STAGES, req: true })}</div>
  ${field(d, "What problem are you solving, and who has it?", "project.problem", { type: "textarea", req: true, minWords: 25, rows: 5 })}
  ${field(d, "How does your product solve it?", "project.solution", { type: "textarea", req: true, minWords: 25, rows: 5, hint: "How it works, not just what it is." })}
  ${field(d, "Why now?", "project.whyNow", { type: "textarea", req: true, minWords: 10, rows: 2, hint: "What changed that makes this possible or necessary today?" })}
  ${field(d, "Who are your competitors, and what do you understand that they don't?", "project.competitors", { type: "textarea", rows: 3 })}
  ${field(d, "How far along are you?", "project.traction", { type: "textarea", req: true, minWords: 5, rows: 3, hint: "Users, revenue, commits, waitlist, pilots. Numbers beat adjectives. \"Prototype on devnet, 0 users\" is an honest, acceptable answer." })}
  <div class="row2">${field(d, "Demo link", "project.demoUrl", { type: "url", placeholder: "https://… (video or live app)" })}${field(d, "Code repository", "project.repoUrl", { type: "url", placeholder: "https://github.com/…" })}</div>`;
}

function stepFunding(d: Draft): string {
  return `
  <h2>What will the money do?</h2>
  <p class="lead">Grants are paid as milestones ship, so make them concrete and checkable.</p>
  ${field(d, `How much are you asking for? (SOL, up to ${DEAL.maxAskSol})`, "funding.askSol", { type: "number", req: true, step: "0.5", min: 0.5, max: DEAL.maxAskSol, hint: `Separate from the ${DEAL.convictionBuySol} SOL conviction buy every backed coin gets.` })}
  ${field(d, "How will you spend it?", "funding.useOfFunds", { type: "textarea", req: true, minWords: 15, rows: 3 })}
  <div class="ms-head"><h3>Milestones</h3><span class="hint">${DEAL.minMilestones}–${DEAL.maxMilestones}. Each one unlocks part of your grant once you show it shipped.</span></div>
  ${d.funding.milestones.map((m, i) => `
    <fieldset class="milestone"><legend>Milestone ${i + 1}${i >= DEAL.minMilestones ? ` <button type="button" class="linkbtn" data-rm-ms="${i}">Remove</button>` : ""}</legend>
      <div class="row-ms">${field(d, "Title", `funding.milestones.${i}.title`, { req: true, maxLength: 60, placeholder: "Public beta" })}${field(d, "Weeks from approval", `funding.milestones.${i}.weeks`, { type: "number", req: true, min: 1, max: 52 })}</div>
      ${field(d, "Deliverable anyone can check", `funding.milestones.${i}.deliverable`, { req: true, maxLength: 200, placeholder: "Live on mainnet with 100 weekly users, dashboard public" })}
      <p class="err" data-err="funding.milestones.${i}" hidden></p>
    </fieldset>`).join("")}
  ${d.funding.milestones.length < DEAL.maxMilestones ? '<button type="button" class="btn ghost sm add" id="addMs">+ Add milestone</button>' : ""}
  <p class="err" data-err="funding.milestones" hidden></p>
  ${field(d, "Why does this project need a token?", "funding.tokenRationale", { type: "textarea", req: true, minWords: 20, rows: 4, hint: "What does the token do inside the product? Who holds it and why? \"Fundraising\" alone is not a reason; reviewers score this." })}
  <h3>Commitments</h3>
  ${field(d, `I won't sell or transfer my dev-buy tokens for ${DEAL.devLockDays} days after launch.`, "funding.commitments.devLock", { type: "checkbox", hint: "Required. Your founder wallet's balance is shown publicly on your project page." })}
  ${field(d, "I'll post a public progress update at least every two weeks.", "funding.commitments.publicUpdates", { type: "checkbox" })}
  ${field(d, "The core code will be open source.", "funding.commitments.openSource", { type: "checkbox" })}`;
}

function stepCoin(d: Draft, s: Saved): string {
  const locked = !!s.pending;
  return `
  <h2>Your coin</h2>
  <p class="lead">${locked ? "This coin is already live on Pump.fun, so its details can't change." : "This is what launches on Pump.fun. Name and ticker are permanent."}</p>
  <fieldset ${locked ? "disabled" : ""} class="plain">
  <div class="coin-row">
    <label class="drop" id="drop" tabindex="0">
      ${s.imageData ? `<img src="${esc(s.imageData)}" alt="Coin image">` : `<span>Drop an image<br><small>PNG, JPG, GIF, WebP · up to 5 MB · square works best</small></span>`}
      <input type="file" id="img" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
    </label>
    <div class="coin-fields">
      <div class="row2">${field(d, "Name", "coin.name", { req: true, maxLength: 32, placeholder: "Tessera" })}${field(d, "Ticker", "coin.symbol", { req: true, maxLength: 10, placeholder: "TSRA" })}</div>
      ${field(d, "Description", "coin.description", { type: "textarea", req: true, rows: 3, maxLength: 500, hint: "Shown on Pump.fun and in wallets. 20–500 characters." })}
    </div>
  </div>
  <p class="err" data-err="coin.image" hidden></p>
  <div class="row3">${field(d, "Website", "coin.website", { type: "url", placeholder: "https://…" })}${field(d, "X", "coin.twitter", { type: "url", placeholder: "https://x.com/…" })}${field(d, "Telegram", "coin.telegram", { type: "url", placeholder: "https://t.me/…" })}</div>
  ${field(d, "Dev buy (SOL)", "coin.devBuySol", { type: "number", req: true, step: "0.1", min: 0, max: 10, hint: `Bought in the same transaction as the launch, so nobody can buy before you. Locked by your ${DEAL.devLockDays}-day commitment. 0 for none.` })}
  </fieldset>`;
}

function summary(d: Draft): string {
  const row = (k: string, v: string) => `<div class="sum-row"><dt>${k}</dt><dd>${v}</dd></div>`;
  return `<dl class="sum">
    ${row("Coin", `<b>${esc(d.coin.name) || "—"}</b> $${esc(d.coin.symbol.toUpperCase()) || "—"} · dev buy ${d.coin.devBuySol} SOL`)}
    ${row("Team", d.team.founders.map((f) => `${esc(f.name)} <span class="mute">(${esc(f.role)})</span>`).join(", ") + (d.team.fullTime ? " · full time" : " · part time"))}
    ${row("One-liner", esc(d.project.oneLiner))}
    ${row("Category", `${esc(d.project.category)} · ${esc(d.project.stage)}`)}
    ${row("Ask", `${d.funding.askSol} SOL over ${d.funding.milestones.length} milestones`)}
    ${row("Milestones", `<ol>${d.funding.milestones.map((m) => `<li><b>${esc(m.title)}</b> — ${esc(m.deliverable)} <span class="mute">(week ${m.weeks})</span></li>`).join("")}</ol>`)}
  </dl>`;
}

function stepLaunch(d: Draft, s: Saved): string {
  const p = s.pending;
  const cost = 0.02 + Number(d.coin.devBuySol || 0);
  return `
  <h2>${p ? "Finish submitting" : "Launch and apply"}</h2>
  ${p ? `<div class="note warn"><b>Your coin is live but the application wasn't filed.</b> Coin <code>${esc(short(p.mint, 6))}</code> was created by <code>${esc(short(p.founder, 4))}</code>. Submit again below; nothing is relaunched.</div>` : ""}
  ${summary(d)}
  <div class="what">
    <h3>What happens when you press the button</h3>
    <ol>
      ${p ? "" : `<li>Your image and coin details are pinned to IPFS.</li><li>Your wallet asks you to approve <b>one transaction</b> that creates $${esc(d.coin.symbol.toUpperCase() || "TICKER")} on Pump.fun${Number(d.coin.devBuySol) > 0 ? ` and makes your ${d.coin.devBuySol} SOL dev buy` : ""}. You are the coin's creator and earn its creator fees.</li>`}
      <li>Your wallet asks you to <b>sign your application</b> (a message, not a transaction: it costs nothing).</li>
      <li>YC Pump checks on-chain that your wallet created the coin, then files the application. It appears on the Launchpad as <i>Applied</i>.</li>
    </ol>
    ${p ? "" : `<p class="cost">Estimated cost: <b>~${cost.toFixed(2)} SOL</b> (network + Pump fees ≈ 0.02 SOL, plus your dev buy).</p>`}
  </div>
  <div class="acks">
    <label class="check"><input type="checkbox" class="ack"><span>I understand the coin is real and tradeable on Pump.fun from the moment it launches, <b>whether or not YC Pump backs it</b>.</span></label>
    <label class="check"><input type="checkbox" class="ack"><span>My answers are true. Misrepresenting the team, traction or code gets an application rejected publicly.</span></label>
    <label class="check"><input type="checkbox" class="ack"><span>Being backed is not investment advice to anyone, and YC Pump doesn't control the coin's price.</span></label>
  </div>
  <p class="err" id="launchErr" hidden></p>
  <button type="button" class="btn solid lg wide" id="launch" disabled>${p ? "Sign & submit application" : isLive() ? "Launch coin & submit application" : "Launch coin & submit (demo)"}</button>
  ${isLive() ? `<p class="mute small center">${env.cluster === "mainnet-beta" ? "Solana mainnet: this creates a real coin on Pump.fun and spends real SOL." : "Solana devnet: test coins only."} Your wallet is asked once; the transaction is dry-run first, so a launch that would fail never reaches your wallet.</p>` : `<p class="mute small center">Demo mode: nothing is sent to Solana. Deploy the site with its API (see README) to launch real coins.</p>`}`;
}

// ---- main ----------------------------------------------------------------------------

export function renderApply(root: HTMLElement) {
  const s = load();
  let problems: Problem[] = [];

  root.innerHTML = `
  <section class="page-head narrow">
    <p class="eyebrow">Apply</p>
    <h1 class="display">Launching your coin is your application.</h1>
    <p class="sub">About 20 minutes. Your draft saves in this browser as you type. Read <a href="#/docs/process">how review works</a> first if you haven't.</p>
  </section>
  <div class="apply">
    <nav class="stepnav" aria-label="Application steps">${STEPS.map((st, i) => `<button type="button" data-step="${i}"><span>${i + 1}</span>${st.title}</button>`).join("")}</nav>
    <form id="form" class="form" novalidate></form>
    <aside class="side">
      <div class="meter"><div class="meter-top"><span class="mono">Application strength</span><b id="score">0</b></div><div class="bar"><i id="scoreBar"></i></div><ul id="tips" class="tips"></ul></div>
      <div class="side-card"><h4>The deal</h4><ul>
        <li><b>${DEAL.convictionBuySol} SOL</b> conviction buy on approval</li>
        <li>Up to <b>${DEAL.maxAskSol} SOL</b> in milestone grants</li>
        <li>The <b>Backed</b> badge and verify API</li>
        <li>No equity, no tokens taken from you</li>
      </ul><a href="#/docs/funding" class="linkbtn">Full terms</a></div>
      <button type="button" class="linkbtn" id="reset">Clear draft</button>
    </aside>
  </div>`;

  const form = $<HTMLFormElement>("#form", root);

  const save = () => persist(s);

  const refreshStrength = () => {
    const { score, tips } = strength(clean(s.draft) as ApplicationInput);
    $("#score", root).textContent = String(score);
    $("#scoreBar", root).style.width = `${score}%`;
    $("#scoreBar", root).className = score >= 70 ? "good" : score >= 40 ? "mid" : "";
    $("#tips", root).innerHTML = tips.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join("") || "<li>Strong application. Read it once more, out loud.</li>";
  };

  const stepProblems = (i: number) => {
    const pre = STEPS[i].prefix;
    const all = validate(clean(s.draft) as ApplicationInput, { requireChain: false });
    const ps = pre ? all.filter((p) => p.field.startsWith(pre)) : all;
    if (i === 3 && !s.imageData && !s.pending) ps.push({ field: "coin.image", message: "Add a coin image." });
    return ps;
  };

  const showErrors = () => {
    $$(".err[data-err], .field .err", form).forEach((e) => { e.hidden = true; e.textContent = ""; });
    $$(".field.bad", form).forEach((e) => e.classList.remove("bad"));
    for (const p of problems) {
      const holder = form.querySelector<HTMLElement>(`[data-field="${p.field}"]`);
      const target = holder?.querySelector<HTMLElement>(".err") ?? form.querySelector<HTMLElement>(`[data-err="${p.field}"]`);
      holder?.classList.add("bad");
      if (target) { target.hidden = false; target.textContent = p.message; }
    }
    const first = form.querySelector<HTMLElement>(".bad input, .bad textarea, .bad select, .err:not([hidden])");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const draw = () => {
    const d = s.draft;
    const i = s.step;
    form.innerHTML = `<div class="step-body">${[stepTeam, stepProduct, stepFunding][i]?.(d) ?? (i === 3 ? stepCoin(d, s) : stepLaunch(d, s))}</div>
      ${i < 4 ? `<div class="step-foot">${i > 0 ? '<button type="button" class="btn ghost" id="back">Back</button>' : "<span></span>"}<button type="button" class="btn solid" id="next">Continue to ${STEPS[i + 1].title.toLowerCase()}</button></div>` : '<div class="step-foot"><button type="button" class="btn ghost" id="back">Back</button><span></span></div>'}`;
    $$("[data-step]", root).forEach((b) => {
      const k = Number(b.dataset.step);
      b.className = k === i ? "cur" : k <= s.visited ? "seen" : "";
      b.toggleAttribute("disabled", k > s.visited);
    });
    problems = [];
    wire();
    refreshStrength();
  };

  const go = (i: number) => {
    s.step = i;
    s.visited = Math.max(s.visited, i);
    save();
    draw();
    root.querySelector(".apply")!.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function wire() {
    $$("[data-rm-founder]", form).forEach((b) => b.addEventListener("click", () => { s.draft.team.founders.splice(Number(b.dataset.rmFounder), 1); save(); draw(); }));
    $$("[data-rm-ms]", form).forEach((b) => b.addEventListener("click", () => { s.draft.funding.milestones.splice(Number(b.dataset.rmMs), 1); save(); draw(); }));
    form.querySelector("#addFounder")?.addEventListener("click", () => { s.draft.team.founders.push({ name: "", role: "", x: "", github: "", linkedin: "" }); save(); draw(); });
    form.querySelector("#addMs")?.addEventListener("click", () => { s.draft.funding.milestones.push({ title: "", deliverable: "", weeks: 12 }); save(); draw(); });
    form.querySelector("#back")?.addEventListener("click", () => go(s.step - 1));
    form.querySelector("#next")?.addEventListener("click", () => {
      problems = stepProblems(s.step);
      if (problems.length) { showErrors(); toast(`Fix ${problems.length} thing${problems.length > 1 ? "s" : ""} to continue.`, "err"); return; }
      go(s.step + 1);
    });
    wireImage();
    wireLaunch();
  }

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el.name) return;
    let v: unknown = el.type === "checkbox" ? el.checked : el.value;
    if (el.type === "number") v = el.value === "" ? 0 : Number(el.value);
    if (el.name === "coin.symbol") { el.value = el.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""); v = el.value; }
    setPath(s.draft, el.name, v);
    const wc = el.parentElement?.querySelector<HTMLElement>(".wc");
    if (wc) {
      const n = words(el.value);
      wc.textContent = `${n} / ${wc.dataset.min}+ words`;
      wc.classList.toggle("ok", n >= Number(wc.dataset.min));
    }
    el.closest(".field")?.classList.remove("bad");
    save();
    refreshStrength();
  }

  function wireImage() {
    const drop = form.querySelector<HTMLLabelElement>("#drop");
    const input = form.querySelector<HTMLInputElement>("#img");
    if (!drop || !input || s.pending) return;
    const take = (f?: File | null) => {
      if (!f) return;
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(f.type)) return toast("Use a PNG, JPEG, GIF or WebP image.", "err");
      if (f.size > 5 * 1024 * 1024) return toast("The image must be 5 MB or smaller.", "err");
      const r = new FileReader();
      r.onload = () => { s.imageData = String(r.result); save(); draw(); };
      r.readAsDataURL(f);
    };
    input.addEventListener("change", () => take(input.files?.[0]));
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer?.files?.[0]); });
  }

  function wireLaunch() {
    const btn = form.querySelector<HTMLButtonElement>("#launch");
    if (!btn) return;
    const acks = $$<HTMLInputElement>(".ack", form);
    const sync = () => (btn.disabled = !acks.every((a) => a.checked));
    acks.forEach((a) => a.addEventListener("change", sync));
    btn.addEventListener("click", async () => {
      const all = validate(clean(s.draft) as ApplicationInput, { requireChain: false });
      if (!s.imageData && !s.pending) all.push({ field: "coin.image", message: "Add a coin image." });
      if (all.length) {
        const stepOf = (f: string) => Math.max(0, STEPS.findIndex((st) => st.prefix && f.startsWith(st.prefix)));
        const firstStep = Math.min(...all.map((p) => stepOf(p.field)));
        toast(`Your application has ${all.length} problem${all.length > 1 ? "s" : ""}. Taking you there.`, "err");
        go(firstStep);
        problems = stepProblems(firstStep);
        showErrors();
        return;
      }
      await launchAndSubmit();
    });
  }

  async function launchAndSubmit() {
    const d = clean(s.draft);
    const steps = s.pending
      ? ["Sign application", "Verify & file"]
      : ["Upload image & metadata", "Dry-run & approve launch in wallet", "Sign application", "Verify & file"];
    const st = stepper(steps);
    const m = modal(`<h3>${s.pending ? "Submitting your application" : `Launching $${esc(d.coin.symbol)}`}</h3>${st.html}<p class="err" id="mErr" hidden></p><div class="m-foot" id="mFoot"></div>`, { closable: false });
    let k = 0;
    const next = () => { st.set(m.el, k, "done"); k++; st.set(m.el, k, "active"); };
    st.set(m.el, 0, "active");
    try {
      const founder = isLive() ? await ensureWallet() : walletKey() ?? backend.demoSigner;
      if (s.pending && s.pending.founder !== founder) throw new Error(`Connect the wallet that launched this coin (${short(s.pending.founder)}).`);

      if (!s.pending) {
        // 1. metadata
        const blob = await (await fetch(s.imageData!)).blob();
        const fd = new FormData();
        fd.append("file", blob, "image");
        for (const [key, v] of Object.entries({ name: d.coin.name, symbol: d.coin.symbol, description: d.coin.description, twitter: d.coin.twitter, telegram: d.coin.telegram, website: d.coin.website })) if (v) fd.append(key, v);
        const { uri, image } = await backend.upload(fd);
        next();
        // 2. launch
        let mint: string, launchSig: string;
        if (isLive()) {
          ({ mint, sig: launchSig } = await launchCoin(conn!, founder, { name: d.coin.name, symbol: d.coin.symbol, uri, devBuySol: d.coin.devBuySol }));
        } else {
          await new Promise((r) => setTimeout(r, 900));
          mint = fakeMint(); launchSig = fakeSig();
        }
        s.pending = { mint, launchSig, founder, uri, image: image || s.imageData! };
        save();
        next();
      }

      // 3. sign + 4. submit
      const p = s.pending!;
      const body: ApplicationInput = { ...d, mint: p.mint, founder: p.founder, launchSig: p.launchSig, coin: { ...d.coin, uri: p.uri, image: p.image } };
      const req = isLive() ? await signAction({ action: "apply", mint: p.mint, body }) : demoSign({ action: "apply", mint: p.mint, body });
      next();
      const app = await backend.submit(req);
      st.set(m.el, k, "done");
      upsert(app);
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      $("#mFoot", m.el).innerHTML = `<p class="ok-msg">You're in the queue. $${esc(app.coin.symbol)} is live on Pump.fun.</p>${isLive() ? `<p class="small"><a href="${pumpUrl(p.mint)}" target="_blank" rel="noopener">Open on Pump.fun ↗</a> · <a href="${explorerTx(p.launchSig)}" target="_blank" rel="noopener">Transaction ↗</a></p>` : ""}<a class="btn solid" href="#/p/${esc(app.mint)}?new=1" id="mGo">See your application</a>`;
      $("#mGo", m.el).addEventListener("click", () => m.close());
    } catch (e) {
      st.set(m.el, k, "fail");
      const err = $("#mErr", m.el);
      err.hidden = false;
      err.textContent = errMsg(e);
      $("#mFoot", m.el).innerHTML = `<button class="btn ghost" id="mClose">Close</button>${s.pending ? '<span class="mute small">Your coin is live; the draft remembers it. Submit again any time.</span>' : ""}`;
      $("#mClose", m.el).addEventListener("click", () => { m.close(); draw(); });
    }
  }

  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);
  $$("[data-step]", root).forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.step))));
  // Two-step confirm in the page itself (native confirm() dialogs are blocked in some embeds).
  let armed = 0;
  const reset = $("#reset", root);
  reset.addEventListener("click", () => {
    if (Date.now() - armed > 4000) {
      armed = Date.now();
      reset.textContent = s.pending ? "This draft is linked to a launched coin. Click again to clear anyway" : "Click again to clear your whole draft";
      setTimeout(() => { if (Date.now() - armed >= 4000) reset.textContent = "Clear draft"; }, 4100);
      return;
    }
    armed = 0;
    reset.textContent = "Clear draft";
    Object.assign(s, { draft: blank(), step: 0, visited: 0, imageData: undefined, pending: undefined });
    save();
    draw();
    toast("Draft cleared");
  });
  draw();
}
