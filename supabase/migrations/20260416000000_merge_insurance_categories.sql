-- 1. Standardize insurance spelling in the fleet documents table
UPDATE logistics_fleet_documents 
SET document_type = 'INSURANCE' 
WHERE document_type IN ('INSUARENCE', 'INSUARANCE', 'Insuarence', 'Insuarance');

-- 2. Standardize insurance spelling in the driver documents table
UPDATE logistics_driver_documents 
SET document_type = 'INSURANCE' 
WHERE document_type IN ('INSUARENCE', 'INSUARANCE', 'Insuarence', 'Insuarance');

-- 3. Update the master document types list so future documents are correct
UPDATE logistics_document_types 
SET name = 'INSURANCE' 
WHERE name IN ('INSUARENCE', 'INSUARANCE', 'Insuarence', 'Insuarance');

-- 4. Delete any duplicate 'INSURANCE' master entries that might have been created
DELETE FROM logistics_document_types a
USING logistics_document_types b
WHERE a.id < b.id 
AND a.name = b.name 
AND a.name = 'INSURANCE';
