import { bad, ok, requireUser } from "./_utils.js";

export async function onRequestGet({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const url = new URL(request.url);
  const bom_id = Number(url.searchParams.get("bom_id") || 0);
  if(!bom_id) return bad("bom_id required");

  const bom = await env.BOM_DB.prepare(
    `SELECT b.id, b.bom_code, b.created_at, b.item_id,
            i.kode item_kode, i.nama item_nama, i.dimensi, i.buyer
     FROM boms b
     JOIN items i ON i.id=b.item_id
     WHERE b.id=?`
  ).bind(bom_id).first();

  if(!bom) return bad("Not found", 404);

  const lines = (await env.BOM_DB.prepare(
    "SELECT line_no, nama_komponen, material_kode, qty, panjang_mm FROM bom_lines WHERE bom_id=? ORDER BY line_no"
  ).bind(bom_id).all()).results || [];

  const acc_lines = (await env.BOM_DB.prepare(
    "SELECT line_no, accessory_kode, qty FROM bom_accessories WHERE bom_id=? ORDER BY line_no"
  ).bind(bom_id).all()).results || [];

  const materials = (await env.BOM_DB.prepare(
    "SELECT kode, deskripsi, berat_per_meter, luas_per_meter, panjang_las FROM materials"
  ).all()).results || [];

  const accessories = (await env.BOM_DB.prepare(
    "SELECT kode, nama, satuan FROM accessories"
  ).all()).results || [];

  // logo from R2 -> dataURL (same like your export)
  const logoKeyRow = await env.BOM_DB.prepare("SELECT value FROM settings WHERE key='logo_key'").first();
  let logo_data_url = "";
  if(logoKeyRow?.value){
    const obj = await env.BOM_R2.get(logoKeyRow.value);
    if(obj){
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const b64 = btoa(String.fromCharCode(...bytes));
      const type = obj.httpMetadata?.contentType || "image/png";
      logo_data_url = `data:${type};base64,${b64}`;
    }
  }

  return ok({
    bom: { id:bom.id, bom_code:bom.bom_code, created_at:bom.created_at, item_id:bom.item_id },
    item: { kode:bom.item_kode, nama:bom.item_nama, dimensi:bom.dimensi, buyer:bom.buyer },
    lines,
    acc_lines,
    materials,
    accessories,
    logo_data_url
  });
}
