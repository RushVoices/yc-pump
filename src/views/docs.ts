// Founder docs: the deal, the process, the bar, and what happens on chain.
import { DEAL } from "../../shared/app";
import { env } from "../chain/config";
import { $$, esc, short } from "../ui";

const D = DEAL;

const SECTIONS: { id: string; title: string; body: () => string }[] = [
  {
    id: "overview", title: "Overview", body: () => `
    <p class="big">YC Pump is an accelerator for tech projects that launch a coin. Founders apply by launching their coin on Pump.fun through this site. Reviewers read every application, score it in public, and back the best ones with SOL and a badge traders can check.</p>
    <p>Pump.fun made launching a coin take seconds. That's great for memes and terrible for anyone trying to tell which coins have a real product and a real team behind them. YC Pump adds the missing filter: a hard application, a public review, and money that only moves when founders ship.</p>
    <div class="callout"><b>In one line:</b> launch = apply · review is public · backed coins get a ${D.convictionBuySol} SOL conviction buy and up to ${D.maxAskSol} SOL in milestone grants · nobody takes your equity or your tokens.</div>
    <h3>Who it's for</h3>
    <ul><li>Teams building software, hardware, AI, infra, DePIN, devtools, or consumer products where a token has a job to do.</li><li>Solo founders and teams, full or part time, anywhere in the world.</li><li>Projects at any stage, from a working prototype to revenue. Idea-only applications are accepted but rarely backed.</li></ul>
    <h3>Who it isn't for</h3>
    <ul><li>Coins with no product plan. Launch those on Pump.fun directly.</li><li>Anyone unwilling to keep their dev tokens for ${D.devLockDays} days.</li></ul>`,
  },
  {
    id: "funding", title: "How funding works", body: () => `
    <p>Every backed project gets the same standard deal. There's nothing to negotiate.</p>
    <table class="deal">
      <tr><th>Backed badge</th><td>Your coin is marked <b>Backed · batch</b> across the site, and <code>/api/verify</code> returns <code>backed: true</code> for it. This is the trust signal: it can't be bought, only earned through review.</td></tr>
      <tr><th>Conviction buy</th><td><b>${D.convictionBuySol} SOL</b> of your coin bought by the YC Pump treasury on the bonding curve right after approval. It's public, on chain, and linked from your page. The treasury doesn't sell these tokens for ${D.treasuryLockDays} days, then sells no more than 10% of them in any month.</td></tr>
      <tr><th>Milestone grants</th><td>Up to <b>${D.maxAskSol} SOL</b>, the amount you asked for, paid straight to your founder wallet as each milestone ships. Grants are not loans and not a purchase of anything.</td></tr>
      <tr><th>What we take</th><td><b>Nothing.</b> No equity, no token allocation, no share of creator fees. Your creator fees on Pump.fun stay 100% yours.</td></tr>
    </table>
    <h3>How grants are paid</h3>
    <ol><li>When you apply, you set ${D.minMilestones}–${D.maxMilestones} milestones, each with a deliverable anyone can check and a target week.</li><li>When a milestone ships, post an update on your project page with the proof (a link, a dashboard, a release).</li><li>A reviewer checks it and sends that milestone's share of the grant from the treasury. The transaction is verified on chain and appears in your page's funding ledger.</li><li>Missed a date? Post an update saying so and why. Late is fine; silent is not.</li></ol>
    <h3>Where the money comes from</h3>
    <p>The YC Pump treasury${env.treasury ? ` (<code>${esc(short(env.treasury, 6))}</code>)` : ""}. Every outgoing payment is a public Solana transaction signed by a reviewer wallet and recorded against the project it funded.</p>`,
  },
  {
    id: "process", title: "Application process", body: () => `
    <ol class="tl-doc">
      <li><b>Write your application.</b> Five steps: team, product, funding, coin, launch. The form scores your application's strength as you write and tells you what's missing. Drafts save in your browser.</li>
      <li><b>Launch = apply.</b> One wallet approval creates your coin on Pump.fun (with an optional dev buy in the same transaction, so nobody buys before you). Then you sign your application, a free message signature. The API checks on chain that your wallet created the coin before filing it, so nobody can apply with someone else's coin.</li>
      <li><b>Applied.</b> Your coin appears on the Launchpad with an <i>Applied</i> label. It's tradeable immediately; the label tells traders it hasn't been reviewed.</li>
      <li><b>In review.</b> A reviewer picks it up, reads everything, opens your demo and repo, and may contact you on X or Telegram.</li>
      <li><b>Decision.</b> Usually within 7 days. Approved or not, the five scores and the reviewer's notes are published on your page, signed by the reviewer's wallet.</li>
      <li><b>Backed.</b> The conviction buy lands, your coin joins the current batch (for example F26), and milestone grants start.</li>
    </ol>
    <h3>If you're not selected</h3>
    <p>Your coin stays live on Pump.fun; it's yours. The notes say what would change the decision. A reviewer can move the application back into review later, so keep shipping and posting updates on your page.</p>
    <h3>Batches</h3>
    <p>Applications are reviewed continuously and grouped into batches by season: <b>W</b> (Jan–Apr), <b>S</b> (May–Aug), <b>F</b> (Sep–Dec). Your batch is the season you applied in.</p>`,
  },
  {
    id: "criteria", title: "What we look for", body: () => `
    <p>Every application is scored 1–5 in five areas. Approval needs an average of <b>${D.approveThreshold} or higher</b>, and the reviewer's judgment on top of that.</p>
    <table class="rubric">
      <tr><th>Team</th><td>Can these people build this? We look for evidence of shipping: code, products, past work. Real names and linked profiles help; anonymity is allowed but must be made up for with public work.</td></tr>
      <tr><th>Product</th><td>Does it work, and is it meaningfully better? A demo and a repo are the strongest evidence you can give.</td></tr>
      <tr><th>Market</th><td>How many people have this problem, and how badly? Why will they choose you?</td></tr>
      <tr><th>Traction</th><td>Users, revenue, pilots, commits, waitlists. Numbers over adjectives. "Nothing yet" scores low but honestly.</td></tr>
      <tr><th>Token design</th><td>Does the token do a job inside the product: paying for a resource, securing a network, rewarding contributors, governing something real? "To raise money" scores 1.</td></tr>
    </table>
    <h3>Things that sink applications</h3>
    <ul><li>Claims we can't check, or that turn out false.</li><li>Selling dev tokens during review.</li><li>Copy-pasted whitepaper language instead of plain answers.</li><li>Tokens whose only use is "staking for rewards" paid out of new buyers.</li></ul>
    <h3>Things that help</h3>
    <ul><li>A 60-second demo video.</li><li>Public code with recent commits.</li><li>Specific milestones a stranger could verify.</li><li>Updates on your page while you wait.</li></ul>`,
  },
  {
    id: "commitments", title: "Founder commitments", body: () => `
    <p>Applying means agreeing to these. Your founder wallet and your page make most of them publicly checkable.</p>
    <ul class="checks">
      <li><b>Dev-token lock (required).</b> No selling or transferring your dev-buy tokens for ${D.devLockDays} days after launch. Your founder wallet's share of supply is shown live on your page.</li>
      <li><b>Public updates.</b> At least every two weeks while funded, posted on your page and signed by your wallet.</li>
      <li><b>Honesty.</b> Misrepresenting your team, traction or code gets the application rejected or the Backed badge removed, with the reason published.</li>
      <li><b>Open source (optional).</b> If you committed to it, reviewers expect the core code to be public before the last grant.</li>
    </ul>
    <p>Breaking a commitment while backed means grants stop, the badge is removed, and the reason is published on your page.</p>`,
  },
  {
    id: "launch", title: "Launch mechanics", body: () => `
    <p>What actually happens on chain when you press <b>Launch coin &amp; submit</b>:</p>
    <ol>
      <li>Your image and coin details are pinned to IPFS. The metadata format is Pump.fun's own, so wallets and explorers show your coin properly.</li>
      <li>Your wallet signs one transaction with Pump's <code>create_v2</code> instruction, plus <code>buy_v2</code> if you set a dev buy. You are the coin's creator on Pump and receive its creator fees. YC Pump never holds your keys or your coin.</li>
      <li>Your wallet signs a plain-text message containing your coin address, a SHA-256 digest of your whole application, and the time. Signing a message costs nothing.</li>
      <li>The API verifies the signature, reads your coin's bonding curve on chain, and confirms its <code>creator</code> is your wallet. Only then is the application filed.</li>
    </ol>
    <p>Coins use Pump.fun's standard bonding curve: 1 billion supply, about 800 million sold on the curve, graduating to PumpSwap when the curve completes. YC Pump doesn't change anything about how your coin trades.</p>
    <h3>Costs</h3>
    <p>About 0.02 SOL in network and Pump fees, plus your dev buy. YC Pump charges nothing.</p>
    <h3>If something fails halfway</h3>
    <p>If your coin launched but the application didn't file (a closed wallet popup, a network blip), the form remembers the coin. Go back to <a href="#/apply">Apply</a> and press <b>Sign &amp; submit application</b>. Nothing is relaunched.</p>`,
  },
  {
    id: "trust", title: "Trust & verification", body: () => `
    <p>The Backed badge is only worth something if it can't be faked. Here's what backs it up:</p>
    <ul>
      <li><b>Creator check.</b> An application is accepted only from the wallet that created the coin on Pump, read from the coin's bonding curve.</li>
      <li><b>Signatures everywhere.</b> Applications are signed by founders; decisions, scores and funding records are signed by reviewer wallets. Each signature covers a digest of exactly what was submitted.</li>
      <li><b>On-chain funding.</b> A funding record is accepted only if its transaction exists, succeeded, was signed by the reviewer, and involves this coin (buys) or this founder (grants).</li>
      <li><b>Everything public.</b> Rejections included.</li>
    </ul>
    <h3>Verify API</h3>
    <p>Check any coin from a wallet, bot, or site:</p>
    <pre><code>GET /api/verify?mint=&lt;coin address&gt;

{
  "mint": "…",
  "backed": true,
  "status": "funded",
  "batch": "F26",
  "name": "Tessera",
  "symbol": "TSRA",
  "founder": "…",
  "fundedSol": 15,
  "score": 4.4
}</code></pre>
    <p><code>backed</code> is <code>true</code> only for <i>approved</i> and <i>funded</i>. A coin that merely applied returns <code>backed: false</code> with <code>status: "submitted"</code>. Responses allow cross-origin requests.</p>
    <p>Other endpoints: <code>GET /api/applications</code> (everything), <code>GET /api/application?mint=…</code> (one).</p>`,
  },
  {
    id: "after", title: "After you're backed", body: () => `
    <ul>
      <li><b>Ship milestones, post proof.</b> Each update on your page is signed by your wallet and timestamped.</li>
      <li><b>Get paid per milestone.</b> Reviewers send grants as milestones are verified.</li>
      <li><b>Keep your creator fees.</b> They're yours on Pump.fun, always.</li>
      <li><b>Demo day.</b> At the end of each batch, backed founders present to the community.</li>
    </ul>`,
  },
  {
    id: "faq", title: "FAQ", body: () => `
    <dl class="faq">
      <dt>Do I have to launch a coin to apply?</dt><dd>Yes. The launch is the application: it proves you're committed and gives the review something real to attach to.</dd>
      <dt>Can I apply with a coin I already launched elsewhere?</dt><dd>Not through the form today. Coins must be created through YC Pump so the application and the launch are one verified flow.</dd>
      <dt>Is my coin tradeable before I'm approved?</dt><dd>Yes, from the moment it launches. The Launchpad labels it <i>Applied</i> until a decision.</dd>
      <dt>Does YC Pump own any of my project?</dt><dd>No. No equity, no tokens, no fee share.</dd>
      <dt>How long does review take?</dt><dd>Most decisions land within 7 days.</dd>
      <dt>Can I edit my application?</dt><dd>The signed application is fixed: that's what makes it trustworthy. Add context with updates on your page.</dd>
      <dt>I'm anonymous. Can I apply?</dt><dd>Yes, but the team score depends on evidence you can build. Link GitHub and past work.</dd>
      <dt>Is this affiliated with Y Combinator or Pump.fun?</dt><dd>No. YC Pump is independent and is not affiliated with, endorsed by, or connected to Y Combinator or Pump.fun.</dd>
    </dl>`,
  },
  {
    id: "risks", title: "Risks & disclaimer", body: () => `
    <p>Coins are volatile and most fail, backed or not. <b>Backed means a reviewer found the application credible; it is not investment advice, a guarantee, or a prediction of price.</b> YC Pump doesn't control any coin's price, liquidity or creator. Grants and conviction buys are made at YC Pump's discretion and may stop at any time. Do your own research, and never put in money you can't lose.</p>
    <p>Rules on tokens, grants and promotion differ by country. Founders are responsible for complying with the laws that apply to them.</p>`,
  },
];

export function renderDocs(root: HTMLElement, section?: string) {
  root.innerHTML = `
  <section class="page-head"><p class="eyebrow">Docs</p><h1 class="display">Funding, the process, and the bar.</h1></section>
  <div class="docs">
    <nav class="toc" aria-label="Docs sections">${SECTIONS.map((s) => `<a href="#/docs/${s.id}" data-id="${s.id}">${s.title}</a>`).join("")}<a class="btn solid sm" href="#/apply">Apply</a></nav>
    <article class="doc">${SECTIONS.map((s) => `<section id="d-${s.id}" class="doc-sec"><h2>${s.title}</h2>${s.body()}</section>`).join("")}</article>
  </div>`;

  const links = $$<HTMLAnchorElement>(".toc a[data-id]", root);
  const mark = (id: string) => links.forEach((l) => l.classList.toggle("cur", l.dataset.id === id));
  links.forEach((l) => l.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", l.getAttribute("href")!);
    document.getElementById(`d-${l.dataset.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    mark(l.dataset.id!);
  }));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) mark(en.target.id.slice(2));
  }, { rootMargin: "-20% 0px -70% 0px" });
  $$(".doc-sec", root).forEach((s) => io.observe(s));
  if (section) requestAnimationFrame(() => document.getElementById(`d-${section}`)?.scrollIntoView({ block: "start" }));
  mark(section || "overview");
}
