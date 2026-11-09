(function () {
	var CURRENCIES = ["GHS", "NGN", "USD", "EUR", "GBP", "CAD", "KES", "ZAR", "XOF", "INR", "AUD"];
	var DRAFT_KEY = "brylla-draft-course";
	var client = null;
	var userId = "";
	var courseId = "";
	var staffRole = "";
	var listingReady = false;
	var descriptionReady = false;
	var loadedDescription = "";
	var topicRows = [];
	var fileRows = [];

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

	function dashboardHref() {
		var fromAdmin = new URLSearchParams(location.search).get("from") === "admin";
		return fromAdmin || staffRole === "founder" ? "admin-dashboard.html" : "instructor-dashboard.html";
	}
	function pointDashboardLinks() {
		["course-return-link", "course-dashboard-link"].forEach(function (id) {
			var link = $(id);
			if (link) link.setAttribute("href", dashboardHref());
		});
	}

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
			pointDashboardLinks();
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

	function minorAmount(id) {
		var text = field(id);
		if (text === "") return null;
		var amount = Number(text);
		if (!isFinite(amount) || amount < 0) amount = 0;
		return Math.round(amount * 100);
	}
	function highlightLines() {
		return [1, 2, 3].map(function (number) {
			return field("course-highlight-" + number).slice(0, 160);
		}).filter(Boolean);
	}
	function plainDescription() {
		if (window.jQuery) {
			var box = jQuery(".summernote");
			if (box.length && box.data("summernote")) {
				var holder = document.createElement("div");
				holder.innerHTML = box.summernote("code") || "";
				return (holder.innerText || "").replace(/\u00a0/g, " ").trim();
			}
		}
		var editor = document.querySelector(".note-editable");
		return editor ? editor.innerText.trim() : "";
	}
	function writeDescription(text) {
		var safe = text || "";
		function html() {
			return safe.split(/\n{2,}/).map(function (part) {
				return "<p>" + part.replace(/[&<>]/g, function (ch) {
					return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;";
				}).replace(/\n/g, "<br>") + "</p>";
			}).join("");
		}
		function apply() {
			if (window.jQuery) {
				var box = jQuery(".summernote");
				if (box.length && box.data("summernote")) {
					box.summernote("code", safe ? html() : "");
					descriptionReady = true;
					return true;
				}
			}
			var editor = document.querySelector(".note-editable");
			if (editor) {
				editor.innerText = safe;
				descriptionReady = true;
				return true;
			}
			return false;
		}
		if (apply()) return;
		var tries = 0;
		var timer = window.setInterval(function () {
			tries += 1;
			if (apply() || tries > 30) window.clearInterval(timer);
		}, 100);
	}
	function saveFields() {
		if (!courseId) return Promise.resolve();
		var payload = {
			title: field("course-title") || "Untitled course",
			level: field("course-level") === "Select" ? "" : field("course-level"),
			visibility: field("course-visibility") === "Private" ? "private" : "public",
			short_description: field("course-short").slice(0, 300),
			intro_video_url: field("course-intro").slice(0, 400),
			currency: field("course-currency") || "GHS"
		};
		var priceText = field("course-price");
		if (priceText !== "") {
			var amount = Number(priceText);
			if (!isFinite(amount) || amount < 0) amount = 0;
			payload.price_amount = amount;
			payload.price_minor = Math.round(amount * 100);
		}
		if (descriptionReady || loadedDescription) {
			var nextDescription = descriptionReady ? plainDescription() : loadedDescription;
			if (!nextDescription && loadedDescription) nextDescription = loadedDescription;
			payload.description = nextDescription.slice(0, 4000);
		}
		if (listingReady) {
			payload.highlights = highlightLines();
			payload.includes_note = field("course-includes").slice(0, 300);
			payload.fee_note = field("course-fee-note").slice(0, 400);
			payload.duration_note = field("course-duration").slice(0, 160);
			payload.cohort_label = field("course-cohort").slice(0, 80);
			var registration = minorAmount("course-registration-fee");
			var enrolment = minorAmount("course-enrolment-fee");
			payload.registration_fee_minor = registration == null ? 0 : registration;
			payload.enrolment_fee_minor = enrolment == null ? 0 : enrolment;
		}
		return client.from("courses").update(payload).eq("id", courseId).then(function (saved) {
			if (saved.error) throw new Error(saved.error.message || "The course could not be saved.");
		});
	}

	function paintShare() {
		var box = $("course-share-box");
		if (!box) return;
		box.hidden = true;
		box.textContent = "";
	}

	function savedFileList(module, kind) {
		var saved = document.createElement("ul");
		saved.className = "material-list";
		(fileRows || []).filter(function (file) { return file.module_id === module.id && file.kind === kind; }).forEach(function (file) {
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
			saved.appendChild(item);
		});
		return saved;
	}
	function mediaSection(module, kind, label, hint, accept, maxMb) {
		var section = document.createElement("section");
		section.className = "material-upload mt-3";
		section.setAttribute("data-kind", kind);
		section.setAttribute("data-module-id", module.id);
		section.setAttribute("data-max-mb", String(maxMb));
		var heading = document.createElement("h6");
		heading.className = "mb-1";
		heading.textContent = label;
		var note = document.createElement("p");
		note.className = "material-hint";
		note.textContent = hint;
		var inputId = "module-" + kind + "-" + module.id;
		var drop = document.createElement("label");
		drop.className = "material-drop";
		drop.htmlFor = inputId;
		drop.innerHTML = kind === "video"
			? '<i class="isax isax-play-circle5" aria-hidden="true"></i><span>Choose videos or drag them here</span>'
			: '<i class="isax isax-document-upload5" aria-hidden="true"></i><span>Choose files or drag them here</span>';
		var input = document.createElement("input");
		input.className = "visually-hidden";
		input.type = "file";
		input.id = inputId;
		input.accept = accept;
		input.multiple = true;
		var error = document.createElement("p");
		error.className = "material-error";
		error.hidden = true;
		error.setAttribute("role", "alert");
		var pending = document.createElement("ul");
		pending.className = "material-list";
		pending.setAttribute("aria-live", "polite");
		section.append(heading, note, drop, input, error, pending, savedFileList(module, kind));
		if (window.BryllaMaterialUpload) BryllaMaterialUpload.setup(section);
		return section;
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
			var modules = document.createElement("div");
			modules.className = "mb-2 mt-2";
			(topic.modules || []).forEach(function (module) {
				var row = document.createElement("div");
				row.className = "border rounded-2 p-3 mb-2";
				var bar = document.createElement("div");
				bar.className = "d-flex align-items-center justify-content-between gap-2";
				var name = document.createElement("strong");
				name.textContent = module.title;
				var removeModule = document.createElement("button");
				removeModule.type = "button";
				removeModule.className = "btn btn-light btn-sm";
				removeModule.textContent = "Remove";
				removeModule.addEventListener("click", function () {
					client.from("course_modules").delete().eq("id", module.id).then(function () { loadTopics(); });
				});
				bar.append(name, removeModule);
				var media = document.createElement("div");
				media.className = "mt-3";
				var mediaTitle = document.createElement("p");
				mediaTitle.className = "fw-medium mb-2";
				mediaTitle.textContent = "Course media";
				var linkLabel = document.createElement("label");
				linkLabel.className = "form-label";
				linkLabel.textContent = "Video link";
				var linkHelp = document.createElement("p");
				linkHelp.className = "text-muted mb-2";
				linkHelp.textContent = "A Google Drive video has to be shared as Anyone with the link. A private Drive file stays blank on the student page.";
				var linkInput = document.createElement("input");
				linkInput.type = "url";
				linkInput.className = "form-control mb-2";
				linkInput.maxLength = 500;
				linkInput.placeholder = "https://";
				linkInput.value = module.video_url || "";
				var linkSave = document.createElement("button");
				linkSave.type = "button";
				linkSave.className = "btn btn-secondary btn-sm";
				linkSave.textContent = "Save video link";
				var linkStatus = document.createElement("p");
				linkStatus.className = "mt-2 mb-0";
				linkStatus.setAttribute("role", "status");
				var lengthNote = document.createElement("p");
				lengthNote.className = "text-muted mb-0";
				lengthNote.textContent = module.duration_seconds ? "Video length " + formatLength(module.duration_seconds) : "";
				linkSave.addEventListener("click", function () {
					var url = linkInput.value.trim();
					if (url && !/^https?:\/\//i.test(url)) {
						linkStatus.textContent = "The video link needs to start with http:// or https://.";
						linkStatus.style.color = "#a12622";
						return;
					}
					linkStatus.textContent = "Saving video link…";
					linkStatus.style.color = "#078d87";
					client.from("course_modules").update({ video_url: url.slice(0, 500) }).eq("id", module.id).then(function (saved) {
						if (saved.error) throw new Error(saved.error.message || "The video link could not be saved.");
						module.video_url = url.slice(0, 500);
						return client.from("course_video_links").update({ video_url: url.slice(0, 500) }).eq("course_id", courseId).ilike("title", module.title);
						linkStatus.textContent = /drive\.google\.com/i.test(url)
							? "Saved. Share that Drive file as Anyone with the link, or students see a blank player."
							: "Saved. Students play this on the lesson page.";
					}).catch(function (error) {
						linkStatus.textContent = error.message || "The video link could not be saved.";
						linkStatus.style.color = "#a12622";
					});
				});
				media.append(
					mediaTitle,
					linkLabel,
					linkHelp,
					linkInput,
					linkSave,
					linkStatus,
					lengthNote,
					mediaSection(module, "video", "Course videos", "Lesson recordings and demos. MP4, WebM or MOV, up to 500 MB each.", ".mp4,.webm,.mov", 500),
					mediaSection(module, "material", "Course materials", "Slides, workbooks, and spreadsheets. PDF, Word, PowerPoint, Excel, CSV or ZIP, up to 50 MB each.", ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.zip", 50),
					mediaSection(module, "study", "Study materials", "Reading and practice sheets. PDF, Word, EPUB, TXT, JPG or PNG, up to 50 MB each.", ".pdf,.doc,.docx,.epub,.txt,.jpg,.jpeg,.png", 50)
				);
				row.append(bar, media);
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
			item.append(head, modules, addModule);
			list.appendChild(item);
		});
		var loose = (fileRows || []).filter(function (file) { return !file.module_id && file.kind !== "thumbnail"; });
		if (loose.length) {
			var box = document.createElement("div");
			box.className = "border rounded-3 p-3 mb-3";
			var looseTitle = document.createElement("p");
			looseTitle.className = "fw-medium mb-2";
			looseTitle.textContent = "Videos and files not attached to a module yet";
			var looseList = document.createElement("ul");
			looseList.className = "mb-0";
			loose.forEach(function (file) {
				var item = document.createElement("li");
				item.textContent = file.file_name;
				looseList.appendChild(item);
			});
			box.append(looseTitle, looseList);
			list.appendChild(box);
		}
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

	function loadTopics() {
		return Promise.all([
			client.from("course_topics").select("id,title,position").eq("course_id", courseId).order("position"),
			client.from("course_modules").select("id,topic_id,title,video_url,duration_seconds,position").eq("course_id", courseId).order("position")
		]).then(function (parts) {
			var topics = parts[0].data || [];
			var modules = parts[1].error ? [] : (parts[1].data || []);
			topics.forEach(function (topic) {
				topic.modules = modules.filter(function (module) { return module.topic_id === topic.id; });
			});
			topicRows = topics;
			renderTopics(topicRows);
		});
	}
	function ensureGettingStarted() {
		if (courseId !== "bookkeeping") return Promise.resolve();
		var wanted = ["Welcome to Brylla Academy", "How to use the learning platform"];
		var topic = (topicRows || []).filter(function (row) {
			return String(row.title || "").trim().toLowerCase() === "getting started";
		})[0];
		var makeTopic = topic
			? Promise.resolve(topic)
			: client.from("course_topics").insert({ course_id: courseId, title: "Getting started", position: 0 }).select("id,title,position").maybeSingle().then(function (saved) {
				if (saved.error) throw new Error(saved.error.message || "Getting started could not be added.");
				return saved.data;
			});
		return makeTopic.then(function (row) {
			if (!row || !row.id) return;
			var existing = {};
			(row.modules || (topicRows.filter(function (item) { return item.id === row.id; })[0] || {}).modules || []).forEach(function (module) {
				existing[String(module.title || "").trim().toLowerCase()] = true;
			});
			var missing = wanted.filter(function (title) { return !existing[title.toLowerCase()]; });
			if (!missing.length) return;
			return client.from("course_modules").select("position").eq("topic_id", row.id).order("position", { ascending: false }).limit(1).then(function (result) {
				var last = result.data && result.data[0] ? Number(result.data[0].position) : 0;
				if (!isFinite(last)) last = 0;
				return missing.reduce(function (chain, title, index) {
					return chain.then(function () {
						return client.from("course_modules").insert({
							course_id: courseId,
							topic_id: row.id,
							title: title,
							video_url: "",
							position: last + index + 1
						});
					});
				}, Promise.resolve());
			});
		}).then(function () {
			return loadTopics();
		}).catch(function () {
			return loadTopics();
		});
	}
	function loadFaqs() {
		return client.from("course_faqs").select("id,question,answer").eq("course_id", courseId).order("position").then(function (result) {
			renderFaqs(result.data || []);
		});
	}
	function formatLength(seconds) {
		var total = Math.round(Number(seconds) || 0);
		if (!total || !isFinite(total)) return "";
		var hours = Math.floor(total / 3600);
		var minutes = Math.floor((total % 3600) / 60);
		var secs = total % 60;
		function pad(value) { return (value < 10 ? "0" : "") + value; }
		if (hours) return hours + ":" + pad(minutes) + ":" + pad(secs);
		return minutes + ":" + pad(secs);
	}
	function measureUrl(url) {
		return new Promise(function (resolve) {
			var video = document.createElement("video");
			video.preload = "metadata";
			video.onloadedmetadata = function () {
				var seconds = Math.round(video.duration);
				video.removeAttribute("src");
				video.load();
				resolve(seconds > 0 && isFinite(seconds) ? seconds : 0);
			};
			video.onerror = function () { resolve(0); };
			video.src = url;
		});
	}
	function rememberDurations() {
		var pending = (fileRows || []).filter(function (file) {
			if (file.kind !== "video" || !file.module_id || !file.storage_path) return false;
			var known = false;
			topicRows.forEach(function (topic) {
				(topic.modules || []).forEach(function (module) {
					if (module.id === file.module_id && module.duration_seconds) known = true;
				});
			});
			return !known;
		});
		if (!pending.length) return Promise.resolve();
		return client.storage.from("course-media").createSignedUrls(pending.map(function (file) { return file.storage_path; }), 600).then(function (signed) {
			return Promise.all((signed.data || []).map(function (row, index) {
				if (!row || !row.signedUrl) return null;
				return measureUrl(row.signedUrl).then(function (seconds) {
					if (!seconds) return null;
					return client.from("course_modules").update({ duration_seconds: seconds }).eq("id", pending[index].module_id);
				});
			}));
		}).then(function () { return loadTopics(); }).catch(function () {});
	}
	function loadFiles() {
		return client.from("course_files").select("id,module_id,kind,file_name,storage_path").eq("course_id", courseId).order("created_at").then(function (result) {
			fileRows = result.error ? [] : (result.data || []);
			if (topicRows.length) renderTopics(topicRows);
			return rememberDurations();
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

	function majorAmount(minor) {
		if (minor == null || minor === "") return "";
		var amount = Number(minor) / 100;
		return isFinite(amount) ? String(amount) : "";
	}
	function applyCourse(course) {
		if (!course) return;
		if ($("course-title") && course.title !== "Untitled course") $("course-title").value = course.title;
		if ($("course-level") && course.level) $("course-level").value = course.level;
		if ($("course-visibility")) $("course-visibility").value = course.visibility === "private" ? "Private" : "Public";
		if ($("course-short")) $("course-short").value = course.short_description || "";
		if ($("course-intro")) $("course-intro").value = course.intro_video_url || "";
		if ($("course-currency")) $("course-currency").value = course.currency || "GHS";
		if ($("course-price") && course.price_amount != null) $("course-price").value = course.price_amount;
		if ($("course-registration-fee")) $("course-registration-fee").value = majorAmount(course.registration_fee_minor);
		if ($("course-enrolment-fee")) $("course-enrolment-fee").value = majorAmount(course.enrolment_fee_minor);
		if ($("course-includes")) $("course-includes").value = course.includes_note || "";
		if ($("course-fee-note")) $("course-fee-note").value = course.fee_note || "";
		if ($("course-duration")) $("course-duration").value = course.duration_note || "";
		if ($("course-cohort")) $("course-cohort").value = course.cohort_label || "";
		var highlights = Array.isArray(course.highlights) ? course.highlights : [];
		[1, 2, 3].forEach(function (number) {
			var input = $("course-highlight-" + number);
			if (input) input.value = highlights[number - 1] || "";
		});
		loadedDescription = course.description || "";
		writeDescription(loadedDescription);
		if (window.jQuery) {
			["course-level", "course-visibility"].forEach(function (id) {
				var box = jQuery("#" + id);
				if (box.length && box.data("select2")) box.trigger("change.select2");
			});
		}
		paintShare();
	}
	function loadCourse() {
		var listing = "title,level,visibility,short_description,description,intro_video_url,currency,price_amount,share_code,approval_status,highlights,includes_note,fee_note,duration_note,cohort_label,registration_fee_minor,enrolment_fee_minor";
		return client.from("courses").select(listing).eq("id", courseId).maybeSingle().then(function (result) {
			if (result.error) {
				return client.from("courses").select("title,level,visibility,short_description,description,intro_video_url,currency,price_amount,share_code,approval_status").eq("id", courseId).maybeSingle();
			}
			listingReady = true;
			return result;
		}).then(function (result) {
			if (result.error) throw new Error(result.error.message || "The course could not be opened.");
			applyCourse(result.data);
		});
	}

	function safeName(name) {
		return String(name || "file").split(/[/\\]/).pop().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
	}

	function measureDuration(file) {
		return new Promise(function (resolve) {
			var url = URL.createObjectURL(file);
			var video = document.createElement("video");
			function finish(seconds) {
				URL.revokeObjectURL(url);
				resolve(seconds);
			}
			video.preload = "metadata";
			video.onloadedmetadata = function () {
				var seconds = Math.round(video.duration);
				finish(seconds > 0 && isFinite(seconds) ? seconds : 0);
			};
			video.onerror = function () { finish(0); };
			video.src = url;
		});
	}
	function uploadFiles(files, kind, moduleId) {
		return keepCourse().then(function () {
			return files.reduce(function (chain, file) {
				return chain.then(function () {
					var path = userId + "/" + courseId + "/" + Date.now() + "-" + safeName(file.name);
					var measured = kind === "video" ? measureDuration(file) : Promise.resolve(0);
					return measured.then(function (seconds) {
						return client.storage.from("course-media").upload(path, file, { upsert: false }).then(function (uploaded) {
							if (uploaded.error) throw new Error(file.name + " could not be uploaded.");
							var row = {
								course_id: courseId,
								user_id: userId,
								kind: kind,
								storage_path: path,
								file_name: file.name.slice(0, 180),
								content_type: file.type || "application/octet-stream",
								size_bytes: file.size
							};
							if (moduleId) row.module_id = moduleId;
							return client.from("course_files").insert(row).then(function (saved) {
								if (saved.error) {
									return client.storage.from("course-media").remove([path]).then(function () {
										throw new Error(file.name + " could not be saved on this module.");
									});
								}
								if (kind === "video" && moduleId && seconds) {
									return client.from("course_modules").update({ duration_seconds: seconds }).eq("id", moduleId).then(function () {
										topicRows.forEach(function (topic) {
											(topic.modules || []).forEach(function (module) {
												if (module.id === moduleId) module.duration_seconds = seconds;
											});
										});
									});
								}
							});
						});
					});
				});
			}, Promise.resolve());
		}).then(function () {
			show("Files saved. Students can play them from this module.");
			return loadFiles();
		}).catch(function (error) {
			show(error.message || "A file could not be saved.", true);
		});
	}

	function bindUploads() {
		document.addEventListener("brylla-files-added", function (event) {
			var section = event.target;
			var input = section.querySelector && section.querySelector("input[type=file]");
			var id = input ? input.id : "";
			var kind = section.getAttribute && section.getAttribute("data-kind");
			if (!kind) kind = id === "course-videos" || id === "lesson-video-file" ? "video" : id === "study-materials" ? "study" : id === "upload-img-input" ? "thumbnail" : "material";
			var moduleId = section.getAttribute ? section.getAttribute("data-module-id") : "";
			var files = event.detail && event.detail.files ? event.detail.files : [];
			if (files.length) uploadFiles(files, kind, moduleId);
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
		["course-title", "course-level", "course-visibility", "course-short", "course-intro", "course-currency", "course-price", "course-registration-fee", "course-enrolment-fee", "course-includes", "course-fee-note", "course-duration", "course-cohort", "course-highlight-1", "course-highlight-2", "course-highlight-3"].forEach(function (id) {
			var node = $(id);
			if (!node) return;
			node.addEventListener("change", function () {
				keepCourse().then(saveFields).then(function () { paintShare(); }).catch(function (error) { show(error.message, true); });
			});
		});
		if (window.jQuery && jQuery(".summernote").data("summernote")) {
			jQuery(".summernote").on("summernote.change", function () {
				descriptionReady = true;
				keepCourse().then(saveFields).then(function () { paintShare(); }).catch(function (error) { show(error.message, true); });
			});
		}
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
		if (!node) return;
		node.textContent = "Prices on the site are shown in Ghana cedis.";
	}

	pointDashboardLinks();
	bindTopics();
	bindModules();
	bindFaqs();
	bindVideoLinks();

	requireStaff().then(function () {
		return openRequestedCourse();
	}).then(function () {
		return Promise.all([loadCourse(), loadTopics(), loadFaqs(), loadFiles(), loadVideoLinks()]).then(function () {
			return ensureGettingStarted();
		});
	}).then(function () {
		bindUploads();
		bindSave();
		previewPrice();
	}).catch(function (error) {
		show(error.message || "Sign in as an instructor or founder before adding a course.", true);
	});
})();
