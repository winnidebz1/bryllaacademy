import { fulfil, serviceClient } from "../_shared/fulfill.ts";
import { json, paystackSignature, signaturesMatch } from "../_shared/http.ts";

Deno.serve(async (request) => {
	if (request.method !== "POST") return json({ error: "Use POST." }, 405);
	const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
	const raw = await request.text();
	const header = request.headers.get("x-paystack-signature") ?? "";
	if (!secret || !signaturesMatch(await paystackSignature(secret, raw), header)) {
		return json({ error: "Invalid signature." }, 401);
	}
	let event: { event?: string; data?: { reference?: string } };
	try {
		event = JSON.parse(raw);
	} catch {
		return json({ error: "Invalid payload." }, 400);
	}
	if (event.event !== "charge.success" || !event.data?.reference) return json({ ignored: true });
	try {
		const result = await fulfil(serviceClient(), event.data.reference);
		return json({ received: true, result });
	} catch (error) {
		console.error("webhook_processing_failed");
		return json({ error: "Processing failed and can be retried." }, 500);
	}
});
