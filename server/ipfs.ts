// Pins the coin image + metadata JSON and returns the metadata URI Pump stores
// on the coin. Uses Pinata when PINATA_JWT is set; otherwise falls back to
// pump.fun's own IPFS endpoint (unofficial, the one pump.fun's site uses).
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

import { HttpError } from "./chain.js";

export async function pinMetadata(form: FormData): Promise<{ uri: string; image: string }> {
  if (!(form instanceof FormData)) throw new HttpError(400, "Send the image as multipart form data.");
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "Add a coin image.");
  if (!TYPES.has(file.type)) throw new HttpError(400, "Use a PNG, JPEG, GIF or WebP image.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "The image must be 5 MB or smaller.");

  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const meta = {
    name: text("name", 32),
    symbol: text("symbol", 10),
    description: text("description", 500),
    twitter: text("twitter", 200) || undefined,
    telegram: text("telegram", 200) || undefined,
    website: text("website", 200) || undefined,
  };
  if (!meta.name || !meta.symbol) throw new HttpError(400, "Name and ticker are required.");

  const jwt = process.env.PINATA_JWT;
  if (!jwt) return pinViaPump(file, meta);

  const gateway = process.env.PINATA_GATEWAY ? `https://${process.env.PINATA_GATEWAY}/ipfs/` : "https://ipfs.io/ipfs/";
  const pinFile = new FormData();
  pinFile.append("file", file, "image");
  pinFile.append("pinataMetadata", JSON.stringify({ name: `${meta.symbol}-image` }));
  const imgRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: pinFile,
  });
  if (!imgRes.ok) throw new HttpError(502, `Image upload failed (${imgRes.status}).`);
  const { IpfsHash: imageCid } = (await imgRes.json()) as { IpfsHash: string };
  const image = `${gateway}${imageCid}`;

  // Same shape pump.fun writes, so wallets and explorers show it.
  const metadata = { ...meta, image, showName: true, createdOn: "https://ycpump" };
  const metaRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `${meta.symbol}-metadata` } }),
  });
  if (!metaRes.ok) throw new HttpError(502, `Metadata upload failed (${metaRes.status}).`);
  const { IpfsHash: metaCid } = (await metaRes.json()) as { IpfsHash: string };
  return { uri: `${gateway}${metaCid}`, image };
}

async function pinViaPump(file: Blob, meta: Record<string, string | undefined>) {
  const form = new FormData();
  form.append("file", file, "image");
  for (const [k, v] of Object.entries(meta)) if (v) form.append(k, v);
  form.append("showName", "true");
  const res = await fetch(process.env.PUMP_IPFS_URL || "https://pump.fun/api/ipfs", { method: "POST", body: form });
  if (!res.ok) throw new HttpError(502, `Upload failed (${res.status}). Set PINATA_JWT to use your own Pinata account.`);
  const body = (await res.json()) as { metadataUri?: string; metadata?: { image?: string } };
  if (!body.metadataUri) throw new HttpError(502, "Upload failed: no metadata URI returned.");
  return { uri: body.metadataUri, image: body.metadata?.image ?? "" };
}
