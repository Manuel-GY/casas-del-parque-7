-- ============================================================
-- Casas del Parque 7 — Esquema de base de datos (Supabase)
-- Cómo usar: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

create extension if not exists "pgcrypto";

-- 1) CASAS (142) ----------------------------------------------
create table if not exists public.casas (
  numero integer primary key
);

insert into public.casas (numero)
select gs from generate_series(1, 142) gs
on conflict (numero) do nothing;

-- 2) PERFILES (1 usuario = 1 vecino; 2 por casa; comité/admin sin casa) -----
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nombre            text not null check (length(nombre) between 1 and 120),
  numero_casa       integer references public.casas(numero),
  rol               text not null default 'vecino'
                    check (rol in ('vecino','comite','admin')),
  debe_cambiar_pass boolean not null default false,
  created_at        timestamptz not null default now()
);

-- Compatibilidad con versiones previas del esquema: agrega la columna si falta
alter table public.profiles add column if not exists debe_cambiar_pass boolean not null default false;

-- 3) RECLAMOS -------------------------------------------------
create table if not exists public.reclamos (
  id          uuid primary key default gen_random_uuid(),
  creado_por  uuid references public.profiles(id) on delete set null,
  numero_casa integer not null references public.casas(numero),
  categoria   text not null
              check (categoria in ('acceso','comportamiento','turnos','instalaciones','otro')),
  severidad   text not null default 'media'
              check (severidad in ('baja','media','alta')),
  titulo      text not null check (length(titulo) between 3 and 200),
  descripcion text not null check (length(descripcion) between 10 and 2000),
  estado      text not null default 'nuevo'
              check (estado in ('nuevo','en_revision','resuelto')),
  respuesta   text,
  atendido_por uuid references public.profiles(id) on delete set null,
  resuelto_en timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists reclamos_estado_idx on public.reclamos(estado);
create index if not exists reclamos_casa_idx  on public.reclamos(numero_casa);
create index if not exists reclamos_fecha_idx on public.reclamos(created_at);

-- 4) FUNCIONES DE AYUDA (evitan recursión en RLS) -------------
create or replace function public.mi_rol()
returns text
language sql stable security definer
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid()
$$;

create or replace function public.mi_casa()
returns integer
language sql stable security definer
set search_path = public
as $$
  select numero_casa from public.profiles where id = auth.uid()
$$;

-- 5) REGISTRO (límite de 2 por casa; comité/admin sin casa) -----------------
-- SECURITY DEFINER: única vía para crear perfiles (el INSERT directo
-- está bloqueado por RLS). Valida en la base, no solo en el frontend.
-- - Vecino: exige número de casa y respeta el cupo de 2 por casa.
-- - Comité/Administración: sin casa, solo si lo pide un admin.
create or replace function public.registrar_perfil(
  p_nombre text,
  p_casa   integer,
  p_rol    text default 'vecino'
)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  v_cuenta integer;
  v_perfil public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Este usuario ya tiene un perfil registrado.';
  end if;

  if p_rol not in ('vecino','comite','admin') then
    raise exception 'Rol inválido.';
  end if;

  if p_rol <> 'vecino' then
    if coalesce(public.mi_rol(),'') <> 'admin' then
      raise exception 'Solo la administración puede crear cuentas de comité/admin.';
    end if;

    insert into public.profiles (id, nombre, numero_casa, rol)
    values (auth.uid(), p_nombre, null, p_rol)
    returning * into v_perfil;

    return v_perfil;
  end if;

  if p_casa is null then
    raise exception 'Los vecinos deben indicar su número de casa.';
  end if;

  if not exists (select 1 from public.casas where numero = p_casa) then
    raise exception 'La casa % no existe.', p_casa;
  end if;

  -- El cupo de 2 aplica solo a vecinos: comité/admin no ocupan espacio.
  select count(*) into v_cuenta
  from public.profiles
  where numero_casa = p_casa and rol = 'vecino';
  if v_cuenta >= 2 then
    raise exception 'La casa % ya tiene sus 2 vecinos registrados.', p_casa;
  end if;

  insert into public.profiles (id, nombre, numero_casa, rol)
  values (auth.uid(), p_nombre, p_casa, p_rol)
  returning * into v_perfil;

  return v_perfil;
end;
$$;

-- 6) ASIGNAR ROL (solo admin) --------------------------------
create or replace function public.asignar_rol(
  p_usuario uuid,
  p_rol     text
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(),'') <> 'admin' then
    raise exception 'Solo un administrador puede asignar roles.';
  end if;

  if p_rol not in ('vecino','comite','admin') then
    raise exception 'Rol inválido.';
  end if;

  update public.profiles set rol = p_rol where id = p_usuario;
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;
end;
$$;

create or replace function public.marcar_clave_cambiada()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.profiles set debe_cambiar_pass = false where id = auth.uid();
end;
$$;

-- 7) DETALLE DE RECLAMOS (solo comité/admin) -----------------
create or replace function public.reclamos_detalle()
returns table (
  id             uuid,
  titulo         text,
  descripcion    text,
  categoria      text,
  severidad      text,
  estado         text,
  respuesta      text,
  nombre         text,
  numero_casa    integer,
  atendido_nombre text,
  created_at     timestamptz,
  resuelto_en    timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(),'') not in ('comite','admin') then
    raise exception 'Sin permisos para ver el detalle de reclamos.';
  end if;

  return query
    select r.id, r.titulo, r.descripcion, r.categoria, r.severidad,
           r.estado, r.respuesta,
           p.nombre, r.numero_casa,
           pa.nombre as atendido_nombre,
           r.created_at, r.resuelto_en
    from public.reclamos r
    left join public.profiles p  on p.id  = r.creado_por
    left join public.profiles pa on pa.id = r.atendido_por
    order by r.created_at desc;
end;
$$;

-- 8) RESPONDER / CAMBIAR ESTADO (solo comité/admin) ----------
create or replace function public.responder_reclamo(
  p_id        uuid,
  p_estado    text,
  p_respuesta text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(),'') not in ('comite','admin') then
    raise exception 'Sin permisos.';
  end if;

  if p_estado not in ('nuevo','en_revision','resuelto') then
    raise exception 'Estado inválido.';
  end if;

  update public.reclamos
  set estado      = p_estado,
      respuesta   = coalesce(p_respuesta, respuesta),
      atendido_por = auth.uid(),
      resuelto_en = case when p_estado = 'resuelto' then now() else resuelto_en end
  where id = p_id;

  if not found then
    raise exception 'Reclamo no encontrado.';
  end if;
end;
$$;

-- 9) ESTADÍSTICAS AGREGADAS (solo conteos, sin detalles) ------
create or replace function public.estadisticas()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_json jsonb;
begin
  select jsonb_build_object(
    'total', (select count(*)::int from public.reclamos),
    'por_estado', (
      select coalesce(jsonb_object_agg(estado, n order by
        case estado when 'nuevo' then 1 when 'en_revision' then 2 when 'resuelto' then 3 else 4 end),
        '{}'::jsonb)
      from (select estado, count(*)::int as n from public.reclamos group by estado) t
    ),
    'por_categoria', (
      select coalesce(jsonb_object_agg(categoria, n), '{}'::jsonb)
      from (select categoria, count(*)::int as n from public.reclamos group by categoria) t
    ),
    'por_severidad', (
      select coalesce(jsonb_object_agg(severidad, n), '{}'::jsonb)
      from (select severidad, count(*)::int as n from public.reclamos group by severidad) t
    ),
    'por_mes', (
      select coalesce(jsonb_agg(
        jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'cantidad', n) order by m), '[]'::jsonb)
      from (
        select date_trunc('month', created_at)::date as m, count(*)::int as n
        from public.reclamos group by 1
      ) t
    ),
    'por_casa', (
      select coalesce(jsonb_agg(
        jsonb_build_object('casa', numero_casa, 'cantidad', n) order by numero_casa), '[]'::jsonb)
      from (
        select numero_casa, count(*)::int as n
        from public.reclamos group by numero_casa
      ) t
    ),
    'sug_total', (select count(*)::int from public.sugerencias),
    'sug_por_estado', (
      select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
      from (select estado, count(*)::int as n from public.sugerencias group by estado) t
    ),
    'sug_por_mes', (
      select coalesce(jsonb_agg(
        jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'cantidad', n) order by m), '[]'::jsonb)
      from (
        select date_trunc('month', created_at)::date as m, count(*)::int as n
        from public.sugerencias group by 1
      ) t
    )
  ) into v_json;

  return v_json;
end;
$$;

-- 9bis) SUGERENCIAS DE VECINOS --------------------------------
create table if not exists public.sugerencias (
  id          uuid primary key default gen_random_uuid(),
  creado_por  uuid references public.profiles(id) on delete set null,
  numero_casa integer not null references public.casas(numero),
  titulo      text not null check (length(titulo) between 3 and 200),
  descripcion text not null check (length(descripcion) between 10 and 2000),
  estado      text not null default 'nueva'
              check (estado in ('nueva','en_revision','resuelta')),
  respuesta   text,
  atendido_por uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists sugerencias_casa_idx on public.sugerencias(numero_casa);
create index if not exists sugerencias_fecha_idx on public.sugerencias(created_at);

-- Detalle de sugerencias (solo comité/admin)
create or replace function public.sugerencias_detalle()
returns table (
  id             uuid,
  titulo         text,
  descripcion    text,
  estado         text,
  respuesta      text,
  nombre         text,
  numero_casa    integer,
  atendido_nombre text,
  created_at     timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(),'') not in ('comite','admin') then
    raise exception 'Sin permisos para ver el detalle de sugerencias.';
  end if;

  return query
    select s.id, s.titulo, s.descripcion, s.estado, s.respuesta,
           p.nombre, s.numero_casa,
           pa.nombre as atendido_nombre,
           s.created_at
    from public.sugerencias s
    left join public.profiles p  on p.id  = s.creado_por
    left join public.profiles pa on pa.id = s.atendido_por
    order by s.created_at desc;
end;
$$;

-- Responder / cambiar estado de sugerencia (solo comité/admin)
create or replace function public.responder_sugerencia(
  p_id        uuid,
  p_estado    text,
  p_respuesta text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(),'') not in ('comite','admin') then
    raise exception 'Sin permisos.';
  end if;

  if p_estado not in ('nueva','en_revision','resuelta') then
    raise exception 'Estado inválido.';
  end if;

  update public.sugerencias
  set estado       = p_estado,
      respuesta    = coalesce(p_respuesta, respuesta),
      atendido_por = auth.uid()
  where id = p_id;

  if not found then
    raise exception 'Sugerencia no encontrada.';
  end if;
end;
$$;

-- 10) ROW LEVEL SECURITY -------------------------------------
alter table public.casas      enable row level security;
alter table public.profiles   enable row level security;
alter table public.reclamos   enable row level security;
alter table public.sugerencias enable row level security;

drop policy if exists "casas_lectura" on public.casas;
create policy "casas_lectura" on public.casas
  for select using (true);

drop policy if exists "profiles_mi_miembro" on public.profiles;
create policy "profiles_mi_miembro" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_comite_admin" on public.profiles;
create policy "profiles_comite_admin" on public.profiles
  for select using (coalesce(public.mi_rol(),'') in ('comite','admin'));

-- Vecino: crea reclamos solo a su nombre y su casa.
drop policy if exists "reclamos_insert" on public.reclamos;
create policy "reclamos_insert" on public.reclamos
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and creado_por = auth.uid()
    and numero_casa = public.mi_casa()
    and estado = 'nuevo'
    and respuesta is null
  );

-- Vecino: ve solo sus propios reclamos (comunidad = solo estadísticas).
drop policy if exists "reclamos_select_mios" on public.reclamos;
create policy "reclamos_select_mios" on public.reclamos
  for select to authenticated
  using (creado_por = auth.uid());

-- Comité/admin: ven el detalle de todos.
drop policy if exists "reclamos_select_comite" on public.reclamos;
create policy "reclamos_select_comite" on public.reclamos
  for select to authenticated
  using (coalesce(public.mi_rol(),'') in ('comite','admin'));

-- Vecino: crea sugerencias solo a su nombre y su casa.
drop policy if exists "sugerencias_insert" on public.sugerencias;
create policy "sugerencias_insert" on public.sugerencias
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid())
    and creado_por = auth.uid()
    and numero_casa = public.mi_casa()
    and estado = 'nueva'
    and respuesta is null
  );

-- Vecino: ve solo sus propias sugerencias.
drop policy if exists "sugerencias_select_mias" on public.sugerencias;
create policy "sugerencias_select_mias" on public.sugerencias
  for select to authenticated
  using (creado_por = auth.uid());

-- Comité/admin: ven el detalle de todas.
drop policy if exists "sugerencias_select_comite" on public.sugerencias;
create policy "sugerencias_select_comite" on public.sugerencias
  for select to authenticated
  using (coalesce(public.mi_rol(),'') in ('comite','admin'));

-- NOTA: no hay política INSERT/UPDATE directa sobre profiles por el
-- público: registrar_perfil() es la única puerta (límite 2 por casa).
-- Los cambios de estado/respuesta van por responder_reclamo().

-- 11) BOTONERA PRIMER ADMIN (ejecutar luego en SQL Editor) -----
-- update public.profiles set rol = 'admin'
-- where id = (select id from auth.users where email = 'tu_correo@ejemplo.cl');

-- 12) USUARIO DEMO (vecino autorizado, casa DEMO = Casa 1) ----
-- EJECUTAR UNA SOLA VEZ desde el SQL Editor de Supabase.
-- Crea el usuario de prueba demo@demo.cl / demo123456 con rol 'vecino' y la casa DEMO (Casa 1).
-- El botón "USER DEMO" del login inicia sesión con estas credenciales.
do $$
declare
  v_user_id uuid;
  v_email text := 'demo@demo.cl';
  v_pass text := 'demo123456';
  v_nombre text := 'USER DEMO';
  v_casa   integer := 1; -- casa DEMO para pruebas
begin
  select id into v_user_id from auth.users where email = v_email;

  -- Si el usuario ya existe, no hacer nada (evita repetir el email en auth)
  if v_user_id is not null then
    raise notice 'El usuario demo ya existe: %', v_email;
    return;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(v_pass, gen_salt('bf')),
    now(),
    now(), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('nombre', v_nombre)
  );

  -- Perfil con rol vecino y casa DEMO (Casa 1)
  insert into public.profiles (id, nombre, numero_casa, rol)
  values (v_user_id, v_nombre, v_casa, 'vecino');

  raise notice 'Usuario demo creado: % / contraseña: % / casa: %', v_email, v_pass, v_casa;
end $$;