(function () {
	var config = window.BryllaPublic || { supabaseUrl: "", supabaseAnonKey: "" };

	function configured() {
		return Boolean(config.supabaseUrl && config.supabaseAnonKey);
	}

	function endpoint(name) {
		return String(config.supabaseUrl).replace(/\/$/, "") + "/functions/v1/" + name;
	}

	async function post(name, body) {
		var response = await fetch(endpoint(name), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				apikey: config.supabaseAnonKey,
				Authorization: "Bearer " + config.supabaseAnonKey
			},
			body: JSON.stringify(body)
		});
		var payload = {};
		try { payload = await response.json(); } catch (error) { payload = {}; }
		if (!response.ok) throw new Error(payload.error || "The request failed.");
		return payload;
	}

	window.BryllaCheckout = { configured: configured, post: post };
})();
