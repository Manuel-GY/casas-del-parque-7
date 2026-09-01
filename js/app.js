(function () {
  "use strict";

  var user = null;
  var profile = null;
  var rol = null;

  function chip(txt, css) {
    return '<span class="chip ' + css + '">' + SBH.esc(txt) + "</span>";
  }

  /* ---------- Sesión / perfil ---------- */

  function guard(cond, sec) {
    if (cond) return;
    SBH.mostrar("msg", "No tienes permisos para ver esto.", "error");
  }

  async function definirNav() {
    var nav = document.getElementById("nav");
    nav.innerHTML = "";

    var tabs = [
      { id: "sec-nuevo", txt: "Nuevo reclamo" },
      { id: "sec-mios", txt: "Mis reclamos" }
    ];
    if (rol === "comite" || rol === "admin") {
      tabs = [
        { id: "sec-reclamos", txt: "Reclamos" },
        { id: "sec-stats", txt: "Estadísticas" }
      ];
      if (rol === "admin") tabs.push({ id: "sec-usuarios", txt: "Usuarios" });
    } else {
      tabs.push({ id: "sec-stats", txt: "Estadísticas" });
    }

    tabs.forEach(function (t, i) {
      var b = document.createElement("button");
      b.className = "tab" + (i === 0 ? " active" : "");
      b.textContent = t.txt;
      b.dataset.target = t.id;
      b.addEventListener("click", function () { mostrarSeccion(t.id); });
      nav.appendChild(b);
    });

    mostrarSeccion(tabs[0].id);
  }

  function mostrarSeccion(id) {
    var secciones = ["sec-nuevo", "sec-mios", "sec-reclamos", "sec-stats", "sec-usuarios"];
    secciones.forEach(function (s) { document.getElementById(s).hidden = (s !== id); });
    document.querySelectorAll("#nav .tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.target === id);
    });

    if (id === "sec-mios") cargarMios();
    if (id === "sec-reclamos") cargarReclamos();
    if (id === "sec-stats") setTimeout(cargarStats, 40);
    if (id === "sec-usuarios") cargarUsuarios();
  }

  async function boot() {
    if (!SB.configOk) {
      SBH.mostrar("msg", "Falta configurar config.js (URL y anon key de Supabase).", "error");
      return;
    }
    var gu = await SB.client.auth.getUser();
    user = gu.data.user || null;
    if (!user) { window.location.href = "index.html"; return; }

    var gp = await SB.client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (gp.error && gp.error.message && !gp.data) {
      SBH.mostrar("msg", gp.error.message, "error");
      return;
    }

    if (!gp.data) {
      document.getElementById("profiling").classList.remove("hidden");
      SBH.llenarCasas(document.getElementById("prof-casa"));
      return;
    }

    profile = gp.data;
    rol = profile.rol;
    document.getElementById("user-nombre").textContent = profile.nombre;
    document.getElementById("user-casa").textContent = "Casa " + profile.numero_casa;
    var rl = document.getElementById("user-rol");
    rl.textContent = rol === "comite" ? "Comité" : rol === "admin" ? "Admin" : "Vecino";
    rl.className = "badge role-" + rol;

    var primer = String(profile.nombre).split(" ")[0];
    document.getElementById("welcome-tx").innerHTML =
      "¡Hola, " + SBH.esc(primer) + '! <span style="color:var(--sun-dark)">☀</span>';

    document.getElementById("app-main").classList.remove("hidden");
    llenarReclamoForm();
    await definirNav();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("app-main")) return;

    document.getElementById("btn-logout").addEventListener("click", async function () {
      await SB.client.auth.signOut();
      window.location.href = "index.html";
    });

    document.getElementById("profiling-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var nombre = document.getElementById("prof-name").value.trim();
      var casa = parseInt(document.getElementById("prof-casa").value, 10);
      var pr = await SB.client.rpc("registrar_perfil", { p_nombre: nombre, p_casa: casa });
      if (pr.error) { SBH.mostrar("msg", pr.error.message, "error"); return; }
      boot();
    });

    boot();
  });

  /* ---------- Vecino: nuevo reclamo ---------- */

  function llenarReclamoForm() {
    var cat = document.getElementById("recl-categoria");
    Object.keys(SB.CATEGORIAS).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = SB.CATEGORIAS[k];
      cat.appendChild(o);
    });
    var sev = document.getElementById("recl-severidad");
    Object.keys(SB.SEVERIDAD).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = SB.SEVERIDAD[k];
      sev.appendChild(o);
    });

    document.getElementById("reclamo-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      SBH.mostrar("msg", "", "ok");
      var payload = {
        creado_por: user.id,
        numero_casa: profile.numero_casa,
        categoria: document.getElementById("recl-categoria").value,
        severidad: document.getElementById("recl-severidad").value,
        titulo: document.getElementById("recl-titulo").value.trim(),
        descripcion: document.getElementById("recl-descripcion").value.trim()
      };
      var ins = await SB.client.from("reclamos").insert([payload]);
      if (ins.error) { SBH.mostrar("msg", ins.error.message, "error"); return; }
      SBH.mostrar("msg", "Reclamo enviado. El comité lo revisará.", "ok");
      e.target.reset();
    });
  }

  /* ---------- Vecino: mis reclamos ---------- */

  async function cargarMios() {
    var wrap = document.getElementById("mios-list");
    var q = await SB.client.from("reclamos")
      .select("*")
      .eq("creado_por", user.id)
      .order("created_at", { ascending: false });
    if (q.error) { wrap.innerHTML = '<p class="hint">' + SBH.esc(q.error.message) + "</p>"; return; }
    if (!q.data.length) { wrap.innerHTML = '<p class="hint">Aún no has enviado reclamos.</p>'; return; }
    wrap.innerHTML = q.data.map(tarjetaReclamo).join("");
  }

  function tarjetaReclamo(r) {
    var resp = r.respuesta
      ? '<div class="respuesta-box"><b>Respuesta del comité:</b> ' + SBH.esc(r.respuesta) + "</div>" : "";
    return (
      '<div class="reclamo">' +
        '<div class="head">' +
          '<div>' +
            '<div class="titulo">' + SBH.esc(r.titulo) + "</div>" +
            '<div class="meta">' + SBH.esc(SB.CATEGORIAS[r.categoria] || r.categoria) +
              " · " + SBH.fmtFecha(r.created_at) + "</div>" +
          "</div>" +
          '<div>' + chip(SB.ESTADOS[r.estado] || r.estado, "estado-" + r.estado) + "</div>" +
        "</div>" +
        '<div class="desc">' + SBH.esc(r.descripcion) + "</div>" + resp +
      "</div>"
    );
  }

  /* ---------- Comité/Admin: lista + responder ---------- */

  async function cargarReclamos() {
    var wrap = document.getElementById("reclamos-list");
    wrap.innerHTML = '<p class="hint">Cargando…</p>';
    var q = await SB.client.rpc("reclamos_detalle");
    if (q.error) { wrap.innerHTML = '<p class="hint">' + SBH.esc(q.error.message) + "</p>"; return; }
    if (!q.data || !q.data.length) { wrap.innerHTML = '<p class="hint">No hay reclamos aún.</p>'; return; }
    wrap.innerHTML = q.data.map(tarjetaComite).join("");
    bindResponder();
  }

  function tarjetaComite(r) {
    var resp = r.respuesta
      ? '<div class="respuesta-box"><b>Respuesta:</b> ' + SBH.esc(r.respuesta) + "</div>" : "";
    return (
      '<div class="reclamo" data-id="' + r.id + '">' +
        '<div class="head">' +
          '<div>' +
            '<div class="titulo">' + SBH.esc(r.titulo) + "</div>" +
            '<div class="meta"><b>Casa ' + r.numero_casa + "</b>" +
              (r.nombre ? " · " + SBH.esc(r.nombre) : "") +
              " · " + SBH.fmtFecha(r.created_at) + "</div>" +
          "</div>" +
          '<div>' + chip(SB.ESTADOS[r.estado] || r.estado, "estado-" + r.estado) +
            " " + chip(SB.SEVERIDAD[r.severidad] || r.severidad, "sev-" + r.severidad) + "</div>" +
        "</div>" +
        '<div class="meta">Categoría: ' + SBH.esc(SB.CATEGORIAS[r.categoria] || r.categoria) + "</div>" +
        '<div class="desc">' + SBH.esc(r.descripcion) + "</div>" + resp +
        '<form class="responder" style="margin-top:12px; display:grid; gap:8px;">' +
          '<div class="grid-2">' +
            '<label>Estado<select class="resp-estado">' +
              '<option value="nuevo"' + (r.estado === "nuevo" ? " selected" : "") + ">Nuevo</option>" +
              '<option value="en_revision"' + (r.estado === "en_revision" ? " selected" : "") + ">En revisión</option>" +
              '<option value="resuelto"' + (r.estado === "resuelto" ? " selected" : "") + ">Resuelto</option>" +
            "</select></label>" +
            '<div style="align-self:end"><button class="btn primary" type="submit">Guardar</button></div>' +
          "</div>" +
          '<label>Respuesta<textarea class="resp-texto" rows="3">' + SBH.esc(r.respuesta || "") + "</textarea></label>" +
        "</form>" +
      "</div>"
    );
  }

  function bindResponder() {
    document.querySelectorAll("#reclamos-list .responder").forEach(function (f) {
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        var card = f.closest(".reclamo");
        var id = card.dataset.id;
        var estado = f.querySelector(".resp-estado").value;
        var texto = f.querySelector(".resp-texto").value.trim();
        var r = await SB.client.rpc("responder_reclamo", {
          p_id: id, p_estado: estado, p_respuesta: texto || null
        });
        if (r.error) { SBH.mostrar("msg", r.error.message, "error"); return; }
        SBH.mostrar("msg", "Reclamo actualizado.", "ok");
        cargarReclamos();
      });
    });
  }

  /* ---------- Estadísticas ---------- */

  async function cargarStats() {
    var s = await SB.client.rpc("estadisticas");
    if (s.error) { SBH.mostrar("msg", s.error.message, "error"); return; }
    var e = s.data || {};

    var grid = document.getElementById("stats-grid");
    grid.innerHTML =
      statCard(e.total || 0, "Reclamos totales") +
      statCard(e.por_estado && e.por_estado.nuevo || 0, "Nuevos") +
      statCard(e.por_estado && e.por_estado.en_revision || 0, "En revisión") +
      statCard(e.por_estado && e.por_estado.resuelto || 0, "Resueltos");

    SBStats.drawBars(
      document.getElementById("chart-estado"),
      Object.keys(e.por_estado || {}).map(function (k) { return SB.ESTADOS[k] || k; }),
      Object.values(e.por_estado || {})
    );
    SBStats.drawBars(
      document.getElementById("chart-categoria"),
      Object.keys(e.por_categoria || {}).map(function (k) { return SB.CATEGORIAS[k] || k; }),
      Object.values(e.por_categoria || {})
    );
    SBStats.drawBars(
      document.getElementById("chart-severidad"),
      Object.keys(e.por_severidad || {}).map(function (k) { return SB.SEVERIDAD[k] || k; }),
      Object.values(e.por_severidad || {})
    );
    var meses = (e.por_mes || []).map(function (m) { return SBStats.fmtMes(m.mes); });
    var cant = (e.por_mes || []).map(function (m) { return m.cantidad; });
    SBStats.drawBars(document.getElementById("chart-mes"), meses, cant);
  }

  function statCard(num, lbl) {
    return '<div class="stat"><div class="num">' + num + '</div><div class="lbl">' + SBH.esc(lbl) + "</div></div>";
  }

  /* ---------- Admin: usuarios ---------- */

  async function cargarUsuarios() {
    var wrap = document.getElementById("usuarios-list");
    if (rol !== "admin") { wrap.innerHTML = '<p class="hint">Solo admin.</p>'; return; }
    var q = await SB.client.from("profiles").select("id,nombre,numero_casa,rol,created_at").order("numero_casa");
    if (q.error) { wrap.innerHTML = '<p class="hint">' + SBH.esc(q.error.message) + "</p>"; return; }
    if (!q.data.length) { wrap.innerHTML = '<p class="hint">No hay usuarios registrados.</p>'; return; }
    wrap.innerHTML = q.data.map(function (p) {
      return (
        '<div class="user-row" data-id="' + p.id + '">' +
          '<div><div class="nm">' + SBH.esc(p.nombre) + '</div>' +
          '<div class="dt">Casa ' + p.numero_casa + " · " + (p.rol === "comite" ? "Comité" : p.rol === "admin" ? "Admin" : "Vecino") + "</div></div>" +
          '<select class="urol">' +
            '<option value="vecino"' + (p.rol === "vecino" ? " selected" : "") + ">Vecino</option>" +
            '<option value="comite"' + (p.rol === "comite" ? " selected" : "") + ">Comité</option>" +
            '<option value="admin"' + (p.rol === "admin" ? " selected" : "") + ">Admin</option>" +
          "</select>" +
          '<button class="btn ghost sm ubtn">Guardar</button>' +
        "</div>"
      );
    }).join("");

    wrap.querySelectorAll(".user-row").forEach(function (row) {
      row.querySelector(".ubtn").addEventListener("click", async function () {
        var id = row.dataset.id;
        var nuevoRol = row.querySelector(".urol").value;
        var r = await SB.client.rpc("asignar_rol", { p_usuario: id, p_rol: nuevoRol });
        if (r.error) { SBH.mostrar("msg", r.error.message, "error"); return; }
        SBH.mostrar("msg", "Rol actualizado.", "ok");
        cargarUsuarios();
      });
    });
  }
})();