import { serviceClient } from "../_shared/fulfill.ts";
import { corsHeaders, json } from "../_shared/http.ts";

// Always answers the same way so the form cannot be used to find out which emails have accounts.
const SENT = { ok: true, message: "If that email has a Brylla Academy account, a reset link is on its way." };

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (request.method !== "POST") return json({ error: "Use POST." }, 405);
	try {
		const body = await request.json();
		const email = String(body.email || "").trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);
		const supabase = serviceClient();
		const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const { count } = await supabase.from("email_events").select("id", { count: "exact", head: true }).eq("email", email).eq("kind", "password_reset").gte("created_at", since);
		if ((count ?? 0) >= 3) return json({ error: "Too many requests. Try again in an hour." }, 429);
		const site = Deno.env.get("SITE_URL") || "https://bryllaacademy.vercel.app";
		const link = await supabase.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: site + "/set-password" } });
		const actionLink = link.data?.properties?.action_link;
		if (link.error || !actionLink) return json(SENT);
		const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
		const from = Deno.env.get("RESEND_FROM") ?? "";
		let status = "waiting_for_email_provider";
		if (resendKey && from) {
			const response = await fetch("https://api.resend.com/emails", {
				method: "POST",
				headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
				body: JSON.stringify({ from, to: email, subject: "Reset your Brylla Academy password", html: resetHtml(actionLink) }),
			});
			status = response.ok ? "sent" : "failed";
		}
		await supabase.from("email_events").insert({ email, kind: "password_reset", status });
		return json(SENT);
	} catch (error) {
		console.error("password_reset_failed");
		return json({ error: "The reset email could not be sent. Try again." }, 500);
	}
});

function resetHtml(link: string): string {
	const safe = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
	return `<div style="font-family:Arial,sans-serif;color:#122d49;max-width:520px"><p>Hello,</p><p>Use the button to choose a new password for Brylla Academy. The link can be used once.</p><p><a href="${safe}" style="background:#073b70;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Choose a new password</a></p><p>If you did not ask for this, you can ignore this email. Your password stays the same.</p><p>Brylla Academy</p></div>`;
}
