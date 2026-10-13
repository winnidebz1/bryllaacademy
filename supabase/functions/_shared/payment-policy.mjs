export function assessPayment(order, transaction) {
	if (!order) return { ok: false, code: "unknown_order" };
	if (order.status === "refunded") return { ok: false, code: "refunded" };
	if (order.status === "paid") return { ok: true, code: "already_paid", duplicate: true };
	if (!transaction || transaction.status !== "success") {
		return { ok: false, code: "not_successful", status: transaction ? transaction.status : "missing" };
	}
	if (String(transaction.reference || "") !== String(order.paystack_reference || "")) {
		return { ok: false, code: "reference_mismatch" };
	}
	if (Number(transaction.amount) !== Number(order.amount_minor)) return { ok: false, code: "amount_mismatch" };
	if (String(transaction.currency || "").toUpperCase() !== String(order.currency || "").toUpperCase()) {
		return { ok: false, code: "currency_mismatch" };
	}
	return { ok: true, code: "verified" };
}
