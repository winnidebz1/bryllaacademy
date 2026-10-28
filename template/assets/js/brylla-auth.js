(function () {
	var PROFILE_KEY = "brylla-student-profile";
	var PROGRESS_KEY = "brylla-course-progress";
	var OWNER_KEY = "brylla-auth-user";
	var COURSE = "bookkeeping";
	var script = document.currentScript;
	var guarded = Boolean(script && script.dataset.guard === "student");
	var config = window.BryllaPublic || {};
	var client = config.client ? config.client() : null;
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

	function union(local, remote) {
		var merged = (local || []).slice();
		remote.forEach(function (id) {
			if (merged.indexOf(id) === -1) merged.push(id);
		});
		return merged;
	}

	// The account is the source of truth; anything this browser saved that the account
	// is missing (for example while offline) is sent up so the two end up identical.
	function mergeProgress(enrolment, rows) {
		var progress = read(PROGRESS_KEY) || blankProgress();
		var remoteLessons = [];
		var remoteLives = [];
		rows.forEach(function (row) {
			if (row.course_id !== COURSE) return;
			(row.kind === "live" ? remoteLives : remoteLessons).push(row.item_id);
		});
		var localStarted = Boolean(progress.started);
		progress.completedLessonIds = union(progress.completedLessonIds, remoteLessons);
		progress.attendedLiveIds = union(progress.attendedLiveIds, remoteLives);
		progress.started = Boolean(enrolment.started_at) || localStarted;
		if (!progress.courses) progress.courses = {};
		progress.courses[COURSE] = { enrolled: true, started: progress.started };
		write(PROGRESS_KEY, progress);

		if (localStarted && !enrolment.started_at) record("start", COURSE);
		progress.completedLessonIds.forEach(function (id) {
			if (remoteLessons.indexOf(id) === -1) record("lesson", id);
		});
		progress.attendedLiveIds.forEach(function (id) {
			if (remoteLives.indexOf(id) === -1) record("live", id);
		});
	}

	function syncStudent(signedIn, profile, enrolments, progressRows) {
		if (localStorage.getItem(OWNER_KEY) !== signedIn.id) {
			localStorage.removeItem(PROGRESS_KEY);
			localStorage.setItem(OWNER_KEY, signedIn.id);
		}
		var meta = signedIn.user_metadata || {};
		var name = (profile && profile.full_name) || meta.full_name || signedIn.email.split("@")[0];
		write(PROFILE_KEY, { name: name, email: signedIn.email });
		var enrolment = enrolments.filter(function (row) { return row.course_id === COURSE; })[0];
		if (enrolment && progressRows) mergeProgress(enrolment, progressRows);
		applyEnrolments(enrolments.map(function (row) { return row.course_id; }));
	}

	function record(kind, id) {
		if (!client) return Promise.resolve({ ok: false });
		if (!user) {
			return ready.then(function () {
				return user ? record(kind, id) : { ok: false };
			});
		}
		var request = kind === "start"
			? client.rpc("start_course", { p_course: id })
			: client.from("lesson_progress").upsert(
				{ user_id: user.id, course_id: COURSE, item_id: id, kind: kind },
				{ onConflict: "user_id,course_id,item_id", ignoreDuplicates: true }
			);
		return Promise.resolve(request).then(function (result) {
			return { ok: !result.error };
		}, function () {
			return { ok: false };
		});
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
		if (session) reveal();
		var checked = session ? await client.auth.getUser() : null;
		if (checked && checked.error && !checked.error.status) throw checked.error;
		if (!session || !checked || checked.error || !checked.data.user) {
			if (session) await client.auth.signOut({ scope: "local" });
			localStorage.removeItem(PROFILE_KEY);
			applyEnrolments([]);
			if (guarded) return toLogin();
			return null;
		}
		user = checked.data.user;
		var results = await Promise.all([
			client.from("profiles").select("full_name,role,account_status").eq("id", user.id).maybeSingle(),
			client.from("enrollments").select("course_id,status,started_at").eq("user_id", user.id),
			client.from("lesson_progress").select("course_id,item_id,kind").eq("user_id", user.id)
		]);
		if (results[0].data && results[0].data.role === "student" && results[0].data.account_status === "pending") {
			await client.auth.signOut({ scope: "local" });
			location.replace("login?waiting=1");
			return new Promise(function () {});
		}
		if (results[1].error) throw results[1].error;
		syncStudent(user, results[0].data, results[1].data || [], results[2].error ? null : results[2].data || []);
		return { user: user };
	}

	var ready = load().catch(function () {
		return null;
	}).then(function (state) {
		reveal();
		return state;
	});

	function clearAuthStorage() {
		[localStorage, sessionStorage].forEach(function (store) {
			try {
				Object.keys(store).forEach(function (key) {
					if (key.indexOf("sb-") === 0) store.removeItem(key);
				});
			} catch (error) { /* storage can be blocked */ }
		});
	}

	async function signOut() {
		try {
			if (client) await client.auth.signOut({ scope: "local" });
		} catch (error) {
			// The saved session is removed below even when the network call fails.
		}
		clearAuthStorage();
		localStorage.removeItem(PROFILE_KEY);
		sessionStorage.removeItem("brylla-role");
		location.assign("login");
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

	window.BryllaAuth = { client: client, ready: ready, signOut: signOut, saveName: saveName, record: record };
})();
