import { ok, bad, randId, hashWithSalt } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  // ===== GUARD: pastikan D1 binding kebaca =====
  const db = env.BOM_DB;
  if (!db) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "D1 binding missing. Pastikan Pages → Settings → Bindings → BOM_DB terpasang."
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // ===== Parse body =====
  const body = await request.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return bad("username/password wajib", 400);
  }

  // ===== Ambil user =====
  let u;
  try {
    u = await db.prepare(
      "SELECT id, username, password_hash, salt FROM users WHERE username=?"
    ).bind(body.username).first();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok:false, error:"DB error (users query)", detail:String(e) }),
      { status:500, headers:{ "content-type":"application/json" } }
    );
  }

  if (!u) return bad("Login gagal", 401);

  // ===== Cek password =====
  const hash = await hashWithSalt(body.password, u.salt);
  if (hash !== u.password_hash) return bad("Login gagal", 401);

  // ===== Buat session =====
  const sid = randId(32);
  const ttlH = Number(env.SESSION_TTL_HOURS || 72);
  const expires = new Date(Date.now() + ttlH * 3600 * 1000).toISOString();

  try {
    await db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)"
    ).bind(sid, u.id, expires).run();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok:false, error:"DB error (sessions insert)", detail:String(e) }),
      { status:500, headers:{ "content-type":"application/json" } }
    );
  }

  // ===== Set cookie =====
  const cookieName = (env.COOKIE_NAME || "bom_session").trim();

  return new Response(
    JSON.stringify({ ok: true, username: u.username }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": `${cookieName}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlH * 3600}`
      }
    }
  );
}
