(function () {
  "use strict";

  function crearMock() {
    var KEY = "cp7_demo_data";
    var SKEY = "cp7_demo_sesion";

    function db() {
      var raw = localStorage.getItem(KEY);
      var d;
      try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
      if (!d) {
        d = { users: [], profiles: [], reclamos: [], seq: 1 };
        guardar(d);
      }
      return d;
    }
    function guardar(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
    function sesion() {
      var raw = sessionStorage.getItem(SKEY);
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function setSesion(u) {
      if (u) sessionStorage.setItem(SKEY, JSON.stringify(u));
      else sessionStorage.removeItem(SKEY);
    }
    function genId(p) {
      return p + Math.floor(Math.random() * 1e12).toString(36) + Date.now().toString(36);
    }
    function ok(data) { return Promise.resolve({ data: data, error: null }); }
    function err(msg) { return Promise.resolve({ data: null, error: { message: msg } }); }
    function rolDe(id, d) {
      var p = d.profiles.find(function (x) { return x.id === id; });
      return p ? p.rol : null;
    }
    function casaDe(id, d) {
      var p = d.profiles.find(function (x) { return x.id === id; });
      return p ? p.numero_casa : null;
    }
    function esCoAd(rol) { return rol === "comite" || rol === "admin"; }

    function consultarPerfiles(state, u, d) {
      var lista = d.profiles.slice();
      if (state.where && state.where.c === "id") {
        var ux = state.where.v;
        var rol = rolDe(u ? u.id : null, d);
        var propio = lista.filter(function (p) { return p.id === ux; });
        if (propio.length) return propio;
        if (esCoAd(rol)) return lista.filter(function (p) { return p.id === ux; });
        return [];
      }
      if (u && !esCoAd(rolDe(u.id, d))) return [];
      if (state.orderCol === "numero_casa") {
        lista.sort(function (a, b) { return (a.numero_casa - b.numero_casa) || (a.created_at < b.created_at ? -1 : 1); });
      }
      return lista;
    }

    function consultarReclamos(state, u, d) {
      var rol = u ? rolDe(u.id, d) : null;
      var lista = d.reclamos.filter(function (r) {
        if (esCoAd(rol)) return true;
        return r.creado_por === (u && u.id);
      });
      if (state.where && state.where.c === "creado_por") {
        lista = lista.filter(function (r) { return r.creado_por === state.where.v; });
      }
      if (state.orderCol === "created_at") {
        lista = lista.slice().sort(function (a, b) {
          return state.orderAsc ? (a.created_at > b.created_at ? -1 : 1) : (a.created_at < b.created_at ? -1 : 1);
        });
      }
      return lista;
    }

    function constructor(tabla) {
      var state = { tabla: tabla, where: null, orderCol: null, orderAsc: true, cols: "*", single: false };
      var b = {
        select: function (cols) { state.cols = cols; return b; },
        eq: function (c, v) { state.where = { c: c, v: v }; return b; },
        order: function (c, opts) { state.orderCol = c; state.orderAsc = !(opts && opts.ascending === false); return b; },
        maybeSingle: function () { state.single = true; return b; },
        insert: function (rows) {
          var d = db();
          var u = sesion();
          var rol = u ? rolDe(u.id, d) : null;
          var ownCasa = u ? casaDe(u.id, d) : null;
          var pk = state.tabla === "reclamos" ? "reclamos" : "profiles";
          var regs = rows.map(function (row) {
            var r = {};
            Object.keys(row).forEach(function (k) { r[k] = row[k]; });
            if (pk === "reclamos") {
              r.id = genId("r");
              r.created_at = new Date().toISOString();
            } else {
              r.id = genId("u");
              r.created_at = new Date().toISOString();
            }
            return r;
          });
          if (pk === "reclamos") {
            for (var i = 0; i < regs.length; i++) {
              if (!u || !esCoAd(rol) && rol !== "vecino") return err("Necesitas un perfil para reclamar.");
              if (regs[i].numero_casa !== ownCasa) return err("El reclamo debe ser de tu casa.");
              if (regs[i].estado !== "nuevo") return err("Los reclamos nuevos empiezan como 'nuevo'.");
            }
          }
          d[pk] = d[pk].concat(regs);
          guardar(d);
          return ok(regs);
        },
        then: function (res, rej) {
          var d = db();
          var u = sesion();
          var data;
          if (state.tabla === "profiles") data = consultarPerfiles(state, u, d);
          else data = consultarReclamos(state, u, d);
          if (state.single) data = data.length ? data[0] : null;
          Promise.resolve().then(function () { res({ data: data, error: null }); }).catch(rej);
        }
      };
      return b;
    }

    function rpc(nombre, args, u, d) {
      if (nombre === "registrar_perfil") {
        var p = d.profiles.find(function (x) { return x.id === u.id; });
        if (p) return err("Este usuario ya tiene un perfil registrado.");
        if (!(args.p_casa >= 1 && args.p_casa <= 142)) return err("La casa no existe.");
        var n = d.profiles.filter(function (x) { return x.numero_casa === args.p_casa; }).length;
        if (n >= 2) return err("La casa " + args.p_casa + " ya tiene sus 2 usuarios registrados.");
        var nuevo = { id: u.id, nombre: args.p_nombre, numero_casa: args.p_casa, rol: "vecino", created_at: new Date().toISOString() };
        d.profiles.push(nuevo);
        guardar(d);
        return ok(nuevo);
      }
      if (nombre === "asignar_rol") {
        if (rolDe(u.id, d) !== "admin") return err("Solo un administrador puede asignar roles.");
        var up = d.profiles.find(function (x) { return x.id === args.p_usuario; });
        if (!up) return err("Usuario no encontrado.");
        up.rol = args.p_rol;
        guardar(d);
        return ok(null);
      }
      if (nombre === "reclamos_detalle") {
        if (!esCoAd(rolDe(u.id, d))) return err("Sin permisos para ver el detalle de reclamos.");
        var lista = d.reclamos.slice().sort(function (a, b) { return a.created_at > b.created_at ? -1 : 1; });
        var data = lista.map(function (r) {
          var q = d.profiles.find(function (x) { return x.id === r.creado_por; });
          var a = r.atendido_por ? d.profiles.find(function (x) { return x.id === r.atendido_por; }) : null;
          return {
            id: r.id, titulo: r.titulo, descripcion: r.descripcion, categoria: r.categoria,
            severidad: r.severidad, estado: r.estado, respuesta: r.respuesta,
            nombre: q ? q.nombre : null, numero_casa: r.numero_casa,
            atendido_nombre: a ? a.nombre : null,
            created_at: r.created_at, resuelto_en: r.resuelto_en
          };
        });
        return ok(data);
      }
      if (nombre === "responder_reclamo") {
        if (!esCoAd(rolDe(u.id, d))) return err("Sin permisos.");
        var rr = d.reclamos.find(function (x) { return x.id === args.p_id; });
        if (!rr) return err("Reclamo no encontrado.");
        rr.estado = args.p_estado;
        if (args.p_respuesta) rr.respuesta = args.p_respuesta;
        rr.atendido_por = u.id;
        if (args.p_estado === "resuelto") rr.resuelto_en = new Date().toISOString();
        guardar(d);
        return ok(null);
      }
      if (nombre === "estadisticas") {
        var cnt = function (f) { return d.reclamos.filter(f).length; };
        var agrupar = function (campo) {
          var m = {};
          d.reclamos.forEach(function (r) {
            var k = r[campo];
            if (!m[k]) m[k] = 0;
            m[k]++;
          });
          return m;
        };
        var porMes = (function () {
          var m = {};
          d.reclamos.forEach(function (r) {
            var k = String(r.created_at).slice(0, 7);
            if (!m[k]) m[k] = 0;
            m[k]++;
          });
          return Object.keys(m).sort().map(function (k) { return { mes: k, cantidad: m[k] }; });
        })();
        return ok({
          total: d.reclamos.length,
          por_estado: agrupar("estado"),
          por_categoria: agrupar("categoria"),
          por_severidad: agrupar("severidad"),
          por_mes: porMes,
          por_casa: d.reclamos.map(function (r) { return { casa: r.numero_casa, cantidad: 1 }; })
        });
      }
      return err("Función desconocida en modo demo.");
    }

    return {
      auth: {
        getUser: function () { return ok({ user: sesion() }); },
        signOut: function () { setSesion(null); return ok(null); },
        signInWithPassword: function (creds) {
          var d = db();
          var u = d.users.find(function (x) { return x.email === creds.email.toLowerCase(); });
          if (!u) return err("Correo no registrado (demo). Prueba creando tu cuenta.");
          if (u.password !== creds.password) return err("Contraseña incorrecta.");
          setSesion(u);
          return ok({ user: u });
        },
        signUp: function (creds) {
          var d = db();
          var em = creds.email.toLowerCase();
          if (d.users.some(function (x) { return x.email === em; })) return err("User already registered");
          var u = { id: genId("u"), email: em, password: creds.password };
          d.users.push(u);
          guardar(d);
          setSesion(u);
          return ok({ user: u, session: { user: u } });
        }
      },
      from: function (tabla) { return constructor(tabla); },
      rpc: function (nombre, args) {
        var d = db();
        var u = sesion();
        if (nombre === "registrar_perfil") {
          if (!u) return err("Debes iniciar sesión.");
        }
        return Promise.resolve().then(function () { return rpc(nombre, args, u, d); });
      }
    };
  }

  if (!window.SB) return;
  if (!window.SB.configOk) {
    window.SB.client = crearMock();
    window.SB.demo = true;
    window.SB.configOk = true;
    var nota = "Modo demostración: los datos solo se guardan en tu navegador. Conecta Supabase en config.js para que la comunidad comparta los reclamos.";
    document.querySelectorAll("#demo-note").forEach(function (el) {
      el.textContent = nota;
      el.classList.remove("hidden");
    });
  }
})();