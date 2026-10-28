/* SOURCE OF TRUTH
   Replace this object with the instructor API response.
   Every total on the dashboard, courses page, and tables is calculated from it.
   A new instructor has the four Brylla courses, no students, and no earnings. */
(function () {
	var STORAGE_KEY = "brylla-instructor-store";
	var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	var BOOKKEEPING_MODULES = [
		{ week: 1, title: "Bookkeeping foundations" },
		{ week: 2, title: "QuickBooks Online" },
		{ week: 3, title: "Payables and reconciliations" },
		{ week: 4, title: "Assets, loans, and adjustments" },
		{ week: 5, title: "Xero and merchant apps" },
		{ week: 6, title: "Month-end close and career" }
	];
	var SOURCE = {
		instructor: { firstName: "", lastName: "", email: "", phone: "", bio: "", photo: "", qualifications: [], experience: [] },
		courses: [
			{ id: "bookkeeping", title: "Bookkeeping", status: "published", price: 600, lessons: 18, image: "", modules: BOOKKEEPING_MODULES },
			{ id: "remote-support", title: "Remote support", status: "draft", price: null, lessons: 0, image: "", modules: [] },
			{ id: "digital-marketing", title: "Digital marketing", status: "draft", price: null, lessons: 0, image: "", modules: [] },
			{ id: "project-management", title: "Project management", status: "draft", price: null, lessons: 0, image: "", modules: [] }
		],
		students: [],
		enrolments: [],
		earnings: [],
		announcements: [],
		assignments: [],
		submissions: [],
		questions: [],
		quizzes: [],
		results: [],
		issued: [],
		instructions: {},
		instructors: [],
		payments: [],
		activity: []
	};
	var MENU = [
		{ label: "Teaching", items: [
			{ label: "Overview", href: "instructor-dashboard.html", icon: "isax isax-grid-35", page: "dashboard" },
			{ label: "My courses", href: "instructor-course.html", icon: "isax isax-teacher5", page: "courses" },
			{ label: "Add course", href: "add-course.html", icon: "isax isax-add-circle5", page: "add-course" },
			{ label: "Modules and lessons", href: "instructor-dashboard.html#module-editor", icon: "isax isax-book", page: "modules" },
			{ label: "Assignments and grading", href: "instructor-assignment.html", icon: "isax isax-clipboard-text5", page: "assignments" },
			{ label: "Students", href: "instructor-students.html", icon: "isax isax-profile-2user5", page: "students" },
			{ label: "Quizzes", href: "instructor-quiz.html", icon: "isax isax-award5", page: "quiz" },
			{ label: "Quiz results", href: "instructor-quiz-results.html", icon: "isax isax-medal-star5", page: "quiz-results" },
			{ label: "Announcements", href: "instructor-announcements.html", icon: "isax isax-volume-high5", page: "announcements" },
			{ label: "Certificates", href: "instructor-certificate.html", icon: "isax isax-note-215", page: "certificates" },
			{ label: "Teaching analytics", href: "instructor-analytics.html", icon: "isax isax-medal-star5", page: "analytics" }
		] },
		{ label: "Account", items: [
			{ label: "My profile", href: "instructor-profile.html", icon: "isax isax-user", page: "profile" },
			{ label: "Help", href: "instructor-help.html", icon: "isax isax-messages-35", page: "help" },
			{ label: "Logout", href: "index-4.html", icon: "isax isax-logout5", page: "logout", danger: true }
		] }
	];
	var ADMIN_MENU = [
		{ label: "Academy", items: [
			{ label: "Academy Overview", href: "admin-dashboard.html", icon: "isax isax-grid-35", page: "admin-dashboard" },
			{ label: "Analytics and reports", href: "admin-reports.html", icon: "isax isax-note-215", page: "admin-reports" }
		] },
		{ label: "Courses", items: [
			{ label: "All courses", href: "admin-courses.html", icon: "isax isax-teacher5", page: "admin-courses" },
			{ label: "Add course", href: "add-course.html", icon: "isax isax-add-circle5", page: "add-course" },
			{ label: "Course performance", href: "admin-performance.html", icon: "isax isax-book", page: "admin-performance" },
			{ label: "Open modules", href: "admin-dashboard.html#module-unlocks", icon: "isax isax-book", page: "module-unlocks" }
		] },
		{ label: "People", items: [
			{ label: "Students", href: "admin-students.html", icon: "isax isax-profile-2user5", page: "admin-students" },
			{ label: "Instructors", href: "admin-instructors.html", icon: "isax isax-user", page: "admin-instructors" }
		] },
		{ label: "Operations", items: [
			{ label: "Announcements", href: "admin-announcements.html", icon: "isax isax-volume-high5", page: "admin-announcements" }
		] },
		{ label: "Account", items: [
			{ label: "My profile", href: "admin-profile.html", icon: "isax isax-user", page: "profile" },
			{ label: "Platform settings", href: "admin-settings.html", icon: "isax isax-setting-25", page: "admin-settings" },
			{ label: "Logout", href: "index-4.html", icon: "isax isax-logout5", page: "logout", danger: true }
		] }
	];
	var dirty = false;
	var selectedCourseId = "bookkeeping";
	var selectedWeek = 1;
	var courseStatusFilter = "all";
	var courseQuery = "";
	var courseSortKey = "title";
	var courseSortDir = 1;
	var earningsYear = new Date().getFullYear();

	function clone(value) { return JSON.parse(JSON.stringify(value)); }
	function readStore() {
		try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
		catch (error) { return null; }
	}
	function writeStore(data) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}
	function seedQuizzes(courses) {
		var bookkeeping = courses.filter(function (course) { return course.id === "bookkeeping"; })[0];
		if (!bookkeeping) return [];
		return bookkeeping.modules.map(function (module) {
			return { id: "bookkeeping-w" + module.week, courseId: "bookkeeping", moduleWeek: module.week, title: "Week " + module.week + " quiz", questions: 0, timeLimit: null, passMark: null, status: "draft" };
		});
	}
	function state() {
		var data = clone(SOURCE);
		var saved = readStore();
		if (!saved) {
			data.quizzes = seedQuizzes(data.courses);
			return data;
		}
		["instructor", "courses", "students", "enrolments", "earnings", "announcements", "assignments", "submissions", "questions", "quizzes", "results", "issued", "instructions", "instructors", "payments", "activity"].forEach(function (key) {
			if (saved[key] != null) data[key] = saved[key];
		});
		if (!Array.isArray(data.quizzes) || !data.quizzes.length) data.quizzes = seedQuizzes(data.courses);
		return data;
	}
	function save(data) { writeStore(data); }
	function esc(value) {
		return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
		});
	}
	function money(amount) {
		var number = Number(amount);
		if (!number) return "GHS 0";
		return "GHS " + number.toLocaleString("en-GH");
	}
	function rate(value) {
		if (value == null || value === "" || Number.isNaN(Number(value))) return "Not yet";
		return value + "%";
	}
	function formatDate(iso) {
		if (!iso) return "Not yet";
		var date = new Date(iso);
		if (Number.isNaN(date.getTime())) return "Not yet";
		var hours = date.getHours();
		var suffix = hours >= 12 ? "PM" : "AM";
		var hour = hours % 12 || 12;
		var minutes = String(date.getMinutes()).padStart(2, "0");
		return date.getDate() + " " + MONTHS[date.getMonth()] + " " + date.getFullYear() + ", " + hour + ":" + minutes + " " + suffix;
	}
	function timeOnly(iso) {
		var full = formatDate(iso);
		var parts = full.split(", ");
		return parts[1] || full;
	}
	function currentArea() {
		return document.body.getAttribute("data-area") === "admin" ? "admin" : "instructor";
	}
	function activeMenu() {
		return currentArea() === "admin" ? ADMIN_MENU : MENU;
	}
	function instructorName(data) {
		var name = (data.instructor.firstName + " " + data.instructor.lastName).trim();
		if (name) return name;
		return currentArea() === "admin" ? "Founder" : "Instructor";
	}
	function welcomeName(data) {
		var first = instructorName(data).split(/\s+/).filter(Boolean)[0];
		return first || "there";
	}
	function initials(data) {
		var name = instructorName(data);
		if (name === "Instructor") return "IN";
		if (name === "Founder") return "FO";
		return name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
	}
	function courseById(data, id) {
		return data.courses.filter(function (course) { return course.id === id; })[0] || null;
	}
	function quizCount(data, courseId) {
		return data.quizzes.filter(function (quiz) { return quiz.courseId === courseId; }).length;
	}
	function studentCount(data, courseId) {
		return data.enrolments.filter(function (row) { return row.courseId === courseId; }).length;
	}
	function paymentSum(data, status) {
		return (data.payments || []).filter(function (row) {
			return !status || row.status === status;
		}).reduce(function (sum, row) { return sum + (Number(row.amount) || 0); }, 0);
	}
	function averageProgress(data, courseId) {
		var rows = data.enrolments.filter(function (row) { return row.courseId === courseId && row.progress != null; });
		if (!rows.length) return null;
		return Math.round(rows.reduce(function (sum, row) { return sum + Number(row.progress); }, 0) / rows.length);
	}
	function totals(data) {
		var earnings = data.earnings.reduce(function (sum, row) { return sum + (Number(row.amount) || 0); }, 0);
		var completedPayments = paymentSum(data, "completed");
		var pendingPayments = paymentSum(data, "pending");
		return {
			courses: data.courses.length,
			active: data.courses.filter(function (course) { return course.status === "published"; }).length,
			completed: data.courses.filter(function (course) { return course.status === "completed"; }).length,
			pending: data.courses.filter(function (course) { return course.status === "pending"; }).length,
			draft: data.courses.filter(function (course) { return course.status === "draft"; }).length,
			paid: data.courses.filter(function (course) { return Number(course.price) > 0; }).length,
			students: data.students.length,
			enrolments: data.enrolments.length,
			earnings: earnings,
			revenue: completedPayments + pendingPayments,
			completedPayments: completedPayments,
			instructors: (data.instructors || []).filter(function (person) { return person.status === "active"; }).length
		};
	}
	function statusBadge(status) {
		var map = {
			published: ["Published", "badge-success-transparent"],
			draft: ["Draft", "badge-light"],
			pending: ["Pending", "badge-warning-transparent"],
			scheduled: ["Scheduled", "badge-warning-transparent"],
			completed: ["Completed", "badge-success-transparent"],
			"on track": ["On track", "badge-success-transparent"],
			"at risk": ["At risk", "badge-warning-transparent"],
			inactive: ["Inactive", "badge-light"],
			pass: ["Pass", "badge-success-transparent"],
			"not passed": ["Not passed", "badge-light"],
			active: ["Active", "badge-success-transparent"],
			failed: ["Failed", "badge-light"],
			refunded: ["Refunded", "badge-light"]
		};
		var item = map[String(status || "").toLowerCase()] || [status || "Draft", "badge-light"];
		var icon = item[0] === "Pass" || item[0] === "Completed" || item[0] === "Active" ? "isax isax-tick-circle" : item[0] === "Not passed" || item[0] === "Failed" || item[0] === "Refunded" ? "isax isax-close-circle" : "";
		return '<span class="badge ' + item[1] + '">' + (icon ? '<i class="' + icon + '" aria-hidden="true"></i> ' : "") + esc(item[0]) + "</span>";
	}
	function toast(message) {
		var node = document.getElementById("instructor-toast");
		if (!node) return;
		node.textContent = message;
		node.hidden = false;
		window.clearTimeout(toast.timer);
		toast.timer = window.setTimeout(function () { node.hidden = true; }, 3200);
	}
	function confirmAction(message) {
		var dialog = document.getElementById("instructor-confirm");
		document.getElementById("instructor-confirm-text").textContent = message;
		if (dialog.open) dialog.close();
		dialog.showModal();
		return new Promise(function (resolve) {
			function done(ok) {
				dialog.querySelector("[value='ok']").onclick = null;
				dialog.querySelector("[value='cancel']").onclick = null;
				if (dialog.open) dialog.close();
				resolve(ok);
			}
			dialog.querySelector("[value='ok']").onclick = function () { done(true); };
			dialog.querySelector("[value='cancel']").onclick = function () { done(false); };
		});
	}
	function empty(message, action) {
		return '<div class="card"><div class="card-body"><p class="mb-0">' + esc(message) + "</p>" + (action || "") + "</div></div>";
	}
	function skeleton() {
		return '<div class="row">' + [1, 2, 3].map(function () {
			return '<div class="col-md-4"><div class="card"><div class="card-body"><div class="bg-light rounded mb-2" style="height:18px"></div><div class="bg-light rounded" style="height:28px;width:40%"></div></div></div></div>';
		}).join("") + "</div>";
	}
	function errorBlock() {
		return '<div class="card"><div class="card-body" role="alert"><p>We could not load this page.</p><button class="btn btn-primary rounded-pill" type="button" id="instructor-retry">Try again</button></div></div>';
	}
	function pageState() { return new URLSearchParams(location.search).get("state"); }

	function pageTitle(page) {
		var title = "Overview";
		activeMenu().forEach(function (group) {
			group.items.forEach(function (item) {
				if (item.page === page) title = item.label;
			});
		});
		return title.charAt(0).toUpperCase() + title.slice(1);
	}
	function academyFooter() {
		return '<footer class="academy-instructor-footer"><div class="container"><div class="academy-footer-row">' +
			'<a class="academy-footer-brand" href="/"><span class="academy-footer-mark"><img src="assets/img/logo.png" alt=""></span>' +
			'<span><strong>Brylla Academy</strong><span class="tagline">Practical professional skills taught for the remote world.</span></span></a>' +
			'<nav class="academy-footer-links" aria-label="Footer navigation">' +
			'<a href="/#courses">Courses</a><a href="/#services">Professional Services</a><a href="/#toolkit">Free Resource</a><a href="contact-us">Contact Us</a>' +
			'</nav></div><p class="copyright">&copy; 2026 Brylla Academy. All rights reserved.</p></div></footer>';
	}
	function shell(page, data) {
		var admin = currentArea() === "admin";
		var home = admin ? "admin-dashboard.html" : "instructor-dashboard.html";
		var avatar = data.instructor.photo
			? '<img src="' + esc(data.instructor.photo) + '" alt="">'
			: esc(initials(data));
		var menu = activeMenu().map(function (group) {
			return '<p class="app-nav-label">' + esc(group.label) + "</p><ul>" + group.items.map(function (item) {
				var current = item.page === page;
				return '<li><a href="' + esc(item.href) + '" class="' + (current ? "active" : "") + (item.danger ? " is-danger" : "") + '"' + (current ? ' aria-current="page"' : "") + (item.page === "logout" ? ' data-logout="1"' : "") + '><i class="' + item.icon + '" aria-hidden="true"></i><span>' + esc(item.label) + "</span></a></li>";
			}).join("") + "</ul>";
		}).join("");
		var notes = admin ? "admin-announcements.html" : "instructor-notifications.html";
		var profileHref = admin ? "admin-profile.html" : "instructor-profile.html";
		return '<a class="instructor-skip" href="#main">Skip to main content</a>' +
			'<div class="app-shell"><aside class="app-sidebar" id="app-sidebar"><div class="app-brand"><a href="' + home + '" aria-label="Brylla Academy"><img src="assets/img/logo.png" alt="Brylla Academy"></a>' +
			'<button class="app-icon" type="button" id="sidebar-collapse" aria-label="Collapse sidebar"><i class="isax isax-arrow-left-2" aria-hidden="true"></i></button></div>' +
			'<nav id="instructor-menu" aria-label="' + (admin ? "Founder menu" : "Instructor menu") + '">' + menu + "</nav></aside>" +
			'<div class="app-scrim" id="app-scrim" hidden></div>' +
			'<div class="app-main"><header class="app-top"><button class="app-icon" type="button" id="sidebar-open" aria-label="Open menu"><i class="isax isax-menu-1" aria-hidden="true"></i></button>' +
			'<p class="app-title" id="app-title">' + esc(pageTitle(page)) + '</p>' +
			'<label class="visually-hidden" for="app-search">Search this page</label><input class="app-search" id="app-search" type="search" placeholder="Search">' +
			'<a class="app-icon" href="' + notes + '" aria-label="Notifications"><i class="isax isax-notification" aria-hidden="true"></i></a>' +
			'<a class="app-profile-button" href="' + profileHref + '"><span class="app-avatar">' + avatar + "</span><span>" + esc(instructorName(data)) + "</span></a></header>" +
			'<main class="app-content" id="main"></main></div></div>' +
			academyFooter() +
			'<p class="instructor-toast" id="instructor-toast" role="status" aria-live="polite" hidden></p>' +
			'<dialog class="instructor-confirm" id="instructor-confirm"><div class="card-body"><p id="instructor-confirm-text"></p><div class="d-flex gap-2"><button class="btn btn-light" type="button" value="cancel">Cancel</button><button class="btn btn-danger" type="button" value="ok">Delete</button></div></div></dialog>';
	}
	function bindMenu() {
		var sidebar = document.getElementById("app-sidebar");
		var scrim = document.getElementById("app-scrim");
		var search = document.getElementById("app-search");
		document.getElementById("sidebar-open").addEventListener("click", function () {
			sidebar.classList.add("is-open");
			scrim.hidden = false;
		});
		document.getElementById("sidebar-collapse").addEventListener("click", function () {
			if (window.matchMedia("(max-width: 991.98px)").matches) {
				sidebar.classList.remove("is-open");
				scrim.hidden = true;
				return;
			}
			document.body.classList.toggle("sidebar-collapsed");
		});
		scrim.addEventListener("click", function () {
			sidebar.classList.remove("is-open");
			scrim.hidden = true;
		});
		document.addEventListener("keydown", function (event) {
			if (event.key === "Escape") {
				sidebar.classList.remove("is-open");
				scrim.hidden = true;
			}
		});
		function endStaffSession(event) {
			if (event) event.preventDefault();
			var current = staffClient();
			var done = current ? current.auth.signOut({ scope: "local" }) : Promise.resolve();
			done.finally(function () {
				sessionStorage.removeItem("brylla-role");
				try {
					[localStorage, sessionStorage].forEach(function (store) {
						Object.keys(store).forEach(function (key) {
							if (key.indexOf("sb-") === 0) store.removeItem(key);
						});
					});
				} catch (error) { /* storage can be blocked */ }
				location.assign(currentArea() === "admin" ? "admin-login" : "instructor-login");
			});
		}
		document.getElementById("instructor-menu").addEventListener("click", function (event) {
			var link = event.target.closest("a");
			if (!link) return;
			if (link.hasAttribute("data-logout")) {
				endStaffSession(event);
				return;
			}
			if (dirty && !window.confirm("You have unsaved changes. Leave this page?")) event.preventDefault();
			else dirty = false;
		});
		search.addEventListener("input", function () {
			var query = search.value.trim().toLowerCase();
			document.querySelectorAll("#main [data-search-item]").forEach(function (row) {
				row.hidden = query && row.textContent.toLowerCase().indexOf(query) === -1;
			});
		});
	}
	function statCard(iconClass, tint, label, value, href, filter, columnClass) {
		var inner = '<div class="card"><div class="card-body"><div class="d-flex align-items-center">' +
			'<span class="icon-box ' + tint + ' me-2 me-xxl-3 flex-shrink-0"><i class="' + iconClass + '" aria-hidden="true"></i></span><div><span class="d-block">' + esc(label) + '</span><h4 class="fs-24 mt-1 mb-0">' + esc(value) + "</h4></div></div></div></div>";
		var control = filter
			? '<button class="instructor-stat-link" type="button" data-course-filter="' + esc(filter) + '">' + inner + "</button>"
			: '<a class="instructor-stat-link" href="' + esc(href) + '">' + inner + "</a>";
		return '<div class="' + (columnClass || "col-md-6 col-xl-4") + '">' + control + "</div>";
	}
	function table(headers, rows) {
		if (!rows.length) return "";
		var head = "<thead><tr>" + headers.map(function (header) {
			var label = header.sort ? '<button type="button" data-sort="' + esc(header.sort) + '">' + esc(header.label) + "</button>" : esc(header.label);
			return '<th scope="col">' + label + "</th>";
		}).join("") + "</tr></thead>";
		var body = "<tbody>" + rows.map(function (row) { return row; }).join("") + "</tbody>";
		return '<div class="card"><div class="card-body p-0"><table class="instructor-table">' + head + body + "</table></div></div>";
	}
	function cell(label, html) { return '<td data-label="' + esc(label) + '">' + html + "</td>"; }

	function renderDashboard(root, data) {
		var count = totals(data);
		var course = courseById(data, selectedCourseId) || data.courses[0];
		selectedCourseId = course ? course.id : "";
		var grading = data.submissions.filter(function (row) { return row.score == null; });
		var questions = data.questions.filter(function (row) { return !row.reply; });
		var visible = data.courses.filter(function (item) {
			if (courseStatusFilter === "paid" && !(Number(item.price) > 0)) return false;
			if (courseStatusFilter !== "all" && courseStatusFilter !== "paid" && item.status !== courseStatusFilter) return false;
			return item.title.toLowerCase().indexOf(courseQuery.toLowerCase()) !== -1;
		});
		visible.sort(function (a, b) {
			var left = courseSortKey === "students" ? studentCount(data, a.id) : String(a[courseSortKey] || "");
			var right = courseSortKey === "students" ? studentCount(data, b.id) : String(b[courseSortKey] || "");
			if (typeof left === "number") return (left - right) * courseSortDir;
			return left.localeCompare(right) * courseSortDir;
		});
		var statusOptions = [["all", "All statuses"], ["published", "Published"], ["pending", "Pending"], ["draft", "Draft"], ["completed", "Completed"]];
		var drafts = data.courses.filter(function (item) { return item.status === "draft"; });
		var scored = data.enrolments.filter(function (row) { return row.progress != null; });
		var completion = scored.length ? Math.round(scored.reduce(function (sum, row) { return sum + Number(row.progress); }, 0) / scored.length) : null;
		root.innerHTML = '<div class="dash-head"><div><h1 class="welcome-badge">Welcome, ' + esc(welcomeName(data)) + '</h1><p class="mb-0">Your courses, students and grading for today.</p></div>' +
			'<div class="d-flex flex-wrap gap-2"><a class="btn btn-primary rounded-pill" href="add-course.html">Create course</a><a class="btn btn-light rounded-pill" href="instructor-assignment.html">Review submissions</a></div></div>' +
			'<div class="row">' +
			statCard("isax isax-teacher5", "bg-primary-transparent", "My courses", String(count.courses), "#my-courses", "all") +
			statCard("isax isax-profile-2user5", "bg-info-transparent", "My students", String(count.students), "instructor-students.html") +
			statCard("isax isax-clipboard-text5", "bg-warning-transparent", "Pending reviews", String(grading.length), "instructor-assignment.html") +
			statCard("isax isax-medal-star5", "bg-success-transparent", "Course completion", rate(completion), "instructor-analytics.html") +
			'</div><div class="card mb-4" id="attention"><div class="card-body"><h2 class="h5 fw-bold">Needs your attention</h2>' +
			'<ul class="attention-list">' +
			'<li><a href="instructor-assignment.html">' + grading.length + " assignment" + (grading.length === 1 ? "" : "s") + " awaiting grading</a></li>" +
			'<li><a href="instructor-course.html">' + drafts.length + " course draft" + (drafts.length === 1 ? "" : "s") + "</a></li>" +
			'<li><a href="#attention">' + questions.length + " unanswered question" + (questions.length === 1 ? "" : "s") + "</a></li></ul>" +
			'<div class="nav nav-tabs mb-3" role="tablist"><button class="nav-link active" type="button" data-tab="grading">Grading <span>' + grading.length + '</span></button><button class="nav-link" type="button" data-tab="questions">Questions <span>' + questions.length + "</span></button></div>" +
			'<div data-panel="grading">' + (grading.length ? grading.map(gradeForm).join("") : "<p class=\"mb-0\">Nothing to grade. Submissions appear here after students enrol.</p>") + "</div>" +
			'<div data-panel="questions" hidden>' + (questions.length ? questions.map(questionForm).join("") : "<p class=\"mb-0\">No questions yet. Student questions appear here after they enrol.</p>") + "</div></div></div>" +
			'<h2 class="h5 fw-bold mb-3" id="my-courses">My courses</h2>' +
			'<div class="instructor-tools d-flex flex-wrap gap-2 mb-3"><label class="visually-hidden" for="dash-course-search">Search courses</label><input class="form-control" id="dash-course-search" placeholder="Search courses" value="' + esc(courseQuery) + '">' +
			'<label class="visually-hidden" for="dash-course-status">Status</label><select class="form-select" id="dash-course-status">' + statusOptions.map(function (option) {
				return '<option value="' + option[0] + '"' + (option[0] === courseStatusFilter ? " selected" : "") + ">" + option[1] + "</option>";
			}).join("") + "</select></div>" +
			(visible.length ? table(
				[{ label: "Course", sort: "title" }, { label: "Students", sort: "students" }, { label: "Status", sort: "status" }],
				visible.map(function (item) {
					return '<tr data-search-item data-course="' + esc(item.id) + '"' + (item.id === selectedCourseId ? ' class="is-selected"' : "") + ">" +
						cell("Course", '<button class="linkish" type="button">' + esc(item.title) + "</button>") +
						cell("Students", String(studentCount(data, item.id))) +
						cell("Status", statusBadge(item.status)) + "</tr>";
				})
			) : empty(data.courses.length ? "No courses match." : "No courses yet. Add a Brylla course to see it here.", data.courses.length ? "" : '<a class="btn btn-primary rounded-pill mt-3" href="add-course.html">Add new course</a>')) +
			moduleEditor(data, course);
		bindDashboard(root, data);
	}
	function gradeForm(row) {
		var files = (row.files || []).map(function (file) {
			if (!file.url) return "<li>" + esc(file.name || "File") + "</li>";
			return '<li><a href="' + esc(file.url) + '" target="_blank" rel="noopener">' + esc(file.name || "File") + "</a></li>";
		}).join("");
		var note = row.note ? '<p class="mb-2">' + esc(row.note) + "</p>" : "";
		var attached = files ? '<ul class="mb-2">' + files + "</ul>" : "";
		return '<form class="border rounded p-3 mb-3" data-grade="' + esc(row.id) + '"><p class="mb-2">' + esc(row.student) + " · " + esc(row.title) + "</p>" +
			note + attached +
			'<label class="form-label" for="score-' + esc(row.id) + '">Score out of ' + esc(row.total) + '</label><input class="form-control mb-2" id="score-' + esc(row.id) + '" name="score" type="number" min="0" max="' + esc(row.total) + '" value="' + esc(row.score == null ? "" : row.score) + '">' +
			'<label class="form-label" for="feed-' + esc(row.id) + '">Feedback</label><textarea class="form-control mb-2" id="feed-' + esc(row.id) + '" name="feedback" rows="2">' + esc(row.feedback || "") + "</textarea>" +
			'<button class="btn btn-primary rounded-pill" type="submit">Save grade</button></form>';
	}
	function submissionFiles(row) {
		var files = row.files || [];
		if (!files.length) return "None";
		return files.map(function (file) {
			if (!file.url) return esc(file.name || "File");
			return '<a href="' + esc(file.url) + '" target="_blank" rel="noopener">' + esc(file.name || "File") + "</a>";
		}).join("<br>");
	}
	function submissionTable(data) {
		var rows = data.submissions || [];
		if (!rows.length) return '<div class="card mb-4"><div class="card-body"><h2 class="h5 fw-bold">Student submissions</h2><p class="mb-0">No assignments have been submitted yet.</p></div></div>';
		return '<h2 class="h5 fw-bold mb-3">Student submissions</h2>' + table(
			[{ label: "Student" }, { label: "Assignment" }, { label: "Submitted" }, { label: "Files" }, { label: "Note" }],
			rows.map(function (row) {
				return "<tr>" + cell("Student", esc(row.student)) + cell("Assignment", esc(row.title)) + cell("Submitted", formatDate(row.submittedAt)) + cell("Files", submissionFiles(row)) + cell("Note", esc(row.note || "None")) + "</tr>";
			})
		);
	}
	function questionForm(row) {
		return '<form class="border rounded p-3 mb-3" data-question="' + esc(row.id) + '"><p class="mb-2">' + esc(row.student) + " · " + esc(row.text) + "</p>" +
			'<label class="form-label" for="reply-' + esc(row.id) + '">Reply</label><textarea class="form-control mb-2" id="reply-' + esc(row.id) + '" name="reply" rows="2"></textarea>' +
			'<button class="btn btn-primary rounded-pill" type="submit">Send reply</button></form>';
	}
	function moduleEditor(data, course) {
		if (!course) return "";
		var saved = (data.instructions[course.id] || {}) ;
		var modules = course.modules || [];
		if (!modules.length) return '<div class="card mt-4"><div class="card-body"><h2 class="h5 fw-bold">Module assignments</h2><p class="mb-0">This course has no modules yet.</p></div></div>';
		var current = modules.filter(function (module) { return module.week === selectedWeek; })[0] || modules[0];
		selectedWeek = current.week;
		return '<div class="card mt-4" id="module-editor"><div class="card-body"><h2 class="h5 fw-bold">Module assignments</h2><p class="text-muted">Instructions students see at the end of ' + esc(course.title) + '.</p>' +
			'<label class="form-label" for="module-week">Module</label><select class="form-select mb-3" id="module-week">' + modules.map(function (module) {
				return '<option value="' + module.week + '"' + (module.week === current.week ? " selected" : "") + ">Week " + module.week + ": " + esc(module.title) + "</option>";
			}).join("") + '</select><label class="form-label" for="module-text">Instructions</label>' +
			'<textarea class="form-control mb-2" id="module-text" rows="4">' + esc(saved[current.week] || "") + '</textarea>' +
			'<button class="btn btn-primary rounded-pill" type="button" id="module-save">Save instructions</button> <span id="module-status" role="status"></span>' +
			'<p class="text-danger mt-2 mb-0" id="module-error" hidden></p></div></div>';
	}
	function earningsBlock(data) {
		var years = data.earnings.map(function (row) { return Number(row.year); }).filter(function (year) { return year; });
		if (years.indexOf(earningsYear) === -1) years.push(earningsYear);
		years = years.filter(function (year, index) { return years.indexOf(year) === index; }).sort();
		var rows = data.earnings.filter(function (row) { return Number(row.year) === earningsYear; });
		var sum = rows.reduce(function (total, row) { return total + (Number(row.amount) || 0); }, 0);
		var body = !sum ? '<p class="mb-0">No earnings yet. Monthly totals appear here after a student pays.</p>' :
			'<div class="instructor-bars">' + MONTHS.map(function (month, index) {
				var amount = rows.filter(function (row) { return Number(row.month) === index + 1; }).reduce(function (total, row) { return total + Number(row.amount || 0); }, 0);
				var height = Math.max(4, Math.round((amount / sum) * 120));
				return '<div class="bar-col"><button type="button" data-month="' + (index + 1) + '" data-amount="' + amount + '" aria-label="' + month + " " + earningsYear + ", " + money(amount) + '"><span style="height:' + height + 'px"></span></button><small>' + month + "</small></div>";
			}).join("") + '</div><p id="earnings-readout" class="mt-3 mb-0" role="status"></p>';
		return '<div class="card mt-4" id="earnings"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 class="h5 fw-bold mb-0">Earnings by year</h2><label class="mb-0">Year <select class="form-select d-inline-block w-auto" id="earnings-year">' + years.map(function (year) {
			return '<option' + (year === earningsYear ? " selected" : "") + ">" + year + "</option>";
		}).join("") + "</select></label></div>" + body + "</div></div>";
	}
	function leaveOk() {
		if (!dirty) return true;
		if (!window.confirm("You have unsaved changes. Leave without saving?")) return false;
		dirty = false;
		return true;
	}
	function restoreField(id) {
		var node = document.getElementById(id);
		if (!node) return;
		node.focus();
		if (node.setSelectionRange && node.tagName !== "SELECT") node.setSelectionRange(node.value.length, node.value.length);
	}
	function bindDashboard(root, data) {
		root.querySelectorAll("[data-tab]").forEach(function (button) {
			button.addEventListener("click", function () {
				root.querySelectorAll("[data-tab]").forEach(function (item) { item.classList.toggle("active", item === button); });
				root.querySelectorAll("[data-panel]").forEach(function (panel) { panel.hidden = panel.getAttribute("data-panel") !== button.getAttribute("data-tab"); });
			});
		});
		if (!root.dataset.bound) {
			root.dataset.bound = "1";
			root.addEventListener("submit", function (event) {
				var grade = event.target.closest("[data-grade]");
				var question = event.target.closest("[data-question]");
				if (!grade && !question) return;
				event.preventDefault();
				if (grade) {
					var row = data.submissions.filter(function (item) { return item.id === grade.getAttribute("data-grade"); })[0];
					if (row) { row.score = grade.score.value; row.feedback = grade.feedback.value; }
				}
				if (question) {
					var item = data.questions.filter(function (entry) { return entry.id === question.getAttribute("data-question"); })[0];
					if (item) item.reply = question.reply.value;
				}
				save(data);
				toast(grade ? "Grade saved." : "Reply sent.");
				renderDashboard(root, data);
			});
		}
		root.querySelectorAll("[data-course-filter]").forEach(function (button) {
			button.addEventListener("click", function () {
				if (!leaveOk()) return;
				courseStatusFilter = button.getAttribute("data-course-filter");
				renderDashboard(root, data);
				var heading = document.getElementById("my-courses");
				if (heading) heading.scrollIntoView({ block: "start" });
			});
		});
		var search = document.getElementById("dash-course-search");
		if (search) search.addEventListener("input", function () {
			courseQuery = search.value;
			renderDashboard(root, data);
			restoreField("dash-course-search");
		});
		var status = document.getElementById("dash-course-status");
		if (status) status.addEventListener("change", function () {
			courseStatusFilter = status.value;
			renderDashboard(root, data);
		});
		root.querySelectorAll("[data-sort]").forEach(function (header) {
			header.addEventListener("click", function () {
				var key = header.getAttribute("data-sort");
				courseSortDir = courseSortKey === key ? courseSortDir * -1 : 1;
				courseSortKey = key;
				renderDashboard(root, data);
			});
		});
		root.querySelectorAll("[data-course]").forEach(function (row) {
			row.addEventListener("click", function () {
				if (!leaveOk()) return;
				selectedCourseId = row.getAttribute("data-course");
				selectedWeek = 1;
				renderDashboard(root, data);
			});
		});
		var select = document.getElementById("module-week");
		var field = document.getElementById("module-text");
		var course = courseById(data, selectedCourseId);
		if (select && field && course) {
			var savedText = function () { return ((data.instructions[course.id] || {})[select.value] || ""); };
			select.addEventListener("change", function () {
				if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) {
					select.value = String(selectedWeek);
					return;
				}
				dirty = false;
				selectedWeek = Number(select.value);
				field.value = savedText();
				document.getElementById("module-status").textContent = "";
				document.getElementById("module-error").hidden = true;
			});
			field.addEventListener("input", function () { dirty = field.value !== savedText(); document.getElementById("module-status").textContent = dirty ? "Unsaved changes" : ""; });
			document.getElementById("module-save").addEventListener("click", function () {
				var error = document.getElementById("module-error");
				if (!field.value.trim()) { error.hidden = false; error.textContent = "Enter instructions before saving."; return; }
				error.hidden = true;
				if (!data.instructions[course.id]) data.instructions[course.id] = {};
				data.instructions[course.id][select.value] = field.value.trim();
				save(data);
				dirty = false;
				document.getElementById("module-status").textContent = "Saved at " + timeOnly(new Date().toISOString());
				toast("Instructions saved.");
			});
		}
		var yearSelect = document.getElementById("earnings-year");
		if (yearSelect) yearSelect.addEventListener("change", function () {
			earningsYear = Number(yearSelect.value);
			renderDashboard(root, data);
			var block = document.getElementById("earnings");
			if (block) block.scrollIntoView({ block: "start" });
		});
		root.querySelectorAll("[data-month]").forEach(function (button) {
			button.addEventListener("click", function () {
				document.getElementById("earnings-readout").textContent = MONTHS[Number(button.getAttribute("data-month")) - 1] + " " + earningsYear + ", " + money(button.getAttribute("data-amount"));
			});
		});
	}

	function renderCourses(root, data) {
		var count = totals(data);
		var query = "";
		var statusFilter = "all";
		var sortKey = "title";
		var sortDir = 1;
		var page = 1;
		var pageSize = 6;
		var focusId = "";
		var editId = new URLSearchParams(location.search).get("edit") || "";
		function draw() {
			var list = data.courses.filter(function (course) {
				if (statusFilter === "paid" && !(Number(course.price) > 0)) return false;
				if (statusFilter !== "all" && statusFilter !== "paid" && course.status !== statusFilter) return false;
				return course.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
			});
			list.sort(function (a, b) {
				if (sortKey === "lessons") return ((Number(a.lessons) || 0) - (Number(b.lessons) || 0)) * sortDir;
				return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * sortDir;
			});
			var pages = Math.max(1, Math.ceil(list.length / pageSize));
			if (page > pages) page = pages;
			var slice = list.slice((page - 1) * pageSize, page * pageSize);
			var editing = courseById(data, editId);
			var statuses = [["all", "All statuses"], ["published", "Published"], ["pending", "Pending"], ["draft", "Draft"], ["completed", "Completed"], ["paid", "Paid"]];
			root.innerHTML = '<h1 class="h5 fw-bold">Courses</h1><div class="row mb-3">' +
				statCard("isax isax-book", "bg-secondary-transparent", "Active", String(count.active), "#course-table", "published") +
				statCard("isax isax-timer", "bg-warning-transparent", "Pending", String(count.pending), "#course-table", "pending") +
				statCard("isax isax-edit", "bg-light", "Draft", String(count.draft), "#course-table", "draft") +
				statCard("isax isax-wallet-add5", "bg-purple-transparent", "Paid", String(count.paid), "#course-table", "paid") +
				'</div><div class="instructor-tools d-flex flex-wrap gap-2 mb-3"><label class="visually-hidden" for="course-search">Search courses</label><input class="form-control" id="course-search" placeholder="Search courses" value="' + esc(query) + '">' +
				'<label class="visually-hidden" for="course-status">Status</label><select class="form-select" id="course-status">' + statuses.map(function (option) {
					return '<option value="' + option[0] + '"' + (option[0] === statusFilter ? " selected" : "") + ">" + option[1] + "</option>";
				}).join("") + "</select></div>" +
				'<div id="course-table">' + (slice.length ? table(
					[{ label: "Course", sort: "title" }, { label: "Lessons", sort: "lessons" }, { label: "Quizzes" }, { label: "Price" }, { label: "Rating" }, { label: "Status", sort: "status" }, { label: "Actions" }],
					slice.map(function (course) {
						var thumb = course.image ? '<img src="' + esc(course.image) + '" alt="">' : '<i class="isax isax-teacher5" aria-hidden="true"></i>';
						return "<tr>" + cell("Course", '<div class="d-flex align-items-center gap-2"><span class="instructor-thumb">' + thumb + "</span>" + esc(course.title) + "</div>") +
							cell("Lessons", String(course.lessons || 0)) + cell("Quizzes", String(quizCount(data, course.id))) +
							cell("Price", course.price == null ? "Not set" : money(course.price)) +
							cell("Rating", course.rating == null ? "No ratings yet" : rate(course.rating)) +
							cell("Status", statusBadge(course.status)) +
							cell("Actions", '<a class="btn btn-light btn-sm" href="instructor-course.html?edit=' + esc(course.id) + '" aria-label="Edit ' + esc(course.title) + '" title="Edit"><i class="isax isax-edit" aria-hidden="true"></i></a> <button class="btn btn-light btn-sm" type="button" data-delete-course="' + esc(course.id) + '" aria-label="Delete ' + esc(course.title) + '" title="Delete"><i class="isax isax-trash" aria-hidden="true"></i></button>') +
							"</tr>";
					})
				) : empty(query || statusFilter !== "all" ? "No courses match." : "No courses yet. Add a Brylla course to see it here.")) + "</div>" +
				(list.length ? '<nav class="mt-3" aria-label="Course pages">' + Array.from({ length: pages }, function (_, index) {
					return '<button class="btn btn-light me-1' + (index + 1 === page ? " btn-primary" : "") + '" type="button" data-page="' + (index + 1) + '">' + (index + 1) + "</button>";
				}).join("") + '<span class="ms-2">Page ' + page + " of " + pages + "</span></nav>" : "") +
				(editing ? '<div class="card mt-4" id="edit-course"><div class="card-body"><h2 class="h5 fw-bold">Edit ' + esc(editing.title) + '</h2><form id="edit-course-form"><label class="form-label" for="edit-status">Status</label><select class="form-select mb-3" id="edit-status">' + ["published", "pending", "draft", "completed"].map(function (status) {
					return '<option value="' + status + '"' + (editing.status === status ? " selected" : "") + ">" + status.charAt(0).toUpperCase() + status.slice(1) + "</option>";
				}).join("") + '</select><button class="btn btn-primary rounded-pill" type="submit">Save course</button></form></div></div>' : "") +
				'<div class="card mt-4" id="add-course"><div class="card-body"><h2 class="h5 fw-bold">Add new course</h2><p>Choose one of the Brylla courses. It is saved as a draft.</p>' +
				'<form id="add-course-form"><label class="form-label" for="new-course">Course</label><select class="form-select mb-3" id="new-course" name="course">' +
				["Bookkeeping", "Remote support", "Digital marketing", "Project management"].map(function (title) { return "<option>" + title + "</option>"; }).join("") +
				'</select><button class="btn btn-primary rounded-pill" type="submit">Save course</button></form></div></div>';
			if (focusId) restoreField(focusId);
			var search = document.getElementById("course-search");
			search.addEventListener("input", function () { query = search.value; page = 1; focusId = "course-search"; draw(); });
			document.getElementById("course-status").addEventListener("change", function (event) { statusFilter = event.target.value; page = 1; focusId = ""; draw(); });
			root.querySelectorAll("[data-course-filter]").forEach(function (button) {
				button.addEventListener("click", function () {
					statusFilter = button.getAttribute("data-course-filter");
					page = 1;
					focusId = "";
					draw();
					var target = document.getElementById("course-table");
					if (target) target.scrollIntoView({ block: "start" });
				});
			});
			root.querySelectorAll("[data-page]").forEach(function (button) {
				button.addEventListener("click", function () { page = Number(button.getAttribute("data-page")); draw(); });
			});
			root.querySelectorAll("[data-sort]").forEach(function (header) {
				header.addEventListener("click", function () {
					var key = header.getAttribute("data-sort");
					sortDir = sortKey === key ? sortDir * -1 : 1;
					sortKey = key;
					draw();
				});
			});
			root.querySelectorAll("[data-delete-course]").forEach(function (button) {
				button.addEventListener("click", function () {
					confirmAction("Delete this course from your list?").then(function (ok) {
						if (!ok) return;
						var id = button.getAttribute("data-delete-course");
						data.courses = data.courses.filter(function (course) { return course.id !== id; });
						data.quizzes = data.quizzes.filter(function (quiz) { return quiz.courseId !== id; });
						save(data);
						toast("Course deleted.");
						draw();
					});
				});
			});
			document.getElementById("add-course-form").addEventListener("submit", function (event) {
				event.preventDefault();
				var title = document.getElementById("new-course").value;
				if (data.courses.some(function (course) { return course.title === title; })) { toast("That course is already on your list."); return; }
				data.courses.push({ id: title.toLowerCase().replace(/\s+/g, "-"), title: title, status: "draft", price: null, lessons: 0, image: "", modules: title === "Bookkeeping" ? BOOKKEEPING_MODULES : [] });
				save(data);
				toast("Course saved.");
				draw();
			});
			var editForm = document.getElementById("edit-course-form");
			if (editForm && editing) editForm.addEventListener("submit", function (event) {
				event.preventDefault();
				editing.status = document.getElementById("edit-status").value;
				save(data);
				toast("Course saved.");
				draw();
			});
		}
		draw();
	}

	function staffClient() {
		var config = window.BryllaPublic || {};
		if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) return null;
		if (!staffClient.current && config.client) staffClient.current = config.client();
		return staffClient.current;
	}

	function deliverNotice(notice) {
		var current = staffClient();
		if (!current) return Promise.resolve({ ok: false, message: "Sign-in is not available on this page." });
		return current.auth.getSession().then(function (result) {
			var session = result.data.session;
			if (!session) return { ok: false, message: "Sign in on Messages with an instructor or founder account." };
			return current.from("profiles").select("role").eq("id", session.user.id).maybeSingle().then(function (profile) {
				var role = profile.data && profile.data.role;
				if (role !== "instructor" && role !== "founder") return { ok: false, message: "This account cannot send student notifications." };
				return current.rpc("post_student_notice", {
					p_type: notice.type,
					p_title: notice.title,
					p_message: notice.message,
					p_destination: notice.destination || "student-dashboard",
					p_course_id: notice.courseId || null,
					p_student_id: notice.studentId || null,
					p_idempotency_key: notice.key
				}).then(function (sent) {
					if (sent.error) return { ok: false, message: sent.error.message || "The message could not be sent." };
					return { ok: true, count: sent.data || 0 };
				});
			});
		}).catch(function () {
			return { ok: false, message: "Check your connection and try again." };
		});
	}

	function renderAnnouncements(root, data) {
		var query = "";
		var statusFilter = "all";
		var sortKey = "title";
		var sortDir = 1;
		var focusId = "";
		function draw() {
			var list = data.announcements.filter(function (item) {
				if (statusFilter !== "all" && item.status !== statusFilter) return false;
				return (item.title || "").toLowerCase().indexOf(query.toLowerCase()) !== -1;
			});
			list.sort(function (a, b) { return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * sortDir; });
			var statuses = [["all", "All statuses"], ["draft", "Draft"], ["published", "Published"], ["scheduled", "Scheduled"]];
			root.innerHTML = '<h1 class="h5 fw-bold">Announcements</h1><div class="d-flex justify-content-end mb-3"><a class="btn btn-primary rounded-pill" href="#add-announcement">Add announcement</a></div>' +
				'<div class="instructor-tools d-flex flex-wrap gap-2 mb-3"><label class="visually-hidden" for="ann-search">Search announcements</label><input class="form-control" id="ann-search" placeholder="Search announcements" value="' + esc(query) + '">' +
				'<label class="visually-hidden" for="ann-filter">Status</label><select class="form-select" id="ann-filter">' + statuses.map(function (option) {
					return '<option value="' + option[0] + '"' + (option[0] === statusFilter ? " selected" : "") + ">" + option[1] + "</option>";
				}).join("") + "</select></div>" +
				(list.length ? table(
					[{ label: "Title", sort: "title" }, { label: "Course" }, { label: "Status", sort: "status" }, { label: "Sent" }, { label: "Actions" }],
					list.map(function (item) {
						var audience = item.audience === "instructors" ? "Instructors" : item.audience === "both" ? "Students and instructors" : "Students";
						var sent = item.delivered != null ? "Sent to " + item.delivered : "Published";
						return "<tr>" + cell("Title", esc(item.title)) + cell("Course", esc(audience)) + cell("Status", statusBadge(item.status || "published")) + cell("Sent", sent) +
							cell("Actions", '<button class="btn btn-light btn-sm" type="button" data-delete-announcement="' + esc(item.id) + '" aria-label="Delete ' + esc(item.title) + '" title="Delete"><i class="isax isax-trash" aria-hidden="true"></i></button>') + "</tr>";
					})
				) : empty(data.announcements.length ? "No announcements match." : "No announcements yet. Add one when you have something to tell a class.", data.announcements.length ? "" : '<a class="btn btn-primary rounded-pill mt-3" href="#add-announcement">Add announcement</a>')) +
				'<div class="card mt-4" id="add-announcement"><div class="card-body"><h2 class="h5 fw-bold">Add announcement</h2><form id="announcement-form">' +
				'<label class="form-label" for="ann-title">Title</label><input class="form-control mb-2" id="ann-title" required>' +
				'<label class="form-label" for="ann-audience">Audience</label><select class="form-select mb-2" id="ann-audience">' +
				(currentArea() === "admin"
					? '<option value="students">Students</option><option value="instructors">Instructors</option><option value="both">Students and instructors</option>'
					: '<option value="students">Students</option>') +
				'</select>' +
				'<label class="form-label" for="ann-body">Message</label><textarea class="form-control mb-3" id="ann-body" rows="3" required></textarea><button class="btn btn-primary rounded-pill" type="submit">Publish announcement</button></form></div></div>';
			if (focusId) restoreField(focusId);
			document.getElementById("ann-search").addEventListener("input", function (event) { query = event.target.value; focusId = "ann-search"; draw(); });
			document.getElementById("ann-filter").addEventListener("change", function (event) { statusFilter = event.target.value; focusId = ""; draw(); });
			root.querySelectorAll("[data-sort]").forEach(function (header) {
				header.addEventListener("click", function () {
					var key = header.getAttribute("data-sort");
					sortDir = sortKey === key ? sortDir * -1 : 1;
					sortKey = key;
					draw();
				});
			});
			root.querySelectorAll("[data-delete-announcement]").forEach(function (button) {
				button.addEventListener("click", function () {
					confirmAction("Delete this announcement?").then(function (ok) {
						if (!ok) return;
						data.announcements = data.announcements.filter(function (item) { return item.id !== button.getAttribute("data-delete-announcement"); });
						save(data);
						toast("Announcement deleted.");
						draw();
					});
				});
			});
			document.getElementById("announcement-form").addEventListener("submit", function (event) {
				event.preventDefault();
				var item = { id: "ann" + Date.now(), title: document.getElementById("ann-title").value.trim(), audience: document.getElementById("ann-audience").value, status: "published", body: document.getElementById("ann-body").value.trim() };
				var current = staffClient();
				if (!current) return;
				toast("Publishing the announcement…");
				current.rpc("post_audience_notice", { p_audience: item.audience, p_title: item.title, p_message: item.body, p_key: item.id }).then(function (result) {
					if (result.error) {
						toast(result.error.message || "The announcement could not be published.");
						return;
					}
					item.delivered = result.data || 0;
					data.announcements.push(item);
					save(data);
					toast("Published to " + item.delivered + " people.");
					draw();
				});
			});
		}
		draw();
	}

	function renderAssignments(root, data) {
		var gradingId = "";
		var query = "";
		var statusFilter = "all";
		var sortKey = "title";
		var sortDir = 1;
		var focusId = "";
		function submitted(id) { return data.submissions.filter(function (row) { return row.assignmentId === id; }); }
		function draw() {
			var list = data.assignments.filter(function (item) {
				if (statusFilter !== "all" && (item.status || "draft") !== statusFilter) return false;
				return (item.title || "").toLowerCase().indexOf(query.toLowerCase()) !== -1;
			});
			list.sort(function (a, b) { return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * sortDir; });
			var statuses = [["all", "All statuses"], ["draft", "Draft"], ["published", "Published"], ["pending", "Pending"]];
			root.innerHTML = '<h1 class="h5 fw-bold">Assignments</h1>' +
				submissionTable(data) +
				'<div class="instructor-tools d-flex flex-wrap gap-2 mb-3"><label class="visually-hidden" for="as-search">Search assignments</label><input class="form-control" id="as-search" placeholder="Search assignments" value="' + esc(query) + '">' +
				'<label class="visually-hidden" for="as-filter">Status</label><select class="form-select" id="as-filter">' + statuses.map(function (option) {
					return '<option value="' + option[0] + '"' + (option[0] === statusFilter ? " selected" : "") + ">" + option[1] + "</option>";
				}).join("") + "</select></div>" +
				(list.length ? table(
					[{ label: "Assignment", sort: "title" }, { label: "Course" }, { label: "Module" }, { label: "Due date", sort: "due" }, { label: "Total marks" }, { label: "Submitted" }, { label: "To grade" }, { label: "Status", sort: "status" }],
					list.map(function (item) {
						var course = courseById(data, item.courseId);
						var module = course && course.modules ? course.modules.filter(function (entry) { return entry.week === Number(item.moduleWeek); })[0] : null;
						var waiting = submitted(item.id).filter(function (row) { return row.score == null; }).length;
						return "<tr>" + cell("Assignment", esc(item.title)) + cell("Course", esc(course ? course.title : "")) + cell("Module", module ? "Week " + module.week + ": " + esc(module.title) : "Not set") +
							cell("Due date", formatDate(item.due)) + cell("Total marks", String(item.marks || 0)) + cell("Submitted", String(submitted(item.id).length)) +
							cell("To grade", '<button class="linkish" type="button" data-grade-list="' + esc(item.id) + '">' + waiting + "</button>") + cell("Status", statusBadge(item.status || "draft")) + "</tr>";
					})
				) : empty(data.assignments.length ? "No assignments match." : "No assignments yet. Create one for a module.")) +
				'<div id="grade-list" class="mt-3"></div>' +
				'<div class="card mt-4"><div class="card-body"><h2 class="h5 fw-bold">Create assignment</h2><form id="assignment-form">' +
				'<label class="form-label" for="as-title">Assignment</label><input class="form-control mb-2" id="as-title" required>' +
				'<label class="form-label" for="as-course">Course</label><select class="form-select mb-2" id="as-course">' + data.courses.map(function (course) { return '<option value="' + esc(course.id) + '">' + esc(course.title) + "</option>"; }).join("") + "</select>" +
				'<label class="form-label" for="as-module">Module</label><select class="form-select mb-2" id="as-module"></select>' +
				'<label class="form-label" for="as-due">Due date</label><input class="form-control mb-2" id="as-due" type="datetime-local">' +
				'<label class="form-label" for="as-marks">Total marks</label><input class="form-control mb-3" id="as-marks" type="number" min="1" value="100">' +
				'<button class="btn btn-primary rounded-pill" type="submit">Save assignment</button></form></div></div>';
			function fillModules() {
				var course = courseById(data, document.getElementById("as-course").value);
				var select = document.getElementById("as-module");
				var modules = course && course.modules.length ? course.modules : [];
				select.innerHTML = modules.length ? modules.map(function (module) { return '<option value="' + module.week + '">Week ' + module.week + ": " + esc(module.title) + "</option>"; }).join("") : '<option value="">No modules yet</option>';
			}
			if (focusId) restoreField(focusId);
			document.getElementById("as-search").addEventListener("input", function (event) { query = event.target.value; focusId = "as-search"; draw(); });
			document.getElementById("as-filter").addEventListener("change", function (event) { statusFilter = event.target.value; focusId = ""; draw(); });
			root.querySelectorAll("[data-sort]").forEach(function (header) {
				header.addEventListener("click", function () {
					var key = header.getAttribute("data-sort");
					sortDir = sortKey === key ? sortDir * -1 : 1;
					sortKey = key;
					draw();
				});
			});
			document.getElementById("as-course").addEventListener("change", fillModules);
			fillModules();
			document.getElementById("assignment-form").addEventListener("submit", function (event) {
				event.preventDefault();
				var moduleWeek = document.getElementById("as-module").value;
				if (!moduleWeek) { toast("Choose a course that has modules."); return; }
				data.assignments.push({ id: "as-" + Date.now(), title: document.getElementById("as-title").value.trim(), courseId: document.getElementById("as-course").value, moduleWeek: Number(moduleWeek), due: document.getElementById("as-due").value, marks: Number(document.getElementById("as-marks").value), status: "draft" });
				save(data);
				toast("Assignment saved.");
				draw();
			});
			root.querySelectorAll("[data-grade-list]").forEach(function (button) {
				button.addEventListener("click", function () {
					gradingId = button.getAttribute("data-grade-list");
					var rows = submitted(gradingId);
					document.getElementById("grade-list").innerHTML = rows.length ? rows.map(gradeForm).join("") : empty("No submissions to grade yet.");
				});
			});
		}
		root.addEventListener("submit", function (event) {
			var form = event.target.closest("[data-grade]");
			if (!form) return;
			event.preventDefault();
			var row = data.submissions.filter(function (item) { return item.id === form.getAttribute("data-grade"); })[0];
			if (row) { row.score = form.score.value; row.feedback = form.feedback.value; save(data); toast("Grade saved."); draw(); }
		});
		draw();
	}

	function enrolmentLabel(status) {
		if (status === "active") return "Enrolled";
		if (status === "pending_setup") return "Setting up account";
		return status || "Enrolled";
	}
	function loadFounderEnrolments() {
		var current = staffClient();
		if (!current) return Promise.resolve({ error: { message: "Sign in to see enrolments." }, data: [] });
		return current.rpc("founder_enrolments").then(function (result) {
			return { error: result.error, data: result.data || [] };
		});
	}
	function watchEnrolments(onChange) {
		watchEnrolments.redraw = onChange;
		var current = staffClient();
		if (!current || watchEnrolments.channel) return;
		watchEnrolments.channel = current.channel("founder-enrolments").on("postgres_changes", {
			event: "*",
			schema: "public",
			table: "enrollments"
		}, function () {
			if (watchEnrolments.redraw) watchEnrolments.redraw();
		}).subscribe();
	}
	function recentEnrolmentCard(rows, error) {
		var body = error
			? empty(error.message || "Enrolments could not be loaded.")
			: (rows.length ? table(
				[{ label: "Student" }, { label: "Course" }, { label: "Enrolled" }, { label: "Status" }],
				rows.map(function (row) {
					return "<tr>" + cell("Student", esc(row.student_name || row.email || "")) + cell("Course", esc(row.course_title || "")) + cell("Enrolled", esc(formatDate(row.enrolled_at))) + cell("Status", esc(enrolmentLabel(row.status))) + "</tr>";
				})
			) : empty("No students have enrolled yet."));
		return '<div class="card mb-3" id="recent-enrolments"><div class="card-body"><h2 class="h5 fw-bold">Recent enrolments</h2><p class="mb-3">This list updates when a student enrols.</p>' + body + "</div></div>";
	}
	function paintLiveEnrolments() {
		var value = document.querySelector("[data-live-students]");
		var host = document.getElementById("recent-enrolments");
		if (!value && !host) return;
		loadFounderEnrolments().then(function (result) {
			var rows = result.data || [];
			var people = {};
			rows.forEach(function (row) { people[(row.email || row.id || "").toLowerCase()] = true; });
			if (value && document.body.contains(value)) value.textContent = result.error ? "Unavailable" : String(Object.keys(people).length);
			if (host && document.body.contains(host)) host.outerHTML = recentEnrolmentCard(rows, result.error);
		});
	}
	function renderStudents(root, data) {
		if (currentArea() === "admin") {
			renderAdminStudents(root);
			return;
		}
		var filter = "all";
		var query = "";
		var openId = "";
		var sortKey = "name";
		var sortDir = 1;
		var focusId = "";
		function draw() {
			var list = data.students.filter(function (student) {
				var enrolment = data.enrolments.filter(function (row) { return row.studentId === student.id; })[0];
				var status = enrolment ? enrolment.status : "inactive";
				var follow = status === "at risk" || status === "inactive";
				if (filter === "on track" && status !== "on track") return false;
				if (filter === "follow" && !follow) return false;
				return (student.name || "").toLowerCase().indexOf(query.toLowerCase()) !== -1;
			});
			list.sort(function (a, b) { return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * sortDir; });
			root.innerHTML = '<h1 class="h5 fw-bold">Students</h1><div class="instructor-tools d-flex flex-wrap gap-2 mb-3"><label class="visually-hidden" for="student-search">Search students</label><input class="form-control" id="student-search" placeholder="Search students" value="' + esc(query) + '">' +
				'<div role="group" aria-label="Filter students"><button class="btn btn-light" type="button" data-filter="all">All</button> <button class="btn btn-light" type="button" data-filter="on track">On track</button> <button class="btn btn-light" type="button" data-filter="follow">Needs follow-up</button></div></div>' +
				(list.length ? table(
					[{ label: "Student", sort: "name" }, { label: "Course" }, { label: "Progress" }, { label: "Last active", sort: "lastActive" }, { label: "Status" }],
					list.map(function (student) {
						var enrolment = data.enrolments.filter(function (row) { return row.studentId === student.id; })[0];
						var course = enrolment ? courseById(data, enrolment.courseId) : null;
						var expanded = openId === student.id;
						return '<tr><td data-label="Student"><button class="linkish" type="button" data-open="' + esc(student.id) + '" aria-expanded="' + expanded + '">' + esc(student.name) + "</button></td>" +
							cell("Course", esc(course ? course.title : "Not enrolled")) + cell("Progress", enrolment && enrolment.progress != null ? rate(enrolment.progress) : "Not yet") +
							cell("Last active", formatDate(student.lastActive)) + cell("Status", statusBadge(enrolment ? enrolment.status : "inactive")) + "</tr>" +
							(expanded ? '<tr class="instructor-expand"><td colspan="5" data-label="Detail"><p>Weekly progress: ' + rate(enrolment && enrolment.progress) + "</p><p>Quiz average: " + rate(enrolment && enrolment.quizAverage) + "</p><p>Assignments submitted: " + (enrolment ? enrolment.submitted || 0 : 0) + '</p><a class="btn btn-light rounded-pill me-2" href="instructor-message.html">Send message</a><button class="btn btn-primary rounded-pill" type="button" data-remind="' + esc(student.id) + '">Send reminder</button></td></tr>' : "");
					})
				) : empty("No students yet. They appear here after they enrol."));
			if (focusId) restoreField(focusId);
			document.getElementById("student-search").addEventListener("input", function (event) { query = event.target.value; focusId = "student-search"; draw(); });
			root.querySelectorAll("[data-sort]").forEach(function (header) {
				header.addEventListener("click", function () {
					var key = header.getAttribute("data-sort");
					sortDir = sortKey === key ? sortDir * -1 : 1;
					sortKey = key;
					focusId = "";
					draw();
				});
			});
			root.querySelectorAll("[data-filter]").forEach(function (button) {
				button.classList.toggle("btn-primary", button.getAttribute("data-filter") === filter);
				button.addEventListener("click", function () { filter = button.getAttribute("data-filter"); draw(); });
			});
			root.querySelectorAll("[data-open]").forEach(function (button) {
				button.addEventListener("click", function () { openId = openId === button.getAttribute("data-open") ? "" : button.getAttribute("data-open"); draw(); });
			});
			root.querySelectorAll("[data-remind]").forEach(function (button) {
				button.addEventListener("click", function () { toast("Reminder saved. It will send when messages are connected."); });
			});
		}
		draw();
	}

	function renderAdminStudents(root) {
		function draw(rows, error) {
			root.innerHTML = '<h1 class="h5 fw-bold">Students</h1><div id="pending-accounts" class="card mb-3"><div class="card-body"><p role="status">Loading accounts…</p></div></div><p class="mb-3">Every student enrolled in a course is listed here, including a student who is still setting up an account.</p>' +
				(error ? empty(error.message || "Students could not be loaded.") : (rows.length ? table(
					[{ label: "Student" }, { label: "Email" }, { label: "Course" }, { label: "Enrolled" }, { label: "Status" }],
					rows.map(function (row) {
						return "<tr>" + cell("Student", esc(row.student_name || row.email || "")) + cell("Email", esc(row.email || "")) + cell("Course", esc(row.course_title || "")) + cell("Enrolled", esc(formatDate(row.enrolled_at))) + cell("Status", esc(enrolmentLabel(row.status))) + "</tr>";
					})
				) : empty("No students have enrolled yet.")));
			paintPendingAccounts();
		}
		root.innerHTML = '<h1 class="h5 fw-bold">Students</h1><p role="status">Loading enrolments…</p>';
		function refresh() {
			loadFounderEnrolments().then(function (result) { draw(result.data || [], result.error); });
		}
		watchEnrolments(refresh);
		refresh();
	}

	function renderQuiz(root, data) {
		var query = "";
		var focusId = "";
		function draw() {
			var list = data.quizzes.filter(function (quiz) { return quiz.title.toLowerCase().indexOf(query.toLowerCase()) !== -1; });
			root.innerHTML = '<h1 class="h5 fw-bold">Quiz</h1><div class="d-flex justify-content-end mb-3"><a class="btn btn-primary rounded-pill" href="#add-quiz">Add quiz</a></div>' +
				'<div class="instructor-tools d-flex flex-wrap gap-2 mb-3"><label class="visually-hidden" for="quiz-search">Search quizzes</label><input class="form-control" id="quiz-search" placeholder="Search quizzes" value="' + esc(query) + '"></div>' +
				(list.length ? table(
					[{ label: "Quiz", sort: "title" }, { label: "Course" }, { label: "Module" }, { label: "Questions" }, { label: "Time limit" }, { label: "Pass mark" }, { label: "Actions" }],
					list.map(function (quiz) {
						var course = courseById(data, quiz.courseId);
						var module = course && course.modules ? course.modules.filter(function (item) { return item.week === Number(quiz.moduleWeek); })[0] : null;
						return "<tr>" + cell("Quiz", esc(quiz.title)) + cell("Course", esc(course ? course.title : "")) + cell("Module", module ? "Week " + module.week + ": " + esc(module.title) : "Not set") +
							cell("Questions", String(quiz.questions || 0)) + cell("Time limit", quiz.timeLimit ? quiz.timeLimit + " min" : "Not set") + cell("Pass mark", quiz.passMark == null ? "Not set" : quiz.passMark + "%") +
							cell("Actions", '<a class="btn btn-light btn-sm" href="instructor-quiz-results.html?quiz=' + esc(quiz.id) + '" aria-label="View results for ' + esc(quiz.title) + '" title="View results">View results</a>') + "</tr>";
					})
				) : empty(data.quizzes.length ? "No quizzes match." : "No quizzes yet. Add a week quiz for a course.")) +
				'<div class="card mt-4" id="add-quiz"><div class="card-body"><h2 class="h5 fw-bold">Add quiz</h2><form id="quiz-form"><label class="form-label" for="quiz-course">Course</label><select class="form-select mb-2" id="quiz-course">' +
				data.courses.map(function (course) { return '<option value="' + esc(course.id) + '">' + esc(course.title) + "</option>"; }).join("") + '</select><label class="form-label" for="quiz-week">Module</label><select class="form-select mb-3" id="quiz-week"></select><button class="btn btn-primary rounded-pill" type="submit">Save quiz</button></form></div></div>';
			if (focusId) restoreField(focusId);
			document.getElementById("quiz-search").addEventListener("input", function (event) { query = event.target.value; focusId = "quiz-search"; draw(); });
			function fill() {
				var course = courseById(data, document.getElementById("quiz-course").value);
				var select = document.getElementById("quiz-week");
				select.innerHTML = course && course.modules.length ? course.modules.map(function (module) { return '<option value="' + module.week + '">Week ' + module.week + "</option>"; }).join("") : '<option value="">No modules yet</option>';
			}
			document.getElementById("quiz-course").addEventListener("change", fill);
			fill();
			document.getElementById("quiz-form").addEventListener("submit", function (event) {
				event.preventDefault();
				var week = document.getElementById("quiz-week").value;
				if (!week) { toast("This course has no modules yet."); return; }
				var courseId = document.getElementById("quiz-course").value;
				data.quizzes.push({ id: courseId + "-w" + week + "-" + Date.now(), courseId: courseId, moduleWeek: Number(week), title: "Week " + week + " quiz", questions: 0, timeLimit: null, passMark: null, status: "draft" });
				save(data);
				toast("Quiz saved.");
				draw();
			});
		}
		draw();
	}

	function renderResults(root, data) {
		var quizFilter = new URLSearchParams(location.search).get("quiz") || "all";
		var resultFilter = "all";
		function draw() {
			var list = data.results.filter(function (row) {
				if (quizFilter !== "all" && row.quizId !== quizFilter) return false;
				if (resultFilter === "pass" && !row.passed) return false;
				if (resultFilter === "fail" && row.passed) return false;
				return true;
			});
			root.innerHTML = '<h1 class="h5 fw-bold">Quiz results</h1><div class="d-flex flex-wrap gap-2 mb-3"><label class="form-label mb-0" for="result-quiz">Quiz</label><select class="form-select w-auto" id="result-quiz"><option value="all">All quizzes</option>' +
				data.quizzes.map(function (quiz) { return '<option value="' + esc(quiz.id) + '"' + (quiz.id === quizFilter ? " selected" : "") + ">" + esc(quiz.title) + "</option>"; }).join("") +
				'</select><label class="form-label mb-0" for="result-status">Result</label><select class="form-select w-auto" id="result-status"><option value="all">All results</option><option value="pass">Pass</option><option value="fail">Not passed</option></select></div>' +
				(list.length ? table(
					[{ label: "Student" }, { label: "Quiz" }, { label: "Score" }, { label: "Percentage" }, { label: "Result" }, { label: "Attempt" }, { label: "Date" }],
					list.map(function (row) {
						var quiz = data.quizzes.filter(function (item) { return item.id === row.quizId; })[0];
						return "<tr>" + cell("Student", esc(row.student)) + cell("Quiz", esc(quiz ? quiz.title : row.quizId)) + cell("Score", esc(row.score)) + cell("Percentage", rate(row.percent)) + cell("Result", statusBadge(row.passed ? "pass" : "not passed")) + cell("Attempt", String(row.attempt || 1)) + cell("Date", formatDate(row.date)) + "</tr>";
					})
				) : empty("No quiz results yet. They appear here after a student submits a quiz."));
			document.getElementById("result-quiz").addEventListener("change", function (event) { quizFilter = event.target.value; draw(); });
			document.getElementById("result-status").value = resultFilter;
			document.getElementById("result-status").addEventListener("change", function (event) { resultFilter = event.target.value; draw(); });
		}
		draw();
	}

	function renderCertificates(root, data) {
		root.innerHTML = '<h1 class="h5 fw-bold">Certificates</h1><div class="row">' + data.courses.map(function (course) {
			return '<div class="col-md-6 mb-3"><div class="card h-100"><div class="card-body"><p class="text-muted mb-1">Certificate template</p><h2 class="h5">' + esc(course.title) + '</h2><p>Issued when the student meets the pass mark and 100% of lessons are done.</p><div class="border rounded p-3"><p class="mb-1">Brylla Academy</p><p class="mb-0">' + esc(course.title) + "</p><p class=\"mb-0\">Student name</p></div></div></div></div>";
		}).join("") + '</div><h2 class="h5 fw-bold mt-2">Issued certificates</h2>' +
			(data.issued.length ? table([{ label: "Student" }, { label: "Course" }, { label: "Date" }, { label: "Download" }], data.issued.map(function (row) {
				var course = courseById(data, row.courseId);
				return "<tr>" + cell("Student", esc(row.student)) + cell("Course", esc(course ? course.title : "")) + cell("Date", formatDate(row.date)) + cell("Download", '<a href="' + esc(row.url || "#") + '">Download</a>') + "</tr>";
			})) : empty("No certificates issued yet. A certificate appears here after a student qualifies."));
	}

	function renderProfile(root, data) {
		var person = data.instructor;
		root.innerHTML = '<h1 class="h5 fw-bold">My profile</h1><div class="card"><div class="card-body"><form id="profile-form">' +
			'<label class="form-label" for="photo">Photo</label><input class="form-control mb-2" id="photo" type="file" accept="image/*">' +
			'<label class="form-label" for="first">First name</label><input class="form-control mb-2" id="first" value="' + esc(person.firstName) + '">' +
			'<label class="form-label" for="last">Last name</label><input class="form-control mb-2" id="last" value="' + esc(person.lastName) + '">' +
			'<label class="form-label" for="email">Email</label><input class="form-control mb-2" id="email" type="email" value="' + esc(person.email) + '">' +
			'<label class="form-label" for="phone">Phone</label><input class="form-control mb-2" id="phone" value="' + esc(person.phone) + '">' +
			'<label class="form-label" for="bio">Short bio</label><textarea class="form-control mb-2" id="bio" rows="3">' + esc(person.bio) + "</textarea>" +
			'<label class="form-label" for="quals">Qualifications</label><textarea class="form-control mb-2" id="quals" rows="2" placeholder="Optional">' + esc((person.qualifications || []).join("\n")) + "</textarea>" +
			'<label class="form-label" for="experience">Experience</label><textarea class="form-control mb-3" id="experience" rows="2" placeholder="Optional">' + esc((person.experience || []).join("\n")) + "</textarea>" +
			'<button class="btn btn-primary rounded-pill" type="submit">Save profile</button> <button class="btn btn-light rounded-pill" type="button" id="preview-profile">Preview public profile</button></form><div id="profile-preview" class="mt-3"></div></div></div>';
		document.getElementById("profile-form").addEventListener("submit", function (event) {
			event.preventDefault();
			person.firstName = document.getElementById("first").value.trim();
			person.lastName = document.getElementById("last").value.trim();
			person.email = document.getElementById("email").value.trim();
			person.phone = document.getElementById("phone").value.trim();
			person.bio = document.getElementById("bio").value.trim();
			person.qualifications = document.getElementById("quals").value.split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
			person.experience = document.getElementById("experience").value.split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
			var file = document.getElementById("photo").files[0];
			function done() { save(data); toast("Profile saved."); location.reload(); }
			if (!file) { done(); return; }
			var reader = new FileReader();
			reader.onload = function () { person.photo = reader.result; done(); };
			reader.readAsDataURL(file);
		});
		document.getElementById("preview-profile").addEventListener("click", function () {
			document.getElementById("profile-preview").innerHTML = '<div class="border rounded p-3"><p class="h5">' + esc(instructorName(data)) + '</p><p>' + esc(person.bio || "No bio yet.") + "</p><p class=\"mb-0\">" + esc(person.email || "No email yet.") + "</p></div>";
		});
	}

	function bindEarnings(root, data) {
		var yearSelect = document.getElementById("earnings-year");
		if (yearSelect) yearSelect.addEventListener("change", function () {
			earningsYear = Number(yearSelect.value);
			var page = document.body.getAttribute("data-page");
			if (PAGES[page]) PAGES[page](root, data);
			var block = document.getElementById("earnings");
			if (block) block.scrollIntoView({ block: "start" });
		});
		root.querySelectorAll("[data-month]").forEach(function (button) {
			button.addEventListener("click", function () {
				var readout = document.getElementById("earnings-readout");
				if (readout) readout.textContent = MONTHS[Number(button.getAttribute("data-month")) - 1] + " " + earningsYear + ", " + money(button.getAttribute("data-amount"));
			});
		});
	}
	function paymentStatusCard(data) {
		var payments = data.payments || [];
		var rows = ["completed", "pending", "failed", "refunded"].map(function (status) {
			var count = payments.filter(function (row) { return row.status === status; }).length;
			var share = payments.length ? Math.round((count / payments.length) * 100) + "%" : "Not yet";
			return '<p class="d-flex justify-content-between align-items-center mb-2"><span>' + statusBadge(status) + "</span><span>" + count + " · " + share + "</span></p>";
		}).join("");
		return '<div class="card h-100"><div class="card-body"><h2 class="h5 fw-bold">Payment status</h2>' +
			(payments.length ? rows : "<p class=\"mb-0\">Unavailable. Completed, pending, failed and refunded counts need a connected payment provider.</p>") + "</div></div>";
	}
	function activityCard(data) {
		var items = data.activity || [];
		var body = items.length ? "<ul class=\"mb-0\">" + items.slice(0, 8).map(function (item) {
			return "<li>" + esc(item.text) + " · " + esc(formatDate(item.date)) + "</li>";
		}).join("") + "</ul>" : '<p class="mb-0">No activity yet. Enrolments and new instructors appear here.</p>';
		return '<div class="card h-100"><div class="card-body"><h2 class="h5 fw-bold">Recent activity</h2>' + body + "</div></div>";
	}
	function quickActions() {
		return '<div class="card h-100"><div class="card-body"><h2 class="h5 fw-bold">Quick actions</h2><div class="d-flex flex-wrap gap-2">' +
			'<a class="btn btn-primary rounded-pill" href="add-course.html">Add course</a>' +
			'<a class="btn btn-light rounded-pill" href="admin-courses.html">Manage courses</a>' +
			'<a class="btn btn-light rounded-pill" href="admin-instructors.html#add-instructor">Add instructor</a>' +
			'<a class="btn btn-light rounded-pill" href="admin-reports.html">View reports</a></div></div></div>';
	}
	function financeNotice() {
		return '<div class="card"><div class="card-body"><h2 class="h5 fw-bold">Payments are not connected</h2><p class="mb-2">Gross sales, refunds, provider fees, net receipts and outstanding balances stay hidden until a payment provider confirms a transaction.</p><p class="mb-0">Revenue is not estimated from course prices or enrolments.</p></div></div>';
	}
	function moduleUnlockCard() {
		return '<div class="card mb-3" id="module-unlocks"><div class="card-body"><h2 class="h5 fw-bold">Open course modules</h2><p class="mb-3">Open a module when students should see it. This applies to Bookkeeping and to every course added later.</p><div id="module-unlock-list"><p role="status">Loading modules…</p></div></div></div>';
	}
	function modulesForCourse(course, topics, modules) {
		if (course.id === "bookkeeping") {
			return BOOKKEEPING_MODULES.map(function (module) {
				return { key: String(module.week), title: "Week " + module.week + ": " + module.title };
			});
		}
		var courseTopics = topics.filter(function (topic) { return topic.course_id === course.id; });
		if (courseTopics.length) {
			return courseTopics.map(function (topic) { return { key: topic.id, title: topic.title }; });
		}
		return modules.filter(function (mod) { return mod.course_id === course.id; }).map(function (mod) {
			return { key: mod.id, title: mod.title };
		});
	}
	function paintModuleUnlocks() {
		var current = staffClient();
		var list = document.getElementById("module-unlock-list");
		var card = document.getElementById("module-unlocks");
		if (!current || !list || !card) return;
		if (!card.dataset.bound) {
			card.dataset.bound = "1";
			card.addEventListener("click", function (event) {
				var button = event.target.closest("[data-module-key]");
				if (!button) return;
				var opening = button.getAttribute("aria-pressed") !== "true";
				button.disabled = true;
				current.rpc("set_module_unlock", {
					p_course: button.getAttribute("data-course-id"),
					p_module: button.getAttribute("data-module-key"),
					p_open: opening
				}).then(function (saved) {
					button.disabled = false;
					if (saved.error) {
						list.insertAdjacentHTML("beforeend", '<p class="mb-0 mt-2" role="status">' + esc(saved.error.message || "That module could not be updated.") + "</p>");
						return;
					}
					paintModuleUnlocks();
				});
			});
		}
		Promise.all([
			current.from("courses").select("id,title").order("title"),
			current.from("course_topics").select("id,course_id,title,position").order("position"),
			current.from("course_modules").select("id,course_id,title,position").order("position"),
			current.from("course_module_unlocks").select("course_id,module_key")
		]).then(function (parts) {
			var courses = (parts[0].data || []).slice();
			if (!courses.some(function (course) { return course.id === "bookkeeping"; })) {
				courses.unshift({ id: "bookkeeping", title: "Bookkeeping" });
			}
			var topics = parts[1].error ? [] : (parts[1].data || []);
			var modules = parts[2].error ? [] : (parts[2].data || []);
			var open = {};
			(parts[3].error ? [] : (parts[3].data || [])).forEach(function (row) {
				open[row.course_id + ":" + row.module_key] = true;
			});
			if (!courses.length) {
				list.innerHTML = "<p class=\"mb-0\">No courses yet.</p>";
				return;
			}
			list.innerHTML = courses.map(function (course) {
				var items = modulesForCourse(course, topics, modules);
				var rows = items.length ? items.map(function (module) {
					var isOpen = Boolean(open[course.id + ":" + module.key]);
					return '<li class="d-flex justify-content-between align-items-center gap-3 py-2 border-bottom"><span>' + esc(module.title) + '</span><button class="' + (isOpen ? "btn btn-primary" : "btn btn-light") + '" type="button" data-course-id="' + esc(course.id) + '" data-module-key="' + esc(module.key) + '" aria-pressed="' + (isOpen ? "true" : "false") + '">' + (isOpen ? "Close" : "Open") + "</button></li>";
				}).join("") : '<li class="py-2 text-muted">No modules have been added to this course yet.</li>';
				return '<section class="mb-3"><h3 class="h6 fw-bold">' + esc(course.title) + ' <a class="fw-normal" href="add-course.html?course=' + encodeURIComponent(course.id) + '">Edit</a></h3><ul class="list-unstyled mb-0">' + rows + "</ul></section>";
			}).join("");
		});
	}
	function renderAdminDashboard(root, data) {
		var count = totals(data);
		var wide = "col-md-6 col-xl-3";
		root.innerHTML = '<div class="dash-head"><div><h1 class="welcome-badge">Welcome, ' + esc(welcomeName(data)) + '</h1><p class="mb-0">Students, courses, and modules for the academy.</p></div></div>' +
			moduleUnlockCard() +
			'<div class="card mb-3" id="published-courses"><div class="card-body"><h2 class="h5 fw-bold">Published courses</h2><p role="status">Loading courses…</p></div></div>' +
			'<div class="card mb-3" id="instructor-invite"><div class="card-body"><h2 class="h5 fw-bold">Instructor registration</h2><p class="mb-2">Share this link only with instructors. It is not shown on the student site.</p><p class="mb-0" id="instructor-invite-link">Loading the registration link…</p></div></div>' +
			'<div class="card mb-3" id="recent-enrolments"><div class="card-body"><h2 class="h5 fw-bold">Recent enrolments</h2><p role="status">Loading enrolments…</p></div></div><div class="row">' +
			statCard("isax isax-book", "bg-success-transparent", "Awaiting approval", "…", "admin-courses.html", "", wide) +
			statCard("isax isax-profile-2user5", "bg-info-transparent", "Total students", "…", "admin-students.html", "", wide) +
			statCard("isax isax-user", "bg-primary-transparent", "Active instructors", String(count.instructors), "admin-instructors.html", "", wide) +
			'</div><div class="mb-3">' + submissionTable(data) + '</div><div class="row"><div class="col-lg-7 mb-3">' + activityCard(data) + '</div><div class="col-lg-5 mb-3">' + quickActions() + "</div></div>";
		root.querySelectorAll(".card-body span").forEach(function (label) {
			if (label.textContent === "Total students") {
				var value = label.parentElement.querySelector("h4");
				if (value) value.setAttribute("data-live-students", "");
			}
		});
		paintInstructorInvite();
		paintModuleUnlocks();
		paintPublishedCourses();
		paintPendingCourses();
		paintPendingAccounts();
		watchEnrolments(paintLiveEnrolments);
		paintLiveEnrolments();
	}
	function formatMinor(amount, currency) {
		var major = Number(amount) / 100;
		var code = currency || "GHS";
		try {
			return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(major);
		} catch (error) {
			return code + " " + (isFinite(major) ? major.toFixed(2) : "0.00");
		}
	}
	function revenueLabel(rows) {
		var totals = {};
		rows.forEach(function (row) {
			var code = row.currency || "GHS";
			totals[code] = (totals[code] || 0) + Number(row.amount_minor || 0);
		});
		var parts = Object.keys(totals).map(function (code) { return formatMinor(totals[code], code); });
		return parts.length ? parts.join(" · ") : "GHS 0.00";
	}
	function paymentRowsHtml(rows) {
		if (!rows.length) return '<p class="mb-0">No student payments in this period. A payment is recorded when a student pays, before the course opens.</p>';
		return table(
			[{ label: "Student" }, { label: "Course" }, { label: "Amount" }, { label: "Paid" }, { label: "Enrolment" }],
			rows.map(function (row) {
				return "<tr>" + cell("Student", esc(row.student_name || row.email || "")) + cell("Course", esc(row.course_title || "")) + cell("Amount", esc(formatMinor(row.amount_minor, row.currency))) + cell("Paid", esc(formatDate(row.paid_at))) + cell("Enrolment", esc(row.enrollment_status || "not enrolled")) + "</tr>";
			})
		);
	}
	function paintFinance(days) {
		var current = staffClient();
		var panel = document.getElementById("finance-panel");
		if (!current) return;
		current.rpc("founder_payment_records", { p_days: days }).then(function (result) {
			var rows = result.error ? [] : (result.data || []);
			var note = document.getElementById("range-note");
			if (note) {
				note.textContent = result.error
					? (result.error.message || "Payments could not be loaded.")
					: (days > 0 ? days + " days: " : "All time: ") + rows.length + " payment" + (rows.length === 1 ? "" : "s") + " from students before their course opened.";
			}
			document.querySelectorAll(".card-body span").forEach(function (label) {
				if (label.textContent === "Total revenue") {
					var value = label.parentElement.querySelector("h4");
					if (value) value.textContent = result.error ? "Unavailable" : revenueLabel(rows);
				}
			});
			if (panel) {
				panel.innerHTML = '<h2 class="h5 fw-bold">Student payments</h2><p>These are payments students made before their enrolment opened.</p>' + (result.error ? empty(result.error.message || "Payments could not be loaded.") : paymentRowsHtml(rows));
			}
			var status = document.getElementById("payment-status");
			if (status) {
				status.innerHTML = '<h2 class="h5 fw-bold">Payment status</h2><p class="mb-2">Paid ' + rows.length + "</p><p class=\"mb-0\">Amounts come from confirmed payments, not from course prices.</p>";
			}
		});
	}
	function paintPendingCourses() {
		var current = staffClient();
		if (!current) return;
		current.rpc("founder_list_instructors").then(function (listed) {
			if (listed.error || !listed.data) return;
			document.querySelectorAll(".card-body span").forEach(function (label) {
				if (label.textContent === "Active instructors") {
					var value = label.parentElement.querySelector("h4");
					if (value) value.textContent = String(listed.data.length);
				}
			});
		});
		current.rpc("founder_pending_courses").then(function (result) {
			var rows = result.data || [];
			document.querySelectorAll(".card-body span").forEach(function (label) {
				if (label.textContent === "Awaiting approval") {
					var value = label.parentElement.querySelector("h4");
					if (value) value.textContent = String(rows.length);
				}
			});
			var host = document.getElementById("pending-courses");
			if (!host) {
				var invite = document.getElementById("instructor-invite");
				if (!invite) return;
				host = document.createElement("div");
				host.id = "pending-courses";
				host.className = "card mb-3";
				invite.insertAdjacentElement("afterend", host);
			}
			host.innerHTML = '<div class="card-body"><h2 class="h5 fw-bold">Courses waiting for approval</h2>' +
				(rows.length ? rows.map(function (course) {
					var page = "https://bryllaacademy.vercel.app/course-details?course=" + encodeURIComponent(course.id);
					var link = '<p class="mb-2">Course page: <a href="' + page + '">' + esc(page) + "</a></p>";
					if (course.visibility === "private" && course.share_code) link += '<p class="mb-2">Private link: https://bryllaacademy.vercel.app/course-details?share=' + esc(course.share_code) + "</p>";
					return '<article class="border rounded-3 p-3 mb-2"><h3 class="h6 fw-bold">' + esc(course.title) + "</h3>" + link +
						'<button class="btn btn-primary btn-sm rounded-pill me-2" type="button" data-approve="' + esc(course.id) + '">Approve</button>' +
						'<button class="btn btn-light btn-sm rounded-pill" type="button" data-reject="' + esc(course.id) + '">Reject</button></article>';
				}).join("") : '<p class="mb-0">No courses are waiting.</p>') + "</div>";
			host.querySelectorAll("[data-approve],[data-reject]").forEach(function (button) {
				button.addEventListener("click", function () {
					var id = button.getAttribute("data-approve") || button.getAttribute("data-reject");
					current.rpc("founder_review_course", { p_course: id, p_approve: button.hasAttribute("data-approve") }).then(function (review) {
						if (review.error) toast(review.error.message || "The course could not be updated.");
						else { toast(button.hasAttribute("data-approve") ? "Course approved." : "Course rejected."); paintPendingCourses(); }
					});
				});
			});
		});
	}
	function paintPendingAccounts() {
		var current = staffClient();
		var host = document.getElementById("pending-accounts");
		if (!current) return;
		if (!host) {
			var anchor = document.getElementById("recent-enrolments") || document.getElementById("main");
			if (!anchor) return;
			host = document.createElement("div");
			host.id = "pending-accounts";
			host.className = "card mb-3";
			if (anchor.id === "main") anchor.insertAdjacentElement("afterbegin", host);
			else anchor.insertAdjacentElement("beforebegin", host);
		}
		current.rpc("founder_pending_accounts").then(function (result) {
			if (!document.body.contains(host)) return;
			var rows = result.error ? [] : (result.data || []);
			host.innerHTML = '<div class="card-body"><h2 class="h5 fw-bold">Student accounts waiting for approval</h2><p class="mb-3">A new student can sign in only after you approve the account.</p>' +
				(result.error ? empty(result.error.message || "Accounts could not be loaded.") : (rows.length ? "<ul class=\"list-unstyled mb-0\">" + rows.map(function (row) {
					return '<li class="d-flex justify-content-between align-items-center gap-3 py-2 border-bottom"><span>' + esc(row.full_name || row.email || "Student") + " · " + esc(row.email || "") + '</span><button class="btn btn-primary btn-sm" type="button" data-approve-student="' + esc(row.id) + '">Approve</button></li>';
				}).join("") + "</ul>" : '<p class="mb-0">No student accounts are waiting.</p>')) + "</div>";
			host.querySelectorAll("[data-approve-student]").forEach(function (button) {
				button.addEventListener("click", function () {
					button.disabled = true;
					current.rpc("founder_approve_student", { p_user: button.getAttribute("data-approve-student") }).then(function (saved) {
						if (saved.error) {
							button.disabled = false;
							toast(saved.error.message || "The account could not be approved.");
							return;
						}
						toast("Student account approved.");
						paintPendingAccounts();
					});
				});
			});
		});
	}
	function paintInstructorInvite() {
		var node = document.getElementById("instructor-invite-link");
		var client = staffClient();
		if (!node || !client) return;
		client.rpc("founder_instructor_invite").then(function (result) {
			if (!document.body.contains(node)) return;
			if (result.error || !result.data) {
				node.textContent = "The registration link is not available yet.";
				return;
			}
			var url = "https://bryllaacademy.vercel.app/instructor-register?code=" + encodeURIComponent(result.data);
			node.innerHTML = '<a href="' + esc(url) + '">' + esc(url) + "</a>";
		});
	}
	function courseEditLink(course) {
		return '<a class="btn btn-light btn-sm" href="add-course.html?course=' + encodeURIComponent(course.id) + '">Edit</a>';
	}
	function paintPublishedCourses() {
		var current = staffClient();
		var host = document.getElementById("published-courses");
		if (!current || !host) return;
		current.from("courses").select("id,title,status").eq("status", "published").order("title").then(function (result) {
			if (!document.body.contains(host)) return;
			var rows = result.error ? [] : (result.data || []);
			host.innerHTML = '<div class="card-body"><h2 class="h5 fw-bold">Published courses</h2>' +
				(result.error ? empty(result.error.message || "Published courses could not be loaded.") : (rows.length ? "<ul class=\"list-unstyled mb-0\">" + rows.map(function (course) {
					return '<li class="d-flex justify-content-between align-items-center gap-3 py-2 border-bottom"><span>' + esc(course.title) + "</span>" + courseEditLink(course) + "</li>";
				}).join("") + "</ul>" : "<p class=\"mb-0\">No published courses yet.</p>")) + "</div>";
		});
	}
	function renderAdminCourses(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">All courses</h1><p role="status">Loading courses…</p>';
		var current = staffClient();
		if (!current) return;
		current.from("courses").select("id,title,status,price_amount,currency").order("title").then(function (result) {
			var rows = result.error ? [] : (result.data || []);
			root.innerHTML = '<h1 class="h5 fw-bold">All courses</h1><p class="mb-3">Published courses can be edited. The change is saved on that course.</p>' +
				(result.error ? empty(result.error.message || "Courses could not be loaded.") : (rows.length ? table(
					[{ label: "Course" }, { label: "Price" }, { label: "Status" }, { label: "Actions" }],
					rows.map(function (course) {
						var price = course.price_amount == null ? "Not set" : (course.currency || "GHS") + " " + course.price_amount;
						return "<tr>" + cell("Course", esc(course.title)) + cell("Price", esc(price)) + cell("Status", statusBadge(course.status)) + cell("Actions", courseEditLink(course)) + "</tr>";
					})
				) : empty("No courses yet.")));
		});
	}
	function renderAdminPerformance(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">Course performance</h1><p id="performance-status" role="status">Loading student progress…</p>';
		var current = staffClient();
		if (!current) return;
		current.rpc("founder_course_performance").then(function (result) {
			if (result.error) {
				root.innerHTML = '<h1 class="h5 fw-bold">Course performance</h1>' + empty(result.error.message || "Student progress could not be loaded.");
				return;
			}
			var rows = result.data || [];
			root.innerHTML = '<h1 class="h5 fw-bold">Course performance</h1><p class="mb-3">Taken from each student\'s saved lesson progress.</p>' + (rows.length ? table(
				[{ label: "Course" }, { label: "Students" }, { label: "Lessons recorded" }, { label: "Progress" }],
				rows.map(function (row) {
					return "<tr>" + cell("Course", esc(row.title)) + cell("Students", String(row.students)) + cell("Lessons recorded", String(row.lessons_recorded)) + cell("Progress", String(row.progress_percent) + "%") + "</tr>";
				})
			) : empty("No published courses yet."));
		});
	}
	function renderAdminTransactions(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">Academy Overview</h1><p class="mb-3">Payment records are no longer part of the academy dashboard.</p><a href="admin-dashboard.html">Back to Academy Overview</a>';
	}
	function renderAdminReports(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">Analytics and reports</h1><p role="status">Loading courses and students…</p>';
		var current = staffClient();
		if (!current) return;
		current.rpc("founder_academy_counts").then(function (result) {
			var row = result.data && result.data[0];
			if (result.error || !row) {
				root.innerHTML = '<h1 class="h5 fw-bold">Analytics and reports</h1>' + empty("Course and student counts could not be loaded.");
				return;
			}
			root.innerHTML = '<h1 class="h5 fw-bold">Analytics and reports</h1><div class="row">' +
				statCard("isax isax-teacher5", "bg-primary-transparent", "Active courses", String(row.active_courses), "admin-courses.html") +
				statCard("isax isax-profile-2user5", "bg-info-transparent", "Enrolled students", String(row.enrolled_students), "admin-students.html") +
				statCard("isax isax-book", "bg-success-transparent", "Enrolments", String(row.enrolments), "admin-students.html") +
				"</div>";
		});
	}
	function renderAdminInstructors(root) {
		var current = staffClient();
		function draw(people) {
			root.innerHTML = '<h1 class="h5 fw-bold">Instructors</h1><p class="mb-3">People who register with the private instructor link appear here, along with anyone you add.</p>' +
				(people.length ? table(
					[{ label: "Instructor" }, { label: "Email" }, { label: "Joined" }],
					people.map(function (person) {
						return "<tr>" + cell("Instructor", esc(person.full_name || "Instructor")) + cell("Email", esc(person.email || "")) + cell("Joined", esc(formatDate(person.created_at))) + "</tr>";
					})
				) : empty("No instructors yet.")) +
				'<div class="card mt-4" id="add-instructor"><div class="card-body"><h2 class="h5 fw-bold">Add instructor</h2><form id="instructor-form">' +
				'<label class="form-label" for="inst-name">Full name</label><input class="form-control mb-2" id="inst-name" required>' +
				'<label class="form-label" for="inst-email">Email</label><input class="form-control mb-2" id="inst-email" type="email" required>' +
				'<label class="form-label" for="inst-password">Temporary password</label><input class="form-control mb-3" id="inst-password" type="text" minlength="8" required>' +
				'<button class="btn btn-primary rounded-pill" type="submit">Save instructor</button></form></div></div>';
			document.getElementById("instructor-form").addEventListener("submit", function (event) {
				event.preventDefault();
				current.rpc("founder_create_instructor", {
					p_name: document.getElementById("inst-name").value.trim(),
					p_email: document.getElementById("inst-email").value.trim(),
					p_password: document.getElementById("inst-password").value
				}).then(function (result) {
					if (result.error) {
						toast(result.error.message || "The instructor could not be added.");
						return;
					}
					toast("Instructor added.");
					load();
				});
			});
		}
		function load() {
			root.innerHTML = '<h1 class="h5 fw-bold">Instructors</h1><p role="status">Loading instructors…</p>';
			if (!current) return;
			current.rpc("founder_list_instructors").then(function (result) {
				if (result.error) {
					root.innerHTML = '<h1 class="h5 fw-bold">Instructors</h1>' + empty(result.error.message || "Instructors could not be loaded.");
					return;
				}
				draw(result.data || []);
			});
		}
		load();
	}
	function renderAdminEarnings(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">Academy Overview</h1><p class="mb-3">Payment records are no longer part of the academy dashboard.</p><a href="admin-dashboard.html">Back to Academy Overview</a>';
	}
	function renderAnalytics(root, data) {
		var count = totals(data);
		var pending = data.submissions.filter(function (row) { return row.score == null; }).length;
		var scored = data.enrolments.filter(function (row) { return row.progress != null; });
		var completion = scored.length ? Math.round(scored.reduce(function (sum, row) { return sum + Number(row.progress); }, 0) / scored.length) : null;
		root.innerHTML = '<h1 class="h5 fw-bold">Teaching analytics</h1><p>Completion and grading for your courses. Academy revenue is not shown here.</p><div class="row">' +
			statCard("isax isax-teacher5", "bg-primary-transparent", "My courses", String(count.courses), "instructor-course.html") +
			statCard("isax isax-profile-2user5", "bg-info-transparent", "My students", String(count.students), "instructor-students.html") +
			statCard("isax isax-clipboard-text5", "bg-warning-transparent", "Pending reviews", String(pending), "instructor-assignment.html") +
			statCard("isax isax-medal-star5", "bg-success-transparent", "Course completion", rate(completion), "instructor-analytics.html") +
			"</div>";
	}
	function renderMessages(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">Messages</h1><p>A message sent here shows on that student\'s notification bell. Students cannot see each other\'s messages.</p>' +
			'<div class="card mt-3"><div class="card-body">' +
			'<form id="staff-sign-in"><h2 class="h6 fw-bold">Sign in to send</h2><p>Use the instructor or founder account. This replaces the academy session in this browser.</p>' +
			'<label class="form-label" for="staff-email">Email</label><input class="form-control mb-2" id="staff-email" type="email" autocomplete="username" required>' +
			'<label class="form-label" for="staff-password">Password</label><input class="form-control mb-3" id="staff-password" type="password" autocomplete="current-password" required>' +
			'<button class="btn btn-primary rounded-pill" type="submit">Sign in</button><p id="staff-sign-status" class="mt-2 mb-0" role="status"></p></form>' +
			'<form id="staff-message" hidden><p id="staff-who" class="mb-3"></p>' +
			'<label class="form-label" for="msg-audience">Send to</label><select class="form-select mb-2" id="msg-audience"></select>' +
			'<label class="form-label" for="msg-title">Title</label><input class="form-control mb-2" id="msg-title" maxlength="140" required>' +
			'<label class="form-label" for="msg-body">Message</label><textarea class="form-control mb-3" id="msg-body" maxlength="2000" rows="4" required></textarea>' +
			'<button class="btn btn-primary rounded-pill" type="submit">Send message</button><p id="msg-status" class="mt-2 mb-0" role="status"></p></form></div></div>';
		var signForm = document.getElementById("staff-sign-in");
		var messageForm = document.getElementById("staff-message");
		var signStatus = document.getElementById("staff-sign-status");
		var msgStatus = document.getElementById("msg-status");
		var current = staffClient();
		if (!current) {
			signStatus.textContent = "Sign-in is not available on this page.";
			return;
		}
		function showComposer(role, directory) {
			signForm.hidden = true;
			messageForm.hidden = false;
			document.getElementById("staff-who").textContent = "Signed in as " + role + ".";
			var courses = {};
			directory.forEach(function (row) { courses[row.course_id] = row.course_title; });
			var options = role === "founder" ? '<option value="all">All active students</option>' : "";
			Object.keys(courses).forEach(function (id) {
				options += '<option value="course:' + esc(id) + '">Everyone in ' + esc(courses[id]) + "</option>";
			});
			directory.forEach(function (row) {
				options += '<option value="student:' + esc(row.user_id) + '">' + esc(row.full_name || row.email) + " — " + esc(row.course_title) + "</option>";
			});
			document.getElementById("msg-audience").innerHTML = options || '<option value="">No active students yet</option>';
		}
		function checkSession() {
			return current.auth.getSession().then(function (result) {
				var session = result.data.session;
				if (!session) return;
				return current.from("profiles").select("role").eq("id", session.user.id).maybeSingle().then(function (profile) {
					var role = profile.data && profile.data.role;
					if (role !== "instructor" && role !== "founder") {
						signStatus.textContent = "This account is not an instructor or founder.";
						return;
					}
					return current.rpc("staff_student_directory").then(function (directory) {
						if (directory.error) throw directory.error;
						showComposer(role, directory.data || []);
					});
				});
			}).catch(function () {
				signStatus.textContent = "Could not check your account. Try again.";
			});
		}
		signForm.addEventListener("submit", function (event) {
			event.preventDefault();
			signStatus.textContent = "Signing in…";
			current.auth.signInWithPassword({
				email: document.getElementById("staff-email").value.trim(),
				password: document.getElementById("staff-password").value
			}).then(function (result) {
				if (result.error) {
					signStatus.textContent = "That email and password don't match.";
					return;
				}
				document.getElementById("staff-password").value = "";
				signStatus.textContent = "";
				return checkSession();
			});
		});
		messageForm.addEventListener("submit", function (event) {
			event.preventDefault();
			var audience = document.getElementById("msg-audience").value;
			if (!audience) {
				msgStatus.textContent = "Choose who should receive this message.";
				return;
			}
			var notice = { type: "message", title: document.getElementById("msg-title").value.trim(), message: document.getElementById("msg-body").value.trim(), destination: "student-dashboard", key: "msg" + Date.now() };
			if (audience.indexOf("course:") === 0) notice.courseId = audience.slice(7);
			else if (audience.indexOf("student:") === 0) notice.studentId = audience.slice(8);
			msgStatus.textContent = "Sending…";
			deliverNotice(notice).then(function (result) {
				msgStatus.textContent = result.ok
					? (result.count ? "Sent to " + result.count + " student" + (result.count === 1 ? "" : "s") + "." : "Nobody new was notified.")
					: result.message;
				if (result.ok && result.count) {
					document.getElementById("msg-title").value = "";
					document.getElementById("msg-body").value = "";
				}
			});
		});
		checkSession();
		paintContactMessages(root);
	}
	function paintContactMessages(root) {
		var current = staffClient();
		if (!current) return;
		var card = document.createElement("div");
		card.className = "card mb-3";
		card.innerHTML = '<div class="card-body"><h2 class="h5 fw-bold">Contact page</h2><p role="status">Loading messages…</p></div>';
		var heading = root.querySelector("h1");
		if (heading) heading.insertAdjacentElement("afterend", card);
		current.rpc("founder_contact_messages").then(function (result) {
			if (result.error) {
				card.remove();
				return;
			}
			var rows = result.data || [];
			card.innerHTML = '<div class="card-body"><h2 class="h5 fw-bold">Contact page</h2>' + (rows.length ? rows.map(function (row) {
				return '<article class="border rounded-3 p-3 mb-2"><h3 class="h6 fw-bold">' + esc(row.subject || "Message") + "</h3><p class=\"mb-1\">" + esc(row.message) + '</p><p class="mb-0 text-muted">' + esc(row.sender_name) + " · " + esc(row.email) + (row.phone ? " · " + esc(row.phone) : "") + " · " + esc(formatDate(row.created_at)) + "</p></article>";
			}).join("") : '<p class="mb-0">No messages from the contact page yet.</p>') + "</div>";
		});
	}

	function renderEmptyPage(root, title, message) {
		root.innerHTML = '<h1 class="h5 fw-bold">' + esc(title) + "</h1>" + empty(message);
	}
	function renderNotifications(root) {
		root.innerHTML = '<h1 class="h5 fw-bold">Notifications</h1><p role="status">Loading announcements…</p>';
		var current = staffClient();
		if (!current) return;
		current.rpc("my_notifications").then(function (result) {
			var rows = result.data || [];
			if (result.error) {
				root.innerHTML = '<h1 class="h5 fw-bold">Notifications</h1>' + empty(result.error.message || "Notifications could not be loaded.");
				return;
			}
			root.innerHTML = '<h1 class="h5 fw-bold">Notifications</h1>' + (rows.length ? rows.map(function (row) {
				return '<article class="card mb-3"><div class="card-body"><h2 class="h6 fw-bold">' + esc(row.title) + '</h2><p class="mb-1">' + esc(row.message) + '</p><p class="mb-0 text-muted">' + esc(formatDate(row.created_at)) + "</p></div></article>";
			}).join("") : empty("No announcements yet."));
		});
	}
	function renderPlatformSettings(root) {
		var current = staffClient();
		root.innerHTML = '<h1 class="h5 fw-bold">Platform settings</h1><p role="status">Loading academy settings…</p>';
		if (!current) return;
		current.rpc("founder_settings").then(function (result) {
			if (result.error) {
				root.innerHTML = '<h1 class="h5 fw-bold">Platform settings</h1>' + empty(result.error.message || "Settings could not be loaded.");
				return;
			}
			var values = {};
			(result.data || []).forEach(function (row) { values[row.key] = row.value; });
			root.innerHTML = '<h1 class="h5 fw-bold">Platform settings</h1><form id="academy-settings" class="card"><div class="card-body">' +
				'<label class="form-label" for="set-name">Academy name</label><input class="form-control mb-3" id="set-name" value="' + esc(values.academy_name || "") + '">' +
				'<label class="form-label" for="set-email">Support email</label><input class="form-control mb-3" id="set-email" type="email" value="' + esc(values.support_email || "") + '">' +
				'<label class="form-label" for="set-currency">Default currency</label><input class="form-control mb-3" id="set-currency" value="' + esc(values.default_currency || "GHS") + '">' +
				'<label class="form-label" for="set-inflation">Conversion buffer (%)</label><input class="form-control mb-3" id="set-inflation" type="number" min="0" max="25" step="0.1" value="' + esc(values.inflation_percent || "3") + '">' +
				'<p class="text-muted">When a visitor sees a price in another currency, this buffer is added so the converted price does not fall below the amount you set.</p>' +
				'<button class="btn btn-primary rounded-pill" type="submit">Save settings</button></div></form>';
			document.getElementById("academy-settings").addEventListener("submit", function (event) {
				event.preventDefault();
				var pairs = [
					["academy_name", document.getElementById("set-name").value.trim()],
					["support_email", document.getElementById("set-email").value.trim()],
					["default_currency", document.getElementById("set-currency").value.trim().toUpperCase()],
					["inflation_percent", document.getElementById("set-inflation").value.trim()]
				];
				pairs.reduce(function (chain, pair) {
					return chain.then(function () {
						return current.rpc("founder_save_setting", { p_key: pair[0], p_value: pair[1] });
					});
				}, Promise.resolve()).then(function (last) {
					if (last && last.error) toast(last.error.message || "Settings could not be saved.");
					else toast("Academy settings saved.");
				});
			});
		});
	}

	var PAGES = {
		dashboard: renderDashboard,
		courses: renderCourses,
		announcements: renderAnnouncements,
		assignments: renderAssignments,
		students: renderStudents,
		quiz: renderQuiz,
		"quiz-results": renderResults,
		certificates: renderCertificates,
		profile: renderProfile,
		analytics: renderAnalytics,
		help: function (root) { renderEmptyPage(root, "Help", "Help articles will be added here. For now, use the menu to open courses, grading and students."); },
		messages: renderMessages,
		settings: function (root) { renderEmptyPage(root, "Settings", "Account settings will be connected later."); },
		notifications: renderNotifications,
		"admin-dashboard": renderAdminDashboard,
		"admin-earnings": renderAdminEarnings,
		"admin-transactions": renderAdminTransactions,
		"admin-reports": renderAdminReports,
		"admin-courses": renderAdminCourses,
		"admin-performance": renderAdminPerformance,
		"admin-students": renderStudents,
		"admin-instructors": renderAdminInstructors,
		"admin-announcements": renderAnnouncements,
		"admin-support": function (root) { renderEmptyPage(root, "Academy Overview", "Support is not part of the founder dashboard."); },
		"admin-settings": renderPlatformSettings,
		"admin-help": function (root) { renderEmptyPage(root, "Academy Overview", "Help is not part of the founder dashboard."); }
	};

	function boot() {
		var page = document.body.getAttribute("data-page");
		if (!page || !PAGES[page]) return;
		var admin = currentArea() === "admin";
		var loginPage = admin ? "admin-login" : "instructor-login";
		var client = window.BryllaPublic && BryllaPublic.client ? BryllaPublic.client() : null;
		if (!client) {
			location.replace(loginPage);
			return;
		}
		client.auth.getSession().then(function (result) {
			var session = result.data && result.data.session;
			if (!session) {
				sessionStorage.removeItem("brylla-role");
				location.replace(loginPage);
				return null;
			}
			return client.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
		}).then(function (profile) {
			if (!profile) return;
			var role = profile.data && profile.data.role;
			if (role !== "instructor" && role !== "founder") {
				sessionStorage.removeItem("brylla-role");
				location.replace("login");
				return;
			}
			if (admin && role !== "founder") {
				sessionStorage.setItem("brylla-role", role);
				location.replace("instructor-dashboard");
				return;
			}
			sessionStorage.setItem("brylla-role", role);
			openPage(page);
		}).catch(function () {
			location.replace(loginPage);
		});
	}
	function loadAssignmentSubmissions(localRows) {
		var saved = {};
		(localRows || []).forEach(function (row) { if (row && row.id) saved[row.id] = row; });
		var client = staffClient();
		if (!client) return Promise.resolve(localRows || []);
		return client.rpc("staff_assignment_submissions").then(function (result) {
			if (result.error || !Array.isArray(result.data)) return localRows || [];
			var paths = [];
			result.data.forEach(function (row) {
				fileList(row).forEach(function (file) { if (file.storage_path) paths.push(file.storage_path); });
			});
			var signed = paths.length
				? client.storage.from("assignment-files").createSignedUrls(paths, 60 * 60)
				: Promise.resolve({ data: [] });
			return signed.then(function (links) {
				var urls = {};
				(links.data || []).forEach(function (item) { if (item && item.path) urls[item.path] = item.signedUrl; });
				return result.data.map(function (row) {
					var previous = saved[row.id] || {};
					var course = row.course_id === "bookkeeping" ? "Bookkeeping" : row.course_id;
					return {
						id: row.id,
						remote: true,
						assignmentId: row.course_id + "-w" + row.module_week,
						student: row.student_name || "Student",
						title: course + ", week " + row.module_week,
						courseId: row.course_id,
						moduleWeek: row.module_week,
						note: row.note || "",
						total: previous.total || 100,
						score: previous.score == null || previous.score === "" ? null : previous.score,
						feedback: previous.feedback || "",
						submittedAt: row.created_at,
						files: fileList(row).map(function (file) {
							return { name: file.file_name, url: urls[file.storage_path] || "" };
						})
					};
				});
			});
		}).catch(function () {
			return localRows || [];
		});
	}
	function fileList(row) {
		var files = row.files;
		if (typeof files === "string") {
			try { files = JSON.parse(files); } catch (error) { files = []; }
		}
		return Array.isArray(files) ? files : [];
	}
	function openPage(page) {
		var data = state();
		document.body.innerHTML = shell(page, data);
		bindMenu();
		var root = document.getElementById("main");
		var title = "Instructor";
		activeMenu().forEach(function (group) {
			group.items.forEach(function (item) {
				if (item.page === page) title = item.label;
			});
		});
		title = title.charAt(0).toUpperCase() + title.slice(1);
		document.title = title + " | Brylla Academy";
		var mode = pageState();
		if (mode === "loading") { root.innerHTML = '<h1 class="h5 fw-bold">' + esc(title) + "</h1>" + skeleton(); return; }
		if (mode === "error") {
			root.innerHTML = '<h1 class="h5 fw-bold">' + esc(title) + "</h1>" + errorBlock();
			document.getElementById("instructor-retry").addEventListener("click", function () { location.search = ""; });
			return;
		}
		root.innerHTML = '<p class="mb-0">Loading submissions…</p>';
		loadAssignmentSubmissions(data.submissions).then(function (rows) {
			data.submissions = rows;
			PAGES[page](root, data);
		});
		window.addEventListener("beforeunload", function (event) {
			if (!dirty) return;
			event.preventDefault();
			event.returnValue = "";
		});
	}
	document.addEventListener("DOMContentLoaded", boot);
	window.BryllaInstructor = { source: SOURCE, state: state, totals: totals };
})();
