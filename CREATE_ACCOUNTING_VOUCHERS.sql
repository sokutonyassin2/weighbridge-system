-- ====================================================================
-- TALLY-STYLE ACCOUNTING SYSTEM: CHARTS OF ACCOUNTS & VOUCHERS
-- Supports: Assets, Liabilities, Income, Expenses + Contra, Payment, 
-- Receipt, and General Journal Vouchers connected with Logistics.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.accounting_ledger_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('ASSETS', 'LIABILITIES', 'INCOME', 'EXPENSES')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.accounting_voucher_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent_type TEXT NOT NULL CHECK (parent_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL')),
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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
    trip_id UUID,
    invoice_no TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default ledger groups
INSERT INTO public.accounting_ledger_groups (code, name, category)
VALUES
    ('GRP_ASSETS', 'Current & Fixed Assets', 'ASSETS'),
    ('GRP_LIAB', 'Current Liabilities & Payables', 'LIABILITIES'),
    ('GRP_INCOME', 'Direct & Operational Income', 'INCOME'),
    ('GRP_EXP', 'Direct, Operating & Financial Costs', 'EXPENSES')
ON CONFLICT (code) DO NOTHING;

-- Seed standard Tally ledgers requested
INSERT INTO public.accounting_ledgers (code, name, category, sub_category, is_system)
VALUES
    ('1010', 'Cash in Hand', 'ASSETS', 'Cash', true),
    ('1020', 'Bank Account (CRDB / NMB)', 'ASSETS', 'Bank', true),
    ('1030', 'Customer Receivables', 'ASSETS', 'Receivables', true),
    ('1040', 'Korridor Account Balance', 'ASSETS', 'Bank / Wallet', true),
    ('2010', 'Supplier Payables', 'LIABILITIES', 'Payables', true),
    ('2020', 'Korridor Clearance Dues', 'LIABILITIES', 'Payables', true),
    ('3010', 'Transit Freight Invoice Account', 'INCOME', 'Direct Income', true),
    ('3020', 'Local Income Account', 'INCOME', 'Operating Income', true),
    ('4010', 'Direct Costs (Fuel, Driver & Clearance)', 'EXPENSES', 'Direct Costs', true),
    ('4020', 'Operating Costs (Repairs & Yard)', 'EXPENSES', 'Operating Costs', true),
    ('4030', 'Finance & Other Costs', 'EXPENSES', 'Finance Costs', true)
ON CONFLICT (code) DO NOTHING;

-- Seed default voucher types
INSERT INTO public.accounting_voucher_types (code, name, parent_type, description, is_system)
VALUES
    ('CONTRA_MAIN', 'Contra (Cash <-> Bank)', 'CONTRA', 'Cash and Bank internal transfers', true),
    ('CONTRA_KORRIDOR', 'Korridor Transfers', 'CONTRA', 'Transfers into Korridor cards/account', true),
    ('PAY_GENERAL', 'Payment Voucher', 'PAYMENT', 'General vendor and company expense payouts', true),
    ('PAY_KORRIDOR', 'Korridor Payments', 'PAYMENT', 'Disbursements to drivers via Korridor cards', true),
    ('REC_BANK', 'Bank Deposits', 'RECEIPT', 'Direct client telegraphic wire / bank deposits', true),
    ('REC_CASH', 'Cash Deposits', 'RECEIPT', 'Office cashier cash receipt collection', true),
    ('JOURNAL_GEN', 'General Journal', 'JOURNAL', 'Adjustments, write-offs, and freight journals', true)
ON CONFLICT (code) DO NOTHING;
