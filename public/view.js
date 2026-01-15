const qs = new URLSearchParams(location.search);
const BOM_ID = Number(qs.get("bom_id") || 0);

const $ = (id) => document.getElementById(id);

function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function f2(n){ return (Math.round(Number(n||0)*100)/100).toFixed(2).replace(".",","); }
function f0(n){ return String(Math.round(Number(n||0))).replace(".",","); }

async function api(path, opts={}){
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";
  let data = ct.includes("application/json") ? await res.json().catch(()=>null) : await res.text().catch(()=> "");
  if(!res.ok){
    const msg = (data && typeof data==="object" && data.error) ? data.error : (typeof data==="string" && data ? data : `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

function totalCell(m, btg, kg){
  return `
    <div class="total3cell">
      <div>${f2(m)} M</div>
      <div>${f2(btg)} Btg</div>
      <div>${f2(kg)} KG</div>
    </div>
  `;
}

function fmtDatePretty(iso){
  // tampil "Rabu, 15 Januari 2026" simpel (tanpa lib)
  try{
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", { weekday:"long", year:"numeric", month:"long", day:"2-digit" });
  }catch{
    return iso || "-";
  }
}

function renderLogo(logoDataUrl){
  const wrap = $("logoWrap");
  if(!wrap) return;
  if(!logoDataUrl){
    wrap.innerHTML = `<div class="logoPh">LOGO<br/><span class="muted small">(upload)</span></div>`;
    return;
  }
  wrap.innerHTML = `<img class="logoImg" src="${logoDataUrl}" alt="Logo" />`;
}

async function loadAndRender(){
  if(!BOM_ID){
    alert("bom_id tidak ada. Buka dari Dashboard -> View.");
    return;
  }

  const data = await api(`/api/bom-view-data?bom_id=${encodeURIComponent(BOM_ID)}`);

  // header / cut box
  $("cutCode").textContent = data.bom?.bom_code || "-";
  $("cutDate").textContent = fmtDatePretty(data.bom?.created_at);

  // info table
  $("infoKode").textContent = data.item?.kode || "-";
  $("infoNama").textContent = data.item?.nama || "-";
  $("infoDimensi").textContent = data.item?.dimensi || "-";
  $("infoBuyer").textContent = data.item?.buyer || "-";

  // logo from server (R2 -> data url)
  renderLogo(data.logo_data_url || "");

  // master map
  const matMap = new Map((data.materials||[]).map(m=>[m.kode, m]));
  const accMap = new Map((data.accessories||[]).map(a=>[a.kode, a]));

  // lines table
  const tb = $("tblViewLines").querySelector("tbody");
  tb.innerHTML = "";

  let tQty=0, tPanjang=0, tM=0, tBtg=0, tKg=0, tLas=0, tLuas=0;
  const recapMatM = new Map();

  (data.lines||[]).forEach(l=>{
    const m = matMap.get(l.material_kode);
    const qty = Number(l.qty||0);
    const panjang = Number(l.panjang_mm||0);

    const totalM = (qty * panjang) / 1000;
    const btg = totalM / 6;
    const kg  = m ? totalM * Number(m.berat_per_meter||0) : 0;
    const las = m ? qty * Number(m.panjang_las||0) : 0;
    const luas= m ? totalM * Number(m.luas_per_meter||0) : 0;

    tQty += qty;
    tPanjang += qty * panjang;
    tM += totalM; tBtg += btg; tKg += kg; tLas += las; tLuas += luas;

    if(l.material_kode){
      recapMatM.set(l.material_kode, (recapMatM.get(l.material_kode)||0) + totalM);
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="c">${esc(l.line_no)}</td>
      <td>${esc(l.nama_komponen)}</td>
      <td>(${esc(l.material_kode)})<br/>${esc(m?.deskripsi||"")}</td>
      <td class="c">${qty}</td>
      <td class="r">${panjang} mm</td>
      <td>${totalCell(totalM, btg, kg)}</td>
      <td class="r">${f0(las)} cm</td>
      <td class="r">${f2(luas)} m²</td>
    `;
    tb.appendChild(tr);
  });

  $("tQty").textContent = String(tQty);
  $("tPanjang").textContent = `${tPanjang} mm`;
  $("tTotalCell").innerHTML = totalCell(tM, tBtg, tKg);
  $("tLas").textContent = `${f0(tLas)} cm`;
  $("tLuas").textContent = `${f2(tLuas)} m²`;

  // recap materials
  const tbRM = $("tblRecapMat").querySelector("tbody");
  tbRM.innerHTML = "";
  let idx=1;
  [...recapMatM.entries()].forEach(([kode, totalM])=>{
    const m = matMap.get(kode);
    const btgNeed = totalM / 6;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="c">${idx++}</td>
      <td>(${esc(kode)}) ${esc(m?.deskripsi||"")}</td>
      <td class="r">${f2(btgNeed)} Btg</td>
    `;
    tbRM.appendChild(tr);
  });
  if(tbRM.children.length===0){
    tbRM.innerHTML = `<tr><td class="c">1</td><td>-</td><td class="r">0,00 Btg</td></tr>`;
  }

  // recap accessories
  const tbRA = $("tblRecapAcc").querySelector("tbody");
  tbRA.innerHTML = "";
  let ia=1;
  (data.acc_lines||[]).forEach(x=>{
    const a = accMap.get(x.accessory_kode);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="c">${ia++}</td>
      <td>(${esc(x.accessory_kode)}) ${esc(a?.nama||"")}</td>
      <td class="r">${Number(x.qty||0)}</td>
      <td class="c">${esc(a?.satuan||"")}</td>
    `;
    tbRA.appendChild(tr);
  });
  if(tbRA.children.length===0){
    tbRA.innerHTML = `<tr><td class="c">1</td><td>-</td><td class="r">0</td><td class="c">-</td></tr>`;
  }

  // buttons
  $("btnEdit").onclick = ()=>{
    // balik ke app lalu buka BOM editor (simple: pake hash + query)
    // kalau app lo belum support deep-linking, minimal arahkan ke homepage.
    location.href = `/?open_bom=${encodeURIComponent(BOM_ID)}`;
  };

  $("btnPrint").onclick = ()=>{
    window.print();
  };

  $("btnExportPdf").onclick = async ()=>{
    // Export PDF = pakai endpoint export yang return HTML printable lalu print dialog.
    // Biar sama: kita buka tab baru, tulis HTML export, lalu print dari sana.
    const html = await api("/api/export-pdf", {
      method:"POST",
      headers:{ "content-type":"application/json" }, // TANPA PIN
      body: JSON.stringify({ bom_id: BOM_ID })
    });

    const w = window.open("", "_blank");
    if(!w) return alert("Popup diblokir. Izinkan popups.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // local logo preview only (ga upload)
  $("logoLocal").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    const url = URL.createObjectURL(f);
    renderLogo(url);
  });
}

// run
(async ()=>{
  try{
    await loadAndRender();
  }catch(e){
    alert(e.message);
    // kalau unauthorized, balik ke home
    // location.href="/";
  }
})();
