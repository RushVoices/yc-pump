// The reviewer desk: a summary, then one list per stage of the queue.
import { avgScore, strength, type Application, type Status } from "../../shared/app";

import { isLive } from "../chain/config";
import { connectWallet, walletKey } from "../chain/wallet";
import { isAdmin, state } from "../state";
import { $, $$, ago, badge, coinImg, errMsg, esc, short, toast } from "../ui";

const TABS: { key: string; label: string; statuses: Status[]; empty: string }[] = [
  { key: "queue", label: "Needs a decision", statuses: ["submitted", "reviewing"], empty: "Nothing is waiting. New applications appear here the moment a founder launches." },
  { key: "backed", label: "Backed", statuses: ["approved", "funded"], empty: "No backed projects yet. Approve an application to start the batch." },
  { key: "rejected", label: "Not selected", statuses: ["rejected"], empty: "No rejections yet." },
  { key: "all", label: "All", statuses: ["submitted", "reviewing", "approved", "funded", "rejected"], empty: "No applications yet." },
];

let tab = "queue";

function row(a: Application): string {
  const str = strength(a).score;
  const score = a.review ? avgScore(a.review.scores).toFixed(1) : "—";
  const funded = a.funding_txs.reduce((s, t) => s + t.sol, 0);
  return `<a class="r-row" href="#/p/${esc(a.mint)}">
    <div class="r-proj">${coinImg(a)}<div><b>${esc(a.coin.name)}</b> <span class="mono">$${esc(a.coin.symbol)}</span><p>${esc(a.project.oneLiner)}</p></div></div>
    <div class="r-cell" data-label="Category">${esc(a.project.category)}<span class="mute">${esc(a.project.stage)}</span></div>
    <div class="r-cell num" data-label="Ask">${a.funding.askSol} SOL${funded ? `<span class="mute">${funded} funded</span>` : ""}</div>
    <div class="r-cell" data-label="Strength"><div class="mini"><i class="${str >= 70 ? "good" : str >= 40 ? "mid" : ""}" style="width:${str}%"></i></div><span class="mute num">${str}/100</span></div>
    <div class="r-cell num" data-label="Score">${score}</div>
    <div class="r-cell" data-label="Status">${badge(a.status)}<span class="mute">${ago(a.history.at(-1)?.at ?? a.createdAt)}</span></div>
  </a>`;
}

export function renderReview(root: HTMLElement, rerender: () => void) {
  if (!isAdmin()) {
    const me = walletKey();
    root.innerHTML = `<section class="page-head narrow"><p class="eyebrow">Reviewer desk</p><h1 class="display">Reviewers only.</h1>
      <p class="sub">${me ? `<code>${esc(short(me, 6))}</code> isn't on the reviewer list. Reviewer wallets are set with <code>ADMIN_WALLETS</code> on the server.` : "Connect a reviewer wallet to see the queue."}</p>
      ${me ? "" : '<button class="btn solid" id="rc">Connect wallet</button>'}</section>`;
    root.querySelector("#rc")?.addEventListener("click", async () => {
      try { await connectWallet(); rerender(); } catch (e) { toast(errMsg(e), "err"); }
    });
    return;
  }

  const apps = state.apps;
  const count = (ss: Status[]) => apps.filter((a) => ss.includes(a.status)).length;
  const waiting = apps.filter((a) => a.status === "submitted");
  const oldest = waiting.length ? Math.min(...waiting.map((a) => a.createdAt)) : null;
  const deployed = apps.reduce((s, a) => s + a.funding_txs.reduce((x, t) => x + t.sol, 0), 0);
  const cfg = state.config;
  const warn = [
    cfg && isLive() && !cfg.persistent ? "No database is connected, so applications are kept in server memory and can disappear. In Vercel, add Upstash for Redis from the Marketplace (free) and redeploy." : "",
  ].filter(Boolean);

  root.innerHTML = `
  <section class="page-head split">
    <div><p class="eyebrow">Reviewer desk</p><h1 class="display">Review queue</h1>
    <p class="sub">${isLive() ? `Signed in as <code>${esc(short(walletKey() ?? "", 6))}</code>. Every decision and payment asks your wallet to sign.` : "Demo mode: you're a reviewer, so you can try the whole flow. Decisions are saved in this browser."} Open a project to score it, decide, and fund it.</p></div>
  </section>
  ${warn.map((w) => `<div class="note warn">${esc(w)}</div>`).join("")}
  <dl class="r-stats">
    <div><dt>Waiting</dt><dd>${count(["submitted"])}</dd><span>${oldest ? `oldest ${ago(oldest)}` : "inbox clear"}</span></div>
    <div><dt>In review</dt><dd>${count(["reviewing"])}</dd><span>picked up</span></div>
    <div><dt>Backed</dt><dd>${count(["approved", "funded"])}</dd><span>${count(["funded"])} funded</span></div>
    <div><dt>SOL deployed</dt><dd>${deployed.toLocaleString(undefined, { maximumFractionDigits: 1 })}</dd><span>buys + grants</span></div>
  </dl>
  <div class="r-tabs" role="tablist">${TABS.map((t) => `<button role="tab" data-tab="${t.key}">${t.label}<span class="count">${count(t.statuses)}</span></button>`).join("")}</div>
  <div class="r-table">
    <div class="r-head"><span>Project</span><span>Category</span><span>Ask</span><span>Strength</span><span>Score</span><span>Status</span></div>
    <div id="rows"></div>
  </div>`;

  const draw = () => {
    const t = TABS.find((x) => x.key === tab)!;
    const list = apps.filter((a) => t.statuses.includes(a.status)).sort((a, b) =>
      t.key === "queue" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
    $$("[data-tab]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $("#rows", root).innerHTML = list.length ? list.map(row).join("")
      : `<div class="empty-state slim"><h3>${esc(t.label === "All" ? "No applications yet" : "All clear")}</h3><p>${esc(t.empty)}</p>${apps.length ? "" : '<a class="btn ghost sm" href="#/apply">Submit a test application</a>'}</div>`;
  };
  $$("[data-tab]", root).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab!; draw(); }));
  draw();
}
