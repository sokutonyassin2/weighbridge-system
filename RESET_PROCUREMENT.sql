-- This script resets all items sent to Management Approvals back to the Procurement Command area.
-- It changes the status back to 'Pending' and removes any created PO numbers.
-- Money calculations and supplier selections are preserved.

UPDATE garage_requisitions
SET 
    status = 'Pending',
    po_number = NULL
WHERE 
    status IN ('Awaiting Approval', 'Approved', 'Purchased');
