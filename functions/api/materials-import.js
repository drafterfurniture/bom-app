import { ok, bad, requireUser, requirePin } from "./_utils.js";

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
  const header = lines.shift().split(",").map(s=>s.trim());
  const rows = [];
  for(const line of lines){
    const cols = line.split(",").map(s=>s.trim());
    const o = {};
    header.forEach((h,i)=>o[h]=cols[i] ?? "");
    rows.push(o);
  }
  return rows;
}

export async function onRequestPost({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const text = await request.text();
  if(!text) return bad("Empty body");

  const rows = parseCSV(text);
  let count = 0;

  const stmt = env.BOM_DB.prepare(
    `INSERT INTO materials (kode, jenis, deskripsi, berat_per_meter, luas_per_meter, panjang_las)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(kode) DO UPDATE SET
       jenis=excluded.jenis,
       deskripsi=excluded.deskripsi,
       berat_per_meter=excluded.berat_per_meter,
       luas_per_meter=excluded.luas_per_meter,
       panjang_las=excluded.panjang_las`
  );

  for(const r of rows){
    if(!r.kode) continue;
    await stmt.bind(
      r.kode,
      r.jenis || "Aluminium",
      r.deskripsi || "",
      Number(r.berat_per_meter||0),
      Number(r.luas_per_meter||0),
      Number(r.panjang_las||0)
    ).run();
    count++;
  }

  return ok({ imported: count });
}
