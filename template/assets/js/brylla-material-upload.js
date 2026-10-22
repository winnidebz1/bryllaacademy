(function () {
	function formatSize(bytes) {
		if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
		if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
		return Math.max(1, Math.round(bytes / 1024)) + " KB";
	}

	function iconFor(name) {
		var ext = name.split(".").pop().toLowerCase();
		if (["mp4", "webm", "mov"].indexOf(ext) !== -1) return "isax-play-circle5";
		if (["jpg", "jpeg", "png"].indexOf(ext) !== -1) return "isax-image5";
		if (["xls", "xlsx", "csv"].indexOf(ext) !== -1) return "isax-chart-215";
		if (ext === "zip") return "isax-archive-15";
		return "isax-document-text5";
	}

	function setup(section) {
		var input = section.querySelector('input[type="file"]');
		var drop = section.querySelector(".material-drop");
		var list = section.querySelector(".material-list");
		var error = section.querySelector(".material-error");
		var maxBytes = Number(section.getAttribute("data-max-mb") || 50) * 1024 * 1024;
		var allowed = (input.getAttribute("accept") || "").split(",").map(function (item) { return item.trim().toLowerCase(); }).filter(Boolean);
		var files = [];

		// The input keeps the chosen files so a later upload step can read input.files directly.
		function sync() {
			if (typeof DataTransfer === "undefined") return;
			var transfer = new DataTransfer();
			files.forEach(function (file) { transfer.items.add(file); });
			input.files = transfer.files;
		}

		function render() {
			list.innerHTML = "";
			files.forEach(function (file, index) {
				var item = document.createElement("li");
				var icon = document.createElement("i");
				icon.className = "isax " + iconFor(file.name);
				icon.setAttribute("aria-hidden", "true");
				var name = document.createElement("span");
				name.className = "material-name";
				name.textContent = file.name;
				var size = document.createElement("span");
				size.className = "material-size";
				size.textContent = formatSize(file.size);
				var remove = document.createElement("button");
				remove.type = "button";
				remove.className = "material-remove";
				remove.textContent = "Remove";
				remove.setAttribute("aria-label", "Remove " + file.name);
				remove.addEventListener("click", function () {
					files.splice(index, 1);
					sync();
					render();
					drop.focus();
				});
				item.append(icon, name, size, remove);
				list.appendChild(item);
			});
		}

		function add(chosen) {
			var problems = [];
			var added = [];
			Array.prototype.forEach.call(chosen, function (file) {
				var ext = "." + file.name.split(".").pop().toLowerCase();
				if (allowed.length && allowed.indexOf(ext) === -1) {
					problems.push(file.name + " is not an accepted file type.");
				} else if (file.size > maxBytes) {
					problems.push(file.name + " is larger than " + formatSize(maxBytes) + ".");
				} else if (!files.some(function (kept) { return kept.name === file.name && kept.size === file.size; })) {
					if (!input.multiple) files = [];
					files.push(file);
					added.push(file);
				}
			});
			error.textContent = problems.join(" ");
			error.hidden = !problems.length;
			sync();
			render();
			if (added.length) section.dispatchEvent(new CustomEvent("brylla-files-added", { bubbles: true, detail: { files: added } }));
		}

		input.addEventListener("change", function () {
			var chosen = Array.prototype.slice.call(input.files);
			add(chosen);
		});
		drop.tabIndex = 0;
		drop.addEventListener("keydown", function (event) {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				input.click();
			}
		});
		["dragenter", "dragover"].forEach(function (type) {
			drop.addEventListener(type, function (event) {
				event.preventDefault();
				drop.classList.add("is-dragging");
			});
		});
		["dragleave", "drop"].forEach(function (type) {
			drop.addEventListener(type, function () { drop.classList.remove("is-dragging"); });
		});
		drop.addEventListener("drop", function (event) {
			event.preventDefault();
			if (event.dataTransfer && event.dataTransfer.files.length) add(event.dataTransfer.files);
		});
	}

	document.querySelectorAll(".material-upload").forEach(setup);
})();
