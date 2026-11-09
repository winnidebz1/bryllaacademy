(function () {
	function endpoint() {
		var config = window.BryllaPublic || {};
		return String(config.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/lead-capture";
	}

	function rpcSubmit(body) {
		var config = window.BryllaPublic || {};
		var client = config.client ? config.client() : null;
		if (!client) return Promise.reject(new Error("The form is not connected."));
		return client.rpc("submit_lead", {
			p_kind: body.kind,
			p_full_name: body.fullName,
			p_email: body.email,
			p_consent: Boolean(body.marketingConsent),
			p_course: body.courseId || null,
			p_freebie: body.freebieId || null,
			p_source: body.source || "website",
			p_honeypot: body.company || ""
		}).then(function (result) {
			if (result.error) throw new Error(result.error.message || "The form could not be saved.");
			if (!result.data || !result.data.ok) throw new Error((result.data && result.data.error) || "The form could not be saved.");
			return result.data;
		});
	}

	function postLead(body) {
		var config = window.BryllaPublic || {};
		var url = endpoint();
		if (!config.supabaseUrl || !config.supabaseAnonKey) return Promise.reject(new Error("The form is not connected."));
		var controller = typeof AbortController === "function" ? new AbortController() : null;
		var timer = controller ? setTimeout(function () { controller.abort(); }, 4000) : null;
		return fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				apikey: config.supabaseAnonKey,
				Authorization: "Bearer " + config.supabaseAnonKey
			},
			body: JSON.stringify(body),
			signal: controller ? controller.signal : undefined
		}).then(function (response) {
			return response.json().catch(function () { return {}; }).then(function (payload) {
				if (payload && payload.ok) return payload;
				return rpcSubmit(body);
			});
		}).catch(function () {
			return rpcSubmit(body);
		}).finally(function () {
			if (timer) clearTimeout(timer);
		});
	}

	function startDownload(url, filename) {
		if (!url) return;
		var absolute = url;
		try {
			absolute = url.charAt(0) === "/" || /^https?:/i.test(url)
				? new URL(url, window.location.origin).href
				: window.location.origin + "/" + url.replace(/^\.\//, "");
		} catch (_error) {}
		var link = document.createElement("a");
		link.href = absolute;
		link.setAttribute("download", filename || absolute.split("/").pop() || "download.pdf");
		link.rel = "noopener";
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	var LEAD_STORE = "brylla-freebie-lead";

	function rememberLead(name, email) {
		try {
			sessionStorage.setItem(LEAD_STORE, JSON.stringify({ name: name, email: email }));
		} catch (_error) {}
	}

	function savedLead() {
		try {
			return JSON.parse(sessionStorage.getItem(LEAD_STORE) || "null");
		} catch (_error) {
			return null;
		}
	}

	function bindForm(form) {
		if (!form || form.getAttribute("data-lead-bound") === "1") return;
		form.setAttribute("data-lead-bound", "1");
		var status = form.querySelector("[data-lead-status]");
		var name = form.querySelector("[name='full_name'], [name='name']");
		var email = form.querySelector("[name='email']");
		var saved = savedLead();
		if (saved) {
			if (name && !name.value) name.value = saved.name || "";
			if (email && !email.value) email.value = saved.email || "";
		}
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			var consent = form.querySelector("[name='marketing_consent']");
			var company = form.querySelector("[name='company']");
			var kind = form.getAttribute("data-lead-kind") || "waitlist";
			var fullName = name ? name.value.trim() : "";
			var address = email ? email.value.trim() : "";
			var file = form.getAttribute("data-file") || "";
			var filename = form.getAttribute("data-download-name") || "";
			if (status) {
				status.hidden = false;
				status.textContent = kind === "freebie" ? "Starting download…" : "Saving…";
			}
			if (kind === "freebie" && file) startDownload(file, filename);
			postLead({
				kind: kind,
				fullName: fullName,
				email: address,
				marketingConsent: Boolean(consent && consent.checked),
				courseId: form.getAttribute("data-course-id") || "",
				freebieId: form.getAttribute("data-freebie-id") || "",
				source: form.getAttribute("data-lead-source") || "website",
				company: company ? company.value : ""
			}).then(function (result) {
				rememberLead(fullName, address);
				if (status) status.textContent = result.message || (kind === "freebie" ? "Your download is starting." : "Saved.");
				var submit = form.querySelector("[type='submit']");
				if (submit) submit.disabled = true;
			}).catch(function (error) {
				if (status) status.textContent = (file ? "Your download is starting. " : "") + (error.message || "The form could not be saved.");
			});
		});
	}

	window.BryllaLeads = { postLead: postLead, bindForm: bindForm, startDownload: startDownload };
	document.querySelectorAll("form[data-lead-kind]").forEach(bindForm);
})();
