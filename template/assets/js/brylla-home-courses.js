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
		var price = node("p", "course-price", (course.currency || "GHS") + " " + (course.price_amount || 0));
		price.setAttribute("data-price-amount", String(course.price_amount || 0));
		price.setAttribute("data-price-currency", course.currency || "GHS");
		side.appendChild(price);
		var view = node("a", "btn btn-brand enroll-button", "View course");
		view.href = "course-details?course=" + encodeURIComponent(course.id);
		side.appendChild(view);
		article.appendChild(details);
		article.appendChild(side);
		return article;
	}

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
		if (window.BryllaCurrency && BryllaCurrency.paint) BryllaCurrency.paint();
	});
})();
