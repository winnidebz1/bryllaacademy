/* Lightweight public / auth activity capture. Actor identity is derived server-side. */
(function () {
	var SESSION_KEY = "brylla-activity-session";
	var LAST_VIEW_KEY = "brylla-activity-last-view";

	function sessionId() {
		try {
			var existing = sessionStorage.getItem(SESSION_KEY);
			if (existing) return existing;
			var created = "anon-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
			sessionStorage.setItem(SESSION_KEY, created);
			return created;
		} catch (error) {
			return "anon-ephemeral";
		}
	}

	function client() {
		return window.BryllaPublic && BryllaPublic.client ? BryllaPublic.client() : null;
	}

	function logActivity(payload) {
		var current = client();
		if (!current || !payload || !payload.event_type) return Promise.resolve(null);
		return current.rpc("log_client_activity", {
			p_event_type: payload.event_type,
			p_category: payload.category || "Website",
			p_action: payload.action || payload.event_type,
			p_description: payload.description || "",
			p_target_type: payload.target_type || null,
			p_target_id: payload.target_id || null,
			p_target_name: payload.target_name || null,
			p_metadata: payload.metadata || {},
			p_status: payload.status || "Success",
			p_severity: payload.severity || "Info",
			p_session_id: payload.session_id || sessionId()
		}).then(function (result) {
			return result.error ? null : result.data;
		}).catch(function () {
			return null;
		});
	}

	function pageMeta() {
		var path = location.pathname.replace(/\.html$/, "") || "/";
		var title = document.title || path;
		var map = {
			"/": ["website.page.viewed", "Homepage viewed", "homepage"],
			"/index": ["website.page.viewed", "Homepage viewed", "homepage"],
			"/about-us": ["website.page.viewed", "About page viewed", "about"],
			"/course-details": ["website.course.viewed", "Course page viewed", "course"],
			"/course-list": ["website.catalogue.viewed", "Course catalogue viewed", "catalogue"],
			"/pricing-plan": ["website.pricing.viewed", "Pricing page viewed", "pricing"],
			"/contact-us": ["website.contact.viewed", "Contact page viewed", "contact"],
			"/free-materials": ["website.free_materials.viewed", "Free materials viewed", "free-materials"],
			"/register": ["website.signup.viewed", "Sign-up page viewed", "register"],
			"/login": ["website.login.viewed", "Login page viewed", "login"],
			"/bookkeeping-registration": ["website.checkout.viewed", "Registration checkout page viewed", "bookkeeping-registration"]
		};
		return map[path] || ["website.page.viewed", "Page viewed: " + title, path.replace(/^\//, "") || "page"];
	}

	function trackPageView() {
		var meta = pageMeta();
		var stamp = meta[0] + ":" + location.pathname + location.search;
		try {
			if (sessionStorage.getItem(LAST_VIEW_KEY) === stamp) return;
			sessionStorage.setItem(LAST_VIEW_KEY, stamp);
		} catch (error) { /* ignore */ }
		logActivity({
			event_type: meta[0],
			category: "Website",
			action: "Page viewed",
			description: meta[1],
			target_type: "website",
			target_id: meta[2],
			target_name: document.title,
			metadata: { path: location.pathname, search: location.search || "" }
		});
	}

	function bindClicks() {
		document.addEventListener("click", function (event) {
			var enroll = event.target.closest(".enroll-button, [data-course-notify], a[href*='paystack.shop'], a[href*='selar.com']");
			if (!enroll) return;
			var href = enroll.getAttribute("href") || "";
			var isCheckout = /paystack\.shop|selar\.com/i.test(href);
			var isWaitlist = enroll.hasAttribute("data-course-notify");
			logActivity({
				event_type: isCheckout ? "payment.checkout.initiated" : (isWaitlist ? "website.waitlist.clicked" : "website.enrollment.clicked"),
				category: isCheckout ? "Payment" : "Website",
				action: isCheckout ? "Checkout initiated" : (isWaitlist ? "Waitlist clicked" : "Enrollment clicked"),
				description: isCheckout ? "External checkout opened" : (isWaitlist ? "Waitlist button clicked" : "Enrollment button clicked"),
				target_type: "website",
				target_id: enroll.getAttribute("data-course-notify") || href.slice(0, 120),
				target_name: (enroll.textContent || "").trim().slice(0, 80),
				metadata: { href: href.slice(0, 200) }
			});
		}, true);
	}

	window.BryllaActivity = {
		log: logActivity,
		sessionId: sessionId,
		trackPageView: trackPageView
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", function () {
			trackPageView();
			bindClicks();
		});
	} else {
		trackPageView();
		bindClicks();
	}
})();
