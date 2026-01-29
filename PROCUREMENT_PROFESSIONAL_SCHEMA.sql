-- Procurement Professional Excellence Schema
-- 1. Supplier Directory
CREATE TABLE IF NOT EXISTS garage_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    category TEXT, -- e.g., Tires, Oils, Spare Parts
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Update Requisitions for Professional Tracking
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES garage_suppliers(id),
ADD COLUMN IF NOT EXISTS po_number TEXT,
ADD COLUMN IF NOT EXISTS includes_vat BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 3. Policy for Suppliers
ALTER TABLE garage_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON garage_suppliers FOR ALL USING (true);
