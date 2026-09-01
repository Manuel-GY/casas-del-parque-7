(function () {
  "use strict";

  var PALETTE = ["#16a34a", "#0e7490", "#c2410c", "#7c3aed", "#b91c1c", "#f59e0b", "#475569", "#059669", "#1d4ed8", "#be185d"];

  function wrapLines(ctx, lbl, maxW) {
    var words = String(lbl).split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    var lines = [];
    var cur = words[0];
    var addEll = false;
    for (var i = 1; i < words.length; i++) {
      var test = cur + " " + words[i];
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
      } else {
        lines.push(cur);
        cur = words[i];
        if (lines.length === 2) { lines = lines.slice(0, 2); addEll = true; break; }
      }
    }
    if (lines.length === 0) {
      lines.push(cur);
    } else if (lines.length === 1) {
      lines.push(cur);
    } else {
      if (addEll || ctx.measureText(cur).width > maxW) lines[1] += "…";
    }
    return lines;
  }

  function drawBars(canvas, labels, values) {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth || 300;
    var H = parseInt(canvas.getAttribute("height"), 10) || 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    var padL = 8, padR = 8, padT = 18, padB = 36;
    var iw = W - padL - padR;
    var ih = H - padT - padB;
    var n = labels.length;

    if (!n) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px Nunito, Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText("Sin datos aún", W / 2, H / 2);
      return;
    }

    var max = 1;
    values.forEach(function (v) { if (v > max) max = v; });
    var bw = iw / n;
    var gap = 6;
    var barW = Math.max(6, bw - gap * 2);

    labels.forEach(function (lbl, i) {
      var h = (values[i] / max) * ih;
      var x = padL + i * bw + (bw - barW) / 2;
      var y = padT + ih - h;

      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.beginPath();
      var r = Math.min(4, barW / 2);
      cornerRect(ctx, x, y, barW, h, r);
      ctx.fill();

      ctx.fillStyle = "#0b1220";
      ctx.font = "bold 11px Nunito, Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(String(values[i]), x + barW / 2, y - 5);

      ctx.fillStyle = "#374151";
      ctx.font = "bold 11px Nunito, Segoe UI";
      var lines = wrapLines(ctx, lbl, Math.max(42, bw - 4));
      var cx = padL + i * bw + bw / 2;
      var base = H - 18 - (lines.length - 1) * 12;
      lines.forEach(function (line, li) {
        ctx.fillText(line, cx, base + li * 12);
      });
    });
  }

  function cornerRect(ctx, x, y, w, h, r) {
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fmtMes(ym) {
    var meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    var p = String(ym).split("-");
    if (p.length < 2) return ym;
    return (meses[(parseInt(p[1], 10) || 1) - 1]) + " " + String(p[0]).slice(2);
  }

  window.SBStats = { drawBars: drawBars, fmtMes: fmtMes };
})();