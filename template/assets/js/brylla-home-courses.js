(function () {
	var grid = document.querySelector(".course-grid");
	var client = window.BryllaPublic && BryllaPublic.client ? BryllaPublic.client() : null;
	if (!grid || !client) return;

	function node(tag, className, text) {
		var element = document.createElement(tag);
		if (className) element.className = className;
		if (text) element.textContent = text;
		return element;
	}
	function meta(iconClass, text) {
		var row = node("p", "course-meta");
		var icon = document.createElement("i");
		icon.className = iconClass;
		icon.setAttribute("aria-hidden", "true");
		row.appendChild(icon);
		row.appendChild(node("span", "", text));
		return row;
	}
	function putText(root, name, value) {
		var target = root.querySelector('[data-listing="' + name + '"]');
		if (!target || value == null || String(value).trim() === "") return;
		target.textContent = String(value);
	}
	function putPrice(root, name, amount, currency) {
		var target = root.querySelector('[data-listing="' + name + '"]');
		if (!target || amount == null || amount === "") return;
		var number = Number(amount);
		if (!isFinite(number)) return;
		target.setAttribute("data-price-amount", String(number));
		target.setAttribute("data-price-currency", currency || "GHS");
		target.textContent = "GHS " + number;
	}
	function fillBookkeeping(course) {
		var article = document.getElementById("bookkeeping");
		if (!article || !course) return;
		putText(article, "title", course.title);
		putText(article, "summary", course.summary);
		putText(article, "includes", course.includes_note);
		putText(article, "fee-note", course.fee_note);
		putText(article, "duration", course.duration_note);
		putText(article, "cohort", course.cohort_label);
		putPrice(article, "price", course.price_amount, course.currency);
		putPrice(article, "registration", course.registration_fee, course.currency);
		putPrice(article, "enrolment", course.enrolment_fee, course.currency);
		var highlights = Array.isArray(course.highlights) ? course.highlights.filter(Boolean).slice(0, 3) : [];
		var list = article.querySelector('[data-listing="highlights"]');
		if (list && highlights.length) {
			list.innerHTML = "";
			highlights.forEach(function (item) {
				var row = document.createElement("li");
				var icon = document.createElement("i");
				icon.className = "fa-solid fa-check";
				icon.setAttribute("aria-hidden", "true");
				row.appendChild(icon);
				row.appendChild(node("span", "", item));
				list.appendChild(row);
			});
		}
	}

	function card(course) {
		var article = node("article", "course-card featured-course");
		article.id = course.id;
		var details = node("div", "featured-course-details");
		var heading = node("div", "featured-course-heading");
		heading.appendChild(node("p", "tuition-label", "Open Now"));
		var title = node("h3", "", course.title || "Course");
		title.id = course.id + "-title";
		article.setAttribute("aria-labelledby", title.id);
		heading.appendChild(title);
		details.appendChild(heading);
		if (course.summary) details.appendChild(node("p", "featured-course-copy", course.summary));
		var bullets = Array.isArray(course.bullets) ? course.bullets.filter(Boolean).slice(0, 3) : [];
		if (bullets.length) {
			var list = node("ul", "course-list");
			bullets.forEach(function (item) {
				var row = document.createElement("li");
				var icon = document.createElement("i");
				icon.className = "fa-solid fa-check";
				icon.setAttribute("aria-hidden", "true");
				row.appendChild(icon);
				row.appendChild(node("span", "", item));
				list.appendChild(row);
			});
			details.appendChild(list);
		}
		var side = node("div", "featured-course-enrollment");
		side.setAttribute("aria-label", (course.title || "Course") + " fee");
		side.appendChild(node("p", "tuition-label", "Total course fee"));
		var price = node("p", "course-price", "GHS " + (course.price_amount || 0));
		price.setAttribute("data-price-amount", String(course.price_amount || 0));
		price.setAttribute("data-price-currency", course.currency || "GHS");
		side.appendChild(price);
		var registration = Number(course.registration_fee);
		var enrolment = Number(course.enrolment_fee);
		if (registration > 0 || enrolment > 0) {
			var fees = node("ul", "fee-list");
			[["Registration fee", registration], ["Course fee", enrolment]].forEach(function (pair) {
				var row = document.createElement("li");
				row.appendChild(node("span", "", pair[0]));
				var amount = node("strong", "", "GHS " + (pair[1] || 0));
				amount.setAttribute("data-price-amount", String(pair[1] || 0));
				amount.setAttribute("data-price-currency", course.currency || "GHS");
				row.appendChild(amount);
				fees.appendChild(row);
			});
			side.appendChild(fees);
		}
		if (course.includes_note) side.appendChild(meta("fa-solid fa-check", course.includes_note));
		if (course.fee_note) side.appendChild(node("p", "fee-note", course.fee_note));
		if (course.duration_note) side.appendChild(meta("fa-regular fa-clock", course.duration_note));
		if (course.cohort_label) side.appendChild(meta("fa-regular fa-calendar", "Next cohort starts " + course.cohort_label));
		var view = node("a", "btn btn-brand enroll-button", "View course");
		view.href = "course-details?course=" + encodeURIComponent(course.id);
		side.appendChild(view);
		article.appendChild(details);
		article.appendChild(side);
		return article;
	}

	client.rpc("public_course_listing", { p_course: "bookkeeping" }).then(function (result) {
		if (result.error || !result.data) return;
		fillBookkeeping(result.data);
	});

	client.rpc("public_open_courses").then(function (result) {
		var courses = Array.isArray(result.data) ? result.data : [];
		var group = document.querySelector(".coming-soon-group");
		courses.forEach(function (course) {
			if (!course || !course.id || course.id === "bookkeeping") return;
			var coming = document.getElementById(course.id);
			if (coming && coming.classList.contains("coming-card")) coming.remove();
			document.querySelectorAll('.menu-drop a[href="#' + course.id + '"]').forEach(function (link) {
				link.textContent = course.title || link.textContent.replace(/\s+—\s+Coming Soon$/, "");
			});
			if (document.getElementById(course.id)) return;
			var featured = card(course);
			if (group && group.parentElement === grid) grid.insertBefore(featured, group);
			else grid.appendChild(featured);
		});
		if (group && !group.querySelector(".coming-card")) group.hidden = true;
	});
})();
