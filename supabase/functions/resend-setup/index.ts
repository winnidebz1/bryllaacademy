import { sendAccountSetup, serviceClient } from "../_shared/fulfill.ts";
import { corsHeaders, json } from "../_shared/http.ts";

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (request.method !== "POST") return json({ error: "Use POST." }, 405);
	try {
		const body = await request.json();
		const email = String(body.email || "").trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter the email used at checkout." }, 400);
		const supabase = serviceClient();
		const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const { count } = await supabase.from("email_events").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since);
		if ((count ?? 0) >= 3) return json({ error: "Try again in an hour." }, 429);
		const { data: order } = await supabase.from("orders").select("id,email,full_name,course_id,user_id,purpose").eq("email", email).eq("status", "paid").order("fulfilled_at", { ascending: false }).limit(1).maybeSingle();
		if (!order) return json({ error: "No paid order was found for this email." }, 404);
		await supabase.from("email_events").delete().eq("order_id", order.id).eq("kind", "account_setup");
		const result = await sendAccountSetup(supabase, order);
		return json({ ok: true, email: result.status });
	} catch (error) {
		console.error("resend_failed");
		return json({ error: error instanceof Error ? error.message : "The email could not be sent." }, 500);
	}
});
