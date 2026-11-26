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
  trial_ends_at timestamp with time zone default (now() + interval '14 days'),
  logo_url text,
  description text,
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Garantir la présence des colonnes si la table existait déjà
alter table public.profiles add column if not exists status text default 'actif';
alter table public.profiles add column if not exists last_sign_in_at timestamp with time zone;
alter table public.profiles add column if not exists activity_type text default 'Prestation de services';
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists subscription_plan text default 'trial_14d';
alter table public.profiles add column if not exists subscription_status text default 'trial';
alter table public.profiles add column if not exists trial_ends_at timestamp with time zone default (now() + interval '14 days');
alter table public.profiles add column if not exists logo_url text;
alter table public.profiles add column if not exists description text;

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

-- 6. Table des Rendez-vous réels
create table if not exists public.appointments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  collaborator_id uuid references public.collaborators(id) on delete set null,
  client_name text not null,
  client_email text,
  client_phone text,
  client_whatsapp text,
  service_name text default 'Rendez-vous standard',
  service_price integer default 0,
  appointment_date date not null,
  appointment_time time not null,
  duration_minutes integer default 30 not null,
  status text not null default 'en_attente' check (status in ('en_attente', 'confirme', 'annule', 'honore')),
  notes text,
  internal_notes text,
  client_cancel_reason text,
  source text default 'lien_public' check (source in ('lien_public', 'manuel')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.appointments add column if not exists source text default 'lien_public';
alter table public.appointments add column if not exists client_whatsapp text;
alter table public.appointments add column if not exists collaborator_id uuid references public.collaborators(id) on delete set null;
alter table public.appointments add column if not exists service_price integer default 0;
alter table public.appointments add column if not exists internal_notes text;
alter table public.appointments add column if not exists client_cancel_reason text;

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

  -- A. Création ou mise à jour du profil
  begin
    insert into public.profiles (id, full_name, business_name, email, last_sign_in_at)
    values (new.id, v_full_name, v_business_name, new.email, now())
    on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(excluded.full_name, public.profiles.full_name),
          business_name = coalesce(excluded.business_name, public.profiles.business_name),
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
begin
  -- A. Notification pour le tableau de bord
  begin
    insert into public.notifications (user_id, appointment_id, title, message)
    values (
      new.user_id,
      new.id,
      'Nouveau rendez-vous reçu',
      'Demande reçue de ' || coalesce(new.client_name, 'Client') || ' pour le ' || coalesce(new.appointment_date::text, '') || ' à ' || coalesce(new.appointment_time::text, '')
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
        'client_name', new.client_name,
        'appointment_date', new.appointment_date,
        'appointment_time', new.appointment_time,
        'source', new.source
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
