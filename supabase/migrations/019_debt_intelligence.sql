-- v0.5.0: Inteligencia de deuda — clasificación de costo, APR, buffer de prepago y bandera MSI

-- accounts: campos para distinguir deuda con costo de MSI sin costo
alter table public.accounts
  add column if not exists cost_type text not null default 'con_costo'
    check (cost_type in ('con_costo', 'sin_costo')),
  add column if not exists apr numeric(5,2)
    check (apr is null or apr >= 0),
  add column if not exists min_payment_pct numeric(5,2) default 1.5
    check (min_payment_pct is null or (min_payment_pct >= 0 and min_payment_pct <= 100)),
  add column if not exists prepay_buffer numeric(12,2) not null default 0
    check (prepay_buffer >= 0);

-- installments: bandera explícita de interés cero
alter table public.installments
  add column if not exists is_zero_interest boolean not null default true;
