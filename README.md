# Casas del Parque 7 — Reclamos a Guardias

Aplicación (GitHub Pages + Supabase gratis) para que los vecinos del condominio **Casas del Parque 7** hagan reclamos sobre el servicio de guardias.

- **Vecinos**: crean su cuenta (máx. 2 por casa), envían reclamos y **sugerencias**, ven los suyos de cada uno y las **estadísticas** de la comunidad.
- **Comité y Administración**: ven el **detalle** de todos los reclamos y sugerencias, cambian su estado y responden.
- **Administrador**: además asigna roles (vecino / comité / admin).

## Cómo funciona

- **GitHub Pages** (o Netlify Drop) solo sirve archivos estáticos (no tiene servidor).
- Toda la lógica viva (login y datos) corre en **Supabase** (plan gratuito): Auth + Postgres con **Row Level Security**, lo que hace que los vecinos *no puedan* leer el detalle de reclamos ajenos aunque conozcan la clave pública del proyecto.

## Cuentas genéricas de prueba

| Rol | Correo | Contraseña | Casa |
|---|---|---|---|
| Administración | `administracion@casasdelparque7.cl` | `AdminCP7#2026` | Sin casa |
| Comité | `comite@casasdelparque7.cl` | `ComiteCP7#2026` | Sin casa |

> ⚠️ Son cuentas de demostración con claves "conocidas". Cámbialas apenas la comunidad esté en uso real, o reemplaza estas cuentas por las reales.

Para dejarlas con su rol y **sin casa** (ejecutar una vez en SQL Editor):

```sql
alter table public.profiles alter column numero_casa drop not null;

insert into public.profiles (id, nombre, numero_casa, rol)
select id, 'Comité Ejecutivo CDP7', null, 'comite'
from auth.users where email = 'comite@casasdelparque7.cl'
on conflict (id) do update set rol = 'comite', numero_casa = null, nombre = 'Comité Ejecutivo CDP7';

update public.profiles p
set rol = 'admin', numero_casa = null, nombre = 'Administración CDP7'
from auth.users u
where u.email = 'administracion@casasdelparque7.cl' and u.id = p.id;
```

## Pasos de instalación

### 1) Supabase (una vez)

1. Crea un proyecto gratis en <https://supabase.com>.
2. Ve a **SQL Editor → New query**, pega el contenido de [`sql/schema.sql`](sql/schema.sql) y ejecútalo.
3. En **Authentication → Providers → Email**, decide si quieres pedir confirmación de correo *(recomendado desactivarla para la prueba)*.
4. Copia la **URL del proyecto** y la **anon key** de **Project Settings → API** y pégalas en [`config.js`](config.js) (sustituyendo `PEGA_AQUI_...`).

> La `anon key` es pública por diseño: la seguridad real la dan las políticas RLS de la base, no esa clave.

### 2) Primer administrador (una vez)

Tras crear la primera cuenta (será `vecino`), promuévela a `admin` en **SQL Editor**:

```sql
update public.profiles set rol = 'admin'
where id = (select id from auth.users where email = 'TU_CORREO@EJEMPLO.CL');
```

Desde ese perfil podrás convertir a otros en comité o admin en la pestaña **Usuarios**.

### 3) GitHub Pages

1. Crea el repositorio (público) y súbelo.
2. Activa **Settings → Pages → Source: Deploy from a branch → main /**
   (GitHub vuelve a publicar automáticamente en cada push a `main`).

## Desarrollo local

Ejecuta un servidor estático en la raíz (no basta abrir `index.html` por CORS):

```powershell
npx serve .
# o
python -m http.server 8080
```

Abre `http://localhost:8080`.

## Estructura

```
├── index.html          Login / registro (pide número de casa)
├── app.html            Panel (según rol)
├── config.js           URL + anon key de Supabase
├── css/style.css
├── js/auth.js          Inicializa el cliente + helpers
├── js/index.js         Lógica de login/registro
├── js/app.js           Panel de vecino / comité / admin (reclamos + sugerencias)
├── js/stats.js         Dibujo de gráficos (Canvas, sin dependencias)
├── sql/schema.sql      Tablas, RLS y funciones (ejecutar en Supabase)
```

## Notas

- Límite de **2 usuarios por casa** validado en Postgres (`registrar_perfil`), no solo en el navegador.
- Los vecinos solo ven: estadísticas agregadas, sus propios reclamos y la respuesta del comité.
- Categorías de reclamos: control de accesos, comportamiento del guardia, cumplimiento de turnos, estado de instalaciones y otros.