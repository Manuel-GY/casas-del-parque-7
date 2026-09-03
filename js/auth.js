(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};
  var supabaseLoaded = (typeof supabase !== "undefined");

  var SB = {
    CATEGORIAS: {
      acceso: "Control de accesos",
      comportamiento: "Comportamiento del guardia",
      turnos: "Cumplimiento de turnos",
      instalaciones: "Estado de instalaciones",
      otro: "Otros"
    },
    SEVERIDAD: { baja: "Baja", media: "Media", alta: "Alta" },
    ESTADOS: { nuevo: "Nuevo", en_revision: "En revisión", resuelto: "Resuelto" },
    client: null,
    configOk: false
  };

  SB.configOk = !!(supabaseLoaded && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf("PEGA") === -1 && cfg.SUPABASE_ANON_KEY.indexOf("PEGA") === -1);
  if (SB.configOk) {
    try {
      SB.client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } catch (e) {
      SB.configOk = false;
    }
  }

  function mostrar(elId, text, tipo) {
    var m = document.getElementById(elId);
    if (!m) return;
    m.textContent = text || "";
    m.className = "msg " + (tipo || "error");
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = (s == null) ? "" : String(s);
    return d.innerHTML;
  }

  function fmtFecha(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-CL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function fmtErr(m) {
    var s = String((m == null) ? "" : m);
    if (/could not find the function|schema cache/i.test(s))
      return "La base de datos no está actualizada. Ejecuta el sql/schema.sql completo en el SQL Editor de Supabase.";
    if (/failed to fetch|networkerror|load failed|fetch failed|timeout/i.test(s))
      return "No hay conexión con Supabase. Revisa tu internet e inténtalo de nuevo.";
    if (/already registered|already been registered|email already/i.test(s))
      return "Ese correo ya está registrado. Prueba iniciando sesión.";
    if (/invalid login credentials|invalid email or password/i.test(s))
      return "Correo o contraseña incorrectos.";
    if (/too many (requests|attempts)|rate limit|429/i.test(s))
      return "Demasiadas solicitudes en poco tiempo. Espera un momento y vuelve a intentarlo.";
    if (/jwt expired|invalid jwt|token has expired|not authorized|signed out/i.test(s))
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (/new password should be different|different from the old|same as (the )?old password/i.test(s))
      return "La nueva contraseña debe ser diferente a la contraseña anterior.";
    if (/password should be at least/i.test(s))
      return "La contraseña debe tener al menos 6 caracteres.";
    if (/weak password/i.test(s))
      return "La contraseña ingresada es demasiado débil.";
    if (/violates check constraint.*descripcion/i.test(s))
      return "El detalle/descripción debe tener al menos 10 y máximo 2000 caracteres.";
    if (/violates check constraint.*titulo/i.test(s))
      return "El título debe tener al menos 3 y máximo 200 caracteres.";
    if (/violates check constraint.*nombre/i.test(s))
      return "El nombre debe tener entre 1 y 120 caracteres.";
    if (/violates check constraint/i.test(s))
      return "Los datos ingresados no cumplen con los límites de longitud requeridos (mínimo 10 caracteres en la descripción).";
    if (/violates row-level security policy/i.test(s))
      return "No tienes permisos para realizar esta acción.";
    return s;
  }

  function llenarCasas(select) {
    if (!select || select.options.length) return;
    var frag = document.createDocumentFragment();
    for (var i = 1; i <= 142; i++) {
      var o = document.createElement("option");
      o.value = i;
      o.textContent = "Casa " + i;
      frag.appendChild(o);
    }
    select.appendChild(frag);
  }

  function bindPrivacyModal() {
    var link = document.getElementById("link-privacy");
    var modal = document.getElementById("modal-privacidad");
    var closeBtn = document.getElementById("btn-close-privacy");
    if (!link || !modal) return;

    function abrir(e) {
      if (e) e.preventDefault();
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }
    function cerrar() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }

    link.addEventListener("click", abrir);
    if (closeBtn) closeBtn.addEventListener("click", cerrar);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) cerrar();
    });
  }

  function demoLogin() {
    var demoEmail = "demo@demo.cl";
    var demoPass = "demo123456";

    if (!SB.configOk) {
      mostrar("msg", configFallback(), "error");
      return;
    }

    var btn = document.getElementById("demo-btn");
    mostrar("msg", "Conectando con usuario demo...", "ok");
    if (btn) btn.disabled = true;

    SB.client.auth.signInWithPassword({ email: demoEmail, password: demoPass })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (res.error) {
          if (/invalid login credentials|invalid email or password/i.test(res.error.message)) {
            mostrar("msg", "El usuario demo aún no está creado. Ejecuta la sección \"USUARIO DEMO\" de sql/schema.sql en el SQL Editor de Supabase y vuelve a intentar.", "error");
          } else {
            mostrar("msg", fmtErr(res.error.message), "error");
          }
          return;
        }
        mostrar("msg", "¡Bienvenido USER DEMO! Redirigiendo...", "ok");
        window.location.href = "app.html";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindPrivacyModal();

    var demoBtn = document.getElementById("demo-btn");
    if (demoBtn) {
      demoBtn.addEventListener("click", demoLogin);
    }
  });

  window.SB = SB;
  window.SBH = { mostrar: mostrar, esc: esc, fmtFecha: fmtFecha, llenarCasas: llenarCasas, fmtErr: fmtErr, bindPrivacyModal: bindPrivacyModal };
})();