import { ok, bad, requireUser, requirePin } from "./_utils.js";

export async function onRequestGet({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const rows = await env.BOM_DB.prepare(
    "SELECT id, kode, nama, dimensi, buyer FROM items ORDER BY kode"
  ).all();
  return ok({ rows: rows.results });
}

export async function onRequestPost({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const b = await request.json().catch(()=>null);
  if(!b?.kode || !b?.nama || !b?.dimensi || !b?.buyer) return bad("Data kurang");

  await env.BOM_DB.prepare(
    `INSERT INTO items (kode, nama, dimensi, buyer)
     VALUES (?,?,?,?)
     ON CONFLICT(kode) DO UPDATE SET nama=excluded.nama, dimensi=excluded.dimensi, buyer=excluded.buyer`
  ).bind(b.kode.trim(), b.nama.trim(), b.dimensi.trim(), b.buyer.trim()).run();

  return ok();
}

export async function onRequestDelete({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const kode = new URL(request.url).searchParams.get("kode");
  if(!kode) return bad("kode required");

  await env.BOM_DB.prepare("DELETE FROM items WHERE kode=?").bind(kode).run();
  return ok();
}
