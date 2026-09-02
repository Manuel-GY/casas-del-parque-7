# Casas del Parque 7 — Plataforma Oficial de Gestión Comunitaria

Plataforma web progresiva (GitHub Pages + Supabase) desarrollada de forma **Serverless & Zero-Build** para la gestión transparente de reclamos y sugerencias sobre el servicio de guardias y seguridad del condominio **Casas del Parque 7** (142 casas).

---

## 🌟 Funcionalidades Principales

### 🏡 Para Vecinos
- **Registro por Casa**: Máximo 2 vecinos registrados por vivienda (validado estrictamente en base de datos).
- **Envío de Reclamos**: Selección de categoría (accesos, comportamiento, turnos, instalaciones, otros) y severidad (baja, media, alta).
- **Envío de Sugerencias**: Propuestas para la mejora comunitaria.
- **Historial Privado**: Visualización exclusiva de sus propias solicitudes y de la respuesta del Comité / Administración.
- **Estadísticas Comunitarias**: Métricas anónimas agregadas por mes, severidad, categoría y estado.

### 🛡️ Para el Comité y la Administración
- **Panel de Control Completo**: Gestión detallada de todos los reclamos y sugerencias con estado (*Nuevo*, *En revisión*, *Resuelto* / *Resuelta*).
- **Buscador en Tiempo Real**: Filtrado dinámico por palabra clave, título, detalle o número de casa.
- **Exportación a CSV / Excel**: Descarga de reportes en formato `.csv` compatible con Microsoft Excel (codificación UTF-8 con BOM).
- **Gestión de Roles (Solo Admin)**: Asignación de permisos de Comité o Administración a perfiles registrados.

### 📱 Experiencia Móvil & PWA
- **Barra de Navegación Inferior (Bottom Tab Bar)**: Menú táctil fijado en la parte inferior con iconos SVG para un manejo cómodo con una sola mano en smartphones (iOS / Android).
- **Prevención de Auto-Zoom**: Ajustes tipográficos a `16px` en controles de formulario para evitar el zoom involuntario en iPhone / Safari.
- **Transparencia y Privacidad**: Modal interactivo de Política de Privacidad accesible desde el pie de página e insignias de confidencialidad en los formularios.

---

## 🔒 Arquitectura de Seguridad (Supabase RLS)

- **Servidor Cero (Zero Server)**: El frontend se sirve como archivos estáticos a través de **GitHub Pages**.
- **Row Level Security (RLS) en PostgreSQL**:
  - Toda la seguridad está garantizada en la base de datos Supabase.
  - Los vecinos **solo pueden consultar sus propios reclamos** (`creado_por = auth.uid()`).
  - La clave pública (`anon key`) no compromete la información, pues PostgreSQL rechaza cualquier consulta no autorizada.
- **Cambio Obligatorio de Contraseña**: Las cuentas genéricas de demostración o iniciales son forzadas a cambiar su clave por defecto en el primer inicio de sesión.

---

## 🔑 Cuentas Iniciales de Prueba

| Rol | Correo | Contraseña Inicial | Casa |
|---|---|---|---|
| Administración | `administracion@casasdelparque7.cl` | `AdminCP7#2026` | Sin casa |
| Comité | `comite@casasdelparque7.cl` | `ComiteCP7#2026` | Sin casa |

> ⚠️ Al ingresar por primera vez con estas cuentas, el sistema exigirá crear una contraseña personalizada segura antes de mostrar el panel.

### Script SQL para Inicialización de Cuentas (Ejecutar en Supabase SQL Editor):

```sql
alter table public.profiles alter column numero_casa drop not null;
alter table public.profiles add column if not exists debe_cambiar_pass boolean not null default false;

insert into public.profiles (id, nombre, numero_casa, rol, debe_cambiar_pass)
select id, 'Comité CDP7', null, 'comite', true
from auth.users where email = 'comite@casasdelparque7.cl'
on conflict (id) do update set rol = 'comite', numero_casa = null, nombre = 'Comité CDP7', debe_cambiar_pass = true;

update public.profiles p
set rol = 'admin', numero_casa = null, nombre = 'Administración CDP7', debe_cambiar_pass = true
from auth.users u
where u.email = 'administracion@casasdelparque7.cl' and u.id = p.id;
```

---

## 🚀 Pasos de Instalación y Despliegue

### 1. Configurar Supabase Backend
1. Crea un proyecto gratuito en [https://supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega el contenido de [`sql/schema.sql`](sql/schema.sql) y ejecútalo.
3. Copia la **URL del proyecto** y la **anon key** en **Project Settings → API** y agrégalas en [`config.js`](config.js).

### 2. Configurar el Primer Administrador
Tras crear tu primera cuenta como vecino, promuévela a `admin` ejecutando en el SQL Editor:

```sql
update public.profiles set rol = 'admin'
where id = (select id from auth.users where email = 'tu_correo@ejemplo.cl');
```

### 3. Despliegue en GitHub Pages
1. Sube los cambios al repositorio en la rama `main`.
2. Ve a **Settings → Pages → Source: Deploy from a branch → main / (root)**.

---

## 💻 Desarrollo Local

Para probar localmente, ejecuta un servidor estático (requerido para evitar bloqueos CORS):

```bash
# Con Node.js
npx serve .

# O con Python
python -m http.server 8080
```

Abre en tu navegador: `http://localhost:8080`.

---

## 📁 Estructura del Código

```
├── index.html          Pantalla de Login, Registro, aviso de privacidad y modal
├── app.html            Panel principal (Vecino / Comité / Admin), navegación y formularios
├── config.js           Credenciales públicas (URL + anon key de Supabase)
├── css/style.css       Sistema de diseño, glassmorphism, responsive y Bottom Navigation Bar
├── js/auth.js          Inicialización del cliente Supabase, traducción de errores y modal
├── js/index.js         Lógica de autenticación e inicio de sesión
├── js/app.js           Panel dinámico, validaciones, buscador en tiempo real y exportación CSV
├── js/stats.js         Motor de gráficos dinámicos en HTML5 Canvas (sin dependencias)
└── sql/schema.sql      Esquema de base de datos, funciones SECURITY DEFINER y políticas RLS
```