(function () {
	var CURRENCIES = ["GHS", "NGN", "USD", "EUR", "GBP", "CAD", "KES", "ZAR", "XOF", "INR", "AUD"];
	var DRAFT_KEY = "brylla-draft-course";
	var client = null;
	var userId = "";
	var courseId = "";
	var staffRole = "";

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
	function coursePageUrl(id) {
		return "https://bryllaacademy.vercel.app/course-details?course=" + encodeURIComponent(id);
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
			staffRole = profile.data && profile.data.role;
			if (staffRole !== "instructor" && staffRole !== "founder") throw new Error("Only an instructor or the founder can add a course.");
		});
	}

	function draftIsUsable(course) {
		if (!course || course.status !== "draft") return false;
		if (staffRole === "founder") return true;
		return course.created_by === userId;
	}

	function createDraft() {
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
			price_amount: 0
		}).then(function (created) {
			if (created.error) throw new Error(created.error.message || "The course draft could not be saved.");
			sessionStorage.setItem(DRAFT_KEY, courseId);
			return courseId;
		});
	}

	function openRequestedCourse() {
		var requested = new URLSearchParams(location.search).get("course") || "";
		if (!requested) return ensureDraft();
		return client.from("courses").select("id,created_by,status").eq("id", requested).maybeSingle().then(function (result) {
			if (result.error || !result.data) throw new Error("That course could not be opened.");
			if (staffRole !== "founder" && (result.data.created_by !== userId || result.data.status !== "draft")) throw new Error("Only the founder can edit a published course.");
			courseId = result.data.id;
			sessionStorage.removeItem(DRAFT_KEY);
			return courseId;
		});
	}

	function ensureDraft() {
		var stored = sessionStorage.getItem(DRAFT_KEY) || "";
		if (!stored) return createDraft();
		return client.from("courses").select("id,status,created_by").eq("id", stored).maybeSingle().then(function (result) {
			if (result.error) throw new Error(result.error.message || "The course draft could not be opened.");
			if (draftIsUsable(result.data)) {
				courseId = result.data.id;
				return courseId;
			}
			sessionStorage.removeItem(DRAFT_KEY);
			return createDraft();
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

	function paintShare() {
		var box = $("course-share-box");
		if (!box) return;
		box.hidden = true;
		box.textContent = "";
	}

	function renderTopics(rows) {
		var list = $("topic-list");
		var empty = $("topic-empty");
		if (!list) return;
		list.innerHTML = "";
		(rows || []).forEach(function (topic) {
			var item = document.createElement("div");
			item.className = "bg-white p-3 border rounded-3 mb-3";
			var head = document.createElement("div");
			head.className = "d-flex align-items-center justify-content-between gap-2";
			var title = document.createElement("p");
			title.className = "fw-medium mb-0";
			title.textContent = topic.title;
			var removeTopic = document.createElement("button");
			removeTopic.type = "button";
			removeTopic.className = "btn btn-light btn-sm";
			removeTopic.textContent = "Remove";
			removeTopic.addEventListener("click", function () {
				client.from("course_topics").delete().eq("id", topic.id).then(function () { loadTopics(); });
			});
			head.appendChild(title);
			head.appendChild(removeTopic);
			var modules = document.createElement("ul");
			modules.className = "list-unstyled mb-2 mt-2";
			(topic.modules || []).forEach(function (module) {
				var row = document.createElement("li");
				row.className = "d-flex align-items-center justify-content-between gap-2 border rounded-2 px-2 py-1 mb-1";
				var name = document.createElement("span");
				name.textContent = module.title;
				var removeModule = document.createElement("button");
				removeModule.type = "button";
				removeModule.className = "btn btn-light btn-sm";
				removeModule.textContent = "Remove";
				removeModule.addEventListener("click", function () {
					client.from("course_modules").delete().eq("id", module.id).then(function () { loadTopics(); });
				});
				row.appendChild(name);
				row.appendChild(removeModule);
				modules.appendChild(row);
			});
			var addModule = document.createElement("button");
			addModule.type = "button";
			addModule.className = "btn btn-sm add-edit-btn";
			addModule.textContent = "Add module";
			addModule.addEventListener("click", function () {
				var topicField = $("module-topic");
				var label = $("module-topic-label");
				if (topicField) topicField.value = topic.id;
				if (label) label.textContent = topic.title;
				formStatus("module-form-status", "");
				var modal = document.getElementById("add-module");
				if (modal && window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
			});
			item.appendChild(head);
			item.appendChild(modules);
			item.appendChild(addModule);
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
		return Promise.all([
			client.from("course_topics").select("id,title,position").eq("course_id", courseId).order("position"),
			client.from("course_modules").select("id,topic_id,title,video_url,position").eq("course_id", courseId).order("position")
		]).then(function (parts) {
			var topics = parts[0].data || [];
			var modules = parts[1].error ? [] : (parts[1].data || []);
			topics.forEach(function (topic) {
				topic.modules = modules.filter(function (module) { return module.topic_id === topic.id; });
			});
			renderTopics(topics);
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
	function renderVideoLinks(rows) {
		var list = $("video-link-list");
		if (!list) return;
		list.innerHTML = "";
		(rows || []).forEach(function (link) {
			var item = document.createElement("li");
			item.textContent = link.title;
			var remove = document.createElement("button");
			remove.type = "button";
			remove.className = "material-remove";
			remove.textContent = "Remove";
			remove.addEventListener("click", function () {
				client.from("course_video_links").delete().eq("id", link.id).then(function () { loadVideoLinks(); });
			});
			item.appendChild(remove);
			list.appendChild(item);
		});
	}
	function loadVideoLinks() {
		if (!courseId) return Promise.resolve();
		return client.from("course_video_links").select("id,title,video_url,position").eq("course_id", courseId).order("position").then(function (result) {
			renderVideoLinks(result.data || []);
		});
	}
	function nextPosition(table) {
		return client.from(table).select("position").eq("course_id", courseId).order("position", { ascending: false }).limit(1).then(function (result) {
			var row = result.data && result.data[0];
			var last = row ? Number(row.position) : 0;
			return isFinite(last) ? last + 1 : 1;
		});
	}
	function saveVideoLink(title, url) {
		return keepCourse().then(function () {
			return nextPosition("course_video_links");
		}).then(function (position) {
			return client.from("course_video_links").insert({
				course_id: courseId,
				title: title.slice(0, 160),
				video_url: url.slice(0, 500),
				position: position
			});
		}).then(function (saved) {
			if (saved.error) throw new Error(saved.error.message || "The video link could not be saved.");
			return loadVideoLinks();
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
			paintShare();
			var editor = document.querySelector(".note-editable");
			if (editor && course.description) editor.innerText = course.description;
		});
	}

	function safeName(name) {
		return String(name || "file").split(/[/\\]/).pop().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
	}

	function uploadFiles(files, kind) {
		return keepCourse().then(function () {
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

	function formStatus(id, message, isError) {
		var node = $(id);
		if (!node) return;
		node.textContent = message || "";
		node.style.color = isError ? "#a12622" : "#078d87";
	}
	function hideModal(id) {
		var modalEl = document.getElementById(id);
		if (modalEl && window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
	}
	function bindTopics() {
		var form = $("topic-form");
		if (!form || form.dataset.bound) return;
		form.dataset.bound = "1";
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			var title = $("topic-name").value.trim();
			if (!title) return;
			if (!client) {
				formStatus("topic-form-status", "Sign in as an instructor or founder to save a topic.", true);
				return;
			}
			formStatus("topic-form-status", "Saving topic…");
			keepCourse().then(function () {
				return nextPosition("course_topics");
			}).then(function (position) {
				return client.from("course_topics").insert({ course_id: courseId, title: title.slice(0, 160), position: position });
			}).then(function (saved) {
				if (saved.error) throw new Error(saved.error.message || "The topic could not be saved.");
				form.reset();
				formStatus("topic-form-status", "");
				hideModal("add-topic");
				return loadTopics();
			}).catch(function (error) {
				formStatus("topic-form-status", error.message || "The topic could not be saved.", true);
			});
		});
	}

	function bindModules() {
		var form = $("module-form");
		if (!form || form.dataset.bound) return;
		form.dataset.bound = "1";
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			var title = $("module-name").value.trim();
			var url = $("module-url").value.trim();
			var topicId = $("module-topic").value;
			if (!title || !topicId) return;
			if (url && !/^https?:\/\//i.test(url)) {
				formStatus("module-form-status", "The video link needs to start with http:// or https://.", true);
				return;
			}
			if (!client) {
				formStatus("module-form-status", "Sign in as an instructor or founder to save a module.", true);
				return;
			}
			formStatus("module-form-status", "Saving module…");
			keepCourse().then(function () {
				return client.from("course_modules").select("position").eq("topic_id", topicId).order("position", { ascending: false }).limit(1);
			}).then(function (result) {
				if (result.error) throw new Error(result.error.message || "The module could not be saved.");
				var last = result.data && result.data[0] ? Number(result.data[0].position) : 0;
				return client.from("course_modules").insert({
					course_id: courseId,
					topic_id: topicId,
					title: title.slice(0, 160),
					video_url: url.slice(0, 500),
					position: isFinite(last) ? last + 1 : 1
				});
			}).then(function (saved) {
				if (saved.error) throw new Error(saved.error.message || "The module could not be saved.");
				form.reset();
				formStatus("module-form-status", "");
				hideModal("add-module");
				return loadTopics();
			}).catch(function (error) {
				formStatus("module-form-status", error.message || "The module could not be saved.", true);
			});
		});
	}

	function bindFaqs() {
		var form = $("faq-form");
		if (!form || form.dataset.bound) return;
		form.dataset.bound = "1";
		form.addEventListener("submit", function (event) {
			event.preventDefault();
			var question = $("faq-question").value.trim();
			var answer = $("faq-answer").value.trim();
			if (!question || !answer) return;
			if (!client) {
				formStatus("faq-form-status", "Sign in as an instructor or founder to save a question.", true);
				return;
			}
			var enabled = $("flexRadioDefault6") ? $("flexRadioDefault6").checked : true;
			formStatus("faq-form-status", "Saving question…");
			keepCourse().then(function () {
				return nextPosition("course_faqs");
			}).then(function (position) {
				return client.from("course_faqs").insert({
					course_id: courseId,
					question: question.slice(0, 200),
					answer: answer.slice(0, 2000),
					enabled: enabled,
					position: position
				});
			}).then(function (saved) {
				if (saved.error) throw new Error(saved.error.message || "The question could not be saved.");
				form.reset();
				formStatus("faq-form-status", "");
				hideModal("add-faq");
				return loadFaqs();
			}).catch(function (error) {
				formStatus("faq-form-status", error.message || "The question could not be saved.", true);
			});
		});
	}
	function bindVideoLinks() {
		var form = $("video-link-form");
		if (form && !form.dataset.bound) {
			form.dataset.bound = "1";
			form.addEventListener("submit", function (event) {
				event.preventDefault();
				var title = $("video-link-title").value.trim();
				var url = $("video-link-url").value.trim();
				if (!title || !url) return;
				if (!client) {
					formStatus("video-link-status", "Sign in as an instructor or founder to save a video link.", true);
					return;
				}
				formStatus("video-link-status", "Saving video link…");
				saveVideoLink(title, url).then(function () {
					form.reset();
					formStatus("video-link-status", "Saved. This lesson plays from the link on the course page.");
				}).catch(function (error) {
					formStatus("video-link-status", error.message || "The video link could not be saved.", true);
				});
			});
		}
		var lesson = $("lesson-form");
		if (lesson && !lesson.dataset.bound) {
			lesson.dataset.bound = "1";
			lesson.addEventListener("submit", function (event) {
				event.preventDefault();
				var title = lesson.querySelector("input[type=text]").value.trim();
				var url = $("lesson-video-link").value.trim();
				if (!title) return;
				if (!url) {
					formStatus("course-save-status", "Add a video link for this lesson.", true);
					return;
				}
				saveVideoLink(title, url).then(function () {
					lesson.reset();
					hideModal("add-lesson");
					show("Lesson video link saved.");
				}).catch(function (error) { show(error.message, true); });
			});
		}
	}

	function keepCourse() {
		if (courseId) return Promise.resolve(courseId);
		return ensureDraft();
	}

	function bindSave() {
		["course-title", "course-level", "course-visibility", "course-short", "course-intro", "course-currency", "course-price"].forEach(function (id) {
			var node = $(id);
			if (!node) return;
			node.addEventListener("change", function () {
				keepCourse().then(saveFields).then(function () { paintShare(); }).catch(function (error) { show(error.message, true); });
			});
		});
		var submit = $("course-submit");
		if (!submit) return;
		submit.addEventListener("click", function (event) {
			event.preventDefault();
			show("Submitting the course for approval…");
			keepCourse().then(saveFields).then(function () {
				return client.rpc("submit_course", { p_course: courseId });
			}).then(function (result) {
				if (result.error) throw new Error(result.error.message || "The course could not be submitted.");
				var note = $("course-share-note");
				var privateLink = field("course-visibility") === "Private" && result.data ? shareUrl(result.data) : "";
				if (note) {
					if (privateLink) {
						note.hidden = false;
						note.textContent = "";
						note.appendChild(document.createTextNode("Private link: "));
						var link = document.createElement("a");
						link.href = privateLink;
						link.textContent = privateLink;
						note.appendChild(link);
					} else {
						note.hidden = true;
						note.textContent = "";
					}
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

	bindTopics();
	bindModules();
	bindFaqs();
	bindVideoLinks();

	requireStaff().then(function () {
		return openRequestedCourse();
	}).then(function () {
		return Promise.all([loadCourse(), loadTopics(), loadFaqs(), loadFiles(), loadVideoLinks()]);
	}).then(function () {
		bindUploads();
		bindSave();
		previewPrice();
	}).catch(function (error) {
		show(error.message || "Sign in as an instructor or founder before adding a course.", true);
	});
})();
