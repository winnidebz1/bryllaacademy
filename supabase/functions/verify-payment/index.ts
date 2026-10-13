import { fulfil, serviceClient } from "../_shared/fulfill.ts";
import { corsHeaders, json } from "../_shared/http.ts";

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (request.method !== "POST") return json({ error: "Use POST." }, 405);
	try {
		const body = await request.json();
		const reference = String(body.reference || "").trim();
		if (!reference.startsWith("brylla_")) return json({ error: "Unknown payment reference." }, 400);
		const result = await fulfil(serviceClient(), reference);
		return json(result, result.ok ? 200 : 409);
	} catch (error) {
		console.error("verify_failed");
		return json({ error: error instanceof Error ? error.message : "Verification failed." }, 500);
	}
});
