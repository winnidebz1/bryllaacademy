export const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

export function bytesToHex(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function paystackSignature(secret: string, raw: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-512" },
		false,
		["sign"],
	);
	const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
	return bytesToHex(signed);
}

export function signaturesMatch(expected: string, received: string): boolean {
	if (!expected || !received || expected.length !== received.length) return false;
	let mismatch = 0;
	for (let index = 0; index < expected.length; index += 1) {
		mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
	}
	return mismatch === 0;
}
