import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle, FileCheck, ClipboardCheck, Loader2, Receipt, AlertTriangle, Calendar, Truck, Building2, ExternalLink, Paperclip, Check, Eye, Trash2, Pencil } from "lucide-react";
import { DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const ManagementApprovals = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [selectedPOItems, setSelectedPOItems] = useState<any[]>([]);
    const [revokeReason, setRevokeReason] = useState("");
    
    // State for Management Review
    const [reviewEdits, setReviewEdits] = useState<Record<string, { qty: number, note: string }>>({});
    const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
    const [quickEditData, setQuickEditData] = useState({ id: "", quantity_requested: 0, unit_price: 0, quantity_approved: 0, item_name: "" });

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "N/A";
        const [year, month, day] = dateString.split('T')[0].split('-');
        return `${day}/${month}/${year}`;
    };

    const groupRequisitionsByPO = (reqs: any[]) => {
        const groups: Record<string, any[]> = {};
        reqs.forEach(req => {
            const poNum = req.po_number || 'DRAFT-PO';
            const supplierId = req.supplier_id || 'Unknown';
            const key = `${poNum}-${supplierId}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(req);
        });
        return groups;
    };

    // Fetch Requisitions waiting for review (from garage)
    const { data: reviewsPending, isLoading: isReviewsLoading } = useQuery({
        queryKey: ["management-reviews"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number, make_model),
                    profiles!requested_by(full_name),
                    garage_inventory(item_name)
                `)
                .in("status", ["Waiting Review", "Pending"])
                .eq("is_deleted", false)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000 // Real-time
    });

    // Fetch Requisitions waiting for final approval (from procurement)
    const { data: approvals, isLoading: isApprovalsLoading } = useQuery({
        queryKey: ["management-approvals"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number, make_model),
                    garage_suppliers(name),
                    profiles!requested_by(full_name),
                    approved_by_profile:profiles!approved_by(full_name),
                    procurement_approved_by_profile:profiles!procurement_approved_by(full_name)
                `)
                .eq("status", "Awaiting Approval")
                .eq("is_deleted", false)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000 // Real-time
    });

    // Workflow Mutation for Forwarding to Procurement
    const forwardToProcurementMutation = useMutation({
        mutationFn: async ({ reqId, originalQty }: { reqId: string, originalQty: number }) => {
            const userResponse = await sb.auth.getUser();
            const userId = userResponse.data.user?.id;
            const edits = reviewEdits[reqId] || { qty: originalQty, note: "" };

            const { error } = await sb.from("garage_requisitions")
                .update({
                    status: 'Reviewed & Pending',
                    management_reviewed_quantity: edits.qty,
                    management_review_note: edits.note,
                    management_reviewed_by: userId,
                    management_reviewed_at: new Date().toISOString(),
                    status_updated_at: new Date().toISOString()
                })
                .eq("id", reqId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["management-reviews"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({
                title: "Forwarded to Procurement",
                description: "The requisition has been reviewed and sent to Procurement."
            });
        }
    });

    const deleteRequisitionMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await sb.from("garage_requisitions").update({
                is_deleted: true,
                deleted_at: new Date().toISOString()
            }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["management-reviews"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            toast({ title: "Requisition Deleted", description: "The request has been removed from all systems." });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: error.message || "Could not delete requisition."
            });
        }
    });

    const quickEditMutation = useMutation({
        mutationFn: async (data: typeof quickEditData) => {
            const { data: reqData, error: fetchError } = await sb.from("garage_requisitions")
                .select("includes_vat")
                .eq("id", data.id)
                .single();
                
            if (fetchError) throw fetchError;
            
            const subtotal = data.quantity_approved * data.unit_price;
            const vat = reqData?.includes_vat ? (subtotal * 0.18) : 0;
            const totalPrice = subtotal + vat;

            const { error } = await sb.from("garage_requisitions")
                .update({ 
                    quantity_requested: data.quantity_requested,
                    quantity_approved: data.quantity_approved,
                    unit_price: data.unit_price,
                    vat_amount: vat,
                    total_price: totalPrice
                })
                .eq("id", data.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["management-reviews"] });
            queryClient.invalidateQueries({ queryKey: ["management-approvals"] });
            setIsQuickEditOpen(false);
            toast({ title: "Updated", description: "Price, quantity and totals recalculated successfully." });
        }
    });

    // Workflow Mutation (Approve or Revoke)
    const workflowMutation = useMutation({
        mutationFn: async ({ reqs, nextStatus }: { reqs: any[], nextStatus: string }) => {
            const updateData: any = {
                status: nextStatus,
                status_updated_at: new Date().toISOString(),
                ...(nextStatus === 'Approved' ? { approved_by: (await sb.auth.getUser()).data.user?.id } : {})
            };

            if (nextStatus === 'Revoked') {
                updateData.revoke_reason = revokeReason;
            }

            for (const req of reqs) {
                const { error: reqError } = await sb.from("garage_requisitions").update(updateData).eq("id", req.id);
                if (reqError) throw reqError;

                // Reduce Stock Only on Approval
                if (nextStatus === 'Approved' && req.item_id) {
                    const { data: item } = await sb.from("garage_inventory").select("quantity").eq("id", req.item_id).single();
                    if (item) {
                        const { error: invError } = await sb.from("garage_inventory").update({
                            quantity: (item.quantity || 0) - (req.quantity_requested || 0)
                        }).eq("id", req.item_id);
                        if (invError) throw invError;
                    }
                }
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["management-approvals"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            setIsApproveDialogOpen(false);
            setRevokeReason("");
            toast({
                title: variables.nextStatus === 'Revoked' ? "PO Revoked" : "PO Approved",
                description: variables.nextStatus === 'Revoked' ? "Returned to requester with reason." : "Purchase Order batch authorized successfully."
            });
        }
    });

    const handleEditChange = (reqId: string, field: 'qty' | 'note', value: any, originalQty: number) => {
        setReviewEdits(prev => {
            const current = prev[reqId] || { qty: originalQty, note: "" };
            return {
                ...prev,
                [reqId]: { ...current, [field]: value }
            };
        });
    };

    const renderReviewTable = () => {
        if (!reviewsPending || reviewsPending.length === 0) return (
            <Card className="border-dashed border-2 border-slate-200 bg-transparent shadow-none mb-8">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">No Pending Reviews!</h3>
                    <p className="text-slate-500 max-sm mt-1">
                        There are no new garage requisitions waiting for your review.
                    </p>
                </CardContent>
            </Card>
        );

        return (
            <div className="bg-white border rounded-lg shadow-sm mb-8 overflow-hidden">
                <div className="bg-amber-50 px-6 py-4 border-b flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Eye className="w-5 h-5 text-amber-600" />
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Review New Requests</h2>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">{reviewsPending.length} Pending</Badge>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="pl-6">Date</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Requester</TableHead>
                                <TableHead className="w-[150px]">Approved Qty</TableHead>
                                <TableHead>Boss Note (Optional)</TableHead>
                                <TableHead className="text-right pr-6">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reviewsPending.map((req: any) => {
                                const currentEdits = reviewEdits[req.id] || { qty: req.quantity_requested, note: "" };
                                return (
                                    <TableRow key={req.id}>
                                        <TableCell className="pl-6 text-xs text-slate-500">{formatDate(req.created_at)}</TableCell>
                                        <TableCell className="font-semibold text-slate-800">
                                            {req.garage_inventory?.item_name || req.item_name}
                                            <div className="text-[10px] text-slate-400 mt-0.5">Original Qty: {req.quantity_requested}</div>
                                        </TableCell>
                                        <TableCell>
                                            {req.vehicle ? (
                                                <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100">
                                                    <Truck className="w-3 h-3 mr-1" />
                                                    {req.vehicle.vehicle_no || req.vehicle.horse_number}
                                                </Badge>
                                            ) : req.requirement_category === 'General' || req.request_type === 'General' ? (
                                                <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                                                    <Building2 className="w-3 h-3 mr-1" />
                                                    STORE ROOM
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs">{req.profiles?.full_name}</TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number" 
                                                min="1" 
                                                className="h-8 text-sm font-bold w-20"
                                                value={currentEdits.qty}
                                                onChange={(e) => handleEditChange(req.id, 'qty', parseInt(e.target.value) || 1, req.quantity_requested)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                placeholder="Add a note for procurement..." 
                                                className="h-8 text-xs"
                                                value={currentEdits.note}
                                                onChange={(e) => handleEditChange(req.id, 'note', e.target.value, req.quantity_requested)}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                                                    title="Admin Quick Edit"
                                                    onClick={() => {
                                                        setQuickEditData({
                                                            id: req.id,
                                                            item_name: req.garage_inventory?.item_name || req.item_name,
                                                            quantity_requested: req.quantity_requested || 0,
                                                            quantity_approved: req.quantity_approved || 0,
                                                            unit_price: req.unit_price || 0
                                                        });
                                                        setIsQuickEditOpen(true);
                                                    }}
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4"
                                                    disabled={forwardToProcurementMutation.isPending || deleteRequisitionMutation.isPending}
                                                    onClick={() => forwardToProcurementMutation.mutate({ reqId: req.id, originalQty: req.quantity_requested })}
                                                >
                                                    {forwardToProcurementMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                                    Send to Procurement
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    className="px-3"
                                                    disabled={forwardToProcurementMutation.isPending || deleteRequisitionMutation.isPending}
                                                    onClick={() => deleteRequisitionMutation.mutate(req.id)}
                                                    title="Delete Requisition"
                                                >
                                                    {deleteRequisitionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    };

    const renderPOCards = () => {
        if (!approvals || approvals.length === 0) return (
            <Card className="border-dashed border-2 border-slate-200 bg-transparent shadow-none">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">All Caught Up!</h3>
                    <p className="text-slate-500 max-sm mt-1">
                        There are no purchase orders waiting for management approval at this time.
                    </p>
                </CardContent>
            </Card>
        );

        const grouped = groupRequisitionsByPO(approvals);

        return (
            <Accordion type="multiple" className="space-y-4">
                {Object.entries(grouped).map(([key, reqs]) => {
                    const firstReq = reqs[0];
                    const supplierName = firstReq.garage_suppliers?.name || 'Manual/Unknown Supplier';
                    const poNumber = firstReq.po_number || 'DRAFT-PO';
                    let poTotal = 0;
                    reqs.forEach((r: any) => { poTotal += r.total_price || 0; });
                    const uploads = [...new Set(reqs.map((r:any) => r.shop_receipt_url).filter(Boolean))] as string[];
                    
                    return (
                        <AccordionItem key={key} value={key} className="overflow-hidden border border-slate-200 rounded-lg shadow-sm bg-white">
                            <AccordionTrigger className="hover:no-underline bg-slate-50/50 px-6 py-4 data-[state=open]:border-b">
                                <div className="flex justify-between items-center w-full pr-4 text-left">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="w-5 h-5 text-indigo-600" />
                                            <span className="text-lg font-bold text-slate-800 uppercase tracking-tight">{supplierName}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <Badge variant="outline" className="font-mono text-[10px] text-blue-900 bg-blue-50 border-blue-200">
                                                {poNumber}
                                            </Badge>
                                            <Badge className="bg-orange-50 text-orange-700 border-orange-200 uppercase text-[10px]">
                                                Awaiting Approval
                                            </Badge>
                                            <span className="text-xs text-slate-500 font-medium ml-2">Latest: {formatDate(firstReq.created_at)}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-black text-indigo-900">
                                            {poTotal.toLocaleString()} <span className="text-[10px] text-slate-500 font-medium">TZS</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{reqs.length} Items Pending</div>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            
                            <AccordionContent className="p-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                    <TableHeader className="bg-slate-100/50">
                                        <TableRow>
                                            <TableHead className="pl-6">Item Description</TableHead>
                                            <TableHead>Vehicle</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Unit Price</TableHead>
                                            <TableHead className="text-right pr-6">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reqs.map((r: any) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="pl-6 font-semibold text-slate-800">{r.item_name}</TableCell>
                                                <TableCell>
                                                    {r.vehicle ? (
                                                        <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100">
                                                            <Truck className="w-3 h-3 mr-1" />
                                                            {r.vehicle.vehicle_no || r.vehicle.horse_number}
                                                        </Badge>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell className="font-medium">{r.quantity_requested}</TableCell>
                                                <TableCell>{(r.unit_price || 0).toLocaleString()} TZS</TableCell>
                                                <TableCell className="text-right pr-6 font-bold text-slate-900">
                                                    {(r.total_price || 0).toLocaleString()} TZS
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </div>
                            
                            {(uploads.length > 0 || firstReq.payment_details) && (
                                <div className="bg-slate-50 border-t p-4 flex flex-wrap items-center justify-between gap-4">
                                    {firstReq.payment_details && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase font-bold text-slate-500">Payment Terms</p>
                                            <p className="text-xs font-semibold text-slate-700">
                                                {firstReq.payment_details.method_type} - {firstReq.payment_details.bank_name} ({firstReq.payment_details.account_number})
                                            </p>
                                        </div>
                                    )}
                                    
                                    {uploads.length > 0 && (
                                        <div className="space-y-1 text-right ml-auto">
                                            <p className="text-[10px] uppercase font-bold text-slate-500">Attachments</p>
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                {uploads.map((url, idx) => (
                                                    <a key={idx} href={url} target="_blank" rel="noreferrer" className="flex items-center text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                                        <Paperclip className="w-3 h-3 mr-1" /> Quote/Receipt {idx + 1}
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            <div className="bg-white border-t p-4 flex justify-end">
                                <Button
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md uppercase text-xs font-bold px-6"
                                    onClick={() => {
                                        setSelectedPOItems(reqs);
                                        setIsApproveDialogOpen(true);
                                    }}
                                >
                                    <FileCheck className="w-4 h-4 mr-2" />
                                    Review PO Batch
                                </Button>
                            </div>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        );
    };

    return (
        <div className="space-y-6 p-6 animate-fade-in bg-slate-50/50 min-h-screen">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <ClipboardCheck className="w-7 h-7 text-indigo-600" />
                    Management Approvals
                    <Badge className="ml-2 bg-orange-100 text-orange-700 border-orange-200">
                        {approvals ? new Set(approvals.map(a => a.po_number || a.supplier_id)).size : 0} Pending POs
                    </Badge>
                </h1>
                <p className="text-slate-500">Review new requests from garage, and authorize purchase orders from procurement.</p>
            </div>

            {(isReviewsLoading || isApprovalsLoading) ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            ) : (
                <div className="grid gap-6">
                    {renderReviewTable()}
                    
                    <div className="mt-4">
                        <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-4">Final Purchase Orders (From Procurement)</h2>
                        {renderPOCards()}
                    </div>
                </div>
            )}

            {/* ACTION DIALOG */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0 bg-slate-50 border-0">
                    <div className="p-6 bg-white border-b sticky top-0 z-10 shadow-sm">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <Receipt className="w-6 h-6 text-indigo-600" />
                                Finalize Purchase Order
                            </DialogTitle>
                        </DialogHeader>
                        <div className="mt-4 flex justify-between items-center">
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Value</p>
                                <p className="text-3xl font-black text-indigo-900">
                                    {selectedPOItems.reduce((acc, curr) => acc + (curr.total_price || 0), 0).toLocaleString()} TZS
                                </p>
                            </div>
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 uppercase text-xs px-3 py-1">
                                {selectedPOItems.length} Items
                            </Badge>
                        </div>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <div className="space-y-2 bg-rose-50/50 p-4 rounded-lg border border-rose-100">
                            <Label className="text-[11px] font-bold text-rose-600 uppercase flex items-center gap-2">
                                <AlertTriangle className="w-3 h-3" />
                                Revoke Entire PO (Optional)
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Enter reason to revoke/reject..."
                                    className="h-9 text-xs bg-white"
                                    value={revokeReason}
                                    onChange={(e) => setRevokeReason(e.target.value)}
                                />
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-9 px-4 uppercase text-[10px] font-bold shrink-0"
                                    disabled={!revokeReason || workflowMutation.isPending}
                                    onClick={() => workflowMutation.mutate({ reqs: selectedPOItems, nextStatus: 'Revoked' })}
                                >
                                    {workflowMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revoke"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-white p-4 border-t sticky bottom-0 z-10 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase shadow-lg shadow-emerald-200 px-8"
                            disabled={workflowMutation.isPending}
                            onClick={() => workflowMutation.mutate({ reqs: selectedPOItems, nextStatus: 'Approved' })}
                        >
                            {workflowMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Approve PO Batch
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={isQuickEditOpen} onOpenChange={setIsQuickEditOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-slate-800">Admin Quick Edit</DialogTitle>
                        <DialogDescription className="text-xs">
                            Directly modify quantity and unit price.
                            <div className="mt-2 font-bold text-indigo-600">{quickEditData.item_name}</div>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label className="text-xs font-bold text-slate-600 uppercase">Quantity Requested</Label>
                            <Input type="number" value={quickEditData.quantity_requested} onChange={(e) => setQuickEditData({ ...quickEditData, quantity_requested: Number(e.target.value) })} />
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-xs font-bold text-slate-600 uppercase">Quantity Approved</Label>
                            <Input type="number" value={quickEditData.quantity_approved} onChange={(e) => setQuickEditData({ ...quickEditData, quantity_approved: Number(e.target.value) })} />
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-xs font-bold text-slate-600 uppercase">Unit Price (TZS)</Label>
                            <Input type="number" value={quickEditData.unit_price} onChange={(e) => setQuickEditData({ ...quickEditData, unit_price: Number(e.target.value) })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsQuickEditOpen(false)}>Cancel</Button>
                        <Button className="bg-indigo-600 text-white hover:bg-indigo-700" disabled={quickEditMutation.isPending} onClick={() => quickEditMutation.mutate(quickEditData)}>
                            {quickEditMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ManagementApprovals;
