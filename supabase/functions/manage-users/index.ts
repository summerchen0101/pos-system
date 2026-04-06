/**
 * Admin-only user management (Auth + public.users + user_booths).
 * Deploy: `supabase functions deploy manage-users`
 * Requires secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set automatically on hosted Supabase).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
): Promise<
  | { ok: true; adminClient: SupabaseClient; actorId: string }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) {
    return { ok: false, response: json({ ok: false, code: "NO_AUTH" }) };
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return { ok: false, response: json({ ok: false, code: "INVALID_SESSION" }) };
  }

  const actorId = userData.user.id;
  const { data: profile } = await adminClient
    .from("users")
    .select("role")
    .eq("id", actorId)
    .single();

  if (profile?.role !== "ADMIN") {
    return { ok: false, response: json({ ok: false, code: "FORBIDDEN" }) };
  }

  return { ok: true, adminClient, actorId };
}

async function fetchAllAuthUsers(adminClient: SupabaseClient) {
  const all: { id: string; email?: string | null }[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users ?? [];
    for (const u of batch) {
      all.push({ id: u.id, email: u.email });
    }
    if (batch.length < perPage) break;
    page += 1;
  }
  return all;
}

async function emailExists(adminClient: SupabaseClient, email: string): Promise<boolean> {
  const lower = email.toLowerCase();
  const authUsers = await fetchAllAuthUsers(adminClient);
  return authUsers.some((u) => (u.email ?? "").toLowerCase() === lower);
}

async function verifyBoothIds(adminClient: SupabaseClient, boothIds: string[]): Promise<boolean> {
  if (boothIds.length === 0) return true;
  const { count, error } = await adminClient
    .from("booths")
    .select("*", { count: "exact", head: true })
    .in("id", boothIds);
  if (error) throw error;
  return (count ?? 0) === boothIds.length;
}

async function syncUserBooths(
  adminClient: SupabaseClient,
  userId: string,
  role: string,
  boothIds: string[],
) {
  const { error: derr } = await adminClient.from("user_booths").delete().eq("user_id", userId);
  if (derr) throw derr;
  if (role !== "STAFF" || boothIds.length === 0) return;
  const { error: ierr } = await adminClient.from("user_booths").insert(
    boothIds.map((booth_id) => ({ user_id: userId, booth_id })),
  );
  if (ierr) throw ierr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, code: "SERVER_MISCONFIGURED" });
  }

  const gate = await requireAdmin(req, supabaseUrl, serviceKey);
  if (!gate.ok) return gate.response;
  const { adminClient, actorId } = gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: "BAD_JSON" });
  }

  const action = String(body.action ?? "");

  try {
    if (action === "list") {
      const { data: profiles, error: pErr } = await adminClient
        .from("users")
        .select("id, name, role, user_booths(booth_id)")
        .order("name");
      if (pErr) throw pErr;

      const authUsers = await fetchAllAuthUsers(adminClient);
      const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? ""]));

      const users = (profiles ?? []).map((p: {
        id: string;
        name: string;
        role: string;
        user_booths: { booth_id: string }[] | null;
      }) => ({
        id: p.id,
        email: emailById.get(p.id) ?? "",
        name: p.name,
        role: p.role,
        boothIds: (p.user_booths ?? []).map((x) => x.booth_id),
      }));

      return json({ ok: true, users });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const name = String(body.name ?? "").trim();
      const role = body.role as string;
      const boothIds = Array.isArray(body.boothIds)
        ? (body.boothIds as unknown[]).map((x) => String(x))
        : [];

      if (!name) return json({ ok: false, code: "VALIDATION", message: "name" });
      if (!EMAIL_RE.test(email)) return json({ ok: false, code: "INVALID_EMAIL" });
      if (password.length < 6) return json({ ok: false, code: "PASSWORD_SHORT" });
      if (role !== "ADMIN" && role !== "STAFF") return json({ ok: false, code: "VALIDATION", message: "role" });

      if (!(await verifyBoothIds(adminClient, boothIds))) {
        return json({ ok: false, code: "INVALID_BOOTHS" });
      }

      if (await emailExists(adminClient, email)) {
        return json({ ok: false, code: "EMAIL_TAKEN" });
      }

      const { data: created, error: cErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (cErr || !created.user) {
        const msg = (cErr?.message ?? "").toLowerCase();
        if (
          msg.includes("already") ||
          msg.includes("registered") ||
          msg.includes("duplicate") ||
          msg.includes("exists")
        ) {
          return json({ ok: false, code: "EMAIL_TAKEN" });
        }
        return json({ ok: false, code: "AUTH_ERROR", message: cErr?.message ?? "createUser" });
      }

      const userId = created.user.id;

      const { error: uErr } = await adminClient
        .from("users")
        .update({ name, role })
        .eq("id", userId);
      if (uErr) throw uErr;

      await syncUserBooths(adminClient, userId, role, boothIds);

      return json({ ok: true });
    }

    if (action === "update") {
      const userId = String(body.userId ?? "");
      const name = String(body.name ?? "").trim();
      const role = body.role as string;
      const boothIds = Array.isArray(body.boothIds)
        ? (body.boothIds as unknown[]).map((x) => String(x))
        : [];
      const passwordRaw = body.password;
      const password =
        passwordRaw == null || passwordRaw === ""
          ? ""
          : String(passwordRaw);

      if (!UUID_RE.test(userId)) return json({ ok: false, code: "VALIDATION", message: "userId" });
      if (!name) return json({ ok: false, code: "VALIDATION", message: "name" });
      if (role !== "ADMIN" && role !== "STAFF") return json({ ok: false, code: "VALIDATION", message: "role" });
      if (password.length > 0 && password.length < 6) {
        return json({ ok: false, code: "PASSWORD_SHORT" });
      }

      if (!(await verifyBoothIds(adminClient, boothIds))) {
        return json({ ok: false, code: "INVALID_BOOTHS" });
      }

      if (password.length > 0) {
        const { error: pErr } = await adminClient.auth.admin.updateUserById(userId, { password });
        if (pErr) return json({ ok: false, code: "AUTH_ERROR", message: pErr.message });
      }

      const { error: metaErr } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { name },
      });
      if (metaErr) return json({ ok: false, code: "AUTH_ERROR", message: metaErr.message });

      const { error: uErr } = await adminClient.from("users").update({ name, role }).eq("id", userId);
      if (uErr) throw uErr;

      const effectiveBooths = role === "STAFF" ? boothIds : [];
      await syncUserBooths(adminClient, userId, role, effectiveBooths);

      return json({ ok: true });
    }

    if (action === "delete") {
      const userId = String(body.userId ?? "");
      if (!UUID_RE.test(userId)) return json({ ok: false, code: "VALIDATION", message: "userId" });

      if (userId === actorId) {
        return json({ ok: false, code: "SELF_DELETE" });
      }

      const { data: target } = await adminClient
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (target?.role === "ADMIN") {
        const { data: admins, error: aErr } = await adminClient.from("users").select("id").eq("role", "ADMIN");
        if (aErr) throw aErr;
        if ((admins ?? []).length <= 1) {
          return json({ ok: false, code: "LAST_ADMIN" });
        }
      }

      const { error: dErr } = await adminClient.auth.admin.deleteUser(userId, false);
      if (dErr) return json({ ok: false, code: "AUTH_ERROR", message: dErr.message });

      return json({ ok: true });
    }

    return json({ ok: false, code: "UNKNOWN_ACTION" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, code: "INTERNAL", message });
  }
});
