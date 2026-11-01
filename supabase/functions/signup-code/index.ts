import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function serviceClient() {
	const url = Deno.env.get("SUPABASE_URL") ?? "";
	const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
	if (!url || !key) throw new Error("Supabase service credentials are not configured.");
	return createClient(url, key, { auth: { persistSession: false } });
}

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (request.method !== "POST") return json({ error: "Use POST." }, 405);
	try {
		const body = await request.json();
		const action = String(body.action || "");
		const email = String(body.email || "").trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);
		const supabase = serviceClient();
		if (action === "send") return await sendCode(supabase, email, String(body.name || ""));
		if (action === "verify") return await verifyCode(supabase, email, String(body.code || ""));
		if (action === "complete") return await completeSignup(supabase, email, String(body.token || ""), String(body.password || ""));
		return json({ error: "That step is not available." }, 400);
	} catch (_error) {
		return json({ error: "The email check could not be completed. Try again." }, 500);
	}
});

async function sendCode(supabase: ReturnType<typeof serviceClient>, email: string, rawName: string) {
	const name = rawName.trim();
	if (name.length < 2 || name.length > 120) return json({ error: "Enter your full name." }, 400);
	const role = await supabase.rpc("account_role_for_email", { p_email: email });
	if (role.error) return json({ error: "The link could not be sent. Try again." }, 500);
	if (role.data === "founder" || role.data === "instructor") {
		return json({ error: "An account with this email already exists. Sign in instead." }, 409);
	}
	const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const recent = await supabase.from("email_events").select("id", { count: "exact", head: true }).eq("email", email).eq("kind", "signup_code").gte("created_at", since);
	if ((recent.count ?? 0) >= 5) return json({ error: "Too many emails. Try again in an hour." }, 429);
	const token = randomHex(32);
	const salt = randomHex(16);
	const tokenHash = await sha256(email + ":" + token);
	const hash = await sha256(salt + ":" + token);
	const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
	const saved = await supabase.from("signup_codes").upsert({
		email,
		full_name: name,
		code_salt: salt,
		code_hash: hash,
		expires_at: expires,
		attempts: 0,
		token_hash: tokenHash,
		token_expires_at: expires,
		updated_at: new Date().toISOString(),
	});
	if (saved.error) return json({ error: "The link could not be sent. Try again." }, 500);
	const site = (Deno.env.get("SITE_URL") || "https://bryllaacademy.vercel.app").replace(/\/$/, "");
	const link = site + "/set-password?email=" + encodeURIComponent(email) + "&token=" + encodeURIComponent(token);
	const sent = await sendEmail(email, name, link);
	await supabase.from("email_events").insert({ email, kind: "signup_code", status: sent.ok ? "sent" : "failed" });
	if (!sent.ok) {
		await supabase.from("signup_codes").delete().eq("email", email);
		return json({ error: sent.error || "The link could not be emailed. Try again." }, 502);
	}
	return json({ ok: true });
}

async function verifyCode(supabase: ReturnType<typeof serviceClient>, email: string, rawCode: string) {
	const code = rawCode.replace(/\D/g, "");
	if (code.length !== 6) return json({ error: "Enter the 6-digit code." }, 400);
	const row = await supabase.from("signup_codes").select("code_salt,code_hash,expires_at,attempts").eq("email", email).maybeSingle();
	if (row.error || !row.data) return json({ error: "Request a new code from sign up." }, 400);
	if (row.data.attempts >= 5 || new Date(row.data.expires_at).getTime() < Date.now()) {
		return json({ error: "That code has expired. Request a new one." }, 400);
	}
	await supabase.from("signup_codes").update({ attempts: row.data.attempts + 1, updated_at: new Date().toISOString() }).eq("email", email);
	const hash = await sha256(row.data.code_salt + ":" + code);
	if (!same(hash, row.data.code_hash)) return json({ error: "That code does not match. Try again." }, 400);
	const token = randomHex(32);
	const tokenHash = await sha256(email + ":" + token);
	const marked = await supabase.from("signup_codes").update({
		token_hash: tokenHash,
		token_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
		updated_at: new Date().toISOString(),
	}).eq("email", email);
	if (marked.error) return json({ error: "The code could not be checked. Try again." }, 500);
	return json({ ok: true, token });
}

async function completeSignup(supabase: ReturnType<typeof serviceClient>, email: string, token: string, password: string) {
	if (token.length < 32) return json({ error: "Verify your email, then choose a password." }, 400);
	if (password.length < 8 || password.length > 72) return json({ error: "Use a password of at least 8 characters." }, 400);
	const row = await supabase.from("signup_codes").select("full_name,token_hash,token_expires_at").eq("email", email).maybeSingle();
	if (row.error || !row.data || !row.data.token_hash || !row.data.token_expires_at) {
		return json({ error: "Verify your email, then choose a password." }, 400);
	}
	if (new Date(row.data.token_expires_at).getTime() < Date.now()) {
		return json({ error: "That link has expired. Sign up again to get a new one." }, 400);
	}
	const tokenHash = await sha256(email + ":" + token);
	if (!same(tokenHash, row.data.token_hash)) return json({ error: "Verify your email, then choose a password." }, 400);
	const role = await supabase.rpc("account_role_for_email", { p_email: email });
	if (role.error) return json({ error: "The password could not be saved. Try again." }, 500);
	if (role.data === "founder" || role.data === "instructor") {
		return json({ error: "An account with this email already exists. Sign in instead." }, 409);
	}
	const existing = await supabase.rpc("user_id_for_email", { p_email: email });
	if (existing.error) return json({ error: "The password could not be saved. Try again." }, 500);
	let userId = existing.data as string | null;
	if (userId) {
		const updated = await supabase.auth.admin.updateUserById(userId, {
			password,
			email_confirm: true,
			user_metadata: { full_name: row.data.full_name },
		});
		if (updated.error) return json({ error: "The password could not be saved. Try again." }, 500);
	} else {
		const created = await supabase.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: row.data.full_name },
		});
		if (created.error || !created.data.user) return json({ error: "The account could not be created. Try again." }, 500);
		userId = created.data.user.id;
	}
	const profile = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
	if (profile.error) return json({ error: "The account could not be finished. Try again." }, 500);
	if (!profile.data) {
		const inserted = await supabase.from("profiles").insert({ id: userId, full_name: row.data.full_name, role: "student" });
		if (inserted.error) return json({ error: "The account could not be finished. Try again." }, 500);
	} else if (profile.data.role !== "student") {
		return json({ error: "An account with this email already exists. Sign in instead." }, 409);
	} else {
		await supabase.from("profiles").update({ full_name: row.data.full_name }).eq("id", userId);
	}
	await supabase.from("signup_codes").delete().eq("email", email);
	return json({ ok: true });
}

function randomHex(bytes: number): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return [...buffer].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function same(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	return mismatch === 0;
}

async function sendEmail(email: string, name: string, link: string): Promise<{ ok: boolean; error: string }> {
	const key = Deno.env.get("RESEND_API_KEY") ?? "";
	const from = Deno.env.get("RESEND_FROM") ?? "";
	if (!key || !from) return { ok: false, error: "The email service is not configured." };
	const safeName = name.replace(/[<>&]/g, "");
	const safeLink = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
		body: JSON.stringify({
			from,
			to: email,
			subject: "Finish your Brylla Academy registration",
			html: `<div style="font-family:Arial,sans-serif;color:#122d49;max-width:520px"><p>Hello ${safeName},</p><p>Click the button to choose your password and finish creating your Brylla Academy account.</p><p><a href="${safeLink}" style="background:#073b70;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Choose a password</a></p><p>The link expires in 24 hours. If you did not sign up, you can ignore this email.</p><p>Brylla Academy</p></div>`,
		}),
	});
	if (response.ok) return { ok: true, error: "" };
	let message = "The link could not be emailed. Try again.";
	try {
		const payload = await response.json();
		if (payload && typeof payload.message === "string" && payload.message.trim()) message = payload.message.trim().slice(0, 180);
	} catch (_error) {
		message = "The link could not be emailed. Try again.";
	}
	return { ok: false, error: message };
}
