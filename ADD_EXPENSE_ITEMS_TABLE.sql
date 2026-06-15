-- =====================================================
-- FIX: Create 'logistics_expense_items' Table
-- =====================================================

CREATE TABLE IF NOT EXISTS logistics_expense_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert predefined expenses
INSERT INTO logistics_expense_items (item_name) VALUES
('Agency fee DRC'),
('Bracks Linning'),
('Carbon Tax'),
('Chemical Fee'),
('Container Drop Off Fee'),
('Council fee Chembe'),
('council Fee Kapiri'),
('Council Fee Lusaka'),
('Council Fee Nakonde'),
('Council Fee Ndola'),
('Council fees Nakonde/Isoka'),
('Council fees Tunduma'),
('Council Kabwe Town Council'),
('Covid Certificate - Facilitation fee'),
('Documents facilitation'),
('DRC Electronic Seal (Tracking Unit)'),
('Driver Per diem in DRC (Facilitation fee)'),
('Driver Per DM General'),
('Driver VISA'),
('Driver''s salary'),
('Entry Card'),
('Insurance'),
('Kanyaka Parking fee'),
('Kawimba Peage Kurudi'),
('Kigamboni Bridge'),
('Lubumbashi Communal Peage'),
('Mokambo Parking kurudi Empty'),
('Mpika Council Fee'),
('Nakonde Exit Fee'),
('New Peage Mokambo'),
('Peage Kasumbalesa'),
('Peage Lubumbashi/Kasumbalesa'),
('Peage Sakania DRC Side'),
('Port / ICD TRA Tracking Devices'),
('RIT Clearance (Bond Zambia)'),
('Road toll - Nakonde - Lusaka'),
('Road toll Extension From Kapiri to Ndola'),
('Road toll System Charges Fee'),
('Road Tolls'),
('Sakania Council fee'),
('Sakania DRC General councils'),
('Sakania DRC Parking fee'),
('Service (Oil Filter and grees)'),
('Tires'),
('Toll Gate Chembe'),
('Toll gate Chilonga'),
('Toll gate George Kunda'),
('Toll Gate Kafulafuta'),
('Toll Gate Kakonde'),
('Toll Gate Kalense'),
('Toll Gate Kateshi'),
('Toll gate Katuba'),
('Toll Gate Manyumbi'),
('Toll Gate Ntoposhi'),
('Toll gate Sabina'),
('Toll gates Kafulafuta'),
('Toll gates Michael Chilufya'),
('Tourism Levy'),
('Transcom'),
('Trucks Permits/ Horse and Trailer'),
('Tunduma Agency fee'),
('Tunduma Health Inspection Fee'),
('Zambia Parking Fee'),
('Zambia Weighbridge Check upon Return'),
('Council Fee Nakonde/Isoka'),
('Toll gate Chilonga and Kalense'),
('Toll gate George Kunda and Toposhi'),
('Toll Gate Kafulafuta and kakonde'),
('Toll Gate Chembe and kateshi')
ON CONFLICT (item_name) DO NOTHING;

-- Grant permissions (if using RLS, ensure these are accessible)
ALTER TABLE logistics_expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all users"
    ON logistics_expense_items FOR SELECT
    USING (true);

CREATE POLICY "Allow insert access to authenticated users"
    ON logistics_expense_items FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update access to authenticated users"
    ON logistics_expense_items FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete access to authenticated users"
    ON logistics_expense_items FOR DELETE
    USING (auth.role() = 'authenticated');
