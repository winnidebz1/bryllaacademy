import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { syncMarketingContact } from "../_shared/email-provider.ts";
import { logActivity } from "../_shared/activity.ts";

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
		const supabase = serviceClient();
		const saved = await supabase.rpc("submit_lead", {
			p_kind: String(body.kind || ""),
			p_full_name: String(body.fullName || body.full_name || ""),
			p_email: String(body.email || ""),
			p_consent: Boolean(body.marketingConsent ?? body.consent),
			p_course: body.courseId || body.course_id || null,
			p_freebie: body.freebieId || body.freebie_id || null,
			p_source: String(body.source || "website"),
			p_honeypot: String(body.company || body.website || ""),
		});
		if (saved.error) return json({ ok: false, error: saved.error.message || "The form could not be saved." }, 400);
		const payload = saved.data || {};
		if (!payload.ok) return json(payload, 400);
		if (payload.contact_id && payload.sync_needed !== false && !payload.unsubscribed) {
			await syncLater(supabase, String(payload.contact_id), String(body.fullName || ""), String(body.email || ""), payload, body);
		}
		const kind = String(body.kind || "lead");
		await logActivity(supabase, {
			event_type: kind === "waitlist" ? "website.waitlist.submitted" : (kind === "freebie" ? "website.download.requested" : "website.contact.submitted"),
			category: "Website",
			action: kind === "waitlist" ? "Waitlist submitted" : (kind === "freebie" ? "Free material download requested" : "Lead submitted"),
			description: kind === "waitlist" ? "A visitor joined a course waitlist" : (kind === "freebie" ? "A visitor requested a free material" : "A website lead was submitted"),
			actor_name: String(body.fullName || body.full_name || ""),
			actor_email: String(body.email || "").trim().toLowerCase(),
			actor_role: "Anonymous",
			target_type: kind === "freebie" ? "freebie" : "lead",
			target_id: String(body.freebieId || body.courseId || body.freebie_id || body.course_id || kind),
			target_name: String(body.freebieId || body.courseId || body.freebie_id || body.course_id || kind),
			metadata: { kind: kind, source: String(body.source || "website") },
			status: "Success",
			severity: "Info",
		});
		return json(payload);
	} catch (_error) {
		return json({ ok: false, error: "The form could not be saved. Try again." }, 500);
	}
});

async function syncLater(
	supabase: ReturnType<typeof serviceClient>,
	contactId: string,
	name: string,
	email: string,
	payload: Record<string, unknown>,
	body: Record<string, unknown>,
) {
	try {
		const tags = ["brylla-academy"];
		if (body.kind === "freebie") tags.push("freebie");
		if (body.kind === "waitlist") tags.push("waitlist");
		if (body.courseId || body.course_id) tags.push("course:" + String(body.courseId || body.course_id));
		if (body.freebieId || body.freebie_id) tags.push("freebie:" + String(body.freebieId || body.freebie_id));
		const result = await syncMarketingContact({
			id: contactId,
			email: email.trim().toLowerCase(),
			fullName: name,
			marketingConsent: Boolean(payload.marketing_consent),
			unsubscribed: Boolean(payload.unsubscribed),
			tags,
			properties: {
				source: String(body.source || "website"),
			},
		});
		await supabase.rpc("record_email_sync", {
			p_contact: contactId,
			p_provider: result.provider,
			p_status: result.ok ? "synced" : "failed",
			p_external: result.externalId,
			p_error: result.error,
		});
	} catch (_error) {
		await supabase.rpc("record_email_sync", {
			p_contact: contactId,
			p_provider: "resend",
			p_status: "failed",
			p_external: "",
			p_error: "The email provider could not be reached.",
		});
	}
}
