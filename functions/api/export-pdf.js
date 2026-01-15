import { bad, requireUser } from "./_utils.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function n0(x){ x = Number(x); return Number.isFinite(x) ? x : 0; }

function f2(n) {
  n = n0(n);
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}
function f0(n) {
  n = n0(n);
  return String(Math.round(n)).replace(".", ",");
}

/** bytes -> base64 (aman untuk ukuran besar) */
function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  // ==== Auth session (tetap wajib login) ====
  const user = await requireUser(request, env);
  if (!user) return bad("Unauthorized", 401);

  const db = env.BOM_DB;
  if (!db) return bad("D1 binding missing (BOM_DB)", 500);

  // ==== Parse body ====
  const b = await request.json().catch(() => null);
  const bom_id = Number(b?.bom_id || 0);
  if (!bom_id) return bad("bom_id required", 400);

  // ==== Header BOM + item ====
  const bom = await db.prepare(
    `SELECT b.id, b.bom_code, b.created_at,
            i.kode AS item_kode, i.nama AS item_nama, i.dimensi, i.buyer
     FROM boms b
     JOIN items i ON i.id=b.item_id
     WHERE b.id=?`
  ).bind(bom_id).first();

  if (!bom) return bad("Not found", 404);

  // ==== Lines ====
  const lines = (await db.prepare(
    "SELECT line_no, nama_komponen, material_kode, qty, panjang_mm FROM bom_lines WHERE bom_id=? ORDER BY line_no"
  ).bind(bom_id).all()).results || [];

  // ==== Accessories lines ====
  const accLines = (await db.prepare(
    "SELECT line_no, accessory_kode, qty FROM bom_accessories WHERE bom_id=? ORDER BY line_no"
  ).bind(bom_id).all()).results || [];

  // ==== Master tables ====
  const mats = (await db.prepare(
    "SELECT kode, deskripsi, berat_per_meter, luas_per_meter, panjang_las FROM materials"
  ).all()).results || [];
  const matMap = new Map(mats.map((x) => [x.kode, x]));

  const accs = (await db.prepare(
    "SELECT kode, nama, satuan FROM accessories"
  ).all()).results || [];
  const accMap = new Map(accs.map((x) => [x.kode, x]));

  // ==== Logo from R2 -> dataURL (AMAN) ====
  let logoDataUrl = "";
  try {
    const logoKeyRow = await db.prepare(
      "SELECT value FROM settings WHERE key='logo_key'"
    ).first();

    if (logoKeyRow?.value && env.BOM_R2) {
      const obj = await env.BOM_R2.get(logoKeyRow.value);
      if (obj) {
        const buf = await obj.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const b64 = bytesToBase64(bytes);
        const type = obj.httpMetadata?.contentType || "image/png";
        logoDataUrl = `data:${type};base64,${b64}`;
      }
    }
  } catch (_) {
    logoDataUrl = "";
  }

  // ==== Totals + recap material per kode ====
  let tQty = 0, tPanjang = 0, tM = 0, tBtg = 0, tKg = 0, tLas = 0, tLuas = 0;
  const recapMatM = new Map(); // kode -> totalM

  const rowsHtml = lines.map((l) => {
    const m = matMap.get(l.material_kode);
    const qty = n0(l.qty);
    const panjang = n0(l.panjang_mm);

    const totalM = (qty * panjang) / 1000;
    const btg = totalM / 6;
    const kg = m ? totalM * n0(m.berat_per_meter) : 0;
    const las = m ? qty * n0(m.panjang_las) : 0;
    const luas = m ? totalM * n0(m.luas_per_meter) : 0;

    tQty += qty;
    tPanjang += qty * panjang;
    tM += totalM;
    tBtg += btg;
    tKg += kg;
    tLas += las;
    tLuas += luas;

    if (l.material_kode) {
      recapMatM.set(l.material_kode, (recapMatM.get(l.material_kode) || 0) + totalM);
    }

    const totalCell = `
      <div class="total3">
        <div>${f2(totalM)} M</div>
        <div>${f2(btg)} Btg</div>
        <div>${f2(kg)} KG</div>
      </div>`;

    return `<tr>
      <td class="c">${esc(l.line_no)}</td>
      <td>${esc(l.nama_komponen)}</td>
      <td>(${esc(l.material_kode)}) ${esc(m?.deskripsi || "")}</td>
      <td class="c">${f0(qty)}</td>
      <td class="r">${f0(panjang)} mm</td>
      <td>${totalCell}</td>
      <td class="r">${f0(las)} cm</td>
      <td class="r">${f2(luas)} m²</td>
    </tr>`;
  }).join("");

  // Recap Materials table
  let rmIndex = 1;
  const recapMaterialsHtml = [...recapMatM.entries()].map(([kode, totalM]) => {
    const m = matMap.get(kode);
    const btgNeed = totalM / 6;
    return `<tr>
      <td class="c">${rmIndex++}</td>
      <td>(${esc(kode)}) ${esc(m?.deskripsi || "")}</td>
      <td class="r">${f2(btgNeed)} Btg</td>
    </tr>`;
  }).join("") || `<tr><td class="c">1</td><td>-</td><td class="r">0,00 Btg</td></tr>`;

  // Accessories table
  let raIndex = 1;
  const recapAccessoriesHtml = accLines.map((x) => {
    const a = accMap.get(x.accessory_kode);
    return `<tr>
      <td class="c">${raIndex++}</td>
      <td>(${esc(x.accessory_kode)}) ${esc(a?.nama || "")}</td>
      <td class="r">${f0(x.qty)}</td>
      <td class="c">${esc(a?.satuan || "")}</td>
    </tr>`;
  }).join("") || `<tr><td class="c">1</td><td>-</td><td class="r">0</td><td class="c">-</td></tr>`;

  const totalCellFoot = `
    <div class="total3">
      <div><b>${f2(tM)}</b> M</div>
      <div><b>${f2(tBtg)}</b> Btg</div>
      <div><b>${f2(tKg)}</b> KG</div>
    </div>`;

  // ===== FINAL HTML (A4 + 12mm) =====
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(bom.bom_code)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  *{ box-sizing:border-box }
  body{ font-family: Arial, sans-serif; color:#000; font-size:12px; }
  .row{ display:flex; justify-content:space-between; gap:10mm; align-items:flex-start; }
  .brand{ font-size:18px; font-weight:800; letter-spacing:.2px; }
  .sub{ font-size:12px; margin-top:2px; }
  .logo{ width:78px; height:78px; object-fit:contain; }
  .cutbox{ border:1px solid #333; padding:8px 12px; min-width:70mm; }
  .cutbox .t{ font-size:18px; font-weight:900; }
  .muted{ color:#111; font-size:12px; }
  .sp10{ height:10px; }
  .sp12{ height:12px; }

  table{ width:100%; border-collapse:collapse; }
  th,td{ border:1px solid #333; padding:6px; vertical-align:top }
  th{ background:#f1f1f1; font-weight:700; }
  .c{ text-align:center; }
  .r{ text-align:right; }
  .tight td{ padding:5px 6px; }
  .info th{ width:30mm; }
  .total3{ display:flex; justify-content:space-between; gap:6px; }
  .total3 > div{ width:33.33%; }
  .section-title{ font-weight:800; margin:0 0 4px; }
  .note{ margin-top:6px; font-size:11px; }
  tr { break-inside: avoid; }
</style>
</head>
<body>

  <div class="row">
    <div style="display:flex; gap:10px;">
      ${logoDataUrl
        ? `<img class="logo" src="${logoDataUrl}" alt="Logo"/>`
        : `<div class="logo" style="border:1px dashed #777;"></div>`}
      <div>
        <div class="brand">CV. MANDIRI ABADI</div>
        <div class="sub">Teak Garden Furniture &amp; Wood Working Industries</div>
      </div>
    </div>

    <div class="cutbox">
      <div class="t">CUTTINGLIST</div>
      <div class="muted">${esc(bom.created_at)}</div>
      <div class="muted" style="margin-top:4px;">${esc(bom.bom_code)}</div>
    </div>
  </div>

  <div class="sp10"></div>

  <div class="row">
    <div style="flex:1.2">
      <table class="info tight">
        <tbody>
          <tr><th>Kode</th><td>${esc(bom.item_kode)}</td></tr>
          <tr><th>Nama</th><td>${esc(bom.item_nama)}</td></tr>
          <tr><th>Dimensi</th><td>${esc(bom.dimensi)}</td></tr>
          <tr><th>Buyer</th><td>${esc(bom.buyer)}</td></tr>
        </tbody>
      </table>
    </div>
   <div style="flex:1; padding-top:2px;"></div>
  </div>

  <div class="sp12"></div>

  <table>
    <thead>
      <tr>
        <th style="width:10mm" rowspan="2">NO</th>
        <th rowspan="2">Nama Komponen</th>
        <th rowspan="2">Material</th>
        <th style="width:10mm" rowspan="2">QTY</th>
        <th style="width:26mm" rowspan="2">Panjang Bersih</th>
        <th style="width:48mm">Total</th>
        <th style="width:22mm" rowspan="2">Panjang Las<br/>(cm)</th>
        <th style="width:26mm" rowspan="2">Luas Permukaan<br/>(m²)</th>
      </tr>
      <tr>
        <th><div class="total3"><div>M</div><div>Batang</div><div>Berat</div></div></th>
      </tr>
    </thead>

    <tbody>
      ${rowsHtml || ""}
    </tbody>

    <tfoot>
      <tr>
        <th colspan="3">Total</th>
        <th class="c">${f0(tQty)}</th>
        <th class="r">${f0(tPanjang)} mm</th>
        <th>${totalCellFoot}</th>
        <th class="r"><b>${f0(tLas)}</b> cm</th>
        <th class="r"><b>${f2(tLuas)}</b> m²</th>
      </tr>
    </tfoot>
  </table>

  <div class="sp12"></div>

  <div class="row">
    <div style="flex:1.25">
      <div class="section-title">Rincian Material yang digunakan</div>
      <table class="tight">
        <thead>
          <tr><th style="width:10mm">No.</th><th>Material</th><th style="width:32mm">Kebutuhan</th></tr>
        </thead>
        <tbody>${recapMaterialsHtml}</tbody>
      </table>
      <div class="note">Kebutuhan batang = Σ(TotalM/6) per material</div>

      <div class="sp12"></div>

      <div class="section-title">Aksesoris</div>
      <table class="tight">
        <thead>
          <tr><th style="width:10mm">No.</th><th>Aksesoris</th><th style="width:18mm">Qty</th><th style="width:18mm">Satuan</th></tr>
        </thead>
        <tbody>${recapAccessoriesHtml}</tbody>
      </table>
    </div>

    <div style="flex:0.75">
      <div class="muted">Print-friendly (A4, 12mm)</div>
      <div class="muted" style="margin-top:6px">Tips: di dialog print pilih “Save as PDF”.</div>
    </div>
  </div>

  <script>
    window.onload = () => { window.print(); };
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${esc(bom.bom_code)}.html"`
    }
  });
}
