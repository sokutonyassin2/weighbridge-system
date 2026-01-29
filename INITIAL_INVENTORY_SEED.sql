-- INITIAL INVENTORY SEED DATA
-- Run this if you want to populate your store with some common truck parts for testing

INSERT INTO public.garage_inventory (item_name, category, quantity, min_threshold, unit_price, unit_measure)
VALUES 
('15W-40 Engine Oil', 'Fluids', 100, 20, 45.00, 'Liters'),
('Synthetic Gear Oil', 'Fluids', 50, 10, 65.00, 'Liters'),
('Heavy Duty Brake Pad Set', 'Parts', 12, 4, 180.00, 'Sets'),
('LED Headlight Bulb (24V)', 'Parts', 20, 5, 25.00, 'pcs'),
('Oil Filter (Model A)', 'Parts', 15, 3, 12.50, 'pcs'),
('Air Filter (Primary)', 'Parts', 8, 2, 85.00, 'pcs'),
('Hydraulic Jack 20T', 'Tools', 3, 1, 350.00, 'pcs'),
('Hand Soap (Industrial)', 'General', 10, 2, 8.00, 'pcs')
ON CONFLICT (item_name) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    min_threshold = EXCLUDED.min_threshold,
    unit_price = EXCLUDED.unit_price,
    unit_measure = EXCLUDED.unit_measure;

-- Example Requisition for testing
-- INSERT INTO public.garage_requisitions (request_type, item_name, quantity_requested, status)
-- VALUES ('General', 'Hand Soap (Industrial)', 2, 'Pending');
