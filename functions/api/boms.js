import { ok, bad, requireUser, requirePin, randId } from "./_utils.js";

function makeBomCode(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `BOM-${y}${m}${day}-${randId(3)}`;
}

export async function onRequestGet({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if(id){
    const bom = await env.BOM_DB.prepare(
      `SELECT b.id, b.bom_code, b.created_at,
              i.kode item_kode, i.nama item_nama, i.dimensi, i.buyer
       FROM boms b
       JOIN items i ON i.id=b.item_id
       WHERE b.id=?`
    ).bind(id).first();
    if(!bom) return bad("Not found", 404);

    const lines = await env.BOM_DB.prepare(
      "SELECT id, line_no, nama_komponen, material_kode, qty, panjang_mm FROM bom_lines WHERE bom_id=? ORDER BY line_no"
    ).bind(id).all();

    const acc = await env.BOM_DB.prepare(
      "SELECT id, line_no, accessory_kode, qty FROM bom_accessories WHERE bom_id=? ORDER BY line_no"
    ).bind(id).all();

    return ok({ bom, lines: lines.results, accessories: acc.results });
  }

  const rows = await env.BOM_DB.prepare(
    `SELECT b.id, b.bom_code, b.created_at,
            i.kode item_kode, i.nama item_nama, i.dimensi, i.buyer
     FROM boms b
     JOIN items i ON i.id=b.item_id
     ORDER BY b.created_at DESC LIMIT 200`
  ).all();

  return ok({ rows: rows.results });
}

export async function onRequestPost({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const b = await request.json().catch(()=>null);
  if(!b?.item_id || !Array.isArray(b?.lines)) return bad("payload salah");

  const bom_code = makeBomCode();

  const res = await env.BOM_DB.prepare(
    "INSERT INTO boms (bom_code, item_id, created_by) VALUES (?,?,?)"
  ).bind(bom_code, Number(b.item_id), user.user_id).run();

  const bom_id = res.meta.last_row_id;

  // lines
  const ins = env.BOM_DB.prepare(
    "INSERT INTO bom_lines (bom_id, line_no, nama_komponen, material_kode, qty, panjang_mm) VALUES (?,?,?,?,?,?)"
  );
  let n = 1;
  for(const line of b.lines){
    await ins.bind(
      bom_id, n++,
      String(line.nama_komponen||''),
      String(line.material_kode||''),
      Number(line.qty||0),
      Number(line.panjang_mm||0)
    ).run();
  }

  // accessories
  if(Array.isArray(b.accessories)){
    const insA = env.BOM_DB.prepare(
      "INSERT INTO bom_accessories (bom_id, line_no, accessory_kode, qty) VALUES (?,?,?,?)"
    );
    let a = 1;
    for(const x of b.accessories){
      await insA.bind(bom_id, a++, String(x.accessory_kode||''), Number(x.qty||0)).run();
    }
  }

  return ok({ bom_id, bom_code });
}

export async function onRequestDelete({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const id = new URL(request.url).searchParams.get("id");
  if(!id) return bad("id required");

  await env.BOM_DB.prepare("DELETE FROM boms WHERE id=?").bind(id).run();
  return ok();
}
