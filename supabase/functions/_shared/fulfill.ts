import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assessPayment } from "./payment-policy.mjs";

export type PaystackTransaction = {
	status: string;
	reference: string;
	amount: number;
	currency: string;
	id?: number;
};

export function serviceClient(): SupabaseClient {
	const url = Deno.env.get("SUPABASE_URL") ?? "";
	const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
	if (!url || !key) throw new Error("Supabase service credentials are not configured.");
	return createClient(url, key, { auth: { persistSession: false } });
}

export async function verifyWithPaystack(reference: string): Promise<PaystackTransaction> {
	const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
	if (!secret) throw new Error("Paystack is not configured.");
	const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
		headers: { Authorization: "Bearer " + secret },
	});
	const payload = await response.json();
	if (!response.ok || !payload.status) throw new Error("Paystack could not verify this transaction.");
	return payload.data;
}

export async function fulfil(supabase: SupabaseClient, reference: string) {
	const transaction = await verifyWithPaystack(reference);
	const { data: order, error } = await supabase.from("orders").select("*").eq("paystack_reference", reference).maybeSingle();
	if (error) throw new Error("The order could not be loaded.");
	const decision = assessPayment(order, transaction);
	if (!decision.ok) {
		if (order && decision.code === "not_successful") {
			await supabase.from("orders").update({ status: transaction.status === "abandoned" ? "abandoned" : "failed", updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "pending");
		}
		return { ok: false, code: decision.code };
	}
	if (!decision.duplicate) {
		const { data: paid } = await supabase.from("orders").update({
			status: "paid",
			fulfilled_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}).eq("id", order.id).eq("status", "pending").select("*").maybeSingle();
		if (!paid) {
			const { data: current } = await supabase.from("orders").select("status").eq("id", order.id).maybeSingle();
			if (!current || current.status !== "paid") return { ok: false, code: "not_fulfilled" };
		}
		await supabase.from("payments").upsert({
			order_id: order.id,
			paystack_reference: reference,
			paystack_id: transaction.id ?? null,
			status: "success",
			amount_minor: transaction.amount,
			currency: transaction.currency,
			verified_at: new Date().toISOString(),
		}, { onConflict: "paystack_reference" });
		await supabase.from("enrollments").upsert({
			order_id: order.id,
			course_id: order.course_id,
			email: order.email,
			user_id: order.user_id,
			status: order.user_id ? "active" : "pending_setup",
		}, { onConflict: "order_id" });
	}
	const setup = await sendSetupEmail(supabase, order);
	return { ok: true, code: decision.code, email: setup.status, setupUrl: setup.link, kind: setup.kind };
}

async function sendSetupEmail(supabase: SupabaseClient, order: { id: string; email: string; full_name: string; course_id: string; user_id: string | null }) {
	const site = Deno.env.get("SITE_URL") || "https://bryllaacademy.vercel.app";
	const { data: course } = await supabase.from("courses").select("title").eq("id", order.course_id).maybeSingle();
	const courseTitle = course?.title ?? "your course";
	let link = site ? site + "/set-password" : "";
	let kind = "invite";
	const invite = await supabase.auth.admin.generateLink({
		type: "invite",
		email: order.email,
		options: { data: { full_name: order.full_name }, redirectTo: (site ? site : "") + "/set-password" },
	});
	if (!invite.error && invite.data?.properties?.action_link) {
		link = invite.data.properties.action_link;
		kind = "invite";
		await linkUser(supabase, order, invite.data.user?.id, "pending_setup");
	} else {
		const magic = await supabase.auth.admin.generateLink({
			type: "magiclink",
			email: order.email,
			options: { redirectTo: (site ? site : "") + "/set-password" },
		});
		if (!magic.error && magic.data?.properties?.action_link) {
			link = magic.data.properties.action_link;
			kind = "sign_in";
			await linkUser(supabase, order, magic.data.user?.id, "active");
		}
	}
	const { data: existing } = await supabase.from("email_events").select("status").eq("order_id", order.id).eq("kind", "account_setup").maybeSingle();
	if (existing && existing.status === "sent") return { status: "already_sent", link, kind };
	const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
	const from = Deno.env.get("RESEND_FROM") ?? "";
	if (!resendKey || !from) {
		await supabase.from("email_events").upsert({ order_id: order.id, email: order.email, kind: "account_setup", status: "waiting_for_email_provider" }, { onConflict: "order_id,kind" });
		return { status: "waiting_for_email_provider", link, kind };
	}
	let responseOk = false;
	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				from,
				to: order.email,
				subject: kind === "invite" ? "Set your Brylla Academy password" : "Your Brylla Academy course is ready",
				html: emailHtml(order.full_name, courseTitle, link, kind),
			}),
		});
		responseOk = response.ok;
	} catch (e) {
		console.error("Resend error:", e);
	}
	await supabase.from("email_events").upsert({
		order_id: order.id,
		email: order.email,
		kind: "account_setup",
		status: responseOk ? "sent" : "failed",
	}, { onConflict: "order_id,kind" });
	return { status: responseOk ? "sent" : "failed", link, kind };
}

async function linkUser(supabase: SupabaseClient, order: { id: string; full_name: string }, userId: string | undefined, status: string) {
	if (!userId) return;
	await supabase.from("orders").update({ user_id: userId }).eq("id", order.id);
	await supabase.from("enrollments").update({ user_id: userId, status }).eq("order_id", order.id);
	await supabase.from("profiles").upsert({ id: userId, full_name: order.full_name });
}

function emailHtml(name: string, course: string, link: string, kind: string): string {
	const step = kind === "invite"
		? "Payment is confirmed. Use the button to choose your password. The link can be used once."
		: "Payment is confirmed and this email already has an account. Sign in to open the course. Your password was not changed.";
	const label = kind === "invite" ? "Set your password" : "Sign in";
	return `<div style="font-family:Arial,sans-serif;color:#122d49;max-width:520px"><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(course)} is ready.</p><p>${step}</p><p><a href="${escapeHtml(link)}" style="background:#073b70;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">${label}</a></p><p>Brylla Academy</p></div>`;
}

function escapeHtml(value: string): string {
	return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
