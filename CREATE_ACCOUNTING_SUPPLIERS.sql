-- ====================================================================
-- ACCOUNTING SUPPLIERS & VENDORS TABLE
-- Keeps company payees/suppliers synced across all users and computers
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.accounting_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'Vendor',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial standard logistics suppliers
INSERT INTO public.accounting_suppliers (name, category)
VALUES
    ('Puma Energy (Fuel)', 'Fuel'),
    ('TotalEnergies', 'Fuel'),
    ('Oryx Energies', 'Fuel'),
    ('Dar Port Wharfage / TPA', 'Port & Wharfage'),
    ('Kasumbalesa Border Clearance', 'Border Clearance'),
    ('Tunduma Border Clearance', 'Border Clearance'),
    ('Garage Spare Parts Ltd', 'Repairs & Spares'),
    ('Tyres & Retreading Centre', 'Tyres & Maintenance'),
    ('Driver Trip Advances', 'Driver Allowance')
ON CONFLICT (name) DO NOTHING;
