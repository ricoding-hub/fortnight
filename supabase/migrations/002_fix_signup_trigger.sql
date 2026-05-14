-- Fortnight — Fix: "Database error saving new user" on signup
--
-- The signup trigger function runs as SECURITY DEFINER but had no search_path
-- set. GoTrue inserts new users with a search_path that does not include
-- `public`, so the function could not resolve `categories` / `user_config`,
-- raised, and rolled back the whole auth.users insert.
--
-- Fix: pin `search_path = public` on both SECURITY DEFINER functions and
-- schema-qualify every table reference. Safe to run on an existing project —
-- `create or replace function` keeps the attached triggers intact.
--
-- Run this in the Supabase SQL Editor.

create or replace function public.seed_user_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind) values
    (NEW.id, 'Renta', 'fixed'),
    (NEW.id, 'Servicios', 'fixed'),
    (NEW.id, 'Suscripciones', 'fixed'),
    (NEW.id, 'Comida', 'variable'),
    (NEW.id, 'Social', 'variable'),
    (NEW.id, 'Transporte', 'variable'),
    (NEW.id, 'Salud', 'variable'),
    (NEW.id, 'Otros', 'variable'),
    (NEW.id, 'Salario', 'income'),
    (NEW.id, 'Vales', 'income'),
    (NEW.id, 'Extra', 'income');

  insert into public.user_config (user_id) values (NEW.id);

  return NEW;
end;
$$;

create or replace function public.update_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.accounts
      set balance = balance + NEW.amount,
          updated_at = now()
      where id = NEW.account_id;
  elsif (TG_OP = 'DELETE') then
    update public.accounts
      set balance = balance - OLD.amount,
          updated_at = now()
      where id = OLD.account_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;
