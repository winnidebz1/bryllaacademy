(function () {
	var ZONES = {
		"Africa/Accra": "GHS",
		"Africa/Lagos": "NGN",
		"Africa/Nairobi": "KES",
		"Africa/Johannesburg": "ZAR",
		"Africa/Abidjan": "XOF",
		"Europe/London": "GBP",
		"Europe/Paris": "EUR",
		"Europe/Berlin": "EUR",
		"America/New_York": "USD",
		"America/Chicago": "USD",
		"America/Los_Angeles": "USD",
		"America/Toronto": "CAD",
		"Asia/Kolkata": "INR",
		"Australia/Sydney": "AUD"
	};
	var SYMBOLS = { GHS: "GHS", NGN: "NGN", USD: "USD", EUR: "EUR", GBP: "GBP", CAD: "CAD", KES: "KES", ZAR: "ZAR", XOF: "XOF", INR: "INR", AUD: "AUD" };

	function visitorCurrency() {
		var zone = "";
		try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (error) { zone = ""; }
		return ZONES[zone] || "USD";
	}

	function format(amount, currency) {
		var code = SYMBOLS[currency] ? currency : "USD";
		try {
			return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 0 }).format(amount);
		} catch (error) {
			return code + " " + Math.ceil(amount);
		}
	}

	function rates() {
		var cached = null;
		try { cached = JSON.parse(sessionStorage.getItem("brylla-fx") || "null"); } catch (error) { cached = null; }
		if (cached && cached.rates && Date.now() - cached.at < 12 * 60 * 60 * 1000) return Promise.resolve(cached.rates);
		return fetch("https://open.er-api.com/v6/latest/USD").then(function (response) {
			return response.json();
		}).then(function (payload) {
			if (!payload || !payload.rates) throw new Error("rates unavailable");
			var pack = { at: Date.now(), rates: payload.rates };
			try { sessionStorage.setItem("brylla-fx", JSON.stringify(pack)); } catch (error) { /* keep going */ }
			return payload.rates;
		});
	}

	function inflation() {
		var client = window.BryllaPublic && BryllaPublic.client ? BryllaPublic.client() : null;
		if (!client) return Promise.resolve(3);
		return client.rpc("public_pricing_settings").then(function (result) {
			var row = result.data && result.data[0];
			var value = row ? Number(row.inflation_percent) : 3;
			return isFinite(value) ? value : 3;
		}).catch(function () { return 3; });
	}

	function convert(amount, from, to, buffer, table) {
		var source = Number(amount);
		if (!isFinite(source)) return null;
		if (!to || to === from) return { amount: source, currency: from, converted: false };
		if (!table[from] || !table[to]) return { amount: source, currency: from, converted: false };
		var usd = source / Number(table[from]);
		var value = usd * Number(table[to]);
		var padded = value * (1 + (Number(buffer) || 0) / 100);
		return { amount: Math.ceil(padded), currency: to, converted: true };
	}

	function paint() {
		var nodes = document.querySelectorAll("[data-price-amount]");
		if (!nodes.length) return;
		var local = visitorCurrency();
		Promise.all([rates(), inflation()]).then(function (parts) {
			nodes.forEach(function (node) {
				var result = convert(node.getAttribute("data-price-amount"), node.getAttribute("data-price-currency") || "GHS", local, parts[1], parts[0]);
				if (!result) return;
				var label = format(result.amount, result.currency);
				if (node.getAttribute("data-price-prefix")) label = node.getAttribute("data-price-prefix") + label;
				node.textContent = label;
			});
		}).catch(function () { /* keep the original price */ });
	}

	window.BryllaCurrency = { visitorCurrency: visitorCurrency, format: format, convert: convert, rates: rates, inflation: inflation, paint: paint };
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
	else paint();
})();
