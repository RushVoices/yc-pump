import { CATEGORIES, avgScore, type Application, type Status } from "../../shared/app";
import { isBacked } from "../data";
import { market, state } from "../state";
import { $, $$, ago, badge, coinImg, esc, sol } from "../ui";

export function card(a: Application): string {
  const m = market(a);
  const score = a.review ? avgScore(a.review.scores) : null;
  return `<a class="card ${isBacked(a.status) ? "backed" : ""}" href="#/p/${esc(a.mint)}">
    <div class="card-top">${coinImg(a)}<div class="card-id"><b>${esc(a.coin.name)}</b><span class="mono">$${esc(a.coin.symbol)} · ${esc(a.project.category)}</span></div></div>
    <p class="one">${esc(a.project.oneLiner)}</p>
    <div class="card-meta">${badge(a.status, a.batch)}${score !== null && a.status !== "rejected" ? `<span class="score" title="Average review score">${score.toFixed(1)}</span>` : ""}<span class="mono when">${ago(a.createdAt)}</span></div>
    ${m ? `<div class="mc"><span class="mono">Mcap ${sol(m.mcapSol, 0)}</span><span class="mono">${m.graduated ? "Graduated" : `${Math.round(m.progress * 100)}% curve`}</span></div><div class="curve"><i style="width:${Math.round(m.progress * 100)}%"></i></div>` : ""}
  </a>`;
}

const FILTERS: { key: string; label: string; test: (s: Status) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "backed", label: "Backed", test: isBacked },
  { key: "reviewing", label: "In review", test: (s) => s === "reviewing" },
  { key: "submitted", label: "Applied", test: (s) => s === "submitted" },
  { key: "rejected", label: "Not selected", test: (s) => s === "rejected" },
];

export function renderLaunchpad(root: HTMLElement, params: URLSearchParams) {
  const ui = { f: params.get("f") || "all", cat: params.get("cat") || "", q: params.get("q") || "", sort: params.get("sort") || "new" };

  root.innerHTML = `
  <section class="page-head split">
    <div>
      <p class="eyebrow">Launchpad</p>
      <h1 class="display">Every application, in public.</h1>
      <p class="sub">Each coin here was launched on Pump.fun as an application to YC Pump. Backed coins passed review; everything else is still a raw launch, so trade accordingly.</p>
    </div>
    <a class="btn solid lg" href="#/apply">+ Launch &amp; apply</a>
  </section>
  <div class="toolbar">
    <div class="tabs" role="tablist">${FILTERS.map((f) => `<button role="tab" data-f="${f.key}">${f.label} <span class="count">${state.apps.filter((a) => f.test(a.status)).length}</span></button>`).join("")}</div>
    <div class="tools">
      <input type="search" id="q" placeholder="Search name, ticker, founder" value="${esc(ui.q)}" aria-label="Search">
      <select id="cat" aria-label="Category"><option value="">All categories</option>${CATEGORIES.map((c) => `<option ${ui.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      <select id="sort" aria-label="Sort"><option value="new">Newest</option><option value="mcap">Market cap</option><option value="score">Review score</option></select>
    </div>
  </div>
  <div id="grid" class="grid"></div>`;

  $<HTMLSelectElement>("#sort", root).value = ui.sort;

  const draw = () => {
    const test = FILTERS.find((f) => f.key === ui.f)?.test ?? (() => true);
    const q = ui.q.trim().toLowerCase();
    let list = state.apps.filter((a) => test(a.status) && (!ui.cat || a.project.category === ui.cat) &&
      (!q || [a.coin.name, a.coin.symbol, a.mint, a.founder, a.project.oneLiner, ...a.team.founders.map((f) => f.name)].some((s) => s.toLowerCase().includes(q))));
    if (ui.sort === "mcap") list = list.sort((a, b) => (market(b)?.mcapSol ?? 0) - (market(a)?.mcapSol ?? 0));
    else if (ui.sort === "score") list = list.sort((a, b) => (b.review ? avgScore(b.review.scores) : 0) - (a.review ? avgScore(a.review.scores) : 0));
    $$("[data-f]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.f === ui.f)));
    $("#grid", root).innerHTML = list.length ? list.map(card).join("") : state.apps.length
      ? `<div class="empty-state"><h3>Nothing matches</h3><p>Try another filter or clear the search.</p></div>`
      : `<div class="empty-state"><h3>No applications yet</h3><p>The launchpad fills up as founders launch their coins. Yours could be the first one here.</p><a class="btn solid" href="#/apply">Launch &amp; apply</a></div>`;
    const qs = new URLSearchParams(Object.entries(ui).filter(([k, v]) => v && !(k === "f" && v === "all") && !(k === "sort" && v === "new")));
    history.replaceState(null, "", `#/launchpad${qs.toString() ? `?${qs}` : ""}`);
  };

  $$("[data-f]", root).forEach((b) => b.addEventListener("click", () => { ui.f = b.dataset.f!; draw(); }));
  $<HTMLInputElement>("#q", root).addEventListener("input", (e) => { ui.q = (e.target as HTMLInputElement).value; draw(); });
  $<HTMLSelectElement>("#cat", root).addEventListener("change", (e) => { ui.cat = (e.target as HTMLSelectElement).value; draw(); });
  $<HTMLSelectElement>("#sort", root).addEventListener("change", (e) => { ui.sort = (e.target as HTMLSelectElement).value; draw(); });
  draw();
}
