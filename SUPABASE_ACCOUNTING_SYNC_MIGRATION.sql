-- ====================================================================
-- LIVE ACCOUNTING & BANK MANAGEMENT SYNC MIGRATION
-- Run this in your Supabase SQL Editor so all branches, offices,
-- and countries see live accounting, bank balances, and vouchers in real-time.
-- ====================================================================

-- 1. Ensure accounting_banks table exists with opening balance & account info
CREATE TABLE IF NOT EXISTS public.accounting_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    account_number TEXT,
    currency TEXT DEFAULT 'USD',
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;

-- 2. Ensure accounting_suppliers table exists
CREATE TABLE IF NOT EXISTS public.accounting_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'Vendor',
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounting_suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;

-- 3. Ensure accounting_ledgers table exists
CREATE TABLE IF NOT EXISTS public.accounting_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('ASSETS', 'LIABILITIES', 'INCOME', 'EXPENSES')),
    sub_category TEXT,
    currency TEXT DEFAULT 'USD',
    opening_balance NUMERIC DEFAULT 0,
    current_balance NUMERIC DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounting_ledgers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
ALTER TABLE public.accounting_ledgers ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;

-- 4. Ensure accounting_vouchers table exists with full relational linking
CREATE TABLE IF NOT EXISTS public.accounting_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_no TEXT NOT NULL UNIQUE,
    voucher_type_code TEXT NOT NULL,
    parent_type TEXT NOT NULL CHECK (parent_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    dr_ledger_code TEXT NOT NULL,
    cr_ledger_code TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'USD',
    exchange_rate NUMERIC DEFAULT 2700,
    narration TEXT,
    reference_no TEXT,
    bank_name TEXT,
    bank_id UUID,
    supplier_name TEXT,
    supplier_id UUID,
    client_name TEXT,
    trip_id UUID,
    invoice_no TEXT,
    status TEXT DEFAULT 'posted',
    reconciliation_status TEXT DEFAULT 'pending',
    reconciled_date DATE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns to existing accounting_vouchers table
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS bank_id UUID;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending';
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS reconciled_date DATE;

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_date ON public.accounting_vouchers(date);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_parent ON public.accounting_vouchers(parent_type);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_dr ON public.accounting_vouchers(dr_ledger_code);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_cr ON public.accounting_vouchers(cr_ledger_code);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_bank ON public.accounting_vouchers(bank_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_client ON public.accounting_vouchers(client_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_supplier ON public.accounting_vouchers(supplier_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_invoice ON public.accounting_vouchers(invoice_no);
