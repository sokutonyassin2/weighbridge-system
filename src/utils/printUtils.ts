export const printPurchaseOrder = (params: { poNumber?: string, reqId?: string, requisitions: any[], userProfile: any }) => {
    const { requisitions, userProfile } = params;
    let relatedReqs: any[] = requisitions || [];

    if (params.poNumber) {
        relatedReqs = relatedReqs.filter((r: any) => r.po_number === params.poNumber);
    } else if (params.reqId) {
        const single = relatedReqs.find((r: any) => r.id === params.reqId);
        relatedReqs = single ? [single] : [];
    }

    if (relatedReqs.length === 0) {
        alert("No items found to print.");
        return;
    }

    const firstReq = relatedReqs[0];
    const displayPONumber = params.poNumber || "REQ-" + firstReq.id.slice(0, 8).toUpperCase();
    let subtotal = 0;
    let totalVat = 0;

    const itemsByVehicle: Record<string, any[]> = {};

    relatedReqs.forEach((req: any) => {
        const plate = req.vehicle?.vehicle_no || req.vehicle?.horse_number || 'General/Workshop';
        if (!itemsByVehicle[plate]) itemsByVehicle[plate] = [];
        itemsByVehicle[plate].push(req);
    });

    let itemsHtml = "";

    Object.entries(itemsByVehicle).forEach(([plate, reqs]) => {
        itemsHtml += `
            <tr>
                <td colspan="4" style="background-color: #f8fafc; font-weight: 800; color: #4f46e5; padding: 6px 8px; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0;">
                    Vehicle: ${plate}
                </td>
            </tr>
        `;

        reqs.forEach((req: any) => {
            const price = req.unit_price || 0;
            const qty = req.quantity_approved || req.quantity_requested || 0;
            const lineTotal = price * qty;
            const lineVat = req.includes_vat ? (lineTotal * 0.18) : 0;

            subtotal += lineTotal;
            totalVat += lineVat;

            itemsHtml += `
                <tr>
                    <td style="padding-left: 16px;">
                        <div style="font-weight: 700; color: #1e293b;">${req.item_name}</div>
                    </td>
                    <td style="text-align: center;">${qty}</td>
                    <td style="text-align: right;">${price.toLocaleString()}</td>
                    <td style="text-align: right; font-weight: 600;">${lineTotal.toLocaleString()}</td>
                </tr>
            `;
        });
    });

    const finalTotal = subtotal + totalVat;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
        <html>
            <head>
                <title>Purchase Order - ${displayPONumber}</title>
                <style>
                    body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; max-width: 800px; margin: auto; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 15px; }
                    .company { font-size: 20px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
                    .po-label { background: #4f46e5; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; margin-top: 5px; display: inline-block; }
                    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                    .meta-box h3 { font-size: 9px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px; }
                    .meta-box p { font-size: 12px; font-weight: 600; margin: 1px 0; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { text-align: left; background: #f8fafc; padding: 8px; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
                    .summary-table { width: 250px; margin-left: auto; }
                    .summary-table td { padding: 4px 8px; border: none; }
                    .total-row { font-size: 14px; font-weight: 900; color: #1e293b; border-top: 2px solid #e2e8f0 !important; }
                    .footer { margin-top: 40px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 10px; }
                    .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 60px; margin-top: 40px; }
                    .sig-line { text-align: center; padding-top: 4px; font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="company">${firstReq.target_company || 'SudEnergy Logistics'}</div>
                        <div style="font-size: 12px; color: #64748b; font-weight: 600;">Logistics & Engineering Procurement</div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 24px; color: #1e293b; letter-spacing: -1px;">PURCHASE ORDER</h1>
                        <div class="po-label">PO #${displayPONumber}</div>
                    </div>
                </div>
                
                <div class="meta-grid">
                    <div class="meta-box">
                        <h3>Vendor / Supplier</h3>
                        <p>${firstReq.garage_suppliers?.name || 'N/A'}</p>
                        <p style="font-size: 11px; font-weight: 400; color: #64748b;">Official Registered Vendor</p>
                    </div>
                    <div style="text-align: right;">
                        <div class="meta-box">
                            <h3>Order Details</h3>
                            <p>Date: ${new Date(firstReq.created_at).toLocaleDateString()}</p>
                            <p>Items: ${relatedReqs.length}</p>
                        </div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Description / Vehicle</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: right;">Unit Price (TZS)</th>
                            <th style="text-align: right;">Amount (TZS)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <table class="summary-table">
                    <tr>
                        <td>Subtotal</td>
                        <td style="text-align: right;">${subtotal.toLocaleString()}</td>
                    </tr>
                    ${totalVat > 0 ? `
                    <tr style="color: #4f46e5; font-weight: 600;">
                        <td>VAT (18%)</td>
                        <td style="text-align: right;">+ ${totalVat.toLocaleString()}</td>
                    </tr>
                    ` : ''}
                    <tr class="total-row">
                        <td>TOTAL TZS</td>
                        <td style="text-align: right;">${finalTotal.toLocaleString()}</td>
                    </tr>
                </table>

                <div class="sig-grid" style="grid-template-columns: 1fr 1fr 1fr;">
                    <div class="sig-line">
                        <span style="display:block; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${firstReq.profiles?.full_name || 'N/A'}</span>
                        Requested By (Garage)
                    </div>
                    <div class="sig-line">
                        <span style="display:block; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${firstReq.procurement_approved_by_profile?.full_name || 'N/A'}</span>
                        Prepared By (Procurement)
                    </div>
                    <div class="sig-line">
                        <span style="display:block; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${firstReq.approved_by_profile?.full_name || 'Pending Approval'}</span>
                        Authorized By (Management)
                    </div>
                </div>

                <div class="footer">
                    This is a computer-generated document. System: SudEnergy Logistics Platform
                </div>
                <script>window.print();</script>
            </body>
        </html>
    `);
    printWindow.document.close();
};

export const printGarageRequisitions = (params: { reqGroups: any[], userProfile: any }) => {
    const { reqGroups, userProfile } = params;

    if (!reqGroups || reqGroups.length === 0) {
        alert("No items selected to print.");
        return;
    }

    let itemsHtml = "";

    reqGroups.forEach(group => {
        const plate = group.vehicle?.vehicle_no || group.vehicle?.horse_number || 'General/Workshop';
        const category = group.category || 'General';
        
        const activeItems = (group.items || []).filter((req: any) => 
            !['Closed', 'Paid', 'Stocked', 'Rejected', 'Revoked'].includes(req.status)
        );

        if (activeItems.length === 0) return;

        itemsHtml += `
            <tr>
                <td colspan="4" style="background-color: #f8fafc; font-weight: 800; color: #4f46e5; padding: 6px 8px; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0;">
                    Vehicle: ${plate} &nbsp;|&nbsp; Category: ${category}
                </td>
            </tr>
        `;

        activeItems.forEach((req: any) => {
            const qty = req.quantity_approved || req.quantity_requested || 0;
            const status = req.status || 'Pending';

            itemsHtml += `
                <tr>
                    <td style="padding-left: 16px;">
                        <div style="font-weight: 700; color: #1e293b;">${req.item_name}</div>
                    </td>
                    <td style="text-align: center;">${qty}</td>
                    <td style="text-align: right; font-weight: 600;">
                        <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; border: 1px solid #cbd5e1; text-transform: uppercase;">
                            ${status}
                        </span>
                    </td>
                </tr>
            `;
        });
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
        <html>
            <head>
                <title>Garage Requisitions - Print Preview</title>
                <style>
                    body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; max-width: 800px; margin: auto; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 15px; }
                    .company { font-size: 20px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
                    .po-label { background: #4f46e5; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; margin-top: 5px; display: inline-block; }
                    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                    .meta-box h3 { font-size: 9px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px; }
                    .meta-box p { font-size: 12px; font-weight: 600; margin: 1px 0; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { text-align: left; background: #f8fafc; padding: 8px; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
                    .footer { margin-top: 40px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="company">SudEnergy Logistics</div>
                        <div style="font-size: 12px; color: #64748b; font-weight: 600;">Garage Department</div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="margin: 0; font-size: 24px; color: #1e293b; letter-spacing: -1px;">GARAGE REQUISITIONS</h1>
                        <div class="po-label">Date: ${new Date().toLocaleDateString()}</div>
                    </div>
                </div>
                
                <div class="meta-grid">
                    <div class="meta-box">
                        <h3>Generated By</h3>
                        <p>${userProfile?.full_name || 'System User'}</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Description / Vehicle</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: right;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="footer">
                    This is a computer-generated document. System: SudEnergy Logistics Platform
                </div>
                <script>window.print();</script>
            </body>
        </html>
    `);
    printWindow.document.close();
};
