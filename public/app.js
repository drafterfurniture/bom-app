// ====== Helpers ======
const $ = (id)=>document.getElementById(id);
const logEl = $("log");
function log(x){ logEl.textContent = (typeof x==="string"?x:JSON.stringify(x,null,2)) + "\n" + logEl.textContent; }

let PIN_TOKEN = ""; // token one-time use dari /api/pin-verify

async function api(path, opts={}){
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type")||"";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if(!res.ok){
    throw new Error((data && data.error) ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

async function ensurePin(){
  if(PIN_TOKEN) return PIN_TOKEN;
  const pin = prompt("Masukkan PIN untuk aksi sensitif:");
  if(!pin) throw new Error("PIN dibatalkan");
  const r = await api("/api/pin-verify", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ pin })
  });
  PIN_TOKEN = r.pin_token;
  log({ pin_token: PIN_TOKEN, expires_in: r.expires_in_sec });
  return PIN_TOKEN;
}

function pinHeaders(){
  if(!PIN_TOKEN) return {};
  return { "x-pin-token": PIN_TOKEN };
}

// ====== Tabs ======
document.querySelectorAll(".tab").forEach(t=>{
  t.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    document.querySelectorAll(".tabPane").forEach(p=>p.classList.add("hidden"));
    $("tab-"+tab).classList.remove("hidden");
  });
});

// ====== Login / Logout ======
async function setLoggedUI(isLogged){
  $("pageLogin").classList.toggle("hidden", isLogged);
  $("pageApp").classList.toggle("hidden", !isLogged);
  $("pillLogin").textContent = isLogged ? "LOGIN OK" : "LOGOUT";
}

$("btnLogin").onclick = async ()=>{
  try{
    const username = $("loginUser").value.trim();
    const password = $("loginPass").value.trim();
    const r = await api("/api/login", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ username, password })
    });
    PIN_TOKEN = "";
    log(r);
    await setLoggedUI(true);
    await boot();
  }catch(e){ alert(e.message); }
};

$("btnLogout").onclick = async ()=>{
  try{
    await api("/api/logout", { method:"POST" });
    PIN_TOKEN = "";
    await setLoggedUI(false);
    log("logout ok");
  }catch(e){ alert(e.message); }
};

$("btnWhoami").onclick = async ()=>{
  try{
    // cara cek: coba GET materials -> kalau 401 berarti belum login
    await api("/api/materials");
    alert("Login OK");
    await setLoggedUI(true);
    await boot();
  }catch(e){
    alert("Belum login / session tidak ada");
    await setLoggedUI(false);
  }
};

// ====== Load master data ======
let MATERIALS = [];
let ACCESSORIES = [];
let ITEMS = [];

async function loadMaterials(){
  const r = await api("/api/materials");
  MATERIALS = r.rows || [];
  // fill material dropdown in lines
}
async function loadAccessories(){
  const r = await api("/api/accessories");
  ACCESSORIES = r.rows || [];
}
async function loadItems(){
  const r = await api("/api/items");
  ITEMS = r.rows || [];
}

function renderMaterialsTable(){
  const tb = $("tblMaterials").querySelector("tbody");
  tb.innerHTML = "";
  MATERIALS.forEach(m=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${m.kode}</b></td>
      <td>${m.jenis}</td>
      <td>${m.deskripsi}</td>
      <td>${m.berat_per_meter}</td>
      <td>${m.luas_per_meter}</td>
      <td>${m.panjang_las}</td>
      <td>
        <button class="btn" data-edit="${m.kode}">Edit</button>
        <button class="btn danger" data-del="${m.kode}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick = ()=>{
      const m = MATERIALS.find(x=>x.kode===b.dataset.edit);
      $("mKode").value = m.kode;
      $("mJenis").value = m.jenis;
      $("mDesc").value = m.deskripsi;
      $("mBerat").value = m.berat_per_meter;
      $("mLuas").value = m.luas_per_meter;
      $("mLas").value = m.panjang_las;
    };
  });

  tb.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick = async ()=>{
      try{
        const token = await ensurePin();
        await api(`/api/materials?kode=${encodeURIComponent(b.dataset.del)}`, {
          method:"DELETE",
          headers: { ...pinHeaders() }
        });
        PIN_TOKEN = ""; // one-time
        await loadMaterials(); renderMaterialsTable(); renderMaterialSelect();
        log("deleted material " + b.dataset.del);
      }catch(e){ alert(e.message); }
    };
  });
}

function renderAccessoriesTable(){
  const tb = $("tblAccessories").querySelector("tbody");
  tb.innerHTML = "";
  ACCESSORIES.forEach(a=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${a.kode}</b></td>
      <td>${a.nama}</td>
      <td>${a.satuan}</td>
      <td>
        <button class="btn" data-edit="${a.kode}">Edit</button>
        <button class="btn danger" data-del="${a.kode}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick = ()=>{
      const a = ACCESSORIES.find(x=>x.kode===b.dataset.edit);
      $("aKode").value = a.kode;
      $("aNama").value = a.nama;
      $("aSatuan").value = a.satuan;
    };
  });

  tb.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick = async ()=>{
      try{
        await ensurePin();
        await api(`/api/accessories?kode=${encodeURIComponent(b.dataset.del)}`, {
          method:"DELETE",
          headers: { ...pinHeaders() }
        });
        PIN_TOKEN = "";
        await loadAccessories(); renderAccessoriesTable(); renderAccessorySelect();
        log("deleted acc " + b.dataset.del);
      }catch(e){ alert(e.message); }
    };
  });
}

function renderItemsTable(){
  const tb = $("tblItems").querySelector("tbody");
  tb.innerHTML = "";
  ITEMS.forEach(i=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i.id}</td>
      <td><b>${i.kode}</b></td>
      <td>${i.nama}</td>
      <td>${i.dimensi}</td>
      <td>${i.buyer}</td>
      <td><button class="btn danger" data-del="${i.kode}">Delete</button></td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick = async ()=>{
      try{
        await ensurePin();
        await api(`/api/items?kode=${encodeURIComponent(b.dataset.del)}`, {
          method:"DELETE",
          headers: { ...pinHeaders() }
        });
        PIN_TOKEN="";
        await loadItems(); renderItemsTable(); renderItemSelect();
      }catch(e){ alert(e.message); }
    };
  });
}

function renderItemSelect(){
  const sel = $("selItem");
  sel.innerHTML = "";
  ITEMS.forEach(i=>{
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = `${i.kode} - ${i.nama}`;
    opt.dataset.dimensi = i.dimensi;
    opt.dataset.buyer = i.buyer;
    sel.appendChild(opt);
  });
  sel.onchange = ()=>{
    const i = ITEMS.find(x=>String(x.id)===String(sel.value));
    $("itemInfo").textContent = i ? `Dimensi: ${i.dimensi} | Buyer: ${i.buyer}` : "";
  };
  sel.onchange();
}

function renderMaterialSelect(){
  // used for BOM lines dropdown when adding
}
function renderAccessorySelect(){
  // used for BOM accessories dropdown when adding
}

// ====== Save master records ======
$("btnSaveMaterial").onclick = async ()=>{
  try{
    await ensurePin();
    const payload = {
      kode: $("mKode").value.trim(),
      jenis: $("mJenis").value.trim(),
      deskripsi: $("mDesc").value.trim(),
      berat_per_meter: Number($("mBerat").value||0),
      luas_per_meter: Number($("mLuas").value||0),
      panjang_las: Number($("mLas").value||0),
    };
    await api("/api/materials", {
      method:"POST",
      headers:{ "content-type":"application/json", ...pinHeaders() },
      body: JSON.stringify(payload)
    });
    PIN_TOKEN="";
    await loadMaterials(); renderMaterialsTable();
    log("material saved");
  }catch(e){ alert(e.message); }
};

$("btnSaveAcc").onclick = async ()=>{
  try{
    await ensurePin();
    const payload = {
      kode: $("aKode").value.trim(),
      nama: $("aNama").value.trim(),
      satuan: $("aSatuan").value.trim()
    };
    await api("/api/accessories", {
      method:"POST",
      headers:{ "content-type":"application/json", ...pinHeaders() },
      body: JSON.stringify(payload)
    });
    PIN_TOKEN="";
    await loadAccessories(); renderAccessoriesTable();
  }catch(e){ alert(e.message); }
};

$("btnSaveItem").onclick = async ()=>{
  try{
    await ensurePin();
    const payload = {
      kode: $("iKode").value.trim(),
      nama: $("iNama").value.trim(),
      dimensi: $("iDimensi").value.trim(),
      buyer: $("iBuyer").value.trim()
    };
    await api("/api/items", {
      method:"POST",
      headers:{ "content-type":"application/json", ...pinHeaders() },
      body: JSON.stringify(payload)
    });
    PIN_TOKEN="";
    await loadItems(); renderItemsTable(); renderItemSelect();
  }catch(e){ alert(e.message); }
};

// ====== Import materials CSV ======
$("btnImportMaterials").onclick = async ()=>{
  try{
    const f = $("csvFile").files[0];
    if(!f) return alert("Pilih file CSV dulu");
    await ensurePin();
    const text = await f.text();
    await api("/api/materials-import", {
      method:"POST",
      headers:{ "content-type":"text/plain", ...pinHeaders() },
      body: text
    });
    PIN_TOKEN="";
    await loadMaterials(); renderMaterialsTable();
    alert("Import sukses");
  }catch(e){ alert(e.message); }
};

// ====== BOM Dashboard ======
async function loadBoms(){
  const r = await api("/api/boms");
  return r.rows || [];
}
async function renderBoms(){
  const rows = await loadBoms();
  const tb = $("tblBoms").querySelector("tbody");
  tb.innerHTML = "";
  rows.forEach(b=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${b.bom_code}</b></td>
      <td>${b.item_kode} - ${b.item_nama}<div class="muted small">${b.dimensi}</div></td>
      <td>${b.buyer}</td>
      <td>${b.created_at}</td>
      <td>
        <button class="btn" data-open="${b.id}">Open</button>
        <button class="btn danger" data-del="${b.id}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("[data-open]").forEach(b=>{
    b.onclick = async ()=>{
      await openBom(b.dataset.open);
      document.querySelector('[data-tab="bom"]').click();
    };
  });

  tb.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick = async ()=>{
      try{
        await ensurePin();
        await api(`/api/boms?id=${encodeURIComponent(b.dataset.del)}`, {
          method:"DELETE",
          headers:{ ...pinHeaders() }
        });
        PIN_TOKEN="";
        await renderBoms();
      }catch(e){ alert(e.message); }
    };
  });

  $("bomsInfo").textContent = `${rows.length} BOM`;
}

$("btnRefreshBoms").onclick = ()=>renderBoms();

// ====== BOM editor ======
function makeMaterialOptions(selected=""){
  return MATERIALS.map(m=>{
    const v = m.kode;
    const label = `(${m.kode}) ${m.deskripsi}`;
    const sel = (v===selected) ? "selected" : "";
    return `<option value="${v}" ${sel}>${label}</option>`;
  }).join("");
}
function makeAccessoryOptions(selected=""){
  return ACCESSORIES.map(a=>{
    const sel = (a.kode===selected) ? "selected" : "";
    return `<option value="${a.kode}" ${sel}>(${a.kode}) ${a.nama}</option>`;
  }).join("");
}

function addLineRow(line={}){
  const tb = $("tblLines").querySelector("tbody");
  const n = tb.children.length + 1;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="c"><input class="input" value="${line.line_no || n}" /></td>
    <td><input class="input" value="${line.nama_komponen || ""}" placeholder="Nama komponen" /></td>
    <td>
      <select class="input">${makeMaterialOptions(line.material_kode || (MATERIALS[0]?.kode||""))}</select>
    </td>
    <td><input class="input" type="number" value="${line.qty ?? 1}" /></td>
    <td><input class="input" type="number" value="${line.panjang_mm ?? 0}" /></td>
    <td><button class="btn danger" type="button">Hapus</button></td>
  `;
  tr.querySelector("button").onclick = ()=>{ tr.remove(); renumberTable("tblLines"); };
  tb.appendChild(tr);
  renumberTable("tblLines");
}

function addAccRow(x={}){
  const tb = $("tblAcc").querySelector("tbody");
  const n = tb.children.length + 1;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="c"><input class="input" value="${x.line_no || n}" /></td>
    <td><select class="input">${makeAccessoryOptions(x.accessory_kode || (ACCESSORIES[0]?.kode||""))}</select></td>
    <td><input class="input" type="number" value="${x.qty ?? 1}" /></td>
    <td><button class="btn danger" type="button">Hapus</button></td>
  `;
  tr.querySelector("button").onclick = ()=>{ tr.remove(); renumberTable("tblAcc"); };
  tb.appendChild(tr);
  renumberTable("tblAcc");
}

function renumberTable(tblId){
  const tb = $(tblId).querySelector("tbody");
  [...tb.children].forEach((tr,i)=>{
    tr.querySelector("td input").value = i+1;
  });
}

$("btnAddLine").onclick = ()=>addLineRow();
$("btnAddAcc").onclick = ()=>addAccRow();

$("btnPin").onclick = async ()=>{
  try{
    await ensurePin();
    alert("PIN OK (token siap dipakai 1x)");
  }catch(e){ alert(e.message); }
};

let CURRENT_BOM_ID = null;

async function openBom(id){
  const r = await api(`/api/boms?id=${encodeURIComponent(id)}`);
  CURRENT_BOM_ID = r.bom.id;
  $("currentBomId").value = r.bom.id;
  $("currentBomInfo").textContent = `${r.bom.bom_code} | ${r.bom.created_at}`;

  // set item select match
  const item = ITEMS.find(x=>x.kode===r.bom.item_kode);
  if(item) $("selItem").value = item.id;

  // render lines
  const tbL = $("tblLines").querySelector("tbody");
  tbL.innerHTML = "";
  (r.lines||[]).forEach(addLineRow);

  const tbA = $("tblAcc").querySelector("tbody");
  tbA.innerHTML = "";
  (r.accessories||[]).forEach(addAccRow);

  log({ opened: r.bom });
}

function collectLines(){
  const tb = $("tblLines").querySelector("tbody");
  return [...tb.children].map(tr=>{
    const inputs = tr.querySelectorAll("input");
    const sel = tr.querySelector("select");
    return {
      line_no: Number(inputs[0].value||0),
      nama_komponen: inputs[1].value.trim(),
      material_kode: sel.value,
      qty: Number(inputs[2].value||0),
      panjang_mm: Number(inputs[3].value||0),
    };
  });
}

function collectAcc(){
  const tb = $("tblAcc").querySelector("tbody");
  return [...tb.children].map(tr=>{
    const inputs = tr.querySelectorAll("input");
    const sel = tr.querySelector("select");
    return {
      line_no: Number(inputs[0].value||0),
      accessory_kode: sel.value,
      qty: Number(inputs[1].value||0),
    };
  });
}

// Create BOM
$("btnCreateBom").onclick = async ()=>{
  try{
    await ensurePin();
    const item_id = Number($("selItem").value);
    const payload = { item_id, lines: collectLines(), accessories: collectAcc() };
    const r = await api("/api/boms", {
      method:"POST",
      headers:{ "content-type":"application/json", ...pinHeaders() },
      body: JSON.stringify(payload)
    });
    PIN_TOKEN="";
    await renderBoms();
    alert(`BOM dibuat: ${r.bom_code}`);
  }catch(e){ alert(e.message); }
};

// Update Lines
$("btnUpdateLines").onclick = async ()=>{
  try{
    if(!CURRENT_BOM_ID) return alert("Open BOM dulu dari Dashboard (Open)");
    await ensurePin();
    await api("/api/bom-lines", {
      method:"PUT",
      headers:{ "content-type":"application/json", ...pinHeaders() },
      body: JSON.stringify({ bom_id: CURRENT_BOM_ID, lines: collectLines() })
    });
    PIN_TOKEN="";
    alert("Lines updated");
  }catch(e){ alert(e.message); }
};

// Export PDF (server generates printable HTML)
$("btnExport").onclick = async ()=>{
  try{
    if(!CURRENT_BOM_ID) return alert("Open BOM dulu dari Dashboard (Open)");
    await ensurePin();
    const res = await fetch("/api/export-pdf", {
      method:"POST",
      headers:{ "content-type":"application/json", ...pinHeaders() },
      body: JSON.stringify({ bom_id: CURRENT_BOM_ID })
    });
    PIN_TOKEN="";
    const html = await res.text();
    const w = window.open("", "_blank");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }catch(e){ alert(e.message); }
};

// Upload logo
$("btnUploadLogo").onclick = async ()=>{
  try{
    const f = $("logoFile").files[0];
    if(!f) return alert("Pilih file logo dulu");
    await ensurePin();
    const fd = new FormData();
    fd.append("file", f);
    await api("/api/upload-logo", {
      method:"POST",
      headers:{ ...pinHeaders() },
      body: fd
    });
    PIN_TOKEN="";
    alert("Logo uploaded");
  }catch(e){ alert(e.message); }
};

// Refresh buttons
$("btnRefreshMaterials").onclick = async ()=>{ await loadMaterials(); renderMaterialsTable(); };
$("btnRefreshAccessories").onclick = async ()=>{ await loadAccessories(); renderAccessoriesTable(); };
$("btnRefreshItems").onclick = async ()=>{ await loadItems(); renderItemsTable(); renderItemSelect(); };

async function boot(){
  await loadMaterials(); renderMaterialsTable();
  await loadAccessories(); renderAccessoriesTable();
  await loadItems(); renderItemsTable(); renderItemSelect();
  await renderBoms();

  // init empty lines if none
  const tbL = $("tblLines").querySelector("tbody");
  if(tbL.children.length===0) addLineRow({ qty:1, panjang_mm:0 });

  const tbA = $("tblAcc").querySelector("tbody");
  if(tbA.children.length===0 && ACCESSORIES.length) addAccRow({ qty:0 });

  $("itemInfo").textContent = "";
  $("currentBomInfo").textContent = "Open BOM dari Dashboard untuk edit/export";
}

// auto check session
(async ()=>{
  try{
    await api("/api/materials");
    await setLoggedUI(true);
    await boot();
  }catch{
    await setLoggedUI(false);
  }
})();
