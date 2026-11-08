(function () {
	var TEMPLATE = "assets/img/certificates/brylla-certificate.jpg";
	var TEAL = "#059ea7";
	var NAVY = "#1d3557";

	function blendOut(ctx, box) {
		var x = Math.max(1, Math.floor(box.x));
		var y = Math.max(0, Math.floor(box.y));
		var w = Math.min(ctx.canvas.width - x - 1, Math.ceil(box.w));
		var h = Math.min(ctx.canvas.height - y, Math.ceil(box.h));
		if (w < 2 || h < 2) return;
		var left = ctx.getImageData(x - 1, y, 1, h);
		var right = ctx.getImageData(x + w, y, 1, h);
		var patch = ctx.createImageData(w, h);
		var row;
		for (row = 0; row < h; row++) {
			var li = row * 4;
			var lr = left.data[li];
			var lg = left.data[li + 1];
			var lb = left.data[li + 2];
			var rr = right.data[li];
			var rg = right.data[li + 1];
			var rb = right.data[li + 2];
			var col;
			for (col = 0; col < w; col++) {
				var t = (col + 1) / (w + 1);
				var i = (row * w + col) * 4;
				patch.data[i] = Math.round(lr + (rr - lr) * t);
				patch.data[i + 1] = Math.round(lg + (rg - lg) * t);
				patch.data[i + 2] = Math.round(lb + (rb - lb) * t);
				patch.data[i + 3] = 255;
			}
		}
		ctx.putImageData(patch, x, y);
	}

	function fitFont(ctx, text, maxWidth, weight, start) {
		var size = start;
		while (size > 12) {
			ctx.font = weight + " " + size + "px Raleway, Arial";
			if (ctx.measureText(text).width <= maxWidth) return size;
			size -= 1;
		}
		return size;
	}

	function printInSlot(ctx, text, box, color, weight, startSize) {
		if (!text || !box) return;
		ctx.save();
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = color;
		fitFont(ctx, text, Math.max(24, box.w - 8), weight, startSize);
		ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2);
		ctx.restore();
	}

	function printProgramme(ctx, course, width, height) {
		var title = String(course || "").replace(/[\[\]]/g, "");
		var left = "for successfully completing the ";
		var right = " Programme at";
		var size = Math.round(height * 0.021);
		ctx.save();
		ctx.textBaseline = "middle";
		ctx.font = "500 " + size + "px Raleway, Arial";
		var leftW = ctx.measureText(left).width;
		ctx.font = "700 " + size + "px Raleway, Arial";
		var titleW = ctx.measureText(title).width;
		ctx.font = "500 " + size + "px Raleway, Arial";
		var rightW = ctx.measureText(right).width;
		var maxWidth = width * 0.78;
		while (leftW + titleW + rightW > maxWidth && size > 14) {
			size -= 1;
			ctx.font = "500 " + size + "px Raleway, Arial";
			leftW = ctx.measureText(left).width;
			ctx.font = "700 " + size + "px Raleway, Arial";
			titleW = ctx.measureText(title).width;
			ctx.font = "500 " + size + "px Raleway, Arial";
			rightW = ctx.measureText(right).width;
		}
		var x = (width - (leftW + titleW + rightW)) / 2;
		var y = height * 0.638;
		ctx.textAlign = "left";
		ctx.fillStyle = NAVY;
		ctx.font = "500 " + size + "px Raleway, Arial";
		ctx.fillText(left, x, y);
		ctx.fillStyle = TEAL;
		ctx.font = "700 " + size + "px Raleway, Arial";
		ctx.fillText(title, x + leftW, y);
		ctx.fillStyle = NAVY;
		ctx.font = "500 " + size + "px Raleway, Arial";
		ctx.fillText(right, x + leftW + titleW, y);
		ctx.textAlign = "center";
		ctx.fillText("Brylla Academy", width / 2, y + size * 1.45);
		ctx.restore();
	}

	function formatDate(value) {
		var text = String(value || "").trim();
		var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
		if (!match) return text.replace(/[\[\]]/g, "");
		var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		return String(Number(match[3])) + " " + months[Number(match[2]) - 1] + " " + match[1];
	}

	function draw(canvas, row) {
		return new Promise(function (resolve, reject) {
			var image = new Image();
			image.onload = function () {
				canvas.width = image.width;
				canvas.height = image.height;
				var ctx = canvas.getContext("2d");
				ctx.drawImage(image, 0, 0);
				var width = canvas.width;
				var height = canvas.height;
				var nameBox = { x: width * 0.279, y: height * 0.513, w: width * 0.425, h: height * 0.071 };
				var programmeBox = { x: width * 0.16, y: height * 0.615, w: width * 0.68, h: height * 0.058 };
				var dateBox = { x: width * 0.775, y: height * 0.767, w: width * 0.1, h: height * 0.028 };
				blendOut(ctx, nameBox);
				blendOut(ctx, programmeBox);
				blendOut(ctx, dateBox);
				printInSlot(ctx, String(row.display_name || row.student_name || "").replace(/[\[\]]/g, ""), nameBox, TEAL, "700", Math.round(nameBox.h * 0.82));
				printProgramme(ctx, row.course_title, width, height);
				printInSlot(ctx, formatDate(row.issue_date), dateBox, NAVY, "600", Math.round(dateBox.h * 0.85));
				resolve(canvas);
			};
			image.onerror = function () { reject(new Error("The certificate template could not be loaded.")); };
			image.src = TEMPLATE;
		});
	}

	window.BryllaCertificate = { draw: draw, formatDate: formatDate };
})();
