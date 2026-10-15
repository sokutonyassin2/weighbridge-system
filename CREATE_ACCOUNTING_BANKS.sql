-- ====================================================================
-- CORPORATE BANK ACCOUNTS TABLE
-- Synchronizes all company bank accounts across users and computers
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.accounting_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    account_number TEXT,
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial corporate banks
INSERT INTO public.accounting_banks (name, currency)
VALUES
    ('CRDB Bank (USD Collection)', 'USD'),
    ('CRDB Bank (TZS Operational)', 'TZS'),
    ('NMB Bank (Main Commercial)', 'TZS'),
    ('Absa Bank Tanzania', 'USD'),
    ('Stanbic Bank (Trade Financing)', 'USD'),
    ('KCB Bank Tanzania', 'TZS')
ON CONFLICT (name) DO NOTHING;
