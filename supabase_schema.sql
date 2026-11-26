-- ==============================================================================
-- SCHÉMA SUPABASE COMPLET & IDEMPOTENT — CRÉNO SAAS
-- Exécutable et ré-exécutable sans aucune erreur dans Supabase SQL Editor
-- ==============================================================================

-- 1. Extension UUID
create extension if not exists "uuid-ossp";

-- 2. Permissions de base sur le schéma public (évite les erreurs 42501 permission denied)
grant usage on schema public to anon, authenticated, service_role;

-- 3. Table des profils professionnels (liée à auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  business_name text default 'Mon Établissement',
  activity_type text default 'Prestation de services',
  email text,
  phone text,
  status text default 'actif' check (status in ('actif', 'suspendu', 'inactif')),
  subscription_plan text default 'trial_14d',
  subscription_status text default 'trial',
  subscription_started_at timestamp with time zone default now(),
  subscription_ends_at timestamp with time zone,
  trial_ends_at timestamp with time zone default (now() + interval '14 days'),
  logo_url text,
  description text,
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Garantir la présence des colonnes si la table existait déjà
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists business_name text default 'Mon Établissement';
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists status text default 'actif';
alter table public.profiles add column if not exists last_sign_in_at timestamp with time zone;
alter table public.profiles add column if not exists activity_type text default 'Prestation de services';
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists subscription_plan text default 'trial_14d';
alter table public.profiles add column if not exists subscription_status text default 'trial';
alter table public.profiles add column if not exists subscription_started_at timestamp with time zone default now();
alter table public.profiles add column if not exists subscription_ends_at timestamp with time zone;
alter table public.profiles add column if not exists trial_ends_at timestamp with time zone default (now() + interval '14 days');
alter table public.profiles add column if not exists logo_url text;
alter table public.profiles add column if not exists description text;

-- Synchronisation rétroactive des emails et dernières connexions depuis auth.users vers public.profiles
update public.profiles p
set email = coalesce(nullif(p.email, ''), u.email),
    phone = coalesce(nullif(p.phone, ''), u.raw_user_meta_data->>'phone'),
    full_name = coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', p.full_name),
    business_name = coalesce(nullif(p.business_name, ''), u.raw_user_meta_data->>'business_name', p.business_name),
    last_sign_in_at = coalesce(p.last_sign_in_at, u.last_sign_in_at)
from auth.users u
where p.id = u.id;

-- Migration rétroactive pour tous les comptes existants :
-- Application par défaut du plan d'essai gratuit de 14 jours à compter de la date de création de leur compte.
-- Si les 14 jours sont dépassés sans abonnement payant, le statut passe en 'expire' (compte bloqué).
update public.profiles
set subscription_plan = coalesce(nullif(subscription_plan, ''), 'trial_14d'),
    subscription_started_at = coalesce(subscription_started_at, created_at, now()),
    subscription_status = case
      when status = 'suspendu' then 'suspendu'
      when subscription_status in ('actif', 'mensuel_10k', 'trimestriel_25k', 'annuel_80k') then subscription_status
      when (coalesce(created_at, now()) + interval '14 days') < now() then 'expire'
      else 'trial'
    end,
    trial_ends_at = coalesce(trial_ends_at, coalesce(created_at, now()) + interval '14 days')
where subscription_plan is null or trial_ends_at is null or subscription_started_at is null or subscription_plan = '' or subscription_plan = 'trial_14d';

-- 4. Table de suivi de l'activité des utilisateurs (de la création aux actions courantes)
create table if not exists public.user_activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null, -- ex: 'creation_compte', 'connexion', 'nouveau_rdv', 'validation_rdv', 'annulation_rdv', 'rdv_honore', 'mise_a_jour_parametres', 'deconnexion'
  entity_type text default 'general', -- 'auth', 'appointment', 'booking_config', 'profile'
  entity_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Table de configuration de la page de réservation publique du professionnel
create table if not exists public.booking_configs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  business_name text not null default 'Mon Établissement',
  description text default 'Bienvenue sur notre espace de réservation en ligne.',
  phone_contact text,
  address text,
  slot_duration_minutes integer default 30 not null,
  opening_time time default '09:00' not null,
  closing_time time default '18:00' not null,
  available_days text[] default array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
  require_phone boolean default true not null,
  require_notes boolean default false not null,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Contrainte d'unicité sur booking_configs(user_id) si elle n'existe pas encore
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unique_user_booking_config') then
    alter table public.booking_configs add constraint unique_user_booking_config unique (user_id);
  end if;
exception when others then null;
end $$;

alter table public.booking_configs add column if not exists available_days text[] default array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
alter table public.booking_configs add column if not exists enable_geolocation boolean default true;
alter table public.booking_configs add column if not exists latitude double precision;
alter table public.booking_configs add column if not exists longitude double precision;
alter table public.booking_configs add column if not exists google_maps_url text;
alter table public.booking_configs add column if not exists services jsonb default '[]'::jsonb;

-- 5bis. Table des Collaborateurs & Membres d'équipe
create table if not exists public.collaborators (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  role text default 'collaborateur',
  avatar_url text,
  available_days text[] default array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
  opening_time time default '09:00',
  closing_time time default '18:00',
  pin_code text default '1234',
  active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.collaborators add column if not exists pin_code text default '1234';
alter table public.collaborators add column if not exists active boolean default true;

-- 6. Table des Rendez-vous réels (prise en charge tolérante et duale des colonnes)
create table if not exists public.appointments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  collaborator_id uuid references public.collaborators(id) on delete set null,
  client_name text,
  client text,
  client_email text,
  client_phone text,
  client_whatsapp text,
  service_name text default 'Rendez-vous standard',
  title text default 'Rendez-vous standard',
  service_price integer default 0,
  appointment_date date,
  date date,
  appointment_time time,
  time time,
  duration_minutes integer default 30,
  duration integer default 30,
  status text not null default 'en_attente' check (status in ('en_attente', 'confirme', 'annule', 'honore')),
  notes text,
  internal_notes text,
  client_cancel_reason text,
  source text default 'lien_public' check (source in ('lien_public', 'manuel')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Garantir la présence de toutes les variantes de colonnes
alter table public.appointments add column if not exists client text;
alter table public.appointments add column if not exists client_name text;
alter table public.appointments add column if not exists client_email text;
alter table public.appointments add column if not exists client_phone text;
alter table public.appointments add column if not exists client_whatsapp text;
alter table public.appointments add column if not exists service_name text default 'Rendez-vous standard';
alter table public.appointments add column if not exists title text default 'Rendez-vous standard';
alter table public.appointments add column if not exists service_price integer default 0;
alter table public.appointments add column if not exists appointment_date date;
alter table public.appointments add column if not exists date date;
alter table public.appointments add column if not exists appointment_time time;
alter table public.appointments add column if not exists time time;
alter table public.appointments add column if not exists duration_minutes integer default 30;
alter table public.appointments add column if not exists duration integer default 30;
alter table public.appointments add column if not exists collaborator_id uuid references public.collaborators(id) on delete set null;
alter table public.appointments add column if not exists internal_notes text;
alter table public.appointments add column if not exists client_cancel_reason text;
alter table public.appointments add column if not exists source text default 'lien_public';

-- Assouplir les contraintes NOT NULL sur les colonnes historiques pour permettre l'insertion avec l'une ou l'autre nomenclature
do $$
begin
  alter table public.appointments alter column client_name drop not null;
exception when others then null;
end $$;

do $$
begin
  alter table public.appointments alter column appointment_date drop not null;
exception when others then null;
end $$;

do $$
begin
  alter table public.appointments alter column appointment_time drop not null;
exception when others then null;
end $$;

do $$
begin
  alter table public.appointments alter column duration_minutes drop not null;
exception when others then null;
end $$;

-- Fonction de synchronisation automatique et bidirectionnelle des colonnes de rendez-vous
create or replace function public.sync_appointment_columns()
returns trigger
language plpgsql
as $$
begin
  -- Synchronisation client / client_name
  if new.client is not null and (new.client_name is null or new.client_name = '') then
    new.client_name := new.client;
  elsif new.client_name is not null and (new.client is null or new.client = '') then
    new.client := new.client_name;
  end if;

  -- Synchronisation client_phone / client_whatsapp
  if new.client_phone is not null and (new.client_whatsapp is null or new.client_whatsapp = '') then
    new.client_whatsapp := new.client_phone;
  elsif new.client_whatsapp is not null and (new.client_phone is null or new.client_phone = '') then
    new.client_phone := new.client_whatsapp;
  end if;

  -- Synchronisation date / appointment_date
  if new.date is not null and new.appointment_date is null then
    new.appointment_date := new.date;
  elsif new.appointment_date is not null and new.date is null then
    new.date := new.appointment_date;
  end if;

  -- Synchronisation time / appointment_time
  if new.time is not null and new.appointment_time is null then
    new.appointment_time := new.time;
  elsif new.appointment_time is not null and new.time is null then
    new.time := new.appointment_time;
  end if;

  -- Synchronisation title / service_name
  if new.title is not null and (new.service_name is null or new.service_name = '') then
    new.service_name := new.title;
  elsif new.service_name is not null and (new.title is null or new.title = '') then
    new.title := new.service_name;
  end if;

  -- Synchronisation duration / duration_minutes
  if new.duration is not null and new.duration_minutes is null then
    new.duration_minutes := new.duration;
  elsif new.duration_minutes is not null and new.duration is null then
    new.duration := new.duration_minutes;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_appointment_columns on public.appointments;
create trigger trg_sync_appointment_columns
  before insert or update on public.appointments
  for each row execute procedure public.sync_appointment_columns();

-- 7. Table des Notifications d'alertes en direct pour le professionnel
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  appointment_id uuid references public.appointments(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Attribution des privilèges sur toutes les tables publiques
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;

-- 9. Trigger automatique lors de la création d'un compte (inscription)
-- Protégé avec blocs d'exceptions pour garantir que la création dans auth.users réussit TOUJOURS
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_name text;
  v_full_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_business_name := coalesce(new.raw_user_meta_data->>'business_name', 'Mon Établissement');

  -- A. Création ou mise à jour du profil avec période d'essai de 14 jours
  begin
    insert into public.profiles (
      id, full_name, business_name, email,
      subscription_plan, subscription_status, subscription_started_at, trial_ends_at, last_sign_in_at
    )
    values (
      new.id, v_full_name, v_business_name, new.email,
      coalesce(new.raw_user_meta_data->>'subscription_plan', 'trial_14d'),
      'trial',
      now(),
      now() + interval '14 days',
      now()
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(excluded.full_name, public.profiles.full_name),
          business_name = coalesce(excluded.business_name, public.profiles.business_name),
          subscription_plan = coalesce(public.profiles.subscription_plan, excluded.subscription_plan, 'trial_14d'),
          subscription_status = coalesce(public.profiles.subscription_status, 'trial'),
          subscription_started_at = coalesce(public.profiles.subscription_started_at, now()),
          trial_ends_at = coalesce(public.profiles.trial_ends_at, now() + interval '14 days'),
          last_sign_in_at = now(),
          updated_at = now();
  exception when others then
    -- Ne jamais faire échouer la création du compte auth
    null;
  end;

  -- B. Configuration de réservation initiale
  begin
    if not exists (select 1 from public.booking_configs where user_id = new.id) then
      insert into public.booking_configs (user_id, business_name)
      values (new.id, v_business_name);
    end if;
  exception when others then
    null;
  end;

  -- C. Journalisation de l'événement de création de compte
  begin
    insert into public.user_activity_logs (user_id, action, entity_type, details)
    values (
      new.id,
      'creation_compte',
      'auth',
      jsonb_build_object(
        'email', new.email,
        'full_name', v_full_name,
        'business_name', v_business_name,
        'timestamp', now()
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 10. Trigger automatique : nouvelle demande de rendez-vous -> notification + journal d'activité
create or replace function public.notify_on_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client text;
  v_date text;
  v_time text;
begin
  v_client := coalesce(new.client_name, new.client, 'Client');
  v_date := coalesce(new.appointment_date::text, new.date::text, '');
  v_time := coalesce(new.appointment_time::text, new.time::text, '');

  -- A. Notification pour le tableau de bord
  begin
    insert into public.notifications (user_id, appointment_id, title, message)
    values (
      new.user_id,
      new.id,
      'Nouveau rendez-vous reçu',
      'Demande reçue de ' || v_client || ' pour le ' || v_date || ' à ' || v_time
    );
  exception when others then null;
  end;

  -- B. Journalisation dans l'activité utilisateur
  begin
    insert into public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    values (
      new.user_id,
      'nouveau_rdv_recu',
      'appointment',
      new.id::text,
      jsonb_build_object(
        'client_name', v_client,
        'appointment_date', v_date,
        'appointment_time', v_time,
        'source', coalesce(new.source, 'lien_public')
      )
    );
  exception when others then null;
  end;

  return new;
end;
$$;

drop trigger if exists on_new_appointment_notify on public.appointments;
create trigger on_new_appointment_notify
  after insert on public.appointments
  for each row execute procedure public.notify_on_new_appointment();

-- ==============================================================================
-- 11. POLITIQUES DE SÉCURITÉ ROW LEVEL SECURITY (RLS) IDEMPOTENTES
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.user_activity_logs enable row level security;
alter table public.booking_configs enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;

-- Politiques profiles
drop policy if exists "Gestion de son propre profil" on public.profiles;
create policy "Gestion de son propre profil" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Lecture publique profil pour page client" on public.profiles;
drop policy if exists "Lecture publique restreinte profil pour réservation" on public.profiles;
create policy "Lecture publique profil pour page client" on public.profiles
  for select using (true);

-- Politiques user_activity_logs
drop policy if exists "Le professionnel consulte son journal d'activité" on public.user_activity_logs;
create policy "Le professionnel consulte son journal d'activité" on public.user_activity_logs
  for select using (auth.uid() = user_id);

drop policy if exists "Insertion journal d'activité" on public.user_activity_logs;
create policy "Insertion journal d'activité" on public.user_activity_logs
  for insert with check (auth.uid() = user_id or auth.uid() is not null);

-- Politiques booking_configs
drop policy if exists "Le professionnel gère sa propre configuration" on public.booking_configs;
create policy "Le professionnel gère sa propre configuration" on public.booking_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Lecture publique de la configuration pour la page client" on public.booking_configs;
create policy "Lecture publique de la configuration pour la page client" on public.booking_configs
  for select using (true);

-- Politiques collaborators
alter table public.collaborators enable row level security;

drop policy if exists "Le professionnel gère ses collaborateurs" on public.collaborators;
create policy "Le professionnel gère ses collaborateurs" on public.collaborators
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Lecture publique des collaborateurs actifs" on public.collaborators;
create policy "Lecture publique des collaborateurs actifs" on public.collaborators
  for select using (active = true);

-- Politiques appointments
drop policy if exists "Le professionnel gère l'ensemble de ses rendez-vous" on public.appointments;
create policy "Le professionnel gère l'ensemble de ses rendez-vous" on public.appointments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Les clients peuvent insérer une demande de rendez-vous publique" on public.appointments;
create policy "Les clients peuvent insérer une demande de rendez-vous publique" on public.appointments
  for insert to anon, authenticated with check (true);

drop policy if exists "Lecture des rendez-vous pour disponibilité et statut client" on public.appointments;
create policy "Lecture des rendez-vous pour disponibilité et statut client" on public.appointments
  for select using (true);

drop policy if exists "Les clients peuvent modifier ou annuler leur rendez-vous" on public.appointments;
create policy "Les clients peuvent modifier ou annuler leur rendez-vous" on public.appointments
  for update to anon, authenticated using (true) with check (true);

-- Politiques notifications
drop policy if exists "Le professionnel gère ses propres notifications" on public.notifications;
create policy "Le professionnel gère ses propres notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Insertion notifications publiques" on public.notifications;
create policy "Insertion notifications publiques" on public.notifications
  for insert to anon, authenticated with check (true);

-- Politiques exclusives Super Administrateur Master (masteradmin@creno.app)
drop policy if exists "Master Admin gestion totale profiles" on public.profiles;
create policy "Master Admin gestion totale profiles" on public.profiles
  for all using ((auth.jwt() ->> 'email') = 'masteradmin@creno.app')
  with check ((auth.jwt() ->> 'email') = 'masteradmin@creno.app');

drop policy if exists "Master Admin lecture totale appointments" on public.appointments;
create policy "Master Admin lecture totale appointments" on public.appointments
  for select using ((auth.jwt() ->> 'email') = 'masteradmin@creno.app');

drop policy if exists "Master Admin lecture totale booking_configs" on public.booking_configs;
create policy "Master Admin lecture totale booking_configs" on public.booking_configs
  for select using ((auth.jwt() ->> 'email') = 'masteradmin@creno.app');

drop policy if exists "Master Admin lecture totale collaborators" on public.collaborators;
create policy "Master Admin lecture totale collaborators" on public.collaborators
  for select using ((auth.jwt() ->> 'email') = 'masteradmin@creno.app');

drop policy if exists "Master Admin lecture totale user_activity_logs" on public.user_activity_logs;
create policy "Master Admin lecture totale user_activity_logs" on public.user_activity_logs
  for select using ((auth.jwt() ->> 'email') = 'masteradmin@creno.app');

-- Fonction RPC sécurisée pour le Master Admin (récupération directe email & dernière connexion depuis auth.users)
create or replace function public.get_master_clients_auth_meta()
returns table (
  id uuid,
  email text,
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone,
  raw_phone text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (auth.jwt() ->> 'email') <> 'masteradmin@creno.app' then
    raise exception 'Accès non autorisé';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.last_sign_in_at,
    u.created_at,
    (u.raw_user_meta_data->>'phone')::text as raw_phone
  from auth.users u;
end;
$$;

-- 12. Attribution finale des privilèges et sécurités par défaut
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;
