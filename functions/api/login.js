import { ok, bad, randId, hashWithSalt } from "./_utils.js";

export async function onRequestPost({ request, env }){
  const body = await request.json().catch(()=>null);
  if(!body?.username || !body?.password) return bad("username/password wajib");

  const u = await env.BOM_DB.prepare(
    "SELECT id, username, password_hash, salt FROM users WHERE username=?"
  ).bind(body.username).first();

  if(!u) return bad("Login gagal", 401);

  const hash = await hashWithSalt(body.password, u.salt);
  if(hash !== u.password_hash) return bad("Login gagal", 401);

  const sid = randId(32);
  const ttlH = Number(env.SESSION_TTL_HOURS || 72);
  const expires = new Date(Date.now() + ttlH*3600*1000).toISOString();

  await env.BOM_DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)"
  ).bind(sid, u.id, expires).run();

  return new Response(JSON.stringify({ ok:true, username:u.username }), {
    headers:{
      "content-type":"application/json; charset=utf-8",
      "set-cookie": `${env.COOKIE_NAME || "bom_session"}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlH*3600}`
    }
  });
}
