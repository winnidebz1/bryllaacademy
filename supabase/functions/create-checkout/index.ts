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
		const purpose = body.purpose === "enrolment" ? "enrolment" : "registration";
		const supabase = serviceClient();
		const { data: course } = await supabase.from("courses").select("id,title,currency,status,registration_fee_minor,enrolment_fee_minor").eq("id", courseId).maybeSingle();
		if (!course || course.status !== "published") {
			return json({ error: "This course is not open for payment." }, 400);
		}
		const amount = purpose === "enrolment" ? Number(course.enrolment_fee_minor) : Number(course.registration_fee_minor);
		if (!amount || amount <= 0) return json({ error: "This course is not open for payment." }, 400);
		const { data: enrolled } = await supabase.from("enrollments").select("id").eq("email", email).eq("course_id", courseId).in("status", ["active", "pending_setup"]).maybeSingle();
		if (enrolled) return json({ status: "already_paid", message: "This email is already enrolled. Sign in to continue. Do not pay again." });
		const { data: paid } = await supabase.from("orders").select("id").eq("email", email).eq("course_id", courseId).eq("status", "paid").eq("purpose", purpose).maybeSingle();
		if (paid) {
			const message = purpose === "registration"
				? "This email already paid the registration fee. Sign in, then pay the course fee to enrol."
				: "This email already paid the course fee. Sign in to continue. Do not pay again.";
			return json({ status: "already_paid", message });
		}
		if (purpose === "enrolment") {
			const { data: registered } = await supabase.from("orders").select("id").eq("email", email).eq("course_id", courseId).eq("status", "paid").eq("purpose", "registration").maybeSingle();
			if (!registered) return json({ error: "Pay the registration fee before the course fee." }, 400);
		}
		const { data: pending } = await supabase.from("orders").select("id,authorization_url,paystack_reference").eq("email", email).eq("course_id", courseId).eq("status", "pending").eq("purpose", purpose).eq("amount_minor", amount).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
				amount: amount,
				currency: course.currency,
				reference,
				callback_url: site ? site + "/payment-status" : undefined,
				metadata: { order_id: orderId, course_id: course.id, purpose },
			}),
		});
		const payload = await paystack.json();
		if (!paystack.ok || !payload.status) return json({ error: "Paystack did not start the payment." }, 502);
		const { error } = await supabase.from("orders").insert({
			id: orderId,
			course_id: course.id,
			full_name: fullName,
			email,
			amount_minor: amount,
			currency: course.currency,
			purpose,
			status: "pending",
			paystack_reference: reference,
			authorization_url: payload.data.authorization_url,
		});
		if (error) return json({ error: "The order could not be saved." }, 500);
		return json({ authorizationUrl: payload.data.authorization_url, reference, course: course.title, amountMinor: amount, currency: course.currency, purpose });
	} catch (error) {
		console.error("checkout_failed");
		return json({ error: error instanceof Error ? error.message : "Checkout failed." }, 500);
	}
});
