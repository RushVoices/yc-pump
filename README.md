# YC Pump

An accelerator for tech projects that launch a coin on Pump.fun. **Launching the coin is the application.** Founders fill in a YC-style application, launch their coin on Pump.fun from their own wallet, and sign the application in the same flow. Reviewers score it in public. Approved coins get the **Backed** badge, a 5 SOL conviction buy on the bonding curve, and up to 50 SOL in milestone grants.

> Not affiliated with Y Combinator or Pump.fun. Check the name with a lawyer before you launch publicly.

## Pages

| Route | What it is |
| --- | --- |
| `#/` | Landing page: the pitch, live stats, the current batch. |
| `#/launchpad` | Every application, filterable by status (Backed, In review, Applied, Not selected), category, search, sort by market cap or score. Live market cap and bonding-curve progress. |
| `#/apply` | 5-step application (Team → Product → Funding → Coin → Launch). Live "application strength" score with tips, per-field validation, draft autosave, image upload. The last step launches the coin and files the application. |
| `#/p/<mint>` | Public project page: the full application, reviewer scorecard and notes, funding ledger with Solscan links, founder's live share of supply, signed updates, timeline. Reviewers get decision + funding controls here; founders get an update box. |
| `#/docs` | Founder docs: the deal, process, criteria, commitments, on-chain mechanics, verify API, FAQ, risks. |
| `#/review` | Reviewer queue by status. |

## How launch = apply works

1. Image + metadata are pinned to IPFS (`/api/upload`, Pinata, or pump.fun's IPFS endpoint if no Pinata key).
2. The founder's wallet signs **one transaction**: Pump's `create_v2` (+ `buy_v2` dev buy) via `@pump-fun/pump-sdk`. The founder is the coin's creator and keeps all creator fees.
3. The wallet signs a plain-text message with the coin address and a SHA-256 of the whole application (`shared/app.ts → messageFor`).
4. `POST /api/applications` checks the signature, validates every field with the same rules as the form, reads the coin's bonding curve on chain to confirm the founder **is** its creator, and stores it.

If step 3 or 4 fails after the coin exists, the draft remembers the coin and the button becomes **Sign & submit application**. Nothing is relaunched.

Reviewer actions (status, scores, notes, funding) and founder updates are wallet-signed too. Approval requires an average score ≥ 3.5 and public notes. A funding record is accepted only if its transaction succeeded on chain, was signed by the reviewer, and touched the coin (conviction buy) or founder (grant).

## API

| | |
| --- | --- |
| `GET /api/verify?mint=` | Public trust check: `{ backed, status, batch, fundedSol, score, … }`. CORS-open. |
| `GET /api/applications` · `GET /api/application?mint=` | Read everything / one. |
| `POST /api/applications` | Signed application. |
| `POST /api/review` | Signed `status` / `fund` (reviewers) or `update` (founder). |
| `POST /api/upload` | Image + metadata to IPFS. |
| `GET /api/config` | Reviewer wallets, deal terms, whether storage and chain checks are configured. |

All routes live in `server/core.ts`; `api/*.ts` are thin Vercel wrappers, and `vite.config.ts` serves the same routes during `npm run dev`.

## Run it

```bash
cd yc-pump
npm install
npm run dev          # http://localhost:5173 — site + API together
```

## How the site decides live vs demo

On load the page asks `/api/config`. If the API answers (local dev, or Vercel with the `api/` functions), the site is **live**: launches create real coins on Pump.fun. A static copy with no API (or a build with `VITE_DEMO=1`) runs as the **demo** with simulated launches.

## Deploy (Vercel), launching real coins

1. Push this folder as the repo root and import it in Vercel (framework: Vite). It deploys with **no env vars** and launches on **mainnet** through the public RPC.
2. Recommended, in Vercel → Settings → Environment Variables:
   - `RPC_URL`: a Helius/Triton/QuickNode mainnet URL (the public RPC is rate-limited).
   - `ADMIN_WALLETS`: your reviewer wallet(s).
3. Storage: Vercel → Marketplace → **Upstash for Redis** → connect to the project (free tier). Redeploy. Without it, applications live in server memory and can disappear.

### What happens on chain when a founder presses Launch

- The browser talks to Solana only through `/api/rpc` (a proxy limited to the methods the site uses), so no RPC key is exposed.
- The launch transaction is built with Pump's SDK (`create_v2` + `buy_v2` dev buy) and **simulated** first. If the simulation fails, the same launch is built by PumpPortal (`/api/pumpportal` → pumpportal.fun local-transaction API, which may charge its own fee on the dev buy) and simulated again. The wallet is only asked to sign a transaction that just simulated cleanly.
- The founder's wallet signs first, then the new mint key signs, so wallet-added safety instructions can't invalidate the mint signature.
- The transaction is re-broadcast every 2 s and confirmation is polled (no websocket needed).
- The API then reads the coin's bonding curve on chain and only files the application if the creator is the founder's wallet.

## Tested so far

- `npm run typecheck`, `npm run build` and a local `vercel build` pass; every built API function loads and answers under Node 22.
- End to end in Chromium against a mock Solana RPC, mock PumpPortal and mock IPFS, with a scripted test wallet: launch (dry-run, signing, broadcast, confirmation), on-chain creator check, approval, conviction buy and on-chain funding check. The mock verified every signature on every transaction.
- Not run against the real Pump program from here (this environment can't reach Solana). The SDK build path is checked by the dry run on the user's side before any signature, with PumpPortal as the fallback.

## Before mainnet

- Rate-limit `/api/upload` and `/api/applications`.
- Use a multisig or a dedicated hot wallet with a small balance for reviewer funding.
- The 90-day dev lock and the treasury's no-sell window are commitments shown publicly, not enforced by a program. Enforcing them would need an escrow/vesting program.
- Get legal advice: grants, token buys, and "backed" labels may be regulated where you or your users are.
