import { ok, bad, requireUser, requirePin } from "./_utils.js";

export async function onRequestPost({ request, env }){
  const user = await requireUser(request, env);
  if(!user) return bad("Unauthorized", 401);

  const pinOK = await requirePin(request, env, user.user_id);
  if(!pinOK) return bad("PIN required", 403);

  const form = await request.formData();
  const file = form.get("file");
  if(!file) return bad("file required");

  const key = "logo/current.png";
  const arrayBuffer = await file.arrayBuffer();

  await env.BOM_R2.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || "image/png" }
  });

  await env.BOM_DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)"
  ).bind("logo_key", key).run();

  return ok({ key });
}
