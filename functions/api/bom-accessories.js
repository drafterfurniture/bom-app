import { ok, bad, requireUser, requirePin } from "./_utils.js";

export async function onRequestPut({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const b = await request.json().catch(()=>null);
  if(!b?.bom_id || !Array.isArray(b?.accessories)) return bad("payload salah");

  const bom_id = Number(b.bom_id);
  await env.BOM_DB.prepare("DELETE FROM bom_accessories WHERE bom_id=?").bind(bom_id).run();

  const insA = env.BOM_DB.prepare(
    "INSERT INTO bom_accessories (bom_id, line_no, accessory_kode, qty) VALUES (?,?,?,?)"
  );

  let i=1;
  for(const x of b.accessories){
    await insA.bind(bom_id, i++, String(x.accessory_kode||''), Number(x.qty||0)).run();
  }

  return ok();
}
