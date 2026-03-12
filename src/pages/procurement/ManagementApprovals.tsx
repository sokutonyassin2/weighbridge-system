import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CheckCircle, XCircle, FileCheck, ClipboardCheck, Loader2, Receipt, AlertTriangle, Calendar, Truck, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ManagementApprovals = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<any>(null);
    const [revokeReason, setRevokeReason] = useState("");

    const [approvalDetails, setApprovalDetails] = useState({
        supplier_id: "",
        po_number: "",
        includes_vat: false,
        vat_amount: 0,
        temp_price: 0,
        payment_method_id: "",
        quantity_approving: 0
    });

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "N/A";
        const [year, month, day] = dateString.split('T')[0].split('-');
        return `${day}/${month}/${year}`;
    };

    const groupRequisitionsByMonth = (reqs: any[]) => {
        return reqs.reduce((groups: any, req: any) => {
            const date = new Date(req.created_at);
            const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!groups[month]) groups[month] = [];
            groups[month].push(req);
            return groups;
        }, {});
    };

    // Fetch Requisitions waiting for approval
    const { data: approvals, isLoading } = useQuery({
        queryKey: ["management-approvals"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number),
                    garage_suppliers(name),
                    profiles!requested_by(full_name)
                `)
                .eq("status", "Awaiting Approval")
                .eq("is_deleted", false)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000 // Real-time
    });

    // Fetch Suppliers and Payment Methods for the Dialog
    const { data: suppliers } = useQuery({
        queryKey: ["procurement-suppliers"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_suppliers").select("id, name").order("name");
            if (error) throw error;
            return data;
        }
    });

    const { data: allPaymentMethods } = useQuery({
        queryKey: ["procurement-payment-methods"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_supplier_payment_methods").select("*");
            if (error) throw error;
            return data;
        }
    });

    // Workflow Mutation (Approve or Revoke)
    const workflowMutation = useMutation({
        mutationFn: async ({ reqId, qty, itemId, details, nextStatus }: { reqId: string, qty: number, itemId?: string, details: any, nextStatus: string }) => {
            const unitPrice = details.temp_price || 0;
            const subtotal = unitPrice * qty;
            const vat = details.includes_vat ? subtotal * 0.18 : 0;

            const updateData: any = {
                status: nextStatus,
                quantity_approved: qty,
                unit_price: unitPrice,
                total_price: subtotal + vat,
                supplier_id: details.supplier_id,
                po_number: details.po_number,
                includes_vat: details.includes_vat,
                vat_amount: vat,
                status_updated_at: new Date().toISOString(),
                payment_details: allPaymentMethods?.find((m: any) => m.id === details.payment_method_id) || null
            };

            if (nextStatus === 'Revoked') {
                updateData.revoke_reason = revokeReason;
            }

            const { error: reqError } = await sb.from("garage_requisitions").update(updateData).eq("id", reqId);
            if (reqError) throw reqError;

            // Handle splitting if quantity approved is less than requested
            if (nextStatus === 'Approved' && qty < selectedReq?.quantity_requested) {
                const remaining = selectedReq.quantity_requested - qty;
                await sb.from("garage_requisitions").insert({
                    ...selectedReq,
                    id: undefined,
                    quantity_requested: remaining,
                    original_quantity: selectedReq.original_quantity || selectedReq.quantity_requested,
                    parent_id: selectedReq.id,
                    status: 'Pending',
                    created_at: new Date().toISOString(),
                    po_number: null,
                    unit_price: 0,
                    total_price: 0
                });
            }

            // Reduce Stock Only on Approval
            if (nextStatus === 'Approved' && itemId) {
                // Get current stock
                const { data: item } = await sb.from("garage_inventory").select("quantity").eq("id", itemId).single();
                if (item) {
                    const { error: invError } = await sb.from("garage_inventory").update({
                        quantity: (item.quantity || 0) - qty
                    }).eq("id", itemId);
                    if (invError) throw invError;
                }
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["management-approvals"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            setIsApproveDialogOpen(false);
            setRevokeReason("");
            toast({
                title: variables.nextStatus === 'Revoked' ? "Request Revoked" : "PO Approved",
                description: variables.nextStatus === 'Revoked' ? "Returned to requester with reason." : "Purchase Order issued successfully."
            });
        }
    });

    return (
        <div className="space-y-6 p-6 animate-fade-in bg-slate-50/50 min-h-screen">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <ClipboardCheck className="w-7 h-7 text-indigo-600" />
                    Management Approvals
                    <Badge className="ml-2 bg-orange-100 text-orange-700 border-orange-200">
                        {approvals?.length || 0} Pending
                    </Badge>
                </h1>
                <p className="text-slate-500">Review quotes, authorize purchase orders, or revoke requests.</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            ) : (
                <div className="grid gap-6">
                    {(approvals || []).length === 0 ? (
                        <Card className="border-dashed border-2 border-slate-200 bg-transparent shadow-none">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900">All Caught Up!</h3>
                                <p className="text-slate-500 max-sm mt-1">
                                    There are no purchase requests waiting for management approval at this time.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        (() => {
                            const grouped = groupRequisitionsByMonth(approvals || []);
                            return Object.keys(grouped).map((month) => (
                                <div key={month} className="space-y-4">
                                    <div className="flex items-center gap-2 py-2">
                                        <Calendar className="w-4 h-4 text-blue-900" />
                                        <h3 className="text-sm font-bold text-blue-950 uppercase tracking-widest">{month}</h3>
                                        <Badge variant="outline" className="ml-2 text-[10px] bg-white text-slate-500">
                                            {grouped[month].length} Items
                                        </Badge>
                                    </div>
                                    {grouped[month].map((req: any) => (
                                        <Card key={req.id} className="overflow-hidden border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-shadow">
                                            <CardHeader className="bg-white border-b pb-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="font-mono text-[10px] text-slate-500">
                                                                REQ #{req.id.slice(0, 8).toUpperCase()}
                                                            </Badge>
                                                            <Badge className="bg-orange-50 text-orange-700 border-orange-200 uppercase text-[10px]">
                                                                Awaiting Approval
                                                            </Badge>
                                                        </div>
                                                        <CardTitle className="text-lg font-bold text-slate-800">
                                                            {req.item_name}
                                                        </CardTitle>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-2xl font-bold text-blue-900">
                                                            {(req.unit_price * req.quantity_requested).toLocaleString()} <span className="text-sm text-slate-500 font-medium">TZS</span>
                                                        </div>
                                                        <div className="text-xs text-slate-500 font-medium">Est. Total Value</div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pt-4 grid md:grid-cols-4 gap-6">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] uppercase text-slate-500 font-semibold">Requested By</Label>
                                                    <p className="text-sm font-medium text-slate-700">{req.profiles?.full_name || 'Unknown'}</p>
                                                    <p className="text-xs text-slate-500 font-bold">{formatDate(req.created_at)}</p>
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-[10px] uppercase text-slate-500 font-semibold">Quantity</Label>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium text-slate-700">{req.quantity_requested} Units</p>
                                                        {req.original_quantity && req.original_quantity !== req.quantity_requested && (
                                                            <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-600 bg-amber-50">
                                                                Partial of {req.original_quantity}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {req.vehicle && (
                                                        <Badge variant="secondary" className="text-[10px] mt-1 bg-blue-50 text-blue-700 border-blue-100">
                                                            <Truck className="w-3 h-3 mr-1" />
                                                            {req.vehicle.vehicle_no || req.vehicle.horse_number}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-[10px] uppercase text-slate-500 font-semibold">Supplier & Payment</Label>
                                                    <p className="text-xs font-semibold text-slate-700">{req.garage_suppliers?.name || 'Manual Vendor'}</p>
                                                    <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{req.payment_details?.bank_name} {req.payment_details?.account_number}</p>
                                                </div>

                                                <div className="flex items-center justify-end">
                                                    <Button
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 uppercase text-xs font-bold px-6 h-10"
                                                        onClick={() => {
                                                            setSelectedReq(req);
                                                            setApprovalDetails({
                                                                supplier_id: req.supplier_id || "",
                                                                po_number: req.po_number || "",
                                                                includes_vat: req.includes_vat || false,
                                                                vat_amount: req.vat_amount || 0,
                                                                temp_price: req.unit_price || 0,
                                                                payment_method_id: req.payment_details?.id || "",
                                                                quantity_approving: req.quantity_requested || 0
                                                            });
                                                            setIsApproveDialogOpen(true);
                                                        }}
                                                    >
                                                        <FileCheck className="w-4 h-4 mr-2" />
                                                        Review & Action
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ));
                        })()
                    )}
                </div>
            )}

            {/* ACTION DIALOG */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                            <Receipt className="w-6 h-6 text-indigo-600" />
                            Finalize Purchase Order
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase font-bold text-slate-500">Item</p>
                                <p className="font-bold text-lg text-slate-800">{selectedReq?.item_name}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-right">
                                <p className="text-[10px] uppercase font-bold text-slate-500">PO Number</p>
                                <p className="font-mono font-bold text-lg text-blue-900">{approvalDetails.po_number || 'N/A'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Approving Quantity</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={selectedReq?.quantity_requested}
                                    value={approvalDetails.quantity_approving}
                                    onChange={(e) => setApprovalDetails({ ...approvalDetails, quantity_approving: parseInt(e.target.value) })}
                                    className="h-10 font-bold border-indigo-200 bg-indigo-50/20 text-indigo-900"
                                />
                                <p className="text-[10px] text-slate-500 italic">Requested: {selectedReq?.quantity_requested}</p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Confirmed Unit Price</Label>
                                <Input
                                    type="number"
                                    className="h-10 font-bold text-slate-900"
                                    value={approvalDetails.temp_price}
                                    onChange={(e) => setApprovalDetails({ ...approvalDetails, temp_price: parseFloat(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Payment Method</Label>
                            <Select
                                value={approvalDetails.payment_method_id}
                                onValueChange={(val) => setApprovalDetails({ ...approvalDetails, payment_method_id: val })}
                                disabled={!approvalDetails.supplier_id}
                            >
                                <SelectTrigger className="h-10 text-xs font-medium">
                                    <SelectValue placeholder="Select Payment Source..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {(allPaymentMethods || [])
                                        .filter((m: any) => m.supplier_id === approvalDetails.supplier_id)
                                        .map((m: any) => (
                                            <SelectItem key={m.id} value={m.id}>
                                                {m.method_type} - {m.bank_name} ({m.account_number})
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-md bg-indigo-50 border border-indigo-100">
                            <Label className="text-sm font-semibold text-indigo-900">Apply 18% VAT?</Label>
                            <Switch
                                checked={approvalDetails.includes_vat}
                                onCheckedChange={(val) => setApprovalDetails({ ...approvalDetails, includes_vat: val })}
                            />
                        </div>

                        {/* Financial breakdown */}
                        <div className="space-y-1 pt-2 border-t">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Subtotal:</span>
                                <span className="font-semibold">{(approvalDetails.quantity_approving * approvalDetails.temp_price).toLocaleString()} TZS</span>
                            </div>
                            {approvalDetails.includes_vat && (
                                <div className="flex justify-between text-sm text-indigo-600">
                                    <span>VAT (18%):</span>
                                    <span>{(approvalDetails.quantity_approving * approvalDetails.temp_price * 0.18).toLocaleString()} TZS</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-black text-slate-900 pt-2">
                                <span>TOTAL PAYABLE:</span>
                                <span>{(approvalDetails.quantity_approving * approvalDetails.temp_price * (approvalDetails.includes_vat ? 1.18 : 1)).toLocaleString()} TZS</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 border-t pt-4 bg-rose-50/50 p-4 -mx-6 rounded-b-lg">
                        <Label className="text-[11px] font-bold text-rose-600 uppercase flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3" />
                            Revoke Request (Optional)
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter reason to revoke/reject (e.g. 'Price too high')"
                                className="h-9 text-xs bg-white"
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                            />
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-9 px-4 uppercase text-[10px] font-bold"
                                disabled={!revokeReason}
                                onClick={() => workflowMutation.mutate({
                                    reqId: selectedReq?.id,
                                    qty: selectedReq?.quantity_requested,
                                    itemId: selectedReq?.item_id,
                                    details: approvalDetails,
                                    nextStatus: 'Revoked'
                                })}
                            >
                                Revoke PO
                            </Button>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 pt-2">
                        <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase"
                            disabled={!approvalDetails.payment_method_id || !approvalDetails.temp_price}
                            onClick={() => workflowMutation.mutate({
                                reqId: selectedReq?.id,
                                qty: selectedReq?.quantity_requested,
                                itemId: selectedReq?.item_id,
                                details: approvalDetails,
                                nextStatus: 'Approved'
                            })}
                        >
                            Approve & Issue PO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ManagementApprovals;
