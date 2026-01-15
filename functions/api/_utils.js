export function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function bad(msg, status=400){
  return json({ ok:false, error: msg }, status);
}

export function ok(data={}){
  return json({ ok:true, ...data });
}

export function parseCookies(req){
  const h = req.headers.get("cookie") || "";
  const out = {};
  h.split(";").forEach(p=>{
    const [k,...rest] = p.trim().split("=");
    if(!k) return;
    out[k]=decodeURIComponent(rest.join("=")||"");
  });
  return out;
}

export function randId(len=32){
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function sha256Hex(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

export async function hashWithSalt(value, salt){
  // sample hashing; for production bisa upgrade ke scrypt/bcrypt libs
  return sha256Hex(`${salt}:${value}`);
}

export async function requireUser(req, env){
  const cookies = parseCookies(req);
  const sid = cookies[env.COOKIE_NAME || "bom_session"];
  if(!sid) return null;

  const row = await env.BOM_DB.prepare(
    "SELECT s.id, s.user_id, s.expires_at, u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?"
  ).bind(sid).first();

  if(!row) return null;
  if(new Date(row.expires_at).getTime() < Date.now()){
    await env.BOM_DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
    return null;
  }
  return { user_id: row.user_id, username: row.username, session_id: row.id };
}

export async function requirePin(req, env, userId){
  // Header X-PIN-TOKEN: token hasil verifikasi PIN (TTL pendek)
  const token = req.headers.get("x-pin-token") || "";
  if(!token) return false;

  const row = await env.BOM_DB.prepare(
    "SELECT value FROM settings WHERE key=?"
  ).bind(`pin_token:${token}`).first();

  if(!row) return false;
  const payload = JSON.parse(row.value);
  if(payload.user_id !== userId) return false;
  if(Date.now() > payload.expires_ms) return false;

  // token one-time use optional: delete after use
  await env.BOM_DB.prepare("DELETE FROM settings WHERE key=?").bind(`pin_token:${token}`).run();
  return true;
}
