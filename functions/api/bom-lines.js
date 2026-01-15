import { ok, bad, requireUser, requirePin } from "./_utils.js";

export async function onRequestPut({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const b = await request.json().catch(()=>null);
  if(!b?.bom_id || !Array.isArray(b?.lines)) return bad("payload salah");

  const bom_id = Number(b.bom_id);

  // Strategy: replace all lines (simple & safe)
  await env.BOM_DB.prepare("DELETE FROM bom_lines WHERE bom_id=?").bind(bom_id).run();

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

  return ok();
}
