import { json, corsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/fulfill.ts";

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (request.method !== "POST") return json({ error: "Use POST." }, 405);
	try {
		const body = await request.json();
		const courseId = String(body.courseId || "").trim();
		const fullName = String(body.fullName || "").trim();
		const email = String(body.email || "").trim().toLowerCase();
		if (!courseId || fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return json({ error: "Enter your name, a valid email, and a course." }, 400);
		}
		const supabase = serviceClient();
		const { data: course } = await supabase.from("courses").select("id,title,price_minor,currency,status").eq("id", courseId).maybeSingle();
		if (!course || course.status !== "published" || course.price_minor <= 0) {
			return json({ error: "This course is not open for payment." }, 400);
		}
		const { data: paid } = await supabase.from("orders").select("id").eq("email", email).eq("course_id", courseId).eq("status", "paid").maybeSingle();
		if (paid) return json({ status: "already_paid", message: "This email already has a paid order. Use the setup email or the recovery page. Do not pay again." });
		const { data: pending } = await supabase.from("orders").select("id,authorization_url,paystack_reference").eq("email", email).eq("course_id", courseId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
		if (pending?.authorization_url) return json({ authorizationUrl: pending.authorization_url, reference: pending.paystack_reference, resumed: true });
		const orderId = crypto.randomUUID();
		const reference = "brylla_" + orderId.replaceAll("-", "");
		const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
		if (!secret) return json({ error: "Payments are not connected yet." }, 503);
		const site = Deno.env.get("SITE_URL") ?? "";
		const paystack = await fetch("https://api.paystack.co/transaction/initialize", {
			method: "POST",
			headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
			body: JSON.stringify({
				email,
				amount: course.price_minor,
				currency: course.currency,
				reference,
				callback_url: site ? site + "/payment-status.html" : undefined,
				metadata: { order_id: orderId, course_id: course.id },
			}),
		});
		const payload = await paystack.json();
		if (!paystack.ok || !payload.status) return json({ error: "Paystack did not start the payment." }, 502);
		const { error } = await supabase.from("orders").insert({
			id: orderId,
			course_id: course.id,
			full_name: fullName,
			email,
			amount_minor: course.price_minor,
			currency: course.currency,
			status: "pending",
			paystack_reference: reference,
			authorization_url: payload.data.authorization_url,
		});
		if (error) return json({ error: "The order could not be saved." }, 500);
		return json({ authorizationUrl: payload.data.authorization_url, reference, course: course.title, amountMinor: course.price_minor, currency: course.currency });
	} catch (error) {
		console.error("checkout_failed");
		return json({ error: error instanceof Error ? error.message : "Checkout failed." }, 500);
	}
});
