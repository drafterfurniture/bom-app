import { ok, bad, requireUser, randId, hashWithSalt } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const body = await request.json().catch(()=>null);
  if(!body?.pin) return bad("PIN wajib");

  const u = await env.BOM_DB.prepare(
    "SELECT id, pin_hash, pin_salt FROM users WHERE id=?"
  ).bind(user.user_id).first();

  const h = await hashWithSalt(body.pin, u.pin_salt);
  if(h !== u.pin_hash) return bad("PIN salah", 403);

  // token TTL 2 menit
  const token = randId(16);
  const expires_ms = Date.now() + 2*60*1000;
  await env.BOM_DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)"
  ).bind(`pin_token:${token}`, JSON.stringify({ user_id: user.user_id, expires_ms })).run();

  return ok({ pin_token: token, expires_in_sec: 120 });
}
