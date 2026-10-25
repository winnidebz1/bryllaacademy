(function () {
	var PAGE_SIZE = 20;
	var PANEL_ID = "student-notifications-panel";
	var state = { status: "loading", items: [], unread: 0, error: "", userId: null, open: false, anchor: null };
	var history = { status: "loading", items: [], error: "", more: false };
	var client = null;
	var channel = null;
	var refreshTimer = 0;
	var panel = null;

	var icons = {
		payment_confirmed: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
		account_setup: '<circle cx="12" cy="8" r="3"/><path d="M6 19c1.2-2.5 3.2-3.5 6-3.5s4.8 1 6 3.5"/><path d="M16 11.5l1.5 1.5L20 10"/>',
		enrolment: '<path d="M4 6.5h10a3 3 0 0 1 3 3V19H7a3 3 0 0 0-3 3z"/><path d="M4 6.5A3 3 0 0 1 7 4h13v15"/>',
		announcement: '<path d="M4 10v4l12 4V6L4 10z"/><path d="M16 9.5a3 3 0 0 1 0 5"/>',
		message: '<path d="M5 6h14v10H8l-3 3z"/>'
	};

	function svg(name) {
		var node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		node.setAttribute("viewBox", "0 0 24 24");
		node.setAttribute("fill", "none");
		node.setAttribute("stroke", "currentColor");
		node.setAttribute("stroke-width", "1.75");
		node.setAttribute("stroke-linecap", "round");
		node.setAttribute("stroke-linejoin", "round");
		node.setAttribute("aria-hidden", "true");
		node.innerHTML = icons[name] || icons.message;
		return node;
	}

	function bellIcon() {
		var node = svg("message");
		node.innerHTML = '<path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9"/><path d="M10 20a2 2 0 0 0 4 0"/>';
		return node;
	}

	function el(tag, className, text) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}

	function styles() {
		if (document.getElementById("brylla-notification-styles")) return;
		var style = document.createElement("style");
		style.id = "brylla-notification-styles";
		style.textContent = [
			"[data-student-notifications]{position:relative}",
			".note-bell{position:relative;width:40px;height:40px;display:inline-grid;place-items:center;padding:0;border:1px solid #d5e2ee;border-radius:10px;background:#fff;color:#122d49;cursor:pointer}",
			".note-bell:hover,.icon-button.notify-button:hover{background:#f4f8fb}",
			".notify-badge{position:absolute;top:2px;right:0;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#b42318;color:#fff;font-size:10px;font-weight:600;line-height:16px;text-align:center}",
			".note-panel{position:fixed;z-index:1200;display:flex;flex-direction:column;width:min(380px,calc(100vw - 16px));max-height:min(480px,70vh);overflow:hidden;border:1px solid #e3ebf2;border-radius:14px;background:#fff;color:#122d49;box-shadow:0 16px 40px rgba(7,59,112,.16);font-family:Raleway,Segoe UI,Arial,sans-serif}",
			".note-panel[hidden]{display:none}",
			".note-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px;border-bottom:1px solid #e3ebf2}",
			".note-head-icon{width:32px;height:32px;display:grid;place-items:center;flex:0 0 32px;border-radius:9px;background:#e7eef6;color:#073b70}",
			".note-head-icon svg{width:16px;height:16px}",
			".note-head h2{margin:0;font-size:15px;font-weight:600;color:#073b70}",
			".note-count{margin:0;color:#4d5d6c;font-size:12px}",
			".note-mark{margin-left:auto;min-height:36px;padding:0 8px;border:0;background:transparent;color:#04635e;font:500 13px/1.2 inherit;cursor:pointer}",
			".note-mark:hover{text-decoration:underline}",
			".note-mark:disabled{color:#8aa0b3;text-decoration:none;cursor:default}",
			".note-list{margin:0;padding:0;list-style:none;overflow:auto}",
			".note-item{display:grid;grid-template-columns:36px minmax(0,1fr) 10px;gap:10px;align-items:start;width:100%;min-height:64px;padding:12px 14px;border:0;border-bottom:1px solid #eef3f7;background:#fff;color:inherit;font:inherit;text-align:left;text-decoration:none;cursor:pointer}",
			".note-item:hover,.note-item:focus-visible{background:#f4f8fb}",
			".note-item.is-unread{background:#f3fbfa}",
			".note-type{width:36px;height:36px;display:grid;place-items:center;border-radius:10px}",
			".note-type svg{width:18px;height:18px}",
			".note-type-payment_confirmed,.note-type-enrolment{background:#e7f6f5;color:#04635e}",
			".note-type-account_setup,.note-type-message{background:#e7eef6;color:#073b70}",
			".note-type-announcement{background:#fff1e6;color:#9a4e12}",
			".note-title{display:block;font-size:14px;font-weight:600;color:#122d49}",
			".note-message{display:block;margin-top:2px;color:#4d5d6c;font-size:13px}",
			".note-time{display:block;margin-top:4px;color:#60748a;font-size:12px}",
			".note-dot{width:8px;height:8px;margin-top:6px;border-radius:50%;background:#073b70}",
			".note-item:not(.is-unread) .note-dot{visibility:hidden}",
			".note-state{padding:28px 18px;color:#4d5d6c;text-align:center}",
			".note-state strong{display:block;margin-bottom:4px;color:#122d49;font-weight:600}",
			".note-retry,.note-more{min-height:40px;margin-top:10px;padding:0 14px;border:1px solid #bfd0df;border-radius:999px;background:#fff;color:#073b70;font:500 13px inherit;cursor:pointer}",
			".note-foot{display:block;padding:12px;border-top:1px solid #e3ebf2;color:#04635e;font-size:13px;font-weight:600;text-align:center;text-decoration:none}",
			".note-foot:hover{background:#f4f8fb}",
			".note-page .note-list{border:1px solid #e3ebf2;border-radius:12px;background:#fff}",
			".note-page .note-item:last-child{border-bottom:0}",
			"@media (max-width:767px){.note-panel{max-height:min(70vh,calc(100vh - 72px))}.note-item{min-height:72px}}"
		].join("");
		document.head.appendChild(style);
	}

	function ago(iso) {
		var then = new Date(iso).getTime();
		if (!then) return "";
		var seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (seconds < 45) return "Just now";
		var minutes = Math.round(seconds / 60);
		if (minutes < 60) return minutes === 1 ? "1 minute ago" : minutes + " minutes ago";
		var hours = Math.round(minutes / 60);
		if (hours < 24) return hours === 1 ? "1 hour ago" : hours + " hours ago";
		var days = Math.round(hours / 24);
		if (days === 1) return "Yesterday";
		if (days < 7) return days + " days ago";
		return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
	}

	function badgeText(count) {
		return count > 99 ? "99+" : String(count);
	}

	function label(count) {
		if (!count) return "Notifications, no unread";
		return "Notifications, " + count + " unread";
	}

	function safePath(value) {
		return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,60}$/.test(value) ? value : "";
	}

	function ensureClient() {
		if (client) return client;
		if (window.BryllaAuth && BryllaAuth.client) client = BryllaAuth.client;
		else if (window.BryllaPublic && BryllaPublic.client) client = BryllaPublic.client();
		return client;
	}

	function bells() {
		return Array.from(document.querySelectorAll("[data-student-notifications], a.icon-button.notify-button"));
	}

	function paintBadges() {
		bells().forEach(function (button) {
			button.setAttribute("aria-label", label(state.unread));
			button.setAttribute("aria-expanded", state.open && state.anchor === button ? "true" : "false");
			button.setAttribute("aria-haspopup", "dialog");
			button.setAttribute("aria-controls", PANEL_ID);
			var badge = button.querySelector(".notify-badge");
			if (state.unread > 0) {
				var text = badgeText(state.unread);
				if (!badge) {
					badge = el("span", "notify-badge", text);
					button.appendChild(badge);
				} else if (badge.textContent !== text) {
					badge.textContent = text;
				}
			} else if (badge) {
				badge.remove();
			}
			if (!button.querySelector("svg") && !button.querySelector("i")) button.appendChild(bellIcon());
		});
	}

	function row(item) {
		var dest = safePath(item.destination_url);
		var node = document.createElement(dest ? "a" : "button");
		node.className = "note-item" + (item.read_at ? "" : " is-unread");
		if (dest) node.href = dest;
		else node.type = "button";
		var type = icons[item.type] ? item.type : "message";
		var mark = el("span", "note-type note-type-" + type);
		mark.appendChild(svg(type));
		var copy = el("span", "note-copy");
		copy.append(el("span", "note-title", item.title), el("span", "note-message", item.message), el("time", "note-time", ago(item.created_at)));
		copy.querySelector("time").dateTime = item.created_at;
		node.append(mark, copy, el("span", "note-dot"));
		node.addEventListener("click", function (event) {
			if (dest) event.preventDefault();
			openItem(item);
		});
		return node;
	}

	function stateBlock(title, detail, retry) {
		var box = el("div", "note-state");
		box.append(el("strong", null, title), document.createTextNode(detail));
		if (retry) {
			var button = el("button", "note-retry", "Try again");
			button.type = "button";
			button.addEventListener("click", function () { refresh(); });
			box.appendChild(button);
		}
		return box;
	}

	function fillList(list, items, emptyTitle) {
		list.replaceChildren();
		if (state.status === "loading" && !items.length) {
			list.appendChild(stateBlock("Loading notifications", "Checking your account."));
			return;
		}
		if (state.status === "error" && !items.length) {
			list.appendChild(stateBlock("Couldn't load notifications", state.error || "Check your connection and try again.", true));
			return;
		}
		if (state.status === "signedout") {
			var signed = stateBlock("Sign in to see notifications", "Your messages appear here after you sign in.");
			var link = el("a", "note-foot", "Student login");
			link.href = "login";
			signed.appendChild(link);
			list.appendChild(signed);
			return;
		}
		if (!items.length) {
			list.appendChild(stateBlock(emptyTitle || "You're all caught up", "New messages from your instructor will show up here."));
			return;
		}
		items.forEach(function (item) { list.appendChild(row(item)); });
	}

	function ensurePanel() {
		if (panel) return panel;
		panel = el("div", "note-panel");
		panel.id = PANEL_ID;
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-modal", "false");
		panel.setAttribute("aria-labelledby", "student-notifications-title");
		panel.hidden = true;
		panel.tabIndex = -1;
		document.body.appendChild(panel);
		return panel;
	}

	function paintPanel() {
		var node = ensurePanel();
		node.replaceChildren();
		var head = el("div", "note-head");
		var iconWrap = el("span", "note-head-icon");
		iconWrap.appendChild(bellIcon());
		var titles = el("div");
		var heading = el("h2", null, "Notifications");
		heading.id = "student-notifications-title";
		titles.append(heading, el("p", "note-count", state.unread ? state.unread + " unread" : "No unread"));
		var mark = el("button", "note-mark", "Mark all as read");
		mark.type = "button";
		mark.disabled = state.unread < 1 || state.status !== "ready";
		mark.addEventListener("click", markAll);
		head.append(iconWrap, titles, mark);
		var list = el("div", "note-list");
		list.setAttribute("role", "list");
		fillList(list, state.items.slice(0, PAGE_SIZE));
		var foot = el("a", "note-foot", "View all notifications");
		foot.href = "student-notifications";
		node.append(head, list, foot);
		node.hidden = !state.open;
		place();
	}

	function paintHistory() {
		var root = document.getElementById("notification-history");
		if (!root) return;
		root.classList.add("note-page");
		root.replaceChildren();
		root.append(el("h1", null, "Notifications"), el("p", "lede", "Messages about your course, your account, and notes from Brylla Academy."));
		var tools = el("div", "actions");
		tools.style.margin = "16px 0";
		var mark = el("button", "note-retry", "Mark all as read");
		mark.type = "button";
		mark.disabled = state.unread < 1;
		mark.addEventListener("click", markAll);
		var status = el("p", "status");
		status.setAttribute("role", "status");
		if (state.error) status.textContent = state.error;
		tools.append(mark, status);
		var list = el("div", "note-list");
		if (state.status === "signedout") fillList(list, []);
		else if (history.status === "loading" || state.status === "loading") list.appendChild(stateBlock("Loading notifications", "Checking your account."));
		else if (history.status === "error" || state.status === "error") list.appendChild(stateBlock("Couldn't load notifications", history.error || state.error || "Check your connection and try again.", true));
		else if (!history.items.length) list.appendChild(stateBlock("You're all caught up", "New messages from your instructor will show up here."));
		else history.items.forEach(function (item) { list.appendChild(row(item)); });
		root.append(tools, list);
		if (history.more) {
			var more = el("button", "note-more", "Load older notifications");
			more.type = "button";
			more.addEventListener("click", function () { loadHistory(true); });
			root.appendChild(more);
		}
	}

	function paint() {
		paintBadges();
		if (state.open) paintPanel();
		else if (panel) panel.hidden = true;
		paintHistory();
	}

	function place() {
		if (!panel || !state.anchor || panel.hidden) return;
		var rect = state.anchor.getBoundingClientRect();
		var width = Math.min(380, window.innerWidth - 16);
		var left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
		var below = window.innerHeight - rect.bottom - 12;
		var above = rect.top - 12;
		var height = Math.min(480, window.innerHeight - 24);
		panel.style.width = width + "px";
		if (below >= 220 || below >= above) {
			panel.style.top = Math.max(8, rect.bottom + 8) + "px";
			panel.style.maxHeight = Math.max(160, Math.min(height, below)) + "px";
		} else {
			var maxHeight = Math.max(160, Math.min(height, above));
			panel.style.maxHeight = maxHeight + "px";
			panel.style.top = Math.max(8, rect.top - maxHeight - 8) + "px";
		}
		panel.style.left = left + "px";
	}

	function openPanel(anchor) {
		state.anchor = anchor;
		state.open = true;
		paint();
		panel.focus();
	}

	function closePanel(restore) {
		var anchor = state.anchor;
		state.open = false;
		if (panel) panel.hidden = true;
		paintBadges();
		if (restore && anchor) anchor.focus();
	}

	function toggle(anchor) {
		if (state.open && state.anchor === anchor) closePanel(false);
		else openPanel(anchor);
	}

	function enhance(button) {
		if (button.dataset.notifyReady) return;
		button.dataset.notifyReady = "1";
		button.setAttribute("data-student-notifications", "");
		if (button.tagName === "A") button.setAttribute("role", "button");
		button.addEventListener("click", function (event) {
			event.preventDefault();
			event.stopPropagation();
			toggle(button);
		});
		button.addEventListener("keydown", function (event) {
			if (event.key === "ArrowDown" && state.open) {
				event.preventDefault();
				var first = panel && panel.querySelector(".note-item, .note-mark, .note-retry");
				if (first) first.focus();
			}
		});
	}

	var scanning = false;
	function scan() {
		if (scanning) return;
		scanning = true;
		try {
			styles();
			bells().forEach(enhance);
			paintBadges();
		} finally {
			scanning = false;
		}
	}

	function applyRows(rows) {
		var seen = {};
		state.items = rows.map(normalise).filter(function (item) {
			if (seen[item.id]) return false;
			seen[item.id] = true;
			return true;
		});
	}

	function normalise(row) {
		return {
			id: row.id,
			type: row.type,
			title: row.title,
			message: row.message,
			destination_url: row.destination_url,
			read_at: row.read_at,
			created_at: row.created_at
		};
	}

	function refresh() {
		var current = ensureClient();
		if (!current || !state.userId) {
			state.status = "signedout";
			state.items = [];
			state.unread = 0;
			paint();
			return Promise.resolve();
		}
		if (!state.items.length) state.status = "loading";
		paint();
		return Promise.all([
			current.from("notifications").select("id,type,title,message,destination_url,read_at,created_at").order("created_at", { ascending: false }).limit(PAGE_SIZE),
			current.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
		]).then(function (results) {
			if (results[0].error || results[1].error) throw results[0].error || results[1].error;
			applyRows(results[0].data || []);
			state.unread = results[1].count || 0;
			state.status = "ready";
			state.error = "";
			paint();
			if (document.getElementById("notification-history")) return loadHistory(false);
		}).catch(function () {
			state.status = "error";
			state.error = "Check your connection and try again.";
			paint();
		});
	}

	function loadHistory(append) {
		var current = ensureClient();
		var root = document.getElementById("notification-history");
		if (!root || !current || !state.userId) return Promise.resolve();
		history.status = append ? history.status : "loading";
		paintHistory();
		var query = current.from("notifications").select("id,type,title,message,destination_url,read_at,created_at").order("created_at", { ascending: false }).limit(PAGE_SIZE);
		var last = append && history.items.length ? history.items[history.items.length - 1].created_at : "";
		if (last) query = query.lt("created_at", last);
		return query.then(function (result) {
			if (result.error) throw result.error;
			var rows = (result.data || []).map(normalise);
			history.items = append ? history.items.concat(rows) : rows;
			history.more = rows.length === PAGE_SIZE;
			history.status = "ready";
			history.error = "";
			paintHistory();
		}).catch(function () {
			history.status = "error";
			history.error = "Check your connection and try again.";
			paintHistory();
		});
	}

	function subscribe(userId) {
		if (!client || !client.channel) return;
		if (channel) client.removeChannel(channel);
		channel = client.channel("student-notifications-" + userId).on(
			"postgres_changes",
			{ event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + userId },
			function () { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(refresh, 250); }
		).subscribe();
	}

	function resetFor(userId) {
		if (state.userId === userId) return;
		state.userId = userId;
		state.items = [];
		state.unread = 0;
		history.items = [];
		if (!userId) {
			if (channel && client) client.removeChannel(channel);
			channel = null;
			state.status = "signedout";
			closePanel(false);
			paint();
			return;
		}
		state.status = "loading";
		subscribe(userId);
		refresh();
	}

	function markRead(item) {
		var current = ensureClient();
		var stamp = new Date().toISOString();
		var wasUnread = !item.read_at;
		if (wasUnread) {
			item.read_at = stamp;
			state.unread = Math.max(0, state.unread - 1);
			history.items.forEach(function (row) { if (row.id === item.id) row.read_at = stamp; });
			paint();
		}
		if (!current) return Promise.resolve({ ok: false });
		return current.from("notifications").update({ read_at: stamp }).eq("id", item.id).is("read_at", null).then(function (result) {
			if (result.error) throw result.error;
			return { ok: true };
		}).catch(function () {
			if (wasUnread) {
				item.read_at = null;
				history.items.forEach(function (row) { if (row.id === item.id) row.read_at = null; });
				state.unread += 1;
				state.error = "That notification could not be marked as read.";
				paint();
			}
			return { ok: false };
		});
	}

	function openItem(item) {
		var dest = safePath(item.destination_url);
		var already = Boolean(item.read_at);
		markRead(item).then(function (result) {
			if (dest && (already || result.ok)) location.assign(dest);
		});
	}

	function markAll() {
		var current = ensureClient();
		if (!current || state.unread < 1) return;
		var stamp = new Date().toISOString();
		var previous = state.items.map(function (item) { return { id: item.id, read_at: item.read_at }; });
		var previousHistory = history.items.map(function (item) { return { id: item.id, read_at: item.read_at }; });
		var previousCount = state.unread;
		state.items.forEach(function (item) { if (!item.read_at) item.read_at = stamp; });
		history.items.forEach(function (item) { if (!item.read_at) item.read_at = stamp; });
		state.unread = 0;
		paint();
		current.from("notifications").update({ read_at: stamp }).is("read_at", null).then(function (result) {
			if (result.error) throw result.error;
		}).catch(function () {
			previous.forEach(function (saved) {
				state.items.forEach(function (item) { if (item.id === saved.id) item.read_at = saved.read_at; });
			});
			previousHistory.forEach(function (saved) {
				history.items.forEach(function (item) { if (item.id === saved.id) item.read_at = saved.read_at; });
			});
			state.unread = previousCount;
			state.error = "Notifications could not be marked as read.";
			state.status = "error";
			paint();
		});
	}

	function boot() {
		styles();
		scan();
		var ready = window.BryllaAuth && BryllaAuth.ready ? BryllaAuth.ready : Promise.resolve(null);
		ready.then(function () {
			var current = ensureClient();
			if (!current) {
				state.status = "error";
				state.error = "Notifications are not available right now.";
				paint();
				return null;
			}
			return current.auth.getSession();
		}).then(function (result) {
			if (!result) return;
			var user = result.data.session && result.data.session.user;
			resetFor(user ? user.id : null);
			client.auth.onAuthStateChange(function (event, session) {
				// The callback runs while the auth lock is held. Wait until it is released
				// before reading the session again, or the dashboard never gets the lock back.
				window.setTimeout(function () {
					if (event === "SIGNED_OUT") resetFor(null);
					else if (session && session.user) resetFor(session.user.id);
				}, 0);
			});
		}).catch(function () {
			state.status = "error";
			state.error = "Check your connection and try again.";
			paint();
		});
	}

	document.addEventListener("click", function (event) {
		if (!state.open) return;
		if (panel && panel.contains(event.target)) return;
		if (state.anchor && state.anchor.contains(event.target)) return;
		closePanel(false);
	});
	document.addEventListener("keydown", function (event) {
		if (!state.open) return;
		if (event.key === "Escape") {
			event.preventDefault();
			closePanel(true);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		var items = panel ? Array.from(panel.querySelectorAll(".note-item, .note-mark, .note-retry, .note-foot")) : [];
		var index = items.indexOf(document.activeElement);
		if (index < 0) return;
		event.preventDefault();
		var next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
		if (next) next.focus();
	});
	window.addEventListener("resize", place);
	window.addEventListener("scroll", place, true);
	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState === "visible" && state.userId) refresh();
	});
	// scan() updates the bell. Ignore those updates, or each badge rewrite schedules another scan.
	var domObserver = new MutationObserver(function () {
		domObserver.disconnect();
		try { scan(); }
		finally { domObserver.observe(document.documentElement, { childList: true, subtree: true }); }
	});
	domObserver.observe(document.documentElement, { childList: true, subtree: true });

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
	else boot();

	window.BryllaNotifications = { refresh: refresh, markAll: markAll };
})();
