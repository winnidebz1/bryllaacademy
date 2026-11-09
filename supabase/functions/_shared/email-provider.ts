export type MarketingContact = {
	id: string;
	email: string;
	fullName: string;
	marketingConsent: boolean;
	unsubscribed: boolean;
	tags: string[];
	properties: Record<string, string>;
};

export type SyncResult = {
	ok: boolean;
	provider: string;
	externalId: string;
	error: string;
};

export function activeProvider(): string {
	return (Deno.env.get("EMAIL_PROVIDER") || "resend").trim().toLowerCase();
}

export async function syncMarketingContact(contact: MarketingContact): Promise<SyncResult> {
	const provider = activeProvider();
	if (provider === "resend") return syncResend(contact);
	return {
		ok: false,
		provider,
		externalId: "",
		error: "Connect " + provider + " before switching the academy to that provider.",
	};
}

async function syncResend(contact: MarketingContact): Promise<SyncResult> {
	const key = Deno.env.get("RESEND_API_KEY") ?? "";
	const audience = Deno.env.get("RESEND_AUDIENCE_ID") ?? "";
	if (!key) return { ok: false, provider: "resend", externalId: "", error: "Resend is not configured." };
	if (!audience) return { ok: false, provider: "resend", externalId: "", error: "Add RESEND_AUDIENCE_ID to send contacts to Resend." };
	const names = contact.fullName.trim().split(/\s+/);
	const firstName = names.shift() || "";
	const lastName = names.join(" ");
	const response = await fetch("https://api.resend.com/audiences/" + encodeURIComponent(audience) + "/contacts", {
		method: "POST",
		headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
		body: JSON.stringify({
			email: contact.email,
			first_name: firstName,
			last_name: lastName,
			unsubscribed: contact.unsubscribed || !contact.marketingConsent,
			properties: {
				...contact.properties,
				tags: contact.tags.join(","),
			},
		}),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = typeof payload.message === "string" ? payload.message : "Resend could not save this contact.";
		if (/already exists|already been added|contact already/i.test(message)) {
			return { ok: true, provider: "resend", externalId: String(payload.id || payload.data?.id || ""), error: "" };
		}
		return { ok: false, provider: "resend", externalId: "", error: message.slice(0, 180) };
	}
	return { ok: true, provider: "resend", externalId: String(payload.id || payload.data?.id || ""), error: "" };
}
