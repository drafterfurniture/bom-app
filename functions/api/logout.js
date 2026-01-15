import { ok, parseCookies } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  const cookies = parseCookies(request);
  const sid = cookies[env.COOKIE_NAME || "bom_session"];
  if(sid){
    await env.BOM_DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
  }
  return new Response(JSON.stringify({ ok:true }), {
    headers:{
      "content-type":"application/json; charset=utf-8",
      "set-cookie": `${env.COOKIE_NAME || "bom_session"}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    }
  });
}
