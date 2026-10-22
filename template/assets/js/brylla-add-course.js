(function () {
	var CURRENCIES = ["GHS", "NGN", "USD", "EUR", "GBP", "CAD", "KES", "ZAR", "XOF", "INR", "AUD"];
	var DRAFT_KEY = "brylla-draft-course";
	var client = null;
	var userId = "";
	var courseId = "";

	function $(id) { return document.getElementById(id); }
	function show(message, isError) {
		var node = $("course-save-status");
		if (!node) return;
		node.textContent = message;
		node.hidden = !message;
		node.style.color = isError ? "#a12622" : "#078d87";
	}
	function slug(title) {
		var base = String(title || "course").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "course";
		return base + "-" + Math.random().toString(36).slice(2, 6);
	}
	function shareUrl(code) {
		return "https://bryllaacademy.vercel.app/course-details?share=" + encodeURIComponent(code);
	}
	function field(id) { return $(id) ? $(id).value.trim() : ""; }

	function requireStaff() {
		client = window.BryllaPublic && BryllaPublic.client ? BryllaPublic.client() : null;
		if (!client) return Promise.reject(new Error("Sign in as an instructor or founder to save a course."));
		return client.auth.getSession().then(function (result) {
			var session = result.data && result.data.session;
			if (!session) throw new Error("Sign in as an instructor or founder to save a course.");
			userId = session.user.id;
			return client.from("profiles").select("role").eq("id", userId).maybeSingle();
		}).then(function (profile) {
			var role = profile.data && profile.data.role;
			if (role !== "instructor" && role !== "founder") throw new Error("Only an instructor or the founder can add a course.");
		});
	}

	function ensureDraft() {
		courseId = sessionStorage.getItem(DRAFT_KEY) || "";
		if (courseId) return Promise.resolve(courseId);
		courseId = slug(field("course-title"));
		return client.from("courses").insert({
			id: courseId,
			title: field("course-title") || "Untitled course",
			price_minor: 0,
			currency: field("course-currency") || "GHS",
			status: "draft",
			visibility: "public",
			approval_status: "draft",
			created_by: userId,
			price_amount: 0,
			share_code: Math.random().toString(16).slice(2, 14)
		}).then(function (created) {
			if (created.error) throw new Error(created.error.message || "The course draft could not be saved.");
			sessionStorage.setItem(DRAFT_KEY, courseId);
			return courseId;
		});
	}

	function saveFields() {
		if (!courseId) return Promise.resolve();
		var amount = Number(field("course-price") || 0);
		if (!isFinite(amount) || amount < 0) amount = 0;
		var description = "";
		var editor = document.querySelector(".note-editable");
		description = editor ? editor.innerText.trim() : "";
		return client.from("courses").update({
			title: field("course-title") || "Untitled course",
			level: field("course-level") === "Select" ? "" : field("course-level"),
			visibility: field("course-visibility") === "Private" ? "private" : "public",
			short_description: field("course-short").slice(0, 300),
			description: description.slice(0, 4000),
			intro_video_url: field("course-intro").slice(0, 400),
			currency: field("course-currency") || "GHS",
			price_amount: amount,
			price_minor: Math.round(amount * 100)
		}).eq("id", courseId).then(function (saved) {
			if (saved.error) throw new Error(saved.error.message || "The course could not be saved.");
		});
	}

	function paintShare(course) {
		var box = $("course-share-box");
		if (!box) return;
		if (course && course.visibility === "private" && course.share_code && course.approval_status !== "draft") {
			var url = shareUrl(course.share_code);
			box.hidden = false;
			box.innerHTML = "Private course link for students: <a href=\"" + url + "\">" + url + "</a>";
		} else {
			box.hidden = true;
		}
	}

	function renderTopics(rows) {
		var list = $("topic-list");
		var empty = $("topic-empty");
		if (!list) return;
		list.innerHTML = "";
		(rows || []).forEach(function (topic) {
			var item = document.createElement("div");
			item.className = "d-flex align-items-center justify-content-between bg-white p-2 border rounded-3 mb-2";
			item.innerHTML = "<p class=\"fw-medium mb-0\"></p><button class=\"btn btn-light btn-sm\" type=\"button\">Remove</button>";
			item.querySelector("p").textContent = topic.title;
			item.querySelector("button").addEventListener("click", function () {
				client.from("course_topics").delete().eq("id", topic.id).then(function () { loadTopics(); });
			});
			list.appendChild(item);
		});
		if (empty) empty.hidden = rows && rows.length > 0;
	}

	function renderFaqs(rows) {
		var list = $("faq-list");
		var empty = $("faq-empty");
		if (!list) return;
		list.innerHTML = "";
		(rows || []).forEach(function (faq) {
			var item = document.createElement("div");
			item.className = "border rounded-3 p-3 mb-2 bg-white";
			item.innerHTML = "<div class=\"d-flex justify-content-between gap-2\"><strong></strong><button class=\"btn btn-light btn-sm\" type=\"button\">Remove</button></div><p class=\"mb-0 mt-2\"></p>";
			item.querySelector("strong").textContent = faq.question;
			item.querySelector("p").textContent = faq.answer;
			item.querySelector("button").addEventListener("click", function () {
				client.from("course_faqs").delete().eq("id", faq.id).then(function () { loadFaqs(); });
			});
			list.appendChild(item);
		});
		if (empty) empty.hidden = rows && rows.length > 0;
	}

	function renderFiles(rows) {
		["video", "material", "study", "thumbnail"].forEach(function (kind) {
			var list = document.querySelector("[data-saved-files=\"" + kind + "\"]");
			if (!list) return;
			list.innerHTML = "";
			(rows || []).filter(function (file) { return file.kind === kind; }).forEach(function (file) {
				var item = document.createElement("li");
				item.textContent = file.file_name;
				var remove = document.createElement("button");
				remove.type = "button";
				remove.className = "material-remove";
				remove.textContent = "Remove";
				remove.addEventListener("click", function () {
					client.storage.from("course-media").remove([file.storage_path]).then(function () {
						return client.from("course_files").delete().eq("id", file.id);
					}).then(function () { loadFiles(); });
				});
				item.appendChild(remove);
				list.appendChild(item);
			});
		});
	}

	function loadTopics() {
		return client.from("course_topics").select("id,title,position").eq("course_id", courseId).order("position").then(function (result) {
			renderTopics(result.data || []);
		});
	}
	function loadFaqs() {
		return client.from("course_faqs").select("id,question,answer").eq("course_id", courseId).order("position").then(function (result) {
			renderFaqs(result.data || []);
		});
	}
	function loadFiles() {
		return client.from("course_files").select("id,kind,file_name,storage_path").eq("course_id", courseId).order("created_at").then(function (result) {
			renderFiles(result.data || []);
		});
	}

	function loadCourse() {
		return client.from("courses").select("title,level,visibility,short_description,description,intro_video_url,currency,price_amount,share_code,approval_status").eq("id", courseId).maybeSingle().then(function (result) {
			var course = result.data;
			if (!course) return;
			if ($("course-title") && course.title !== "Untitled course") $("course-title").value = course.title;
			if ($("course-level") && course.level) $("course-level").value = course.level;
			if ($("course-visibility")) $("course-visibility").value = course.visibility === "private" ? "Private" : "Public";
			if ($("course-short")) $("course-short").value = course.short_description || "";
			if ($("course-intro")) $("course-intro").value = course.intro_video_url || "";
			if ($("course-currency")) $("course-currency").value = course.currency || "GHS";
			if ($("course-price")) $("course-price").value = course.price_amount || "";
			paintShare(course);
			var editor = document.querySelector(".note-editable");
			if (editor && course.description) editor.innerText = course.description;
		});
	}

	function safeName(name) {
		return String(name || "file").split(/[/\\]/).pop().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
	}

	function uploadFiles(files, kind) {
		return ensureDraft().then(function () {
			return files.reduce(function (chain, file) {
				return chain.then(function () {
					var path = userId + "/" + courseId + "/" + Date.now() + "-" + safeName(file.name);
					return client.storage.from("course-media").upload(path, file, { upsert: false }).then(function (uploaded) {
						if (uploaded.error) throw new Error(file.name + " could not be uploaded.");
						return client.from("course_files").insert({
							course_id: courseId,
							user_id: userId,
							kind: kind,
							storage_path: path,
							file_name: file.name.slice(0, 180),
							content_type: file.type || "application/octet-stream",
							size_bytes: file.size
						});
					});
				});
			}, Promise.resolve());
		}).then(function () {
			show("Files saved. They stay on this course after a refresh.");
			return loadFiles();
		}).catch(function (error) {
			show(error.message || "A file could not be saved.", true);
		});
	}

	function bindUploads() {
		document.addEventListener("brylla-files-added", function (event) {
			var input = event.target.querySelector && event.target.querySelector("input[type=file]");
			var id = input ? input.id : "";
			var kind = id === "course-videos" || id === "lesson-video-file" ? "video" : id === "study-materials" ? "study" : id === "upload-img-input" ? "thumbnail" : "material";
			var files = event.detail && event.detail.files ? event.detail.files : [];
			if (files.length) uploadFiles(files, kind);
		});
		var image = $("upload-img-input");
		if (image) image.addEventListener("change", function () {
			if (image.files && image.files.length) uploadFiles(Array.prototype.slice.call(image.files), "thumbnail");
		});
	}

	function bindTopics() {
		var form = document.querySelector("#add-topic form");
		if (!form) return;
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			var title = form.querySelector("input").value.trim();
			if (!title) return;
			ensureDraft().then(function () {
				return client.from("course_topics").insert({ course_id: courseId, title: title.slice(0, 160), position: Date.now() });
			}).then(function (saved) {
				if (saved.error) throw new Error(saved.error.message);
				form.reset();
				var modal = window.bootstrap && bootstrap.Modal.getInstance(document.getElementById("add-topic"));
				if (modal) modal.hide();
				return loadTopics();
			}).catch(function (error) { show(error.message, true); });
		});
	}

	function bindFaqs() {
		var form = document.querySelector("#add-faq form");
		if (!form) return;
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			var question = $("faq-question").value.trim();
			var answer = $("faq-answer").value.trim();
			if (!question || !answer) return;
			ensureDraft().then(function () {
				return client.from("course_faqs").insert({
					course_id: courseId,
					question: question.slice(0, 200),
					answer: answer.slice(0, 2000),
					enabled: true,
					position: Date.now()
				});
			}).then(function (saved) {
				if (saved.error) throw new Error(saved.error.message);
				form.reset();
				var modal = window.bootstrap && bootstrap.Modal.getInstance(document.getElementById("add-faq"));
				if (modal) modal.hide();
				return loadFaqs();
			}).catch(function (error) { show(error.message, true); });
		});
	}

	function bindSave() {
		["course-title", "course-level", "course-visibility", "course-short", "course-intro", "course-currency", "course-price"].forEach(function (id) {
			var node = $(id);
			if (!node) return;
			node.addEventListener("change", function () {
				ensureDraft().then(saveFields).then(function () {
					return client.from("courses").select("visibility,share_code,approval_status").eq("id", courseId).maybeSingle();
				}).then(function (result) { paintShare(result.data); }).catch(function (error) { show(error.message, true); });
			});
		});
		var submit = $("course-submit");
		if (!submit) return;
		submit.addEventListener("click", function (event) {
			event.preventDefault();
			show("Submitting the course for approval…");
			ensureDraft().then(saveFields).then(function () {
				return client.rpc("submit_course", { p_course: courseId });
			}).then(function (result) {
				if (result.error) throw new Error(result.error.message || "The course could not be submitted.");
				var code = result.data;
				var url = field("course-visibility") === "Private" ? shareUrl(code) : "";
				var note = $("course-share-note");
				if (note) {
					note.hidden = !url;
					if (url) note.innerHTML = "Share this private link with students: <a href=\"" + url + "\">" + url + "</a>";
				}
				sessionStorage.removeItem(DRAFT_KEY);
				var modalEl = document.getElementById("success");
				if (modalEl && window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
				show("Submitted. The founder can approve it from the dashboard.");
			}).catch(function (error) { show(error.message, true); });
		});
	}

	function previewPrice() {
		var node = $("course-price-preview");
		var amount = $("course-price");
		var currency = $("course-currency");
		if (!node || !amount || !window.BryllaCurrency) return;
		function draw() {
			Promise.all([BryllaCurrency.rates(), BryllaCurrency.inflation()]).then(function (parts) {
				var result = BryllaCurrency.convert(amount.value || 0, currency.value, BryllaCurrency.visitorCurrency(), parts[1], parts[0]);
				if (!result || !Number(amount.value)) {
					node.textContent = "Visitors see this price in their local currency, with a small buffer so the converted price is not under the amount you set.";
					return;
				}
				node.textContent = result.converted
					? "A visitor in your current location would see about " + BryllaCurrency.format(result.amount, result.currency) + ", including the conversion buffer."
					: "Visitors who use " + currency.value + " see this amount exactly. Other currencies include a conversion buffer.";
			}).catch(function () {
				node.textContent = "The price is stored in " + currency.value + ".";
			});
		}
		amount.addEventListener("input", draw);
		currency.addEventListener("change", draw);
		draw();
	}

	requireStaff().then(function () {
		return ensureDraft();
	}).then(function () {
		return Promise.all([loadCourse(), loadTopics(), loadFaqs(), loadFiles()]);
	}).then(function () {
		bindUploads();
		bindTopics();
		bindFaqs();
		bindSave();
		previewPrice();
	}).catch(function (error) {
		show(error.message || "Sign in as an instructor or founder before adding a course.", true);
	});
})();
