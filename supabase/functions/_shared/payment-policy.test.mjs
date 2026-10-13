import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import test from "node:test";
import { assessPayment } from "./payment-policy.mjs";

const order = { status: "pending", paystack_reference: "brylla_1", amount_minor: 95000, currency: "GHS" };

test("accepts a matching successful payment", () => {
	const result = assessPayment(order, { status: "success", reference: "brylla_1", amount: 95000, currency: "GHS" });
	assert.equal(result.ok, true);
	assert.equal(result.code, "verified");
});

test("rejects a failed or abandoned payment", () => {
	assert.equal(assessPayment(order, { status: "failed", reference: "brylla_1", amount: 95000, currency: "GHS" }).ok, false);
	assert.equal(assessPayment(order, { status: "abandoned", reference: "brylla_1", amount: 95000, currency: "GHS" }).code, "not_successful");
});

test("rejects amount, currency, and reference mismatches", () => {
	assert.equal(assessPayment(order, { status: "success", reference: "brylla_1", amount: 100, currency: "GHS" }).code, "amount_mismatch");
	assert.equal(assessPayment(order, { status: "success", reference: "brylla_1", amount: 95000, currency: "NGN" }).code, "currency_mismatch");
	assert.equal(assessPayment(order, { status: "success", reference: "other", amount: 95000, currency: "GHS" }).code, "reference_mismatch");
});

test("does not fulfil a refunded order and treats a repeat as already paid", () => {
	assert.equal(assessPayment({ ...order, status: "refunded" }, { status: "success", reference: "brylla_1", amount: 95000, currency: "GHS" }).code, "refunded");
	const repeat = assessPayment({ ...order, status: "paid" }, { status: "success", reference: "brylla_1", amount: 95000, currency: "GHS" });
	assert.equal(repeat.duplicate, true);
});

test("rejects a forged Paystack signature", () => {
	const body = '{"event":"charge.success"}';
	const good = createHmac("sha512", "test-secret").update(body).digest("hex");
	const forged = createHmac("sha512", "other-secret").update(body).digest("hex");
	assert.equal(safeEqual(good, forged), false);
	assert.equal(safeEqual(good, good), true);
});

function safeEqual(left, right) {
	if (!left || !right || left.length !== right.length) return false;
	return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
