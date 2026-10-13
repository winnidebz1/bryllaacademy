(function () {
	var PROFILE_KEY = "brylla-student-profile";
	var PROGRESS_KEY = "brylla-course-progress";
	var OWNER_KEY = "brylla-auth-user";
	var script = document.currentScript;
	var guarded = Boolean(script && script.dataset.guard === "student");
	var config = window.BryllaPublic || {};
	var client = window.supabase && config.supabaseUrl && config.supabaseAnonKey
		? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
		: null;
	var user = null;

	var cloak = null;
	if (guarded) {
		cloak = document.createElement("style");
		cloak.textContent = "body{visibility:hidden}";
		document.head.appendChild(cloak);
	}

	function reveal() {
		if (cloak) cloak.remove();
		cloak = null;
	}

	function read(key) {
		try {
			return JSON.parse(localStorage.getItem(key) || "null");
		} catch (error) {
			return null;
		}
	}

	function write(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}

	function blankProgress() {
		return { enrolled: false, started: false, completedLessonIds: [], attendedLiveIds: [], courses: {} };
	}

	// Paid courses come only from the enrollments table, never from this browser.
	function applyEnrolments(paidIds) {
		var paid = {};
		paidIds.forEach(function (id) { paid[id] = true; });
		var progress = read(PROGRESS_KEY) || blankProgress();
		var courses = progress.courses || {};
		Object.keys(courses).forEach(function (id) {
			if (!paid[id]) courses[id] = { enrolled: false, started: false };
		});
		Object.keys(paid).forEach(function (id) {
			var course = courses[id] || {};
			courses[id] = { enrolled: true, started: Boolean(course.started) };
		});
		progress.courses = courses;
		progress.enrolled = Boolean(paid.bookkeeping);
		if (!progress.enrolled) progress.started = false;
		write(PROGRESS_KEY, progress);
	}

	function syncStudent(signedIn, profile, enrolments) {
		if (localStorage.getItem(OWNER_KEY) !== signedIn.id) {
			localStorage.removeItem(PROGRESS_KEY);
			localStorage.setItem(OWNER_KEY, signedIn.id);
		}
		var meta = signedIn.user_metadata || {};
		var name = (profile && profile.full_name) || meta.full_name || signedIn.email.split("@")[0];
		write(PROFILE_KEY, { name: name, email: signedIn.email });
		applyEnrolments(enrolments.map(function (row) { return row.course_id; }));
	}

	function toLogin() {
		location.replace("login?next=" + encodeURIComponent(location.pathname + location.search));
		return new Promise(function () {});
	}

	async function load() {
		if (!client) {
			if (guarded) return toLogin();
			return null;
		}
		var session = (await client.auth.getSession()).data.session;
		if (!session) {
			localStorage.removeItem(PROFILE_KEY);
			applyEnrolments([]);
			if (guarded) return toLogin();
			return null;
		}
		user = session.user;
		var results = await Promise.all([
			client.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
			client.from("enrollments").select("course_id,status").eq("user_id", user.id)
		]);
		if (results[1].error) throw results[1].error;
		syncStudent(user, results[0].data, results[1].data || []);
		return { user: user };
	}

	var ready = load().catch(function () {
		return null;
	}).then(function (state) {
		reveal();
		return state;
	});

	async function signOut() {
		try {
			if (client) await client.auth.signOut();
		} catch (error) {
			// The local session is cleared even when the network call fails.
		}
		localStorage.removeItem(PROFILE_KEY);
		location.assign("/");
	}

	async function saveName(name) {
		if (!client || !user) return { ok: false };
		var result = await client.from("profiles").update({ full_name: name }).eq("id", user.id);
		return { ok: !result.error };
	}

	document.addEventListener("click", function (event) {
		var link = event.target.closest ? event.target.closest("a") : null;
		if (!link || link.textContent.trim() !== "Sign out") return;
		event.preventDefault();
		signOut();
	});

	window.BryllaAuth = { client: client, ready: ready, signOut: signOut, saveName: saveName };
})();
