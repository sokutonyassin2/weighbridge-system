import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface POPreviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    supplierName: string;
    reqs: any[];
}

export function POPreviewDialog({ isOpen, onClose, supplierName, reqs }: POPreviewDialogProps) {
    const printRef = useRef<HTMLDivElement>(null);
    
    if (!reqs || reqs.length === 0) return null;
    
    const firstReq = reqs[0];
    const poNumber = firstReq.po_number || "DRAFT-PO";
    const poDate = new Date().toLocaleDateString();
    
    let subtotal = 0;
    let vatTotal = 0;

    reqs.forEach(r => {
        const qty = r.quantity_approved || r.management_reviewed_quantity || r.quantity_requested || 1;
        const unitPrice = r.unit_price || 0;
        const discount = (qty * unitPrice) * ((r.discount_percentage || 0) / 100);
        const lineSubtotal = (qty * unitPrice) - discount;
        subtotal += lineSubtotal;
        if (r.includes_vat) {
            vatTotal += (lineSubtotal * 0.18);
        }
    });

    const grandTotal = subtotal + vatTotal;

    const handlePrint = () => {
        const printContent = printRef.current;
        if (printContent) {
            const originalContents = document.body.innerHTML;
            document.body.innerHTML = printContent.innerHTML;
            window.print();
            document.body.innerHTML = originalContents;
            window.location.reload(); // Reload to restore React bindings
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        Purchase Order Preview
                    </DialogTitle>
                    <Button onClick={handlePrint} variant="outline" size="sm" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200">
                        <Printer className="w-4 h-4 mr-2" />
                        Print / Save PDF
                    </Button>
                </DialogHeader>

                <div ref={printRef} className="p-8 bg-white text-slate-900 border border-slate-200 rounded-md my-4">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-black text-indigo-900 tracking-tight">PURCHASE ORDER</h1>
                            <p className="text-sm font-semibold text-slate-500 mt-1">PO #: {poNumber}</p>
                            <p className="text-sm text-slate-500">Date: {poDate}</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-xl font-bold text-slate-800">SudEnergy Logistics</h2>
                            <p className="text-sm text-slate-500">Kongowe - Kibaha</p>
                        </div>
                    </div>

                    {/* Addresses */}
                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div className="p-4 bg-slate-50 rounded-md border border-slate-100">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Vendor / Supplier</p>
                            <h3 className="font-bold text-slate-800">{supplierName}</h3>
                            <p className="text-sm text-slate-600 mt-1">
                                {firstReq.payment_details ? `${firstReq.payment_details.bank_name} - ${firstReq.payment_details.account_number}` : 'No Payment Details'}
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-md border border-slate-100">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Ship To</p>
                            <h3 className="font-bold text-slate-800">SudEnergy Logistics Garage</h3>
                            <p className="text-sm text-slate-600 mt-1">Kongowe - Kibaha</p>
                        </div>
                    </div>

                    {/* Items Table */}
                    <Table className="mb-8 border">
                        <TableHeader className="bg-slate-100">
                            <TableRow>
                                <TableHead className="font-bold text-slate-700">Item Description</TableHead>
                                <TableHead className="font-bold text-slate-700">Vehicle</TableHead>
                                <TableHead className="font-bold text-slate-700 text-right">Qty</TableHead>
                                <TableHead className="font-bold text-slate-700 text-right">Unit Price</TableHead>
                                <TableHead className="font-bold text-slate-700 text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reqs.map((req, idx) => {
                                const qty = req.quantity_approved || req.management_reviewed_quantity || req.quantity_requested || 1;
                                const price = req.unit_price || 0;
                                const discount = (qty * price) * ((req.discount_percentage || 0) / 100);
                                const lineTotal = (qty * price) - discount;
                                return (
                                    <TableRow key={idx}>
                                        <TableCell className="font-medium">{req.item_name}</TableCell>
                                        <TableCell className="text-sm text-slate-600">{req.vehicle?.vehicle_no || req.vehicle?.horse_number || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-semibold">{qty}</TableCell>
                                        <TableCell className="text-right">{price.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-bold">{lineTotal.toLocaleString()}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {/* Totals */}
                    <div className="flex justify-end">
                        <div className="w-64 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="font-semibold text-slate-600">Subtotal:</span>
                                <span>{subtotal.toLocaleString()} TZS</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="font-semibold text-slate-600">VAT (18%):</span>
                                <span>{vatTotal.toLocaleString()} TZS</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-300 pt-2 mt-2">
                                <span className="font-bold text-lg text-slate-800">Total:</span>
                                <span className="font-bold text-lg text-indigo-700">{grandTotal.toLocaleString()} TZS</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Signatures */}
                    <div className="mt-16 grid grid-cols-2 gap-16">
                        <div>
                            <div className="border-b border-slate-300 pb-1 mb-2"></div>
                            <p className="text-xs text-slate-500 font-semibold uppercase">Authorized Signature</p>
                        </div>
                        <div>
                            <div className="border-b border-slate-300 pb-1 mb-2"></div>
                            <p className="text-xs text-slate-500 font-semibold uppercase">Supplier Acceptance</p>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
