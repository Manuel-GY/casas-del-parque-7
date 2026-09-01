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

  window.SB = SB;
  window.SBH = { mostrar: mostrar, esc: esc, fmtFecha: fmtFecha, llenarCasas: llenarCasas };
})();