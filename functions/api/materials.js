import { ok, bad, requireUser, requirePin } from "./_utils.js";

export async function onRequestGet({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const rows = await env.BOM_DB.prepare(
    "SELECT kode, jenis, deskripsi, berat_per_meter, luas_per_meter, panjang_las FROM materials ORDER BY kode"
  ).all();

  return ok({ rows: rows.results });
}

export async function onRequestPost({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const b = await request.json().catch(()=>null);
  if(!b?.kode || !b?.jenis || !b?.deskripsi) return bad("Data kurang");

  await env.BOM_DB.prepare(
    `INSERT INTO materials (kode, jenis, deskripsi, berat_per_meter, luas_per_meter, panjang_las)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(kode) DO UPDATE SET
       jenis=excluded.jenis,
       deskripsi=excluded.deskripsi,
       berat_per_meter=excluded.berat_per_meter,
       luas_per_meter=excluded.luas_per_meter,
       panjang_las=excluded.panjang_las`
  ).bind(
    b.kode.trim(),
    b.jenis.trim(),
    b.deskripsi.trim(),
    Number(b.berat_per_meter||0),
    Number(b.luas_per_meter||0),
    Number(b.panjang_las||0)
  ).run();

  return ok();
}

export async function onRequestDelete({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const kode = new URL(request.url).searchParams.get("kode");
  if(!kode) return bad("kode required");

  await env.BOM_DB.prepare("DELETE FROM materials WHERE kode=?").bind(kode).run();
  return ok();
}
