import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const uid = Date.now();
const email = `qa-clip-${uid}@test.dev`;
const password = "QaPass_12345";

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name: `QA Clip ${uid}` },
});
if (error) throw new Error("createUser: " + error.message);
console.log("user id:", data.user.id);
console.log(JSON.stringify({ uid, userId: data.user.id, email, password }));
