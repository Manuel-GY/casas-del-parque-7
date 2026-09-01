(function () {
  "use strict";

  function llenarOpciones(select, map, selKey) {
    if (!select) return;
    if (select.options.length) return;
    Object.keys(map).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = map[k];
      if (selKey && k === selKey) o.selected = true;
      select.appendChild(o);
    });
  }

  function activarTab(btn) {
    var tabs = document.querySelectorAll("#auth-tabs .tab");
    tabs.forEach(function (t) { t.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById("view-login").hidden = (btn.dataset.view !== "login");
    document.getElementById("view-register").hidden = (btn.dataset.view !== "register");
  }

  function onLoginForm(e) {
    e.preventDefault();
    var email = document.getElementById("login-email").value.trim();
    var pass = document.getElementById("login-pass").value;
    var btn = document.getElementById("login-btn");
    SBH.mostrar("msg", "", "ok");
    if (!SB.configOk) { SBH.mostrar("msg", configFallback(), "error"); return; }
    cargando(btn, true, "Entrando…");
    SB.client.auth.signInWithPassword({ email: email, password: pass })
      .then(function (res) {
        cargando(btn, false, "Entrar");
        if (res.error) { SBH.mostrar("msg", res.error.message, "error"); return; }
        window.location.href = "app.html";
      });
  }

  function onRegisterForm(e) {
    e.preventDefault();
    var nombre = document.getElementById("reg-name").value.trim();
    var email = document.getElementById("reg-email").value.trim();
    var pass = document.getElementById("reg-pass").value;
    var casa = parseInt(document.getElementById("reg-casa").value, 10);
    var btn = document.getElementById("reg-btn");
    SBH.mostrar("msg", "", "ok");
    if (!SB.configOk) { SBH.mostrar("msg", configFallback(), "error"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { SBH.mostrar("msg", "Revisa el correo: parece no ser válido.", "error"); return; }

    cargando(btn, true, "Creando cuenta…");
    SB.client.auth.signUp({ email: email, password: pass })
      .then(function (res) {
        if (res.error) {
          cargando(btn, false, "Crear cuenta");
          if (/already registered/i.test(res.error.message)) {
            SBH.mostrar("msg", "Ese correo ya está registrado. Prueba iniciando sesión.", "error");
          } else {
            SBH.mostrar("msg", res.error.message, "error");
          }
          return null;
        }
        return SB.client.rpc("registrar_perfil", { p_nombre: nombre, p_casa: casa })
          .then(function (pr) {
            if (pr.error) {
              SBH.mostrar("msg", "Cuenta creada pero faltó asociar tu casa: " + pr.error.message, "error");
              return null;
            }
            return res;
          });
      })
      .then(function (res) {
        if (!res) return;
        cargando(btn, false, "Crear cuenta");
        if (res.data && res.data.session) {
          SBH.mostrar("msg", "¡Bienvenido a tu comunidad! Redirigiendo…", "ok");
          window.location.href = "app.html";
        } else {
          SBH.mostrar("msg", "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.", "ok");
        }
      });
  }

  function cargando(btn, on, txt) {
    if (!btn) return;
    btn.disabled = on;
    if (txt) btn.textContent = txt;
  }

  function configFallback() {
    return "Falta conectar Supabase: pega la URL y la anon key en config.js. Sin eso el registro no puede funcionar.";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var loginForm = document.getElementById("login-form");
    if (!loginForm) return;

    var tabs = document.querySelectorAll("#auth-tabs .tab");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { activarTab(t); });
    });
    SBH.llenarCasas(document.getElementById("reg-casa"));

    loginForm.addEventListener("submit", onLoginForm);
    document.getElementById("register-form").addEventListener("submit", onRegisterForm);
  });
})();