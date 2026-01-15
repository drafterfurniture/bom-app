// ====== Helpers ======
const $ = (id) => document.getElementById(id);
const logEl = $("log");

function log(x) {
  if (!logEl) return;
  logEl.textContent =
    (typeof x === "string" ? x : JSON.stringify(x, null, 2)) +
    "\n" +
    logEl.textContent;
}

let PIN_TOKEN = ""; // token one-time use dari /api/pin-verify

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";

  let data;
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && data.error) ||
      (typeof data === "string" && data) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function ensurePin() {
  if (PIN_TOKEN) return PIN_TOKEN;
  const pin = prompt("Masukkan PIN untuk aksi sensitif:");
  if (!pin) throw new Error("PIN dibatalkan");

  const r = await api("/api/pin-verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin }),
  });

  PIN_TOKEN = r.pin_token;
  log({ pin_token: PIN_TOKEN, expires_in: r.expires_in_sec });
  return PIN_TOKEN;
}

function pinHeaders() {
  if (!PIN_TOKEN) return {};
  return { "x-pin-token": PIN_TOKEN };
}

// helper fetch HTML export (no pin)
async function fetchExportHtml(bomId) {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" }, // TANPA x-pin-token
    body: JSON.stringify({ bom_id: Number(bomId) }),
  });

  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error || `HTTP ${res.status}`);
    }
    throw new Error(await res.text());
  }

  return await res.text();
}

// ====== VIEWER (same window) ======
let VIEWER = null;

function injectViewerStylesOnce() {
  if (document.getElementById("bomViewerStyle")) return;
  const style = document.createElement("style");
  style.id = "bomViewerStyle";
  style.textContent = `
    #bomViewer{
      position:fixed; inset:0; z-index:9999;
      display:none;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      padding: 16px;
    }
    #bomViewer .panel{
      width: min(1100px, 100%);
      height: calc(100vh - 32px);
      margin: 0 auto;
      background:#fff;
      border-radius: 16px;
      overflow:hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
      display:flex;
      flex-direction:column;
    }
    #bomViewer .topbar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding: 10px 12px;
      border-bottom:1px solid #eee;
      background: #fafafa;
    }
    #bomViewer .title{
      font-weight:700;
      font-size:14px;
      color:#111;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      flex:1;
      text-align:center;
    }
    #bomViewer .btnBack{
      appearance:none;
      border:1px solid #e5e5e5;
      background:#fff;
      color:#111;
      padding: 8px 12px;
      border-radius: 12px;
      cursor:pointer;
      font-weight:700;
      line-height:1;
      display:inline-flex;
      align-items:center;
      gap:8px;
      box-shadow: 0 6px 18px rgba(0,0,0,.06);
    }
    #bomViewer .btnBack:hover{ background:#f6f6f6; }
    #bomViewer .btnBack:active{ transform: translateY(1px); }
    #bomViewer .btnBack .arr{
      width: 22px; height: 22px;
      border-radius: 999px;
      background:#111;
      color:#fff;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      font-weight:900;
      font-size:14px;
    }
    #bomViewer .actions{
      display:flex; align-items:center; gap:8px;
    }
    #bomViewer .btnIcon{
      appearance:none;
      border:1px solid #e5e5e5;
      background:#fff;
      padding:8px 10px;
      border-radius:12px;
      cursor:pointer;
      font-weight:700;
      color:#111;
    }
    #bomViewer .btnIcon:hover{ background:#f6f6f6; }
    #bomViewer iframe{
      width:100%;
      height:100%;
      border:0;
      background:#fff;
      flex:1;
    }

    @media (max-width: 640px){
      #bomViewer{ padding:10px; }
      #bomViewer .panel{ height: calc(100vh - 20px); border-radius: 14px; }
      #bomViewer .title{ display:none; }
    }
  `;
  document.head.appendChild(style);
}

function ensureViewerUI() {
  // kalau udah ada dan refs lengkap, return
  if (VIEWER?.wrap && VIEWER?.iframe && VIEWER?.titleEl) return VIEWER;

  injectViewerStylesOnce();

  // kalau ada sisa wrap tanpa refs (misal dari versi lama), hapus biar bersih
  const old = document.getElementById("bomViewer");
  if (old) old.remove();

  const wrap = document.createElement("div");
  wrap.id = "bomViewer";

  const panel = document.createElement("div");
  panel.className = "panel";

  const topbar = document.createElement("div");
  topbar.className = "topbar";

  const btnBack = document.createElement("button");
  btnBack.className = "btnBack";
  btnBack.id = "btnViewerBack";
  btnBack.type = "button";
  btnBack.innerHTML = `<span class="arr">←</span><span>Back</span>`;

  const titleEl = document.createElement("div");
  titleEl.className = "title";
  titleEl.id = "viewerTitle";
  titleEl.textContent = "View / Print BOM";

  const actions = document.createElement("div");
  actions.className = "actions";

  const btnPrint = document.createElement("button");
  btnPrint.className = "btnIcon";
  btnPrint.id = "btnViewerPrint";
  btnPrint.type = "button";
  btnPrint.textContent = "Print";

  const btnClose = document.createElement("button");
  btnClose.className = "btnIcon";
  btnClose.id = "btnViewerClose";
  btnClose.type = "button";
  btnClose.textContent = "Close";

  actions.appendChild(btnPrint);
  actions.appendChild(btnClose);

  topbar.appendChild(btnBack);
  topbar.appendChild(titleEl);
  topbar.appendChild(actions);

  const iframe = document.createElement("iframe");
  iframe.id = "viewerFrame";
  iframe.title = "BOM Viewer";

  panel.appendChild(topbar);
  panel.appendChild(iframe);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);

  const close = () => hideViewer();

  btnBack.onclick = close;
  btnClose.onclick = close;

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideViewer();
  });

  btnPrint.onclick = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      alert("Tidak bisa print dari viewer. Coba gunakan Print dari browser.");
    }
  };

  VIEWER = { wrap, iframe, titleEl };
  return VIEWER;
}

function setIframeHtml(iframe, html) {
  // prefer srcdoc
  try {
    iframe.srcdoc = html;
    return;
  } catch {
    // fallback ke write()
  }

  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("no iframe document");
    doc.open();
    doc.write(html);
    doc.close();
  } catch (e) {
    console.error(e);
    alert("Gagal render view. Coba refresh halaman.");
  }
}

function showViewer(html, title = "View / Print BOM") {
  const v = ensureViewerUI();
  v.titleEl.textContent = title;

  setIframeHtml(v.iframe, html);

  v.wrap.style.display = "block";
  document.body.style.overflow = "hidden";
}

function hideViewer() {
  const v = VIEWER;
  if (!v?.wrap) return;
  v.wrap.style.display = "none";
  document.body.style.overflow = "";
  // bersihin konten biar ringan
  try {
    v.iframe.srcdoc = "";
  } catch {
    try {
      const doc = v.iframe.contentWindow?.document;
      doc?.open();
      doc?.write("");
      doc?.close();
    } catch {}
  }
}

// ====== Tabs ======
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    document.querySelectorAll(".tabPane").forEach((p) => p.classList.add("hidden"));
    $("tab-" + tab)?.classList.remove("hidden");
  });
});

// ====== Login / Logout ======
async function setLoggedUI(isLogged) {
  $("pageLogin")?.classList.toggle("hidden", isLogged);
  $("pageApp")?.classList.toggle("hidden", !isLogged);
  if ($("pillLogin")) $("pillLogin").textContent = isLogged ? "LOGIN OK" : "LOGOUT";
}

$("btnLogin").onclick = async () => {
  try {
    const username = $("loginUser").value.trim();
    const password = $("loginPass").value.trim();
    const r = await api("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    PIN_TOKEN = "";
    log(r);
    await setLoggedUI(true);
    await boot();
  } catch (e) {
    alert(e.message);
  }
};

$("btnLogout").onclick = async () => {
  try {
    await api("/api/logout", { method: "POST" });
    PIN_TOKEN = "";
    await setLoggedUI(false);
    log("logout ok");
  } catch (e) {
    alert(e.message);
  }
};

$("btnWhoami").onclick = async () => {
  try {
    await api("/api/materials");
    alert("Login OK");
    await setLoggedUI(true);
    await boot();
  } catch (e) {
    alert("Belum login / session tidak ada");
    await setLoggedUI(false);
  }
};

// ====== Load master data ======
let MATERIALS = [];
let ACCESSORIES = [];
let ITEMS = [];

async function loadMaterials() {
  const r = await api("/api/materials");
  MATERIALS = r.rows || [];
}
async function loadAccessories() {
  const r = await api("/api/accessories");
  ACCESSORIES = r.rows || [];
}
async function loadItems() {
  const r = await api("/api/items");
  ITEMS = r.rows || [];
}

function renderMaterialsTable() {
  const tb = $("tblMaterials")?.querySelector("tbody");
  if (!tb) return;
  tb.innerHTML = "";

  MATERIALS.forEach((m) => {
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

  tb.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => {
      const m = MATERIALS.find((x) => x.kode === b.dataset.edit);
      if (!m) return;
      $("mKode").value = m.kode;
      $("mJenis").value = m.jenis;
      $("mDesc").value = m.deskripsi;
      $("mBerat").value = m.berat_per_meter;
      $("mLuas").value = m.luas_per_meter;
      $("mLas").value = m.panjang_las;
    };
  });

  tb.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      try {
        await ensurePin();
        await api(`/api/materials?kode=${encodeURIComponent(b.dataset.del)}`, {
          method: "DELETE",
          headers: { ...pinHeaders() },
        });
        PIN_TOKEN = "";
        await loadMaterials();
        renderMaterialsTable();
        log("deleted material " + b.dataset.del);
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderAccessoriesTable() {
  const tb = $("tblAccessories")?.querySelector("tbody");
  if (!tb) return;
  tb.innerHTML = "";

  ACCESSORIES.forEach((a) => {
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

  tb.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => {
      const a = ACCESSORIES.find((x) => x.kode === b.dataset.edit);
      if (!a) return;
      $("aKode").value = a.kode;
      $("aNama").value = a.nama;
      $("aSatuan").value = a.satuan;
    };
  });

  tb.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      try {
        await ensurePin();
        await api(`/api/accessories?kode=${encodeURIComponent(b.dataset.del)}`, {
          method: "DELETE",
          headers: { ...pinHeaders() },
        });
        PIN_TOKEN = "";
        await loadAccessories();
        renderAccessoriesTable();
        log("deleted acc " + b.dataset.del);
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderItemsTable() {
  const tb = $("tblItems")?.querySelector("tbody");
  if (!tb) return;
  tb.innerHTML = "";

  ITEMS.forEach((i) => {
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

  tb.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      try {
        await ensurePin();
        await api(`/api/items?kode=${encodeURIComponent(b.dataset.del)}`, {
          method: "DELETE",
          headers: { ...pinHeaders() },
        });
        PIN_TOKEN = "";
        await loadItems();
        renderItemsTable();
        renderItemSelect();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderItemSelect() {
  const sel = $("selItem");
  if (!sel) return;
  sel.innerHTML = "";

  ITEMS.forEach((i) => {
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = `${i.kode} - ${i.nama}`;
    sel.appendChild(opt);
  });

  sel.onchange = () => {
    const it = ITEMS.find((x) => String(x.id) === String(sel.value));
    $("itemInfo").textContent = it ? `Dimensi: ${it.dimensi} | Buyer: ${it.buyer}` : "";
  };

  sel.onchange();
}

// ====== Save master records ======
$("btnSaveMaterial").onclick = async () => {
  try {
    await ensurePin();
    const payload = {
      kode: $("mKode").value.trim(),
      jenis: $("mJenis").value.trim(),
      deskripsi: $("mDesc").value.trim(),
      berat_per_meter: Number($("mBerat").value || 0),
      luas_per_meter: Number($("mLuas").value || 0),
      panjang_las: Number($("mLas").value || 0),
    };

    await api("/api/materials", {
      method: "POST",
      headers: { "content-type": "application/json", ...pinHeaders() },
      body: JSON.stringify(payload),
    });

    PIN_TOKEN = "";
    await loadMaterials();
    renderMaterialsTable();
    log("material saved");
  } catch (e) {
    alert(e.message);
  }
};

$("btnSaveAcc").onclick = async () => {
  try {
    await ensurePin();
    const payload = {
      kode: $("aKode").value.trim(),
      nama: $("aNama").value.trim(),
      satuan: $("aSatuan").value.trim(),
    };

    await api("/api/accessories", {
      method: "POST",
      headers: { "content-type": "application/json", ...pinHeaders() },
      body: JSON.stringify(payload),
    });

    PIN_TOKEN = "";
    await loadAccessories();
    renderAccessoriesTable();
  } catch (e) {
    alert(e.message);
  }
};

$("btnSaveItem").onclick = async () => {
  try {
    await ensurePin();
    const payload = {
      kode: $("iKode").value.trim(),
      nama: $("iNama").value.trim(),
      dimensi: $("iDimensi").value.trim(),
      buyer: $("iBuyer").value.trim(),
    };

    await api("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", ...pinHeaders() },
      body: JSON.stringify(payload),
    });

    PIN_TOKEN = "";
    await loadItems();
    renderItemsTable();
    renderItemSelect();
  } catch (e) {
    alert(e.message);
  }
};

// ====== Import materials CSV ======
$("btnImportMaterials").onclick = async () => {
  try {
    const f = $("csvFile").files[0];
    if (!f) return alert("Pilih file CSV dulu");

    await ensurePin();
    const text = await f.text();

    await api("/api/materials-import", {
      method: "POST",
      headers: { "content-type": "text/plain", ...pinHeaders() },
      body: text,
    });

    PIN_TOKEN = "";
    await loadMaterials();
    renderMaterialsTable();
    alert("Import sukses");
  } catch (e) {
    alert(e.message);
  }
};

// ====== BOM Dashboard ======
async function loadBoms() {
  const r = await api("/api/boms");
  return r.rows || [];
}

async function renderBoms() {
  const rows = await loadBoms();
  const tb = $("tblBoms")?.querySelector("tbody");
  if (!tb) return;
  tb.innerHTML = "";

  rows.forEach((b) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${b.bom_code}</b></td>
      <td>${b.item_kode} - ${b.item_nama}<div class="muted small">${b.dimensi}</div></td>
      <td>${b.buyer}</td>
      <td>${b.created_at}</td>
      <td>
        <button class="btn" data-view="${b.id}">View</button>
        <button class="btn" data-open="${b.id}">Open</button>
        <button class="btn danger" data-del="${b.id}">Delete</button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("[data-view]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const bomId = btn.dataset.view;
        const html = await fetchExportHtml(bomId);
        showViewer(html, "View / Print BOM");
      } catch (e) {
        alert(e.message);
      }
    };
  });

  tb.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = async () => {
      await openBom(btn.dataset.open);
      document.querySelector('[data-tab="bom"]')?.click();
    };
  });

  tb.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await ensurePin();
        await api(`/api/boms?id=${encodeURIComponent(btn.dataset.del)}`, {
          method: "DELETE",
          headers: { ...pinHeaders() },
        });
        PIN_TOKEN = "";
        await renderBoms();
      } catch (e) {
        alert(e.message);
      }
    };
  });

  if ($("bomsInfo")) $("bomsInfo").textContent = `${rows.length} BOM`;
}

$("btnRefreshBoms").onclick = () => renderBoms();

// ====== BOM editor ======
function makeMaterialOptions(selected = "") {
  if (!MATERIALS.length) return `<option value="">(material kosong)</option>`;
  return MATERIALS
    .map((m) => {
      const v = m.kode;
      const label = `(${m.kode}) ${m.deskripsi}`;
      const sel = v === selected ? "selected" : "";
      return `<option value="${v}" ${sel}>${label}</option>`;
    })
    .join("");
}

function makeAccessoryOptions(selected = "") {
  if (!ACCESSORIES.length) return `<option value="">(aksesoris kosong)</option>`;
  return ACCESSORIES
    .map((a) => {
      const sel = a.kode === selected ? "selected" : "";
      return `<option value="${a.kode}" ${sel}>(${a.kode}) ${a.nama}</option>`;
    })
    .join("");
}

function addLineRow(line = {}) {
  const tb = $("tblLines")?.querySelector("tbody");
  if (!tb) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="c"><input class="input lineNo" value="${line.line_no ?? (tb.children.length + 1)}" /></td>
    <td><input class="input compName" value="${line.nama_komponen || ""}" placeholder="Nama komponen" /></td>
    <td>
      <select class="input matSel">${makeMaterialOptions(line.material_kode || (MATERIALS[0]?.kode || ""))}</select>
    </td>
    <td><input class="input qty" type="number" value="${line.qty ?? 1}" /></td>
    <td><input class="input panjang" type="number" value="${line.panjang_mm ?? 0}" /></td>
    <td><button class="btn danger" type="button">Hapus</button></td>
  `;
  tr.querySelector("button").onclick = () => {
    tr.remove();
    renumberTable("tblLines");
  };
  tb.appendChild(tr);
  renumberTable("tblLines");
}

function addAccRow(x = {}) {
  const tb = $("tblAcc")?.querySelector("tbody");
  if (!tb) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="c"><input class="input lineNo" value="${x.line_no ?? (tb.children.length + 1)}" /></td>
    <td><select class="input accSel">${makeAccessoryOptions(x.accessory_kode || (ACCESSORIES[0]?.kode || ""))}</select></td>
    <td><input class="input qty" type="number" value="${x.qty ?? 1}" /></td>
    <td><button class="btn danger" type="button">Hapus</button></td>
  `;
  tr.querySelector("button").onclick = () => {
    tr.remove();
    renumberTable("tblAcc");
  };
  tb.appendChild(tr);
  renumberTable("tblAcc");
}

function renumberTable(tblId) {
  const tb = $(tblId)?.querySelector("tbody");
  if (!tb) return;
  [...tb.children].forEach((tr, i) => {
    const inp = tr.querySelector("input.lineNo");
    if (inp) inp.value = i + 1;
  });
}

$("btnAddLine").onclick = () => addLineRow();
$("btnAddAcc").onclick = () => addAccRow();

$("btnPin").onclick = async () => {
  try {
    await ensurePin();
    alert("PIN OK (token siap dipakai 1x)");
  } catch (e) {
    alert(e.message);
  }
};

let CURRENT_BOM_ID = null;

async function openBom(id) {
  const r = await api(`/api/boms?id=${encodeURIComponent(id)}`);

  CURRENT_BOM_ID = r.bom.id;
  $("currentBomId").value = r.bom.id;
  $("currentBomInfo").textContent = `${r.bom.bom_code} | ${r.bom.created_at}`;

  if (r.bom.item_id) {
    $("selItem").value = r.bom.item_id;
  } else {
    const item = ITEMS.find((x) => x.kode === r.bom.item_kode);
    if (item) $("selItem").value = item.id;
  }
  $("selItem").dispatchEvent(new Event("change"));

  const tbL = $("tblLines").querySelector("tbody");
  tbL.innerHTML = "";
  (r.lines || []).forEach(addLineRow);

  const tbA = $("tblAcc").querySelector("tbody");
  tbA.innerHTML = "";
  (r.accessories || []).forEach(addAccRow);

  log({ opened: r.bom });
}

function collectLines() {
  const tb = $("tblLines")?.querySelector("tbody");
  if (!tb) return [];

  return [...tb.children].map((tr) => ({
    line_no: Number(tr.querySelector("input.lineNo")?.value || 0),
    nama_komponen: (tr.querySelector("input.compName")?.value || "").trim(),
    material_kode: tr.querySelector("select.matSel")?.value || "",
    qty: Number(tr.querySelector("input.qty")?.value || 0),
    panjang_mm: Number(tr.querySelector("input.panjang")?.value || 0),
  }));
}

function collectAcc() {
  const tb = $("tblAcc")?.querySelector("tbody");
  if (!tb) return [];

  return [...tb.children].map((tr) => ({
    line_no: Number(tr.querySelector("input.lineNo")?.value || 0),
    accessory_kode: tr.querySelector("select.accSel")?.value || "",
    qty: Number(tr.querySelector("input.qty")?.value || 0),
  }));
}

// Create BOM (PIN)
$("btnCreateBom").onclick = async () => {
  try {
    await ensurePin();
    const item_id = Number($("selItem").value);
    const payload = { item_id, lines: collectLines(), accessories: collectAcc() };

    const r = await api("/api/boms", {
      method: "POST",
      headers: { "content-type": "application/json", ...pinHeaders() },
      body: JSON.stringify(payload),
    });

    PIN_TOKEN = "";
    await renderBoms();
    alert(`BOM dibuat: ${r.bom_code}`);
  } catch (e) {
    alert(e.message);
  }
};

// Update Lines (PIN)
$("btnUpdateLines").onclick = async () => {
  try {
    if (!CURRENT_BOM_ID) return alert("Open BOM dulu dari Dashboard (Open)");
    await ensurePin();

    await api("/api/bom-lines", {
      method: "PUT",
      headers: { "content-type": "application/json", ...pinHeaders() },
      body: JSON.stringify({ bom_id: CURRENT_BOM_ID, lines: collectLines() }),
    });

    PIN_TOKEN = "";
    alert("Lines updated");
  } catch (e) {
    alert(e.message);
  }
};

// Export PDF/View (NO PIN) -> viewer overlay
$("btnExport").onclick = async () => {
  try {
    if (!CURRENT_BOM_ID) return alert("Open BOM dulu dari Dashboard (Open)");
    const html = await fetchExportHtml(CURRENT_BOM_ID);
    showViewer(html, "View / Print BOM");
  } catch (e) {
    alert(e.message);
  }
};

// Upload logo (PIN)
$("btnUploadLogo").onclick = async () => {
  try {
    const f = $("logoFile").files[0];
    if (!f) return alert("Pilih file logo dulu");

    await ensurePin();
    const fd = new FormData();
    fd.append("file", f);

    await api("/api/upload-logo", {
      method: "POST",
      headers: { ...pinHeaders() },
      body: fd,
    });

    PIN_TOKEN = "";
    alert("Logo uploaded");
  } catch (e) {
    alert(e.message);
  }
};

// Refresh buttons
$("btnRefreshMaterials").onclick = async () => {
  await loadMaterials();
  renderMaterialsTable();
};
$("btnRefreshAccessories").onclick = async () => {
  await loadAccessories();
  renderAccessoriesTable();
};
$("btnRefreshItems").onclick = async () => {
  await loadItems();
  renderItemsTable();
  renderItemSelect();
};

async function boot() {
  // bikin viewer sejak awal biar aman (fix error null)
  ensureViewerUI();

  await loadMaterials();
  renderMaterialsTable();

  await loadAccessories();
  renderAccessoriesTable();

  await loadItems();
  renderItemsTable();
  renderItemSelect();

  await renderBoms();

  const tbL = $("tblLines")?.querySelector("tbody");
  if (tbL && tbL.children.length === 0) addLineRow({ qty: 1, panjang_mm: 0 });

  const tbA = $("tblAcc")?.querySelector("tbody");
  if (tbA && tbA.children.length === 0 && ACCESSORIES.length) addAccRow({ qty: 0 });

  if ($("itemInfo")) $("itemInfo").textContent = "";
  if ($("currentBomInfo")) $("currentBomInfo").textContent = "Open BOM dari Dashboard untuk edit/export";
}

// auto check session
(async () => {
  try {
    await api("/api/materials");
    await setLoggedUI(true);
    await boot();
  } catch {
    await setLoggedUI(false);
  }
})();
