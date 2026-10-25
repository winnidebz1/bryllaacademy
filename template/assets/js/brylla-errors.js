(function () {
	var path = location.pathname || "";
	if (/\/(?:error-404|error-500|404|500)(?:\.html)?$/.test(path)) return;

	var sent = false;

	function showServerError() {
		if (sent) return;
		sent = true;
		var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
		location.replace(local ? "/error-500.html" : "/error-500");
	}

	function isThisPage(file) {
		if (!file || file.indexOf(location.origin) !== 0) return false;
		var reported = file.split("#")[0].split("?")[0];
		var page = location.href.split("#")[0].split("?")[0];
		return reported === page;
	}

	window.addEventListener("error", function (event) {
		var message = event.message || "";
		if (message === "Script error." || /ResizeObserver loop/.test(message)) return;

		var target = event.target;
		if (target && target.tagName === "SCRIPT") {
			var src = target.src || "";
			if (src.indexOf("/assets/js/brylla-") !== -1) showServerError();
			return;
		}
		if (target && target !== window && target.tagName) return;

		var file = event.filename || "";
		if (file.indexOf("/assets/js/brylla-") !== -1 || isThisPage(file)) showServerError();
	}, true);
})();
