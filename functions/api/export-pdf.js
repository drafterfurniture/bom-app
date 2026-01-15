import { bad, requireUser, requirePin } from "./_utils.js";

function esc(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

export async function onRequestPost({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const b = await request.json().catch(()=>null);
  const bom_id = Number(b?.bom_id||0);
  if(!bom_id) return bad("bom_id required");

  const bom = await env.BOM_DB.prepare(
    `SELECT b.bom_code, b.created_at, i.kode item_kode, i.nama item_nama, i.dimensi, i.buyer
     FROM boms b JOIN items i ON i.id=b.item_id WHERE b.id=?`
  ).bind(bom_id).first();
  if(!bom) return bad("Not found", 404);

  const lines = (await env.BOM_DB.prepare(
    "SELECT line_no, nama_komponen, material_kode, qty, panjang_mm FROM bom_lines WHERE bom_id=? ORDER BY line_no"
  ).bind(bom_id).all()).results;

  const mats = (await env.BOM_DB.prepare(
    "SELECT kode, deskripsi, berat_per_meter, luas_per_meter, panjang_las FROM materials"
  ).all()).results;
  const map = new Map(mats.map(x=>[x.kode,x]));

  const logoKeyRow = await env.BOM_DB.prepare("SELECT value FROM settings WHERE key='logo_key'").first();
  let logoDataUrl = "";
  if(logoKeyRow?.value){
    const obj = await env.BOM_R2.get(logoKeyRow.value);
    if(obj){
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const b64 = btoa(String.fromCharCode(...bytes));
      const type = obj.httpMetadata?.contentType || "image/png";
      logoDataUrl = `data:${type};base64,${b64}`;
    }
  }

  // Build simple A4 HTML (bisa lo tweak supaya 1:1 Excel)
  const rowsHtml = lines.map(l=>{
    const m = map.get(l.material_kode);
    const totalM = (Number(l.qty)*Number(l.panjang_mm))/1000;
    const btg = totalM/6;
    const kg = m ? totalM*Number(m.berat_per_meter) : 0;
    const las = m ? Number(l.qty)*Number(m.panjang_las) : 0;
    const luas = m ? totalM*Number(m.luas_per_meter) : 0;

    return `<tr>
      <td>${l.line_no}</td>
      <td>${esc(l.nama_komponen)}</td>
      <td>(${esc(l.material_kode)}) ${esc(m?.deskripsi||"")}</td>
      <td>${l.qty}</td>
      <td>${l.panjang_mm} mm</td>
      <td>${totalM.toFixed(2)} M | ${btg.toFixed(2)} Btg | ${kg.toFixed(2)} KG</td>
      <td>${las.toFixed(0)} cm</td>
      <td>${luas.toFixed(2)} m²</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <style>
  @page{ size:A4; margin:12mm; }
  body{ font-family: Arial, sans-serif; color:#000; }
  .head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .logo{ width:80px; height:80px; object-fit:contain; }
  table{ width:100%; border-collapse:collapse; font-size:12px; }
  th,td{ border:1px solid #333; padding:6px; vertical-align:top; }
  th{ background:#f1f1f1; }
  </style></head><body>
    <div class="head">
      <div style="display:flex;gap:10px">
        ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}"/>` : `<div style="width:80px;height:80px;border:1px dashed #999"></div>`}
        <div>
          <div style="font-size:18px;font-weight:800">CV. MANDIRI ABADI</div>
          <div style="font-size:12px">Teak Garden Furniture & Wood Working Industries</div>
        </div>
      </div>
      <div style="border:1px solid #333;padding:8px 12px">
        <div style="font-size:18px;font-weight:900">CUTTINGLIST</div>
        <div style="font-size:12px">${esc(bom.created_at)}</div>
        <div style="font-size:12px;margin-top:4px">${esc(bom.bom_code)}</div>
      </div>
    </div>

    <div style="height:10px"></div>
    <table>
      <tr><th style="width:120px">Kode</th><td>${esc(bom.item_kode)}</td></tr>
      <tr><th>Nama</th><td>${esc(bom.item_nama)}</td></tr>
      <tr><th>Dimensi</th><td>${esc(bom.dimensi)}</td></tr>
      <tr><th>Buyer</th><td>${esc(bom.buyer)}</td></tr>
    </table>

    <div style="height:12px"></div>
    <table>
      <thead>
        <tr>
          <th style="width:35px">No</th>
          <th>Nama Komponen</th>
          <th>Material</th>
          <th style="width:40px">Qty</th>
          <th style="width:90px">Panjang</th>
          <th style="width:160px">Total</th>
          <th style="width:70px">Las</th>
          <th style="width:90px">Luas</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <script>window.onload=()=>{ window.print(); }</script>
  </body></html>`;

  return new Response(html, {
    headers:{
      "content-type":"text/html; charset=utf-8",
      "content-disposition": `inline; filename="${bom.bom_code}.html"`
    }
  });
}
