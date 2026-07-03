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
import { CheckCircle, FileCheck, ClipboardCheck, Loader2, Receipt, AlertTriangle, Calendar, Truck, Building2, ExternalLink, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ManagementApprovals = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [selectedPOItems, setSelectedPOItems] = useState<any[]>([]);
    const [revokeReason, setRevokeReason] = useState("");

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
            const date = req.created_at.split('T')[0];
            const key = `${poNum}-${supplierId}-${date}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(req);
        });
        return groups;
    };

    // Fetch Requisitions waiting for approval
    const { data: approvals, isLoading } = useQuery({
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

    const renderPOCards = () => {
        if (!approvals || approvals.length === 0) return null;
        const grouped = groupRequisitionsByPO(approvals);

        return Object.entries(grouped).map(([key, reqs]) => {
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
        });
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
                                    There are no purchase orders waiting for management approval at this time.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <Accordion type="multiple" className="space-y-4">
                            {renderPOCards()}
                        </Accordion>
                    )}
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
        </div>
    );
};

export default ManagementApprovals;
