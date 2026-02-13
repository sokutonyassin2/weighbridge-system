import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wallet, CheckCircle, Receipt, Search, Loader2, Filter, DollarSign, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CashierPaymentPortal = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState("");
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<any>(null);
    const [paymentRef, setPaymentRef] = useState("");

    // Fetch Authorized Requisitions (Items ready for payment)
    const { data: authorizedItems, isLoading } = useQuery({
        queryKey: ["cashier-authorized-items"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number),
                    garage_suppliers(name),
                    profiles!requested_by(full_name)
                `)
                .eq("status", "Approved")
                .order("status_updated_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000
    });

    // Payment Mutation
    const paymentMutation = useMutation({
        mutationFn: async ({ reqId, reference }: { reqId: string, reference: string }) => {
            const { error } = await sb
                .from("garage_requisitions")
                .update({
                    status: 'Paid',
                    payment_reference: reference, // Ensure this column exists or use JSONB
                    status_updated_at: new Date().toISOString()
                })
                .eq("id", reqId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-authorized-items"] });
            setIsPaymentDialogOpen(false);
            setPaymentRef("");
            toast({
                title: "Payment Confirmed",
                description: "Requisition has been marked as Paid and Complete.",
                variant: "default"
            });
        }
    });

    const filteredItems = (authorizedItems || []).filter((item: any) =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.po_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen animate-fade-in">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <Wallet className="w-8 h-8 text-emerald-600" />
                    Payment Portal
                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-emerald-200">
                        {authorizedItems?.length || 0} Ready for Payment
                    </Badge>
                </h1>
                <p className="text-slate-500 text-sm">Process authorized purchase orders and confirm disbursements.</p>
            </header>

            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by PO Number or Item..."
                        className="pl-10 bg-white border-slate-200 h-10 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-white border-b py-4">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                        Pending Disbursements
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center p-20">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50">
                                    <TableHead className="text-[11px] font-bold uppercase py-4 pl-6">PO Number</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase">Item Details</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase">Vendor</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase">Total Amount</TableHead>
                                    <TableHead className="text-right text-[11px] font-bold uppercase pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-20 text-slate-400 italic">
                                            No items currently authorized for payment.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems.map((item: any) => (
                                        <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="font-mono text-xs font-bold text-blue-900 pl-6">
                                                {item.po_number || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-semibold text-slate-800">{item.item_name}</span>
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-tight">Qty: {item.quantity_approved} Units</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium text-slate-600 align-middle">
                                                <div className="h-full flex items-center">
                                                    {item.garage_suppliers?.name || 'Unassigned'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-emerald-700">
                                                        {item.total_price?.toLocaleString()} TZS
                                                    </span>
                                                    {item.includes_vat && (
                                                        <span className="text-[9px] text-indigo-500 font-bold uppercase">Incl. 18% VAT</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button
                                                    size="sm"
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 px-4"
                                                    onClick={() => {
                                                        setSelectedReq(item);
                                                        setIsPaymentDialogOpen(true);
                                                    }}
                                                >
                                                    <span className="mr-1 text-xs">TShs</span>
                                                    Pay
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Payment Confirmation Dialog */}
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-emerald-600" />
                            Confirm Payment Disbursement
                        </DialogTitle>
                        <DialogDescription>
                            Enter the payment reference or receipt number to complete this transaction.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col gap-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Payable to:</span>
                                <span className="font-bold text-slate-800">{selectedReq?.garage_suppliers?.name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Total Amount:</span>
                                <span className="font-extrabold text-emerald-700 text-lg">{selectedReq?.total_price?.toLocaleString()} TZS</span>
                            </div>

                            {/* Payment Details Section */}
                            {selectedReq?.payment_details && (
                                <div className="mt-2 pt-2 border-t border-slate-200 border-dashed">
                                    <p className="text-xs font-bold text-slate-500 uppercase mb-1">Payment Instructions</p>
                                    <div className="text-sm space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Method:</span>
                                            <span className="font-medium text-slate-900">{selectedReq.payment_details.method_name}</span>
                                        </div>
                                        {selectedReq.payment_details.bank_name && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Bank:</span>
                                                <span className="font-medium text-slate-900">{selectedReq.payment_details.bank_name}</span>
                                            </div>
                                        )}
                                        {selectedReq.payment_details.account_number && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Account No:</span>
                                                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                                                    {selectedReq.payment_details.account_number}
                                                </span>
                                            </div>
                                        )}
                                        {selectedReq.payment_details.account_name && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Account Name:</span>
                                                <span className="font-medium text-slate-900">{selectedReq.payment_details.account_name}</span>
                                            </div>
                                        )}
                                        {selectedReq.payment_details.mobile_number && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Mobile No:</span>
                                                <span className="font-mono font-bold text-slate-900">{selectedReq.payment_details.mobile_number}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>


                        <div className="space-y-2">
                            <Label htmlFor="payment-ref" className="text-xs font-bold text-slate-500 uppercase">Payment Reference / Receipt #</Label>
                            <Input
                                id="payment-ref"
                                placeholder="e.g. BANK-12345 or CASH-REC-001"
                                className="h-10"
                                value={paymentRef}
                                onChange={(e) => setPaymentRef(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            disabled={!paymentRef || paymentMutation.isPending}
                            onClick={() => paymentMutation.mutate({
                                reqId: selectedReq.id,
                                reference: paymentRef
                            })}
                        >
                            {paymentMutation.isPending ? "Processing..." : "Complete Payment"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default CashierPaymentPortal;
