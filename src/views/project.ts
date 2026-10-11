// One project: the public application, its review, funding ledger and
// updates. Reviewers get the decision and funding controls inline; the founder
// gets an update box.
import { DEAL, avgScore, type Application, type Scores, type SignedAction, type Status } from "../../shared/app";
import { STATUS_LABEL, backend, demoSign, fakeSig, isBacked } from "../data";
import { env, explorerAddr, explorerTx, isLive, pumpUrl } from "../chain/config";
import { convictionBuy, holdingShare, sendGrant } from "../chain/pump";
import { ensureWallet, signAction, walletKey } from "../chain/wallet";
import { conn, isAdmin, market, state, upsert } from "../state";
import { $, $$, ago, badge, coinImg, copy, date, errMsg, esc, modal, pct, safeUrl, short, sol, stepper, toast } from "../ui";

const SCORE_AREAS: [keyof Scores, string, string][] = [
  ["team", "Team", "Can these people build this? Evidence of shipping."],
  ["product", "Product", "Does it work, and is it a real improvement?"],
  ["market", "Market", "How many people have this problem, how badly?"],
  ["traction", "Traction", "Users, revenue, commits, pilots — proof over plans."],
  ["token", "Token design", "Does the token do a job in the product?"],
];

const sign = (a: SignedAction) => (isLive() ? signAction(a) : Promise.resolve(demoSign(a)));

const link = (u?: string, label?: string) => (u && safeUrl(u) ? `<a href="${safeUrl(u)}" target="_blank" rel="noopener nofollow">${esc(label ?? u.replace(/^https?:\/\/(www\.)?/, ""))}</a>` : "");
const para = (s: string) => esc(s).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, "<br>")}</p>`).join("");

export async function renderProject(root: HTMLElement, mint: string, params: URLSearchParams) {
  let a = state.apps.find((x) => x.mint === mint) ?? (await backend.get(mint));
  if (!a) {
    root.innerHTML = `<section class="page-head"><h1 class="display">Not found</h1><p class="sub">No application for <code>${esc(short(mint, 6))}</code>. It may not be a YC Pump coin. <a href="#/launchpad">Back to the launchpad</a></p></section>`;
    return;
  }
  upsert(a);
  draw(a);
  if (params.get("new")) celebrate(a);

  function draw(app: Application) {
    a = app;
    const m = market(app);
    const backed = isBacked(app.status);
    const funded = app.funding_txs.reduce((s, t) => s + t.sol, 0);
    const me = walletKey() ?? (isLive() ? null : backend.demoSigner);
    const isFounder = !!me && me === app.founder;

    root.innerHTML = `
    <a class="crumb" href="#/launchpad">← Launchpad</a>
    <section class="p-head ${backed ? "backed" : ""}">
      ${coinImg(app, "coin xl")}
      <div class="p-id">
        <div class="p-badges">${badge(app.status, app.batch)}<span class="pill">${esc(app.project.category)}</span><span class="pill">${esc(app.project.stage)}</span>${app.verified ? '<span class="pill ok" title="The API checked on-chain that the founder wallet created this coin">Creator verified</span>' : ""}</div>
        <h1 class="display">${esc(app.coin.name)} <span class="tick">$${esc(app.coin.symbol)}</span></h1>
        <p class="p-one">${esc(app.project.oneLiner)}</p>
        <div class="p-links">
          <button class="ca" id="ca" title="Copy coin address"><span class="mono">CA</span> ${esc(short(app.mint, 6))} <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
          <a class="btn solid sm" href="${pumpUrl(app.mint)}" target="_blank" rel="noopener">Trade on Pump.fun ↗</a>
          ${link(app.coin.website, "Website")}${link(app.coin.twitter, "X")}${link(app.coin.telegram, "Telegram")}
        </div>
      </div>
      <dl class="p-stats">
        <div><dt>Market cap</dt><dd>${m ? sol(m.mcapSol, 0) : "—"}</dd></div>
        <div><dt>Bonding curve</dt><dd>${m ? (m.graduated ? "Graduated" : `${Math.round(m.progress * 100)}%`) : "—"}</dd></div>
        <div><dt>Ask</dt><dd>${sol(app.funding.askSol, 1)}</dd></div>
        <div><dt>Funded</dt><dd>${funded ? sol(funded, 1) : "—"}</dd></div>
        <div><dt>Founder holds</dt><dd id="hold">${isLive() ? "…" : "—"}</dd></div>
        <div><dt>Applied</dt><dd>${date(app.createdAt)}</dd></div>
      </dl>
    </section>

    ${!backed && app.status !== "rejected" ? `<div class="note">This coin has <b>applied</b> but has not been backed. It is a live, unreviewed Pump.fun coin.</div>` : ""}
    ${app.status === "rejected" ? `<div class="note warn">YC Pump reviewed this application and did <b>not</b> back it. See the reviewer notes below.</div>` : ""}

    <div class="p-grid">
      <div class="p-main">
        ${app.review ? reviewBlock(app) : app.status === "reviewing" ? '<section class="blk"><h2>Review</h2><p class="mute">A reviewer has picked this up. Scores and notes are published with the decision.</p></section>' : ""}

        <section class="blk"><h2>The problem</h2>${para(app.project.problem)}</section>
        <section class="blk"><h2>The product</h2>${para(app.project.solution)}
          <div class="chips">${link(app.project.demoUrl, "▶ Demo")}${link(app.project.repoUrl, "⌥ Code")}</div></section>
        <section class="blk"><h2>Why now</h2>${para(app.project.whyNow)}</section>
        ${app.project.competitors ? `<section class="blk"><h2>Competition</h2>${para(app.project.competitors)}</section>` : ""}
        <section class="blk"><h2>Progress</h2>${para(app.project.traction)}</section>
        <section class="blk"><h2>Why a token</h2>${para(app.funding.tokenRationale)}</section>
        <section class="blk"><h2>Funding plan</h2>${para(app.funding.useOfFunds)}
          <ol class="ms">${app.funding.milestones.map((ms, i) => `<li><span class="n">${i + 1}</span><div><b>${esc(ms.title)}</b><p>${esc(ms.deliverable)}</p></div><span class="mono">wk ${ms.weeks}</span></li>`).join("")}</ol>
          <ul class="commit">
            <li class="${app.funding.commitments.devLock ? "y" : "n"}">No dev-token sales for ${DEAL.devLockDays} days</li>
            <li class="${app.funding.commitments.publicUpdates ? "y" : "n"}">Public updates every two weeks</li>
            <li class="${app.funding.commitments.openSource ? "y" : "n"}">Open-source core</li>
          </ul>
        </section>

        <section class="blk" id="updates"><h2>Updates</h2>
          ${isFounder ? `<form class="post" id="post"><textarea name="text" rows="3" maxlength="1000" placeholder="What shipped? Numbers, links, what's next."></textarea><div class="post-foot"><input name="link" type="url" placeholder="Link (optional)"><button class="btn solid sm">Post update</button></div></form>` : ""}
          ${app.updates.length ? `<ul class="updates">${app.updates.map((u) => `<li><span class="mono">${ago(u.at)}</span><p>${esc(u.text)}</p>${link(u.link)}</li>`).join("")}</ul>` : '<p class="mute">No updates yet.</p>'}
        </section>
      </div>

      <aside class="p-side">
        ${isAdmin() ? reviewerPanel(app) : ""}
        <section class="side-card"><h4>Team</h4>
          <ul class="team">${app.team.founders.map((f) => `<li><b>${esc(f.name)}</b><span class="mute">${esc(f.role)}</span><span class="tl">${link(f.x, "X")}${link(f.github, "GitHub")}${link(f.linkedin, "LinkedIn")}</span></li>`).join("")}</ul>
          <p class="small">${app.team.fullTime ? "Full time" : "Part time"}${app.team.knownFor ? ` · ${esc(app.team.knownFor)}` : ""}</p>
          <details><summary>Most impressive thing built</summary>${para(app.team.impressive)}</details>
          <p class="small mono">Founder wallet <a href="${explorerAddr(app.founder)}" target="_blank" rel="noopener">${esc(short(app.founder))}</a></p>
        </section>
        <section class="side-card"><h4>Funding ledger</h4>
          ${app.funding_txs.length ? `<ul class="ledger">${app.funding_txs.map((t) => `<li><span>${t.kind === "curve-buy" ? "Conviction buy" : "Grant"}${t.note ? ` · ${esc(t.note)}` : ""}</span><b>${sol(t.sol, 2)}</b>${t.sig.startsWith("demo") ? '<span class="mono mute">demo</span>' : `<a class="mono" href="${explorerTx(t.sig)}" target="_blank" rel="noopener">${esc(short(t.sig, 5))} ↗</a>`}</li>`).join("")}</ul>` : `<p class="mute small">${backed ? "Funding is on its way." : "Funding starts after approval."}</p>`}
        </section>
        <section class="side-card"><h4>Timeline</h4>
          <ol class="timeline">${app.history.map((h) => `<li class="s-${h.status}"><b>${esc(STATUS_LABEL[h.status])}</b><span class="mono">${date(h.at)}</span></li>`).join("")}</ol>
          ${isLive() && app.launchSig ? `<p class="small"><a href="${explorerTx(app.launchSig)}" target="_blank" rel="noopener">Launch transaction ↗</a></p>` : ""}
        </section>
        <section class="side-card"><h4>Verify</h4><p class="small">Anyone can check this coin's status:</p><code class="block">GET /api/verify?mint=${esc(short(app.mint, 6))}</code></section>
      </aside>
    </div>`;

    $("#ca", root).addEventListener("click", () => copy(app.mint));
    wirePost(app);
    wireReviewer(app);
    if (conn) {
      holdingShare(conn, app.founder, app.mint).then((share) => {
        const el = root.querySelector("#hold");
        if (el) el.textContent = share === null ? "—" : pct(share);
      });
    }
  }

  function reviewBlock(app: Application) {
    const r = app.review!;
    const avg = avgScore(r.scores);
    return `<section class="blk review ${app.status === "rejected" ? "neg" : "pos"}">
      <div class="rv-head"><h2>Review</h2><div class="avg"><b>${avg.toFixed(1)}</b><span class="mono">/ 5 avg</span></div></div>
      <ul class="scores">${SCORE_AREAS.map(([k, label]) => `<li><span>${label}</span><div class="sbar"><i style="width:${(r.scores[k] / 5) * 100}%"></i></div><b>${r.scores[k]}</b></li>`).join("")}</ul>
      <blockquote>${para(r.notes)}</blockquote>
      <p class="mono small">Signed by reviewer ${esc(short(r.reviewer))} · ${date(r.at)}</p>
    </section>`;
  }

  function reviewerPanel(app: Application) {
    const r = app.review?.scores;
    const moves: Status[] = ({ submitted: ["reviewing"], reviewing: ["submitted"], approved: ["reviewing"], funded: [], rejected: ["reviewing"] } as Record<Status, Status[]>)[app.status];
    const canDecide = app.status === "submitted" || app.status === "reviewing";
    const canFund = app.status === "approved" || app.status === "funded";
    const buyDone = app.funding_txs.some((t) => t.kind === "curve-buy");
    const granted = app.funding_txs.filter((t) => t.kind === "grant").reduce((s, t) => s + t.sol, 0);
    return `<section class="side-card reviewer"><h4>Reviewer desk ${isLive() ? "" : '<span class="pill">demo</span>'}</h4>
      ${moves.map((s) => `<button class="btn ghost sm" data-move="${s}">Move to ${esc(STATUS_LABEL[s].toLowerCase())}</button>`).join(" ")}
      ${canDecide ? `
      <form id="decide" class="decide">
        ${SCORE_AREAS.map(([k, label, hint]) => `<label class="srow" title="${esc(hint)}"><span>${label}</span><input type="range" min="1" max="5" step="1" name="${k}" value="${r?.[k] ?? 3}"><output>${r?.[k] ?? 3}</output></label>`).join("")}
        <p class="mono small" id="avgOut"></p>
        <textarea name="notes" rows="4" placeholder="Public notes: why you're backing or passing. Founders and traders read this."></textarea>
        <div class="row2"><button class="btn solid sm" data-decide="approved">Approve</button><button class="btn ghost sm" data-decide="rejected">Reject</button></div>
      </form>` : ""}
      ${canFund ? `
      <div class="fund">
        <p class="small">Treasury: ${env.treasury ? esc(short(env.treasury)) : "your connected wallet"}. Funded so far: ${sol(app.funding_txs.reduce((s, t) => s + t.sol, 0))}.</p>
        <button class="btn solid sm wide" id="buy" ${buyDone ? "disabled" : ""}>${buyDone ? "Conviction buy done" : `Conviction buy · ${DEAL.convictionBuySol} SOL`}</button>
        <div class="grant"><input type="number" id="grantSol" min="0.1" step="0.1" value="${Math.max(0.1, Math.min(app.funding.askSol - granted, app.funding.askSol / app.funding.milestones.length)).toFixed(1)}" aria-label="Grant SOL"><input id="grantNote" placeholder="Milestone ${Math.min(app.funding.milestones.length, app.funding_txs.filter((t) => t.kind === "grant").length + 1)}" aria-label="Grant note"><button class="btn ghost sm" id="grant">Send grant</button></div>
        <p class="small mute">Granted ${sol(granted, 1)} of ${sol(app.funding.askSol, 1)} asked.</p>
        <details><summary class="small">Record an existing transaction</summary>
          <div class="grant"><select id="recKind"><option value="grant">Grant</option><option value="curve-buy">Curve buy</option></select><input id="recSol" type="number" step="0.1" placeholder="SOL"><input id="recSig" placeholder="Signature"><button class="btn ghost sm" id="rec">Record</button></div>
        </details>
      </div>` : ""}
    </section>`;
  }

  async function act(action: SignedAction, label: string) {
    try {
      const req = await sign(action);
      const app = await backend.review(req);
      upsert(app);
      toast(label);
      draw(app);
    } catch (e) {
      toast(errMsg(e), "err");
    }
  }

  function wirePost(app: Application) {
    const f = root.querySelector<HTMLFormElement>("#post");
    f?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = (f.elements.namedItem("text") as HTMLTextAreaElement).value.trim();
      const lk = (f.elements.namedItem("link") as HTMLInputElement).value.trim() || undefined;
      if (text.length < 10) return toast("Updates are at least 10 characters.", "err");
      act({ action: "update", mint: app.mint, body: { text, link: lk } }, "Update posted");
    });
  }

  function wireReviewer(app: Application) {
    $$("[data-move]", root).forEach((b) => b.addEventListener("click", () =>
      act({ action: "status", mint: app.mint, body: { status: b.dataset.move as Status } }, `Moved to ${STATUS_LABEL[b.dataset.move as Status].toLowerCase()}`)));

    const f = root.querySelector<HTMLFormElement>("#decide");
    if (f) {
      const read = (): Scores => Object.fromEntries(SCORE_AREAS.map(([k]) => [k, Number((f.elements.namedItem(k) as HTMLInputElement).value)])) as unknown as Scores;
      const upd = () => {
        $$<HTMLInputElement>("input[type=range]", f).forEach((r) => (r.nextElementSibling!.textContent = r.value));
        const avg = avgScore(read());
        $("#avgOut", f).textContent = `Average ${avg.toFixed(1)} · approval needs ${DEAL.approveThreshold}+`;
        $<HTMLButtonElement>('[data-decide="approved"]', f).disabled = avg < DEAL.approveThreshold;
      };
      f.addEventListener("input", upd);
      upd();
      $$("[data-decide]", f).forEach((b) => b.addEventListener("click", (e) => {
        e.preventDefault();
        const status = b.dataset.decide as Status;
        const notes = (f.elements.namedItem("notes") as HTMLTextAreaElement).value.trim();
        if (notes.length < 20) return toast("Write at least a sentence of public notes.", "err");
        act({ action: "status", mint: app.mint, body: { status, scores: read(), notes } }, status === "approved" ? "Approved — now fund it" : "Rejected");
      }));
    }

    root.querySelector("#buy")?.addEventListener("click", () => fund(app, "curve-buy", DEAL.convictionBuySol, "Conviction buy"));
    root.querySelector("#grant")?.addEventListener("click", () => {
      const amt = Number($<HTMLInputElement>("#grantSol", root).value);
      if (!(amt > 0)) return toast("Enter a grant amount.", "err");
      fund(app, "grant", amt, $<HTMLInputElement>("#grantNote", root).value.trim() || $<HTMLInputElement>("#grantNote", root).placeholder);
    });
    root.querySelector("#rec")?.addEventListener("click", () => {
      const kind = $<HTMLSelectElement>("#recKind", root).value as "grant" | "curve-buy";
      const amt = Number($<HTMLInputElement>("#recSol", root).value);
      const sig = $<HTMLInputElement>("#recSig", root).value.trim();
      if (!(amt > 0) || sig.length < 40) return toast("Enter the SOL amount and the transaction signature.", "err");
      act({ action: "fund", mint: app.mint, body: { kind, sol: amt, sig, note: "Recorded" } }, "Recorded");
    });
  }

  async function fund(app: Application, kind: "curve-buy" | "grant", amount: number, note: string) {
    const st = stepper([kind === "curve-buy" ? `Buy ${amount} SOL of $${app.coin.symbol} on the curve` : `Send ${amount} SOL to the founder`, "Sign the funding record", "Verify on chain & publish"]);
    const m = modal(`<h3>${kind === "curve-buy" ? "Conviction buy" : "Milestone grant"}</h3>${st.html}<p class="err" id="mErr" hidden></p><div class="m-foot" id="mFoot"></div>`, { closable: false });
    let k = 0;
    st.set(m.el, 0, "active");
    try {
      let sig: string;
      if (isLive()) {
        const me = await ensureWallet();
        sig = kind === "curve-buy" ? await convictionBuy(conn!, me, app.mint, amount) : await sendGrant(conn!, me, app.founder, amount);
      } else {
        await new Promise((r) => setTimeout(r, 800));
        sig = `demo-${fakeSig()}`;
      }
      st.set(m.el, 0, "done"); k = 1; st.set(m.el, 1, "active");
      const req = await sign({ action: "fund", mint: app.mint, body: { kind, sol: amount, sig, note } });
      st.set(m.el, 1, "done"); k = 2; st.set(m.el, 2, "active");
      const updated = await backend.review(req);
      st.set(m.el, 2, "done");
      upsert(updated);
      m.close();
      toast(kind === "curve-buy" ? "Conviction buy recorded" : "Grant sent and recorded");
      draw(updated);
    } catch (e) {
      st.set(m.el, k, "fail");
      const err = $("#mErr", m.el);
      err.hidden = false;
      err.textContent = errMsg(e) + (k > 0 ? " The transaction went through; use “Record an existing transaction” to publish it." : "");
      $("#mFoot", m.el).innerHTML = '<button class="btn ghost" id="mClose">Close</button>';
      $("#mClose", m.el).addEventListener("click", m.close);
    }
  }
}

function celebrate(a: Application) {
  const m = modal(`<div class="celebrate">${coinImg(a, "coin xl")}<h3>$${esc(a.coin.symbol)} is live. You've applied.</h3>
    <p>Your application is in the public queue. Reviewers usually decide within 7 days. Meanwhile:</p>
    <ul><li>Share your project page; traders can see it's applied, not yet backed.</li><li>Post updates here as you ship. Reviewers read them.</li><li>Keep your dev tokens: your holding is public.</li></ul>
    <div class="row2"><button class="btn solid" id="cShare">Copy project link</button><button class="btn ghost" id="cClose">Done</button></div></div>`);
  $("#cShare", m.el).addEventListener("click", () => copy(location.href.replace(/\?new=1$/, "")));
  $("#cClose", m.el).addEventListener("click", () => { m.close(); history.replaceState(null, "", location.hash.replace(/\?new=1$/, "")); });
}
