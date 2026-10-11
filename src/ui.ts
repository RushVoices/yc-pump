// Small DOM helpers shared by the views.
import type { Application, Status } from "../shared/app";
import { STATUS_LABEL } from "./data";

/** Escapes text for HTML. Every user-supplied string goes through this. */
export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s) and data:image links are rendered as links or images. */
export const safeUrl = (u?: string) => (u && /^(https?:\/\/|data:image\/)/i.test(u) ? esc(u) : "");

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export const short = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
export const sol = (n: number, d = 2) => `${n.toLocaleString(undefined, { maximumFractionDigits: d })} SOL`;
export const pct = (n: number) => `${(n * 100).toFixed(n < 0.01 && n > 0 ? 2 : 1)}%`;

export function ago(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export const date = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function badge(s: Status, batch?: string): string {
  const label = s === "approved" || s === "funded" ? `${STATUS_LABEL[s]}${batch ? ` · ${batch}` : ""}` : STATUS_LABEL[s];
  return `<span class="badge s-${s}">${s === "approved" || s === "funded" ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1l1.9 1.4 2.3-.1.7 2.2 1.9 1.4-.8 2.2.8 2.2-1.9 1.4-.7 2.2-2.3-.1L8 15l-1.9-1.4-2.3.1-.7-2.2-1.9-1.4.8-2.2-.8-2.2 1.9-1.4.7-2.2 2.3.1z" fill="currentColor"/><path d="M5.3 8.2l1.8 1.8 3.6-3.8" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}${esc(label)}</span>`;
}

export const coinImg = (a: Application, cls = "coin") =>
  `<img class="${cls}" src="${safeUrl(a.coin.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;

// ---- toast ---------------------------------------------------------------------------

let toastTimer = 0;
export function toast(msg: string, kind: "ok" | "err" = "ok") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.className = "toast"), kind === "err" ? 7000 : 3500);
}

export const errMsg = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  if (/User rejected|rejected the request|declined/i.test(m)) return "You cancelled in your wallet.";
  return m;
};

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Couldn't copy", "err"); }
}

// ---- modal ---------------------------------------------------------------------------

export function modal(html: string, opts: { closable?: boolean } = {}): { el: HTMLElement; close: () => void } {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${opts.closable !== false ? '<button class="x" aria-label="Close">×</button>' : ""}${html}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  const close = () => { wrap.classList.remove("open"); setTimeout(() => wrap.remove(), 200); document.removeEventListener("keydown", onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && opts.closable !== false) close(); };
  document.addEventListener("keydown", onKey);
  if (opts.closable !== false) {
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.querySelector(".x")!.addEventListener("click", close);
  }
  return { el: wrap.querySelector(".modal")!, close };
}

/** A step list for multi-step actions (launch, fund). */
export function stepper(steps: string[]) {
  const html = `<ol class="steps">${steps.map((s) => `<li><i></i><span>${esc(s)}</span></li>`).join("")}</ol>`;
  return {
    html,
    set(root: HTMLElement, i: number, state: "active" | "done" | "fail") {
      const li = root.querySelectorAll(".steps li")[i];
      if (li) li.className = state;
    },
  };
}
