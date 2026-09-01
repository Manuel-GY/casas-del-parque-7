(function () {
  "use strict";

  var PALETTE = ["#16a34a", "#0e7490", "#c2410c", "#7c3aed", "#b91c1c", "#f59e0b", "#475569", "#059669", "#1d4ed8", "#be185d"];

  var ANIM_MS = 420;
  var raf = window.requestAnimationFrame ||
    function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
  var caf = window.cancelAnimationFrame || function (id) { clearTimeout(id); };

  var registry = [];

  function findRecord(canvas) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].canvas === canvas) return registry[i];
    }
    return null;
  }

  function ensureRecord(canvas) {
    var rec = findRecord(canvas);
    if (!rec) {
      rec = {
        canvas: canvas,
        labels: [],
        values: [],
        raf: 0,
        rects: [],
        bound: false
      };
      registry.push(rec);
    }
    return rec;
  }

  /* ---------- helpers ---------- */

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

  function shade(hex, amt) {
    var c = parseInt(hex.slice(1), 16);
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    var t = amt < 0 ? 0 : 255;
    var p = Math.abs(amt);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- tooltip ---------- */

  var tooltipEl = null;

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    var t = document.createElement("div");
    t.className = "chart-tooltip";
    t.style.display = "none";
    document.body.appendChild(t);
    tooltipEl = t;
    return t;
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.classList.remove("vis");
      tooltipEl.style.display = "none";
    }
  }

  function showTooltip(value, label, x, y) {
    var t = ensureTooltip();
    t.innerHTML =
      '<div class="chart-tip-num">' + escHtml(value) + "</div>" +
      (label ? '<div class="chart-tip-lbl">' + escHtml(label) + "</div>" : "");
    t.classList.remove("vis");
    t.style.display = "block";
    t.style.visibility = "hidden";

    var w = t.offsetWidth;
    var h = t.offsetHeight;
    var vw = document.documentElement.clientWidth || document.body.clientWidth;
    var vh = document.documentElement.clientHeight || document.body.clientHeight;

    var L = Math.max(8, Math.min(x - w / 2, vw - w - 8));
    var T = y - h - 10;
    if (T < 8) T = y + 14;

    t.style.left = L + "px";
    t.style.top = T + "px";
    t.style.visibility = "visible";
    void t.offsetWidth;
    t.classList.add("vis");
  }

  function bindHover(canvas, rec) {
    if (rec.bound) return;
    rec.bound = true;

    canvas.addEventListener("mousemove", function (e) {
      if (!rec.canvas) return;
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      var px = e.clientX - r.left;
      var py = e.clientY - r.top;
      var hit = null;
      for (var i = 0; i < rec.rects.length; i++) {
        var b = rec.rects[i];
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { hit = b; break; }
      }
      if (hit) {
        showTooltip(hit.value, hit.label, r.left + hit.x + hit.w / 2, r.top + hit.y);
      } else {
        hideTooltip();
      }
    });

    canvas.addEventListener("mouseleave", hideTooltip);
    canvas.addEventListener("touchstart", function (e) {
      var t = e.touches && e.touches[0];
      if (!t) return;
      var r = canvas.getBoundingClientRect();
      var px = t.clientX - r.left;
      var py = t.clientY - r.top;
      var hit = null;
      for (var i = 0; i < rec.rects.length; i++) {
        var b = rec.rects[i];
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { hit = b; break; }
      }
      if (hit) {
        showTooltip(hit.value, hit.label, r.left + hit.x + hit.w / 2, r.top + hit.y);
      }
    }, false);
  }

  /* ---------- rendering ---------- */

  function renderChart(rec, ease) {
    var canvas = rec.canvas;
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth;
    if (!W && canvas.parentNode) W = canvas.parentNode.clientWidth;
    if (!W) W = 300;
    var H = parseInt(canvas.getAttribute("height"), 10) || 200;

    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    var padL = 8, padR = 8, padT = 18, padB = 36;
    var iw = W - padL - padR;
    var ih = H - padT - padB;
    var n = Math.min(rec.labels.length, rec.values.length);

    ctx.fillStyle = "rgba(255,255,255,.30)";
    ctx.fillRect(0, 0, W, H);

    if (!n) {
      ctx.strokeStyle = "rgba(20,83,45,.18)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      roundRectPath(ctx, padL, padT, iw, ih, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 14px Nunito, Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Sin datos aún", W / 2, padT + ih / 2);
      ctx.textBaseline = "alphabetic";
      rec.rects = [];
      return;
    }

    var max = 1;
    for (var i = 0; i < n; i++) { if (rec.values[i] > max) max = rec.values[i]; }
    var bw = iw / n;
    var gap = Math.min(8, Math.max(2, bw * 0.14));
    var barW = Math.max(6, bw - gap * 2);
    var baseY = padT + ih;

    ctx.textAlign = "center";

    /* gridlines */
    ctx.strokeStyle = "rgba(20,83,45,.06)";
    ctx.lineWidth = 1;
    for (var g = 1; g <= 4; g++) {
      var gy = padT + (ih * g) / 5;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + iw, gy);
      ctx.stroke();
    }

    /* baseline */
    ctx.strokeStyle = "rgba(20,83,45,.22)";
    ctx.beginPath();
    ctx.moveTo(padL, baseY + 0.5);
    ctx.lineTo(padL + iw, baseY + 0.5);
    ctx.stroke();

    /* soft drop shadow under the plot area */
    var sh = ctx.createLinearGradient(0, baseY, 0, baseY + 26);
    sh.addColorStop(0, "rgba(20,83,45,.12)");
    sh.addColorStop(1, "rgba(20,83,45,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(padL, baseY, iw, 26);

    rec.rects = [];

    for (var i = 0; i < n; i++) {
      var target = (rec.values[i] / max) * ih;
      var h = target * ease;
      var x = padL + i * bw + (bw - barW) / 2;
      var y = baseY - h;
      var fullY = baseY - target;
      var color = PALETTE[i % PALETTE.length];

      if (rec.values[i] > 0) {
        var r = Math.min(5, barW / 2);

        var grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, shade(color, 0.32));
        grad.addColorStop(0.5, shade(color, 0.1));
        grad.addColorStop(1, shade(color, -0.16));
        ctx.fillStyle = grad;
        ctx.beginPath();
        cornerRect(ctx, x, y, barW, h, r);
        ctx.fill();

        /* inner frame for depth */
        ctx.strokeStyle = "rgba(255,255,255,.30)";
        ctx.lineWidth = 1;
        ctx.stroke();

        /* glossy highlight on the left */
        ctx.save();
        ctx.beginPath();
        cornerRect(ctx, x, y, barW, h, r);
        ctx.clip();
        var gl = ctx.createLinearGradient(x, y, x + barW * 0.55, y + h);
        gl.addColorStop(0, "rgba(255,255,255,.26)");
        gl.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gl;
        ctx.fillRect(x, y, barW * 0.55, h);
        /* bright rounded cap on top */
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.beginPath();
        cornerRect(ctx, x, y, barW, Math.min(4, Math.max(2, h * 0.18)), r);
        ctx.fill();
        ctx.restore();

        rec.rects.push({ x: x, y: fullY, w: barW, h: target, value: rec.values[i], label: rec.labels[i] });
      }

      /* value badge above the bar */
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.font = "bold 11px Nunito, Segoe UI";
      var vy = fullY - 5;
      ctx.strokeText(String(rec.values[i]), x + barW / 2, vy);
      ctx.fillStyle = "#14532d";
      ctx.fillText(String(rec.values[i]), x + barW / 2, vy);

      /* wrapped label below (2 lines, bold, 11px) */
      ctx.fillStyle = "#374151";
      ctx.font = "bold 11px Nunito, Segoe UI";
      var lines = wrapLines(ctx, rec.labels[i], Math.max(42, bw - 4));
      var cx = padL + i * bw + bw / 2;
      var base = H - 18 - (lines.length - 1) * 12;
      for (var li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cx, base + li * 12);
      }
    }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cornerRect(ctx, x, y, w, h, r);
  }

  function animate(rec) {
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / ANIM_MS);
      var e = 1 - Math.pow(1 - p, 3);
      renderChart(rec, e);
      if (p < 1) {
        rec.raf = raf(step);
      } else {
        rec.raf = 0;
      }
    }
    rec.raf = raf(step);
  }

  /* ---------- public API ---------- */

  function drawBars(canvas, labels, values) {
    if (!canvas || !canvas.getContext) return;
    var rec = ensureRecord(canvas);
    if (rec.raf) { caf(rec.raf); rec.raf = 0; }
    rec.labels = labels || [];
    rec.values = values || [];
    bindHover(canvas, rec);
    animate(rec);
  }

  window.addEventListener("resize", function () {
    hideTooltip();
    for (var i = 0; i < registry.length; i++) {
      var rec = registry[i];
      var alive = typeof rec.canvas.isConnected === "undefined" || rec.canvas.isConnected;
      if (alive) drawBars(rec.canvas, rec.labels, rec.values);
    }
  });

  document.addEventListener("scroll", hideTooltip, true);

  function fmtMes(ym) {
    var meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    var p = String(ym).split("-");
    if (p.length < 2) return ym;
    return (meses[(parseInt(p[1], 10) || 1) - 1]) + " " + String(p[0]).slice(2);
  }

  window.SBStats = { drawBars: drawBars, fmtMes: fmtMes };
})();