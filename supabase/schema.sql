-- =====================================================================
-- Lotería iO.GENIX 2026 · Esquema de base de datos (Supabase / PostgreSQL)
-- Todo el acceso desde la web pasa por funciones RPC (SECURITY DEFINER).
-- Las tablas tienen RLS activado y sin políticas: nadie puede leerlas
-- ni escribirlas directamente con la clave pública.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Configuración (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.lot_config (
  id                 int primary key default 1 check (id = 1),
  reg_open           timestamptz not null default '2026-12-01 00:00:00 Europe/Madrid',
  reg_close          timestamptz not null default '2026-12-21 23:59:59 Europe/Madrid',
  draw_at            timestamptz not null default '2026-12-22 09:00:00 Europe/Madrid',
  winning_number     text check (winning_number ~ '^[0-9]{5}$'),
  results_published  boolean not null default false,
  discount_code      text not null default 'NAVIDAD5',
  discount_text      text not null default '5 % de descuento extra en la web hasta el 30 de enero de 2027',
  packs              jsonb not null default '[]'::jsonb,
  tombola            jsonb not null default '{"activa":false,"premio":"","ganadores":0,"suplentes":0,"fecha":"","descripcion":""}'::jsonb,
  admin_hash         text not null,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Décimos: uno por pedido, número único 00000-99999
-- ---------------------------------------------------------------------
create table if not exists public.lot_tickets (
  id          bigserial primary key,
  order_ref   text not null unique,
  email       text not null,
  number      int  not null unique check (number between 0 and 99999),
  status      text not null default 'activo' check (status in ('activo','anulado')),
  is_test     boolean not null default false,
  shared_at   timestamptz,
  prize_code  text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lot_tickets_email_idx on public.lot_tickets (email);
create index if not exists lot_tickets_created_idx on public.lot_tickets (created_at);

-- ---------------------------------------------------------------------
-- Sorteos de la tómbola (historial; el último marcado oficial es el válido)
-- ---------------------------------------------------------------------
create table if not exists public.lot_tombola_draws (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  official     boolean not null default true,
  pool_size    int not null,
  entries      int not null,
  winners      jsonb not null,   -- [{order_ref, email_masked, number}]
  substitutes  jsonb not null,
  note         text
);

-- ---------------------------------------------------------------------
-- Registro de intentos fallidos de acceso al panel (freno a fuerza bruta)
-- ---------------------------------------------------------------------
create table if not exists public.lot_admin_fails (
  at timestamptz not null default now()
);

alter table public.lot_config        enable row level security;
alter table public.lot_tickets       enable row level security;
alter table public.lot_tombola_draws enable row level security;
alter table public.lot_admin_fails   enable row level security;

revoke all on public.lot_config, public.lot_tickets, public.lot_tombola_draws, public.lot_admin_fails from anon, authenticated;

-- =====================================================================
-- Utilidades internas
-- =====================================================================

create or replace function public.lot_norm_ref(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p,''), '[^A-Za-z0-9-]', '', 'g'))
$$;

create or replace function public.lot_mask_email(p text) returns text
language sql immutable as $$
  select case when position('@' in p) > 1
    then left(p,1) || repeat('•', greatest(length(split_part(p,'@',1))-1,1)) || '@' || split_part(p,'@',2)
    else '•••' end
$$;

-- Premio (en euros) de un número frente al número ganador. No acumulables.
create or replace function public.lot_prize(p_number int, p_winning text) returns int
language sql immutable as $$
  select case
    when p_winning is null then 0
    when lpad(p_number::text,5,'0') = p_winning then 1000
    when right(lpad(p_number::text,5,'0'),4) = right(p_winning,4) then 500
    when right(lpad(p_number::text,5,'0'),3) = right(p_winning,3) then 150
    else 0 end
$$;

-- Número aleatorio criptográfico 0-99999
create or replace function public.lot_rand_number() returns int
language sql volatile as $$
  select (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 100000)::int
$$;

-- Comprobación de contraseña del panel
create or replace function public.lot_admin_ok(p_pw text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text; recent int;
begin
  select count(*) into recent from lot_admin_fails where at > now() - interval '10 minutes';
  if recent >= 20 then
    raise exception 'demasiados_intentos' using errcode = 'P0001';
  end if;
  select admin_hash into h from lot_config where id = 1;
  if h is not null and extensions.crypt(coalesce(p_pw,''), h) = h then
    return true;
  end if;
  insert into lot_admin_fails default values;
  delete from lot_admin_fails where at < now() - interval '1 day';
  perform pg_sleep(0.8);
  return false;
end $$;

create or replace function public.lot_require_admin(p_pw text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not lot_admin_ok(p_pw) then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;
end $$;

-- Ficha de un décimo para el cliente
create or replace function public.lot_ticket_json(t public.lot_tickets, c public.lot_config) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  prize int := 0;
  tomb jsonb := null;
  d record;
begin
  if c.results_published and t.status = 'activo' and not t.is_test then
    prize := lot_prize(t.number, c.winning_number);
  end if;
  select * into d from lot_tombola_draws where official order by id desc limit 1;
  if found then
    if d.winners @> jsonb_build_array(jsonb_build_object('order_ref', t.order_ref)) then
      tomb := jsonb_build_object('resultado','ganador');
    elsif d.substitutes @> jsonb_build_array(jsonb_build_object('order_ref', t.order_ref)) then
      tomb := jsonb_build_object('resultado','suplente');
    else
      tomb := jsonb_build_object('resultado','no');
    end if;
  end if;
  return jsonb_build_object(
    'order_ref', t.order_ref,
    'number', lpad(t.number::text,5,'0'),
    'status', t.status,
    'is_test', t.is_test,
    'shared', t.shared_at is not null,
    'created_at', t.created_at,
    'discount_code', case when t.status='activo' then c.discount_code end,
    'discount_text', c.discount_text,
    'packs', case when t.status='activo' then c.packs else '[]'::jsonb end,
    'results_published', c.results_published,
    'winning_number', case when c.results_published then c.winning_number end,
    'prize', prize,
    'prize_code', case when prize > 0 then t.prize_code end,
    'tombola', tomb
  );
end $$;

-- =====================================================================
-- API PÚBLICA (clave anon)
-- =====================================================================

-- Estado general de la promoción
create or replace function public.lot_public_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c lot_config; phase text;
begin
  select * into c from lot_config where id = 1;
  phase := case
    when now() < c.reg_open then 'antes'
    when now() <= c.reg_close then 'abierto'
    else 'cerrado' end;
  return jsonb_build_object(
    'phase', phase,
    'now', now(),
    'reg_open', c.reg_open,
    'reg_close', c.reg_close,
    'draw_at', c.draw_at,
    'results_published', c.results_published,
    'winning_number', case when c.results_published then c.winning_number end,
    'tombola', jsonb_build_object(
        'activa', coalesce((c.tombola->>'activa')::boolean,false),
        'premio', c.tombola->>'premio',
        'ganadores', c.tombola->'ganadores',
        'fecha', c.tombola->>'fecha',
        'descripcion', c.tombola->>'descripcion',
        'sorteada', exists(select 1 from lot_tombola_draws where official)),
    'packs_count', jsonb_array_length(c.packs)
  );
end $$;

-- Conseguir (o recuperar) el décimo de un pedido
create or replace function public.lot_get_ticket(p_order text, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c lot_config;
  ref text := lot_norm_ref(p_order);
  em  text := lower(trim(coalesce(p_email,'')));
  t lot_tickets;
  test boolean;
  n int; tries int := 0;
begin
  select * into c from lot_config where id = 1;

  if length(ref) < 3 or length(ref) > 40 then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 200 then
    raise exception 'email_invalido' using errcode = 'P0001';
  end if;

  select * into t from lot_tickets where order_ref = ref;
  if found then
    if t.email <> em then
      raise exception 'email_no_coincide' using errcode = 'P0001';
    end if;
    return lot_ticket_json(t, c) || jsonb_build_object('nuevo', false);
  end if;

  test := ref like 'TEST%';
  if not test then
    if now() < c.reg_open then raise exception 'aun_no_abierto' using errcode = 'P0001'; end if;
    if now() > c.reg_close then raise exception 'cerrado' using errcode = 'P0001'; end if;
  end if;

  -- Freno básico de abuso: máximo 30 décimos por email
  if (select count(*) from lot_tickets where email = em) >= 30 then
    raise exception 'limite_email' using errcode = 'P0001';
  end if;

  loop
    tries := tries + 1;
    n := lot_rand_number();
    begin
      insert into lot_tickets(order_ref, email, number, is_test)
      values (ref, em, n, test)
      returning * into t;
      exit;
    exception when unique_violation then
      -- ¿Otro proceso registró el mismo pedido a la vez?
      select * into t from lot_tickets where order_ref = ref;
      if found then
        if t.email <> em then raise exception 'email_no_coincide' using errcode = 'P0001'; end if;
        return lot_ticket_json(t, c) || jsonb_build_object('nuevo', false);
      end if;
      if tries > 200 then raise exception 'sin_numeros' using errcode = 'P0001'; end if;
    end;
  end loop;

  return lot_ticket_json(t, c) || jsonb_build_object('nuevo', true);
end $$;

-- Marcar que el décimo se ha compartido (participación extra en la tómbola)
create or replace function public.lot_mark_shared(p_order text, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare ref text := lot_norm_ref(p_order); em text := lower(trim(coalesce(p_email,''))); t lot_tickets;
begin
  update lot_tickets set shared_at = coalesce(shared_at, now()), updated_at = now()
   where order_ref = ref and email = em
   returning * into t;
  if not found then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  return jsonb_build_object('shared', true);
end $$;

-- =====================================================================
-- API DEL PANEL INTERNO (requiere contraseña)
-- =====================================================================

create or replace function public.lot_admin_login(p_pw text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  return lot_admin_ok(p_pw);
end $$;

create or replace function public.lot_admin_dashboard(p_pw text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c lot_config; res jsonb;
begin
  perform lot_require_admin(p_pw);
  select * into c from lot_config where id = 1;
  select jsonb_build_object(
    'config', jsonb_build_object(
        'reg_open', c.reg_open, 'reg_close', c.reg_close, 'draw_at', c.draw_at,
        'winning_number', c.winning_number, 'results_published', c.results_published,
        'discount_code', c.discount_code, 'discount_text', c.discount_text,
        'packs', c.packs, 'tombola', c.tombola),
    'stats', (select jsonb_build_object(
        'total',     count(*) filter (where not is_test),
        'activos',   count(*) filter (where not is_test and status='activo'),
        'anulados',  count(*) filter (where not is_test and status='anulado'),
        'compartidos', count(*) filter (where not is_test and shared_at is not null),
        'emails',    count(distinct email) filter (where not is_test),
        'pruebas',   count(*) filter (where is_test)) from lot_tickets),
    'por_dia', coalesce((select jsonb_agg(x order by x->>'dia') from (
        select jsonb_build_object('dia', dia, 'n', count(*)) x
          from (select to_char(created_at at time zone 'Europe/Madrid','YYYY-MM-DD') dia from lot_tickets where not is_test) q
         group by dia) s), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object(
        'order_ref', order_ref, 'email', email, 'number', lpad(number::text,5,'0'),
        'status', status, 'is_test', is_test, 'shared', shared_at is not null,
        'prize_code', prize_code, 'note', note, 'created_at', created_at,
        'prize', case when c.winning_number is not null and status='activo' and not is_test then lot_prize(number, c.winning_number) else 0 end
      ) order by created_at desc) from lot_tickets), '[]'::jsonb),
    'tombola_draws', coalesce((select jsonb_agg(to_jsonb(d) order by d.id desc) from lot_tombola_draws d), '[]'::jsonb)
  ) into res;
  return res;
end $$;

create or replace function public.lot_admin_set_status(p_pw text, p_order text, p_status text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform lot_require_admin(p_pw);
  if p_status not in ('activo','anulado') then raise exception 'estado_invalido' using errcode='P0001'; end if;
  update lot_tickets set status = p_status, note = coalesce(p_note, note), updated_at = now()
   where order_ref = lot_norm_ref(p_order);
  if not found then raise exception 'no_encontrado' using errcode='P0001'; end if;
end $$;

-- Anular en bloque una lista de referencias (pedidos cancelados / devueltos)
create or replace function public.lot_admin_bulk_cancel(p_pw text, p_orders text[], p_note text default 'Pedido cancelado o devuelto') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare n int; refs text[];
begin
  perform lot_require_admin(p_pw);
  select array_agg(lot_norm_ref(x)) into refs from unnest(p_orders) x;
  update lot_tickets set status = 'anulado', note = p_note, updated_at = now()
   where order_ref = any(refs) and status = 'activo';
  get diagnostics n = row_count;
  return jsonb_build_object('anulados', n,
    'no_encontrados', coalesce((select jsonb_agg(r) from unnest(refs) r where not exists (select 1 from lot_tickets where order_ref = r)), '[]'::jsonb));
end $$;

create or replace function public.lot_admin_set_prize_code(p_pw text, p_order text, p_code text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform lot_require_admin(p_pw);
  update lot_tickets set prize_code = nullif(trim(p_code),''), updated_at = now()
   where order_ref = lot_norm_ref(p_order);
  if not found then raise exception 'no_encontrado' using errcode='P0001'; end if;
end $$;

create or replace function public.lot_admin_delete_tests(p_pw text) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform lot_require_admin(p_pw);
  delete from lot_tickets where is_test;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.lot_admin_set_result(p_pw text, p_winning text, p_publish boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare w text := nullif(regexp_replace(coalesce(p_winning,''),'\D','','g'),'');
begin
  perform lot_require_admin(p_pw);
  if w is not null and length(w) <> 5 then raise exception 'numero_invalido' using errcode='P0001'; end if;
  if p_publish and w is null then raise exception 'numero_invalido' using errcode='P0001'; end if;
  update lot_config set winning_number = w, results_published = coalesce(p_publish,false), updated_at = now() where id = 1;
  return (select jsonb_build_object(
    'winning_number', w,
    'ganadores', coalesce(jsonb_agg(jsonb_build_object('order_ref',order_ref,'email',email,'number',lpad(number::text,5,'0'),'prize',lot_prize(number,w)) order by lot_prize(number,w) desc), '[]'::jsonb))
    from lot_tickets where status='activo' and not is_test and lot_prize(number,w) > 0);
end $$;

create or replace function public.lot_admin_save_config(p_pw text, p_cfg jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform lot_require_admin(p_pw);
  update lot_config set
    reg_open      = coalesce((p_cfg->>'reg_open')::timestamptz, reg_open),
    reg_close     = coalesce((p_cfg->>'reg_close')::timestamptz, reg_close),
    draw_at       = coalesce((p_cfg->>'draw_at')::timestamptz, draw_at),
    discount_code = coalesce(nullif(p_cfg->>'discount_code',''), discount_code),
    discount_text = coalesce(nullif(p_cfg->>'discount_text',''), discount_text),
    packs         = case when p_cfg ? 'packs'   then p_cfg->'packs'   else packs end,
    tombola       = case when p_cfg ? 'tombola' then p_cfg->'tombola' else tombola end,
    updated_at    = now()
  where id = 1;
end $$;

create or replace function public.lot_admin_change_password(p_pw text, p_new text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  perform lot_require_admin(p_pw);
  if length(coalesce(p_new,'')) < 8 then raise exception 'password_corta' using errcode='P0001'; end if;
  update lot_config set admin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = 1;
end $$;

-- Tómbola: entre décimos activos, no de prueba y SIN premio de lotería.
-- Compartir el décimo = 2 participaciones. Sorteo con aleatoriedad criptográfica.
create or replace function public.lot_admin_tombola_draw(p_pw text, p_winners int, p_substitutes int, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  c lot_config; pool int; ents int; w jsonb; s jsonb; d lot_tombola_draws;
begin
  perform lot_require_admin(p_pw);
  select * into c from lot_config where id = 1;
  if not c.results_published then raise exception 'primero_resultado' using errcode='P0001'; end if;
  if coalesce(p_winners,0) < 1 then raise exception 'ganadores_invalido' using errcode='P0001'; end if;

  create temp table _pool on commit drop as
    select order_ref, email, number, case when shared_at is not null then 2 else 1 end as weight
      from lot_tickets
     where status='activo' and not is_test and lot_prize(number, c.winning_number) = 0;
  select count(*), coalesce(sum(weight),0) into pool, ents from _pool;
  if pool < p_winners + coalesce(p_substitutes,0) then raise exception 'pocos_participantes' using errcode='P0001'; end if;

  -- Muestreo ponderado sin reemplazo (Efraimidis–Spirakis): clave = u^(1/peso)
  create temp table _drawn on commit drop as
    select order_ref, email, number,
           row_number() over (order by power(
              ((('x'||encode(gen_random_bytes(6),'hex'))::bit(48)::bigint + 1)::float8 / 281474976710657.0),
              1.0/weight) desc) as pos
      from _pool;

  select coalesce(jsonb_agg(jsonb_build_object('order_ref',order_ref,'email',email,'email_masked',lot_mask_email(email),'number',lpad(number::text,5,'0')) order by pos),'[]'::jsonb)
    into w from _drawn where pos <= p_winners;
  select coalesce(jsonb_agg(jsonb_build_object('order_ref',order_ref,'email',email,'email_masked',lot_mask_email(email),'number',lpad(number::text,5,'0')) order by pos),'[]'::jsonb)
    into s from _drawn where pos > p_winners and pos <= p_winners + coalesce(p_substitutes,0);

  update lot_tombola_draws set official = false where official;
  insert into lot_tombola_draws(official, pool_size, entries, winners, substitutes, note)
  values (true, pool, ents, w, s, p_note) returning * into d;
  return to_jsonb(d);
end $$;

-- =====================================================================
-- Permisos: solo las funciones de la API son ejecutables con la clave pública
-- =====================================================================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'lot\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.lot_public_state()                                   to anon, authenticated;
grant execute on function public.lot_get_ticket(text, text)                           to anon, authenticated;
grant execute on function public.lot_mark_shared(text, text)                          to anon, authenticated;
grant execute on function public.lot_admin_login(text)                                to anon, authenticated;
grant execute on function public.lot_admin_dashboard(text)                            to anon, authenticated;
grant execute on function public.lot_admin_set_status(text, text, text, text)         to anon, authenticated;
grant execute on function public.lot_admin_bulk_cancel(text, text[], text)            to anon, authenticated;
grant execute on function public.lot_admin_set_prize_code(text, text, text)           to anon, authenticated;
grant execute on function public.lot_admin_delete_tests(text)                         to anon, authenticated;
grant execute on function public.lot_admin_set_result(text, text, boolean)            to anon, authenticated;
grant execute on function public.lot_admin_save_config(text, jsonb)                   to anon, authenticated;
grant execute on function public.lot_admin_change_password(text, text)                to anon, authenticated;
grant execute on function public.lot_admin_tombola_draw(text, int, int, text)         to anon, authenticated;
