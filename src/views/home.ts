import { DEAL } from "../../shared/app";
import { isBacked } from "../data";
import { state } from "../state";
import { card } from "./launchpad";

export function renderHome(root: HTMLElement) {
  const apps = state.apps;
  const backed = apps.filter((a) => isBacked(a.status));
  const decided = apps.filter((a) => isBacked(a.status) || a.status === "rejected").length;
  const deployed = apps.reduce((s, a) => s + a.funding_txs.reduce((x, t) => x + t.sol, 0), 0);
  const rate = decided ? Math.round((backed.length / decided) * 100) : 0;
  const latest = backed.slice(0, 6);

  root.innerHTML = `
  <section class="hero">
    <p class="eyebrow">The accelerator for coins with a product behind them</p>
    <h1 class="display">Launch your startup's coin.<br><span class="hot">Get backed.</span></h1>
    <div class="hero-row">
      <p class="lede">On YC Pump, launching a coin <em>is</em> your application. Founders launch on Pump.fun, apply in the same step, and get reviewed in public. Approved projects earn the <b>Backed</b> badge, a ${DEAL.convictionBuySol} SOL conviction buy, and up to ${DEAL.maxAskSol} SOL in milestone grants.</p>
      <div class="cta">
        <a class="btn solid lg" href="#/apply">Apply by launching</a>
        <a class="btn ghost lg" href="#/docs/funding">How funding works</a>
      </div>
    </div>
    <dl class="stats">
      <div><dt>Applications</dt><dd>${apps.length}</dd></div>
      <div><dt>Backed</dt><dd>${backed.length}</dd></div>
      <div><dt>Acceptance rate</dt><dd>${decided ? `${rate}%` : "—"}</dd></div>
      <div><dt>SOL deployed</dt><dd>${deployed.toLocaleString(undefined, { maximumFractionDigits: 1 })}</dd></div>
    </dl>
  </section>

  <section class="section">
    <div class="sec-head"><p class="eyebrow">How it works</p><h2 class="display">One transaction to apply. A public bar to clear.</h2></div>
    <ol class="how">
      <li><span class="n">01</span><h3>Write the application</h3><p>Team, problem, product, traction, milestones and why your project needs a token. The form tells you how strong your answers are as you write.</p></li>
      <li><span class="n">02</span><h3>Launch = apply</h3><p>Your coin is created on Pump.fun from your wallet and your signed application is filed against it. Only the coin's creator can apply with it.</p></li>
      <li><span class="n">03</span><h3>Public review</h3><p>Reviewers score team, product, market, traction and token design. Scores and notes are published, approved or not.</p></li>
      <li><span class="n">04</span><h3>Backed + funded</h3><p>Approved coins get the Backed badge, a ${DEAL.convictionBuySol} SOL treasury buy on the curve, and SOL grants as each milestone ships.</p></li>
    </ol>
  </section>

  <section class="section">
    <div class="sec-head split"><div><p class="eyebrow">Backed projects</p><h2 class="display">The current batch</h2></div><a class="btn ghost" href="#/launchpad?f=backed">See all</a></div>
    ${latest.length ? `<div class="grid">${latest.map(card).join("")}</div>` : `<div class="empty-state"><h3>The first batch is open</h3><p>No projects are backed yet. Apply now and yours could be the first coin with the Backed badge.</p><a class="btn solid" href="#/apply">Start your application</a></div>`}
  </section>

  <section class="section">
    <div class="sec-head"><p class="eyebrow">Why it matters</p><h2 class="display">A badge that means something.</h2></div>
    <div class="trust">
      <div><h3>Verified creator</h3><p>The API checks on-chain that the wallet applying is the wallet that created the coin on Pump.</p></div>
      <div><h3>Signed applications</h3><p>Every answer is signed by the founder's wallet. Every decision is signed by a reviewer's wallet.</p></div>
      <div><h3>Money on chain</h3><p>Every conviction buy and grant links to its Solana transaction, checked by the API before it's recorded.</p></div>
      <div><h3>Open verify API</h3><p>Wallets, bots and other sites can ask <code>/api/verify?mint=…</code> whether a coin is Backed.</p></div>
    </div>
  </section>

  <section class="final">
    <h2 class="display">Building something real?</h2>
    <p>Applications are reviewed continuously. Most decisions land within 7 days.</p>
    <div class="cta"><a class="btn solid lg" href="#/apply">Start your application</a><a class="btn ghost lg" href="#/docs/criteria">What we look for</a></div>
  </section>`;
}
