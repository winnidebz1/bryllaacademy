(function () {
	var PROFILE_KEY = "brylla-student-profile";
	var PROGRESS_KEY = "brylla-course-progress";
	var LESSON_MINUTES = 45;
	var modules = [
		{ week: 1, title: "Bookkeeping foundations", live: "Chart of accounts build-off", lessons: ["What a US bookkeeper does", "Debits, credits, and journal entries", "Chart of accounts"] },
		{ week: 2, title: "QuickBooks Online", live: "The shoebox challenge", lessons: ["QuickBooks Online setup and navigation", "Bank feeds, bank rules, and categorizing", "Accounts receivable"] },
		{ week: 3, title: "Payables and reconciliations", live: "Find the difference", lessons: ["Accounts payable", "Bank reconciliation", "Credit card reconciliation"] },
		{ week: 4, title: "Assets, loans, and adjustments", live: "Schedule lab", lessons: ["Fixed assets and depreciation", "Amortization, prepaid expenses, and accruals", "Loan accounts"] },
		{ week: 5, title: "Xero and merchant apps", live: "Messy e-commerce month", lessons: ["Xero from start to finish", "Stripe", "PayPal and reconciling merchant payouts"] },
		{ week: 6, title: "Month-end close and career", live: "Capstone presentations and mock interviews", lessons: ["Month-end close and financial reports", "Real-world practice: cleanup and catch-up", "Job sites, applications, and using AI"] }
	];
	var lessons = [];
	var lives = [];
	modules.forEach(function (module) {
		module.lessons.forEach(function (title, index) {
			lessons.push({ id: "w" + module.week + "l" + (index + 1), week: module.week, title: title, minutes: LESSON_MINUTES });
		});
		lives.push({ id: "w" + module.week + "live", week: module.week, title: module.live });
	});

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

	function blank() {
		return { enrolled: false, started: false, completedLessonIds: [], attendedLiveIds: [] };
	}

	function loadProgress() {
		var saved = read(PROGRESS_KEY) || blank();
		saved.completedLessonIds = Array.isArray(saved.completedLessonIds) ? saved.completedLessonIds : [];
		saved.attendedLiveIds = Array.isArray(saved.attendedLiveIds) ? saved.attendedLiveIds : [];
		return saved;
	}

	function saveProgress(progress) {
		write(PROGRESS_KEY, progress);
	}

	function sendToAccount(kind, id) {
		if (window.BryllaAuth && BryllaAuth.record) BryllaAuth.record(kind, id);
	}

	function lessonById(id) {
		return lessons.filter(function (lesson) { return lesson.id === id; })[0] || null;
	}

	function currentLesson(progress) {
		var done = {};
		progress.completedLessonIds.forEach(function (id) { done[id] = true; });
		for (var i = 0; i < lessons.length; i += 1) {
			if (!done[lessons[i].id]) return lessons[i];
		}
		return lessons[lessons.length - 1];
	}

	function doneCount(progress) {
		var known = {};
		lessons.forEach(function (lesson) { known[lesson.id] = true; });
		return progress.completedLessonIds.filter(function (id) { return known[id]; }).length;
	}

	function summary() {
		var progress = loadProgress();
		var started = Boolean(progress.enrolled && progress.started);
		var current = currentLesson(progress);
		var completed = doneCount(progress);
		var allDone = completed >= lessons.length;
		return {
			enrolled: Boolean(progress.enrolled),
			started: started,
			weekCurrent: started ? (allDone ? modules.length : current.week) : 0,
			weeksTotal: started ? modules.length : 0,
			lessonsDone: started ? completed : 0,
			lessonsTotal: started ? lessons.length : 0,
			minutesLeft: started && !allDone ? LESSON_MINUTES : 0,
			lessonTitle: current.title,
			lessonId: current.id,
			attendancePercent: started ? Math.round((progress.attendedLiveIds.length / lives.length) * 100) : 0,
			assignmentsDue: 0,
			percentComplete: started ? Math.round((completed / lessons.length) * 100) : 0,
			completed: started && allDone
		};
	}

	function courseRecord(id) {
		var progress = loadProgress();
		var saved = progress.courses && progress.courses[id] ? progress.courses[id] : {};
		var record = { enrolled: Boolean(saved.enrolled), started: Boolean(saved.started) };
		if (id === "bookkeeping") {
			record.enrolled = record.enrolled || Boolean(progress.enrolled);
			record.started = record.started || Boolean(progress.started);
		}
		return record;
	}

	function enroll(courseId) {
		var id = courseId || "bookkeeping";
		var progress = loadProgress();
		if (!progress.courses) progress.courses = {};
		var existing = progress.courses[id] || {};
		existing.enrolled = true;
		if (!existing.started) existing.started = false;
		progress.courses[id] = existing;
		if (id === "bookkeeping") progress.enrolled = true;
		saveProgress(progress);
		return summary();
	}

	function startCourse() {
		var progress = loadProgress();
		var wasStarted = Boolean(progress.started);
		progress.enrolled = true;
		progress.started = true;
		if (!progress.courses) progress.courses = {};
		progress.courses.bookkeeping = { enrolled: true, started: true };
		saveProgress(progress);
		if (!wasStarted) sendToAccount("start", "bookkeeping");
		return summary();
	}

	function completeLesson(id) {
		var progress = loadProgress();
		var wasStarted = Boolean(progress.started);
		if (!progress.started) {
			progress.enrolled = true;
			progress.started = true;
		}
		var current = currentLesson(progress);
		var added = current.id === id && progress.completedLessonIds.indexOf(id) === -1;
		if (added) progress.completedLessonIds.push(id);
		saveProgress(progress);
		if (!wasStarted) sendToAccount("start", "bookkeeping");
		if (added) sendToAccount("lesson", id);
		return summary();
	}

	function attendLive(id) {
		var progress = loadProgress();
		if (!progress.started) return summary();
		var known = lives.some(function (live) { return live.id === id; });
		var added = known && progress.attendedLiveIds.indexOf(id) === -1;
		if (added) progress.attendedLiveIds.push(id);
		saveProgress(progress);
		if (added) sendToAccount("live", id);
		return summary();
	}

	function loadProfile() {
		var profile = read(PROFILE_KEY);
		if (!profile || !profile.name || !profile.email) return null;
		return { name: profile.name, email: profile.email };
	}

	function saveProfile(profile) {
		write(PROFILE_KEY, { name: String(profile.name || "").trim(), email: String(profile.email || "").trim() });
	}

	window.BryllaStudent = {
		modules: modules,
		lessons: lessons,
		lives: lives,
		lessonMinutes: LESSON_MINUTES,
		lessonById: lessonById,
		loadProfile: loadProfile,
		saveProfile: saveProfile,
		loadProgress: loadProgress,
		summary: summary,
		courseRecord: courseRecord,
		enroll: enroll,
		startCourse: startCourse,
		completeLesson: completeLesson,
		attendLive: attendLive
	};
})();
