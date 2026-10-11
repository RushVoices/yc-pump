import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
import "./styles.css";

import { isLive, env, initMode } from "./chain/config";
import { connectWallet, disconnectWallet, hasWallet, onWallet, walletKey } from "./chain/wallet";
import { backend } from "./data";
import { initState, loadAll, state } from "./state";
import { $, $$, errMsg, short, toast } from "./ui";
import { renderHome } from "./views/home";
import { renderLaunchpad } from "./views/launchpad";
import { renderApply } from "./views/apply";
import { renderProject } from "./views/project";
import { renderDocs } from "./views/docs";
import { renderReview } from "./views/review";

const view = $("#view");

async function route() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const params = new URLSearchParams(qs);
  const parts = path.split("/").filter(Boolean);
  const top = parts[0] ?? "";
  $$(".links a").forEach((a) => a.classList.toggle("cur", a.getAttribute("href") === `#/${top}`));
  if (!state.loaded) {
    view.innerHTML = '<div class="loading"><i></i></div>';
    try { await loadAll(); } catch (e) { toast(`Couldn't load applications: ${errMsg(e)}`, "err"); state.loaded = true; }
  }
  const scroll = !(top === "docs" && parts[1]);
  switch (top) {
    case "": renderHome(view); break;
    case "launchpad": renderLaunchpad(view, params); break;
    case "apply": renderApply(view); break;
    case "p": await renderProject(view, parts[1] ?? "", params); break;
    case "docs": renderDocs(view, parts[1]); break;
    case "review": renderReview(view, route); break;
    default: view.innerHTML = '<section class="page-head"><h1 class="display">Page not found</h1><p class="sub"><a href="#/">Home</a></p></section>';
  }
  if (scroll) window.scrollTo({ top: 0 });
}

// ---- wallet button ----------------------------------------------------------------

const wb = $<HTMLButtonElement>("#walletBtn");
const paintWallet = (k: string | null) => {
  wb.textContent = k ? short(k) : hasWallet() || !isLive() ? "Connect wallet" : "Get a wallet";
  wb.classList.toggle("on", !!k);
};
onWallet((k) => { paintWallet(k); const top = location.hash.split("/")[1] ?? ""; if (top.startsWith("review") || top.startsWith("p")) route(); });
wb.addEventListener("click", async () => {
  if (walletKey()) { await disconnectWallet(); toast("Disconnected"); return; }
  if (!hasWallet()) { toast(isLive() ? "No Solana wallet found. Install Phantom, Solflare or Backpack, then reload." : "Demo mode doesn't need a wallet: launches and reviews are simulated.", "err"); return; }
  try { await connectWallet(); } catch (e) { toast(errMsg(e), "err"); }
});
// The mode (live vs demo) comes from the API, so everything below waits for it.
async function boot() {
  await initMode();
  initState();
  paintWallet(null);
  if (hasWallet()) connectWallet(true).catch(() => {});

  // ---- chrome --------------------------------------------------------------------------

  const banner = $("#mode");
  if (!isLive()) {
    banner.hidden = false;
    banner.innerHTML = 'Demo mode: launches are simulated and you can act as a reviewer. Everything stays in this browser. <button class="linkbtn" id="resetDemo">Reset demo</button>';
    $("#resetDemo").addEventListener("click", () => { backend.resetDemo(); state.loaded = false; route(); toast("Demo reset"); });
  } else if (env.cluster === "devnet") {
    banner.hidden = false;
    banner.textContent = "Devnet: coins and SOL here are test-only.";
  }

  window.addEventListener("scroll", () => $(".nav").classList.toggle("scrolled", scrollY > 8), { passive: true });
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("menu-open"));
  window.addEventListener("hashchange", () => { document.body.classList.remove("menu-open"); route(); });
  setInterval(() => {
    // Refresh in the background on list pages so new launches and decisions show up.
    const top = location.hash.split("/")[1] ?? "";
    if (top === "" || top.startsWith("launchpad")) loadAll().then(() => { if (!document.querySelector(".modal-wrap")) route(); }).catch(() => {});
  }, 30_000);
  route();
}
boot();
