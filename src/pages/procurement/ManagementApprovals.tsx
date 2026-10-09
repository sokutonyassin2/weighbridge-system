import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CheckCircle, FileCheck, ClipboardCheck, Loader2, Receipt, AlertTriangle, Calendar, Truck, Building2, ExternalLink, Paperclip, Check, Eye, Trash2, Pencil, ChevronsUpDown, Package, Wrench, Search, X, Layers, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, DollarSign, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ManagementApprovals = () => {
    const navigate = useNavigate();
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [selectedPOItems, setSelectedPOItems] = useState<any[]>([]);
    const [revokeReason, setRevokeReason] = useState("");
    
    // Edit PO Batch State
    const [batchSharedDetails, setBatchSharedDetails] = useState({
        supplier_id: "",
        po_number: "",
        includes_vat: false,
        payment_method_id: "",
        discount_percentage: 0,
        advance_payment: 0
    });
    const [batchItemPrices, setBatchItemPrices] = useState<Record<string, number>>({});
    const [batchItemQuantities, setBatchItemQuantities] = useState<Record<string, number>>({});
    const [submittingBatchType, setSubmittingBatchType] = useState<"update" | "send" | null>(null);
    const [singleSupplierOpen, setSingleSupplierOpen] = useState(false);

    // State for Management Review
    const [reviewEdits, setReviewEdits] = useState<Record<string, { qty: number, note: string }>>({});
    const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
    const [quickEditData, setQuickEditData] = useState({ id: "", quantity_requested: 0, unit_price: 0, quantity_approved: 0, item_name: "" });

    // Toolbar & Filter State
    const [searchTerm, setSearchTerm] = useState("");
    const [approvalFilterTab, setApprovalFilterTab] = useState<'all' | 'reviews' | 'pos'>('all');
    const [expandedReviewVehicles, setExpandedReviewVehicles] = useState<string[]>([]);
    const [expandedPOKeys, setExpandedPOKeys] = useState<string[]>([]);

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

    // Fetch Suppliers
    const { data: suppliers } = useQuery({
        queryKey: ["management-suppliers"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_suppliers").select("*").order("name");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Payment Methods
    const { data: allPaymentMethods } = useQuery({
        queryKey: ["management-payment-methods"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_supplier_payment_methods").select("*");
            if (error) throw error;
            return data;
        }
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

    // Update PO Batch (Save changes without approving)
    const updatePOBatchMutation = useMutation({
        mutationFn: async ({ reqs, sharedDetails, itemPrices, itemQuantities }: any) => {
            const paymentDetails = allPaymentMethods?.find((m: any) => m.id === sharedDetails.payment_method_id) || null;
            
            // Calculate total batch price for proportional advance distribution
            const totalBatchPrice = reqs.reduce((sum: number, r: any) => {
                const price = itemPrices[r.id] || 0;
                const qty = itemQuantities[r.id] || 0;
                const subtotal = price * qty;
                const discount = subtotal * ((sharedDetails.discount_percentage || 0) / 100);
                const discountedSubtotal = subtotal - discount;
                const vat = sharedDetails.includes_vat ? (discountedSubtotal * 0.18) : 0;
                return sum + (discountedSubtotal + vat);
            }, 0);

            const totalAdv = Number(sharedDetails.advance_payment ?? 0);
            // Pre-calculate advances to avoid rounding errors
            const advanceAllocations: Record<string, number> = {};
            if (totalAdv > 0) {
                let allocatedSum = 0;
                const itemTotals = reqs.map((req: any) => {
                    const price = itemPrices[req.id] || 0;
                    const qty = itemQuantities[req.id] || 0;
                    const subtotal = price * qty;
                    const discount = subtotal * ((sharedDetails.discount_percentage || 0) / 100);
                    const discountedSubtotal = subtotal - discount;
                    const vat = sharedDetails.includes_vat ? (discountedSubtotal * 0.18) : 0;
                    return discountedSubtotal + vat;
                });
                for (let i = 0; i < reqs.length; i++) {
                    const ratio = totalBatchPrice > 0 ? (itemTotals[i] / totalBatchPrice) : (1 / reqs.length);
                    if (i === reqs.length - 1) {
                        advanceAllocations[reqs[i].id] = totalAdv - allocatedSum;
                    } else {
                        const amt = Math.round(totalAdv * ratio);
                        advanceAllocations[reqs[i].id] = amt;
                        allocatedSum += amt;
                    }
                }
            }

            for (const req of reqs) {
                const price = itemPrices[req.id] || 0;
                const qty = itemQuantities[req.id] || 0;
                const subtotal = price * qty;
                const discount = subtotal * ((sharedDetails.discount_percentage || 0) / 100);
                const discountedSubtotal = subtotal - discount;
                const vat = sharedDetails.includes_vat ? (discountedSubtotal * 0.18) : 0;
                const total = discountedSubtotal + vat;

                const { error } = await sb.from("garage_requisitions").update({
                    supplier_id: sharedDetails.supplier_id,
                    po_number: sharedDetails.po_number,
                    includes_vat: sharedDetails.includes_vat,
                    payment_details: paymentDetails,
                    discount_percentage: sharedDetails.discount_percentage || 0,
                    unit_price: price,
                    quantity_approved: qty,
                    vat_amount: vat,
                    total_price: total,
                    advance_payment: advanceAllocations[req.id] || 0
                }).eq("id", req.id);

                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["management-approvals"] });
            toast({ title: "Updated", description: "PO details saved successfully." });
            setSubmittingBatchType(null);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
            setSubmittingBatchType(null);
        }
    });

    const pushBackMutation = useMutation({
        mutationFn: async ({ reqs }: { reqs: any[] }) => {
            for (const req of reqs) {
                const { error } = await sb.from("garage_requisitions").update({
                    status: 'Pending Quotes',
                    po_number: null,
                    status_updated_at: new Date().toISOString()
                }).eq("id", req.id);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["management-approvals"] });
            setIsApproveDialogOpen(false);
            toast({ title: "Pushed Back", description: "PO pushed back to procurement successfully." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    // Workflow Mutation (Approve or Revoke)
    const workflowMutation = useMutation({
        mutationFn: async ({ reqs, nextStatus, sharedDetails, itemPrices, itemQuantities }: any) => {
            const updateData: any = {
                status: nextStatus,
                status_updated_at: new Date().toISOString(),
                ...(nextStatus === 'Approved' ? { approved_by: (await sb.auth.getUser()).data.user?.id } : {})
            };

            if (nextStatus === 'Revoked') {
                updateData.revoke_reason = revokeReason;
            }
            
            const paymentDetails = sharedDetails?.payment_method_id ? 
                (allPaymentMethods?.find((m: any) => m.id === sharedDetails.payment_method_id) || null) : null;

            // Calculate total batch price for proportional advance distribution
            const totalBatchPrice = reqs.reduce((sum: number, r: any) => {
                const price = itemPrices?.[r.id] ?? r.unit_price ?? 0;
                const qty = itemQuantities?.[r.id] ?? r.quantity_approved ?? r.quantity_requested ?? 0;
                const subtotal = price * qty;
                const discountPercentage = sharedDetails?.discount_percentage ?? r.discount_percentage ?? 0;
                const discountedSubtotal = subtotal - (subtotal * (discountPercentage / 100));
                const vat = (sharedDetails?.includes_vat ?? r.includes_vat) ? (discountedSubtotal * 0.18) : 0;
                return sum + (discountedSubtotal + vat);
            }, 0);

            // Pre-calculate advance allocations to avoid rounding errors
            const totalAdv = sharedDetails?.advance_payment !== undefined ? Number(sharedDetails.advance_payment) : reqs.reduce((s: number, r: any) => s + (Number(r.advance_payment) || 0), 0);
            const advanceAllocations: Record<string, number> = {};
            if (totalAdv > 0 && nextStatus === 'Approved') {
                let allocatedSum = 0;
                const itemTotals = reqs.map((r: any) => {
                    const p = itemPrices?.[r.id] ?? r.unit_price ?? 0;
                    const q = itemQuantities?.[r.id] ?? r.quantity_approved ?? r.quantity_requested ?? 0;
                    const sub = p * q;
                    const dp = sharedDetails?.discount_percentage ?? r.discount_percentage ?? 0;
                    const ds = sub - (sub * (dp / 100));
                    const v = (sharedDetails?.includes_vat ?? r.includes_vat) ? (ds * 0.18) : 0;
                    return ds + v;
                });
                for (let i = 0; i < reqs.length; i++) {
                    const ratio = totalBatchPrice > 0 ? (itemTotals[i] / totalBatchPrice) : (1 / reqs.length);
                    if (i === reqs.length - 1) {
                        advanceAllocations[reqs[i].id] = totalAdv - allocatedSum;
                    } else {
                        const amt = Math.round(totalAdv * ratio);
                        advanceAllocations[reqs[i].id] = amt;
                        allocatedSum += amt;
                    }
                }
            }

            for (const req of reqs) {
                const price = itemPrices?.[req.id] ?? req.unit_price;
                const qty = itemQuantities?.[req.id] ?? req.quantity_approved;
                const subtotal = price * qty;
                const discountPercentage = sharedDetails?.discount_percentage ?? req.discount_percentage ?? 0;
                const discount = subtotal * (discountPercentage / 100);
                const discountedSubtotal = subtotal - discount;
                
                const vat = sharedDetails?.includes_vat ? (discountedSubtotal * 0.18) : (req.includes_vat ? (discountedSubtotal * 0.18) : 0);
                const total = discountedSubtotal + vat;
                
                const finalUpdate = { ...updateData };
                
                // Only update these if we are approving (i.e. not just revoking)
                if (nextStatus === 'Approved') {
                    finalUpdate.supplier_id = sharedDetails?.supplier_id || req.supplier_id;
                    finalUpdate.po_number = sharedDetails?.po_number || req.po_number;
                    finalUpdate.includes_vat = sharedDetails?.includes_vat ?? req.includes_vat;
                    finalUpdate.discount_percentage = discountPercentage;
                    if (paymentDetails) {
                        finalUpdate.payment_details = paymentDetails;
                    }
                    finalUpdate.unit_price = price;
                    finalUpdate.quantity_approved = qty;
                    finalUpdate.vat_amount = vat;
                    finalUpdate.total_price = total;
                    finalUpdate.advance_payment = advanceAllocations[req.id] || 0;
                }

                const { error: reqError } = await sb.from("garage_requisitions").update(finalUpdate).eq("id", req.id);
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

    const groupRequisitionsByVehicle = (reqs: any[]) => {
        const groups: Record<string, any[]> = {};
        reqs.forEach(req => {
            let key = "STORE ROOM";
            if (req.vehicle) {
                key = req.vehicle.vehicle_no || req.vehicle.horse_number || "Unknown Vehicle";
            }
            if (!groups[key]) groups[key] = [];
            groups[key].push(req);
        });
        return groups;
    };

    // Filtered lists for real-time search
    const filteredReviewsPending = useMemo(() => {
        if (!reviewsPending) return [];
        const q = searchTerm.trim().toLowerCase();
        if (!q) return reviewsPending;
        return reviewsPending.filter((r: any) =>
            (r.item_name || "").toLowerCase().includes(q) ||
            (r.garage_inventory?.item_name || "").toLowerCase().includes(q) ||
            (r.vehicle?.vehicle_no || "").toLowerCase().includes(q) ||
            (r.vehicle?.horse_number || "").toLowerCase().includes(q) ||
            (r.vehicle?.make_model || "").toLowerCase().includes(q) ||
            (r.profiles?.full_name || "").toLowerCase().includes(q)
        );
    }, [reviewsPending, searchTerm]);

    const filteredApprovals = useMemo(() => {
        if (!approvals) return [];
        const q = searchTerm.trim().toLowerCase();
        if (!q) return approvals;
        return approvals.filter((r: any) =>
            (r.item_name || "").toLowerCase().includes(q) ||
            (r.garage_suppliers?.name || "").toLowerCase().includes(q) ||
            (r.po_number || "").toLowerCase().includes(q) ||
            (r.vehicle?.vehicle_no || "").toLowerCase().includes(q) ||
            (r.vehicle?.horse_number || "").toLowerCase().includes(q) ||
            (r.vehicle?.make_model || "").toLowerCase().includes(q) ||
            (r.profiles?.full_name || "").toLowerCase().includes(q)
        );
    }, [approvals, searchTerm]);

    const groupedReviews = useMemo(() => groupRequisitionsByVehicle(filteredReviewsPending), [filteredReviewsPending]);
    const groupedPOs = useMemo(() => groupRequisitionsByPO(filteredApprovals), [filteredApprovals]);

    const reviewGroupKeys = useMemo(() => Object.keys(groupedReviews), [groupedReviews]);
    const poGroupKeys = useMemo(() => Object.keys(groupedPOs), [groupedPOs]);

    const isAllExpanded = useMemo(() => {
        const hasReviews = reviewGroupKeys.length > 0;
        const hasPOs = poGroupKeys.length > 0;
        const reviewsExpanded = !hasReviews || reviewGroupKeys.every(k => expandedReviewVehicles.includes(k));
        const posExpanded = !hasPOs || poGroupKeys.every(k => expandedPOKeys.includes(k));
        return (hasReviews || hasPOs) && reviewsExpanded && posExpanded;
    }, [reviewGroupKeys, poGroupKeys, expandedReviewVehicles, expandedPOKeys]);

    const handleToggleAllGroups = () => {
        if (isAllExpanded) {
            setExpandedReviewVehicles([]);
            setExpandedPOKeys([]);
        } else {
            setExpandedReviewVehicles(reviewGroupKeys);
            setExpandedPOKeys(poGroupKeys);
        }
    };

    const toggleReviewVehicle = (vehicleKey: string) => {
        setExpandedReviewVehicles(prev =>
            prev.includes(vehicleKey) ? prev.filter(k => k !== vehicleKey) : [...prev, vehicleKey]
        );
    };

    const togglePOKey = (key: string) => {
        setExpandedPOKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const pendingReviewsCount = reviewsPending?.length || 0;
    const poBatchesCount = approvals ? new Set(approvals.map((a: any) => a.po_number || a.supplier_id)).size : 0;
    const totalPOCommitmentTZS = useMemo(() => {
        return (approvals || []).reduce((acc: number, r: any) => acc + (Number(r.total_price) || 0), 0);
    }, [approvals]);
    const totalAdvanceCommittedTZS = useMemo(() => {
        return (approvals || []).reduce((acc: number, r: any) => acc + (Number(r.advance_payment) || 0), 0);
    }, [approvals]);

    const renderReviewTable = () => {
        if (!filteredReviewsPending || filteredReviewsPending.length === 0) {
            return (
                <Card className="border border-slate-200 bg-white p-12 rounded-2xl text-center shadow-xs mb-6">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                        {searchTerm ? "No Matching Review Requests" : "All Caught Up on Reviews"}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                        {searchTerm
                            ? "No pending garage requests match your search query."
                            : "There are currently no new garage requisitions awaiting your initial management review."}
                    </p>
                </Card>
            );
        }

        return (
            <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                            <Eye className="w-4 h-4" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                            Review New Requests (From Garage)
                        </h2>
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold ml-1">
                            {filteredReviewsPending.length} Pending
                        </Badge>
                    </div>
                </div>

                <div className="space-y-3">
                    {Object.entries(groupedReviews).sort((a, b) => a[0].localeCompare(b[0])).map(([vehicleKey, reqs]) => {
                        const isExpanded = expandedReviewVehicles.includes(vehicleKey);

                        return (
                            <Card
                                key={vehicleKey}
                                className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                            >
                                {/* Accordion Header */}
                                <div
                                    onClick={() => toggleReviewVehicle(vehicleKey)}
                                    className="p-4 sm:p-5 bg-gradient-to-r from-amber-50/40 via-white to-slate-50/50 hover:from-amber-100/40 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none"
                                >
                                    <div className="flex items-center gap-3.5 flex-1">
                                        <div className="text-slate-400 transition-transform duration-200">
                                            {isExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                        </div>

                                        <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
                                            {vehicleKey === "STORE ROOM" ? <Building2 size={18} /> : <Truck size={18} />}
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                    {vehicleKey}
                                                </h3>
                                                <Badge className="bg-amber-600 text-white border-none text-[10px] font-black px-2 h-5 rounded-md">
                                                    {reqs.length} {reqs.length === 1 ? 'Item' : 'Items'}
                                                </Badge>
                                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                                                    AWAITING BOSS REVIEW
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                {vehicleKey === "STORE ROOM" ? "General Workshop & Facility Supplies" : "Vehicle Mechanical & Workshop Requisitions"} • Latest: {formatDate(reqs[0]?.created_at)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleReviewVehicle(vehicleKey);
                                            }}
                                            className="h-8 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 rounded-xl"
                                        >
                                            {isExpanded ? "Collapse" : "Review Items"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded Item Cards (Active Operations Style) */}
                                {isExpanded && (
                                    <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                        {reqs.map((req: any, rIdx: number) => {
                                            const currentEdits = reviewEdits[req.id] || { qty: req.quantity_requested, note: "" };

                                            return (
                                                <div
                                                    key={req.id}
                                                    className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 overflow-hidden"
                                                >
                                                    {/* Status Accent Bar */}
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400" />

                                                    {/* 1. Item Details */}
                                                    <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                                                        <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                            {(rIdx + 1).toString().padStart(2, '0')}
                                                        </span>

                                                        <div className="space-y-1.5 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                    <Package size={14} className="text-amber-600" />
                                                                    {req.garage_inventory?.item_name || req.item_name}
                                                                </span>

                                                                <Badge variant="outline" className="text-[10px] font-bold border-slate-200 text-slate-700 bg-slate-50">
                                                                    Req: {req.quantity_requested} Units
                                                                </Badge>

                                                                {req.vehicle && (
                                                                    <Badge variant="outline" className="text-[10px] font-bold border-slate-200 text-slate-700 bg-slate-50 gap-1 rounded">
                                                                        <Truck size={10} className="text-blue-700" />
                                                                        <span>{req.vehicle.vehicle_no || req.vehicle.horse_number}</span>
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                                <span>Req by: <strong className="text-slate-700">{req.profiles?.full_name || 'Workshop Team'}</strong></span>
                                                                <span>•</span>
                                                                <span>Date: <strong className="text-slate-700">{formatDate(req.created_at)}</strong></span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 2. Interactive Inputs: Approved Qty & Boss Note */}
                                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-4">
                                                        <div className="space-y-1 w-full sm:w-28">
                                                            <Label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                                Approved Qty
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                className="h-8 text-xs font-black text-slate-900 bg-slate-50 border-slate-200 rounded-lg text-center"
                                                                value={currentEdits.qty}
                                                                onChange={(e) => handleEditChange(req.id, 'qty', parseInt(e.target.value) || 1, req.quantity_requested)}
                                                            />
                                                        </div>

                                                        <div className="space-y-1 flex-1 min-w-[200px]">
                                                            <Label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                                Boss Note / Instructions
                                                            </Label>
                                                            <Input
                                                                placeholder="Add note for procurement team..."
                                                                className="h-8 text-xs bg-slate-50 border-slate-200 rounded-lg placeholder:text-slate-400"
                                                                value={currentEdits.note}
                                                                onChange={(e) => handleEditChange(req.id, 'note', e.target.value, req.quantity_requested)}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* 3. Actions */}
                                                    <div className="flex items-center gap-1.5 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-3 justify-end">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
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
                                                            <Pencil size={13} />
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            className="h-8 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs gap-1"
                                                            disabled={forwardToProcurementMutation.isPending || deleteRequisitionMutation.isPending}
                                                            onClick={() => forwardToProcurementMutation.mutate({ reqId: req.id, originalQty: req.quantity_requested })}
                                                        >
                                                            {forwardToProcurementMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                            Send to Proc
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                            disabled={forwardToProcurementMutation.isPending || deleteRequisitionMutation.isPending}
                                                            onClick={() => {
                                                                if (window.confirm("Are you sure you want to delete this requisition?")) {
                                                                    deleteRequisitionMutation.mutate(req.id);
                                                                }
                                                            }}
                                                            title="Delete Requisition"
                                                        >
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderPOCards = () => {
        if (!filteredApprovals || filteredApprovals.length === 0) {
            return (
                <Card className="border border-slate-200 bg-white p-12 rounded-2xl text-center shadow-xs">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                        {searchTerm ? "No Matching Purchase Orders" : "No Orders Awaiting Approval"}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                        {searchTerm
                            ? "No purchase order batches match your search query."
                            : "There are no purchase orders waiting for executive management authorization at this time."}
                    </p>
                </Card>
            );
        }

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                            <FileCheck className="w-4 h-4" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                            Final Purchase Orders (From Procurement)
                        </h2>
                        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-bold ml-1">
                            {filteredApprovals.length} Items ({poGroupKeys.length} Batches)
                        </Badge>
                    </div>
                </div>

                <div className="space-y-4">
                    {Object.entries(groupedPOs).sort((a, b) => a[0].localeCompare(b[0])).map(([key, reqs]) => {
                        const isExpanded = expandedPOKeys.includes(key);
                        const firstReq = reqs[0];
                        const supplierName = firstReq.garage_suppliers?.name || 'Manual/Unknown Supplier';
                        const poNumber = firstReq.po_number || 'DRAFT-PO';
                        let poTotal = 0;
                        reqs.forEach((r: any) => { poTotal += r.total_price || 0; });
                        const uploads = [...new Set(reqs.map((r: any) => r.shop_receipt_url).filter(Boolean))] as string[];

                        const totalAdvance = reqs.reduce((sum: number, r: any) => sum + (Number(r.advance_payment) || 0), 0);
                        const remainingBalance = Math.max(0, poTotal - totalAdvance);

                        const handleOpenBatchDialog = () => {
                            setSelectedPOItems(reqs);

                            let matchedPaymentMethodId = "";
                            if (firstReq.payment_details && firstReq.payment_details.id) {
                                matchedPaymentMethodId = firstReq.payment_details.id;
                            }

                            setBatchSharedDetails({
                                supplier_id: firstReq.supplier_id || "",
                                po_number: firstReq.po_number || "",
                                includes_vat: firstReq.includes_vat || false,
                                payment_method_id: matchedPaymentMethodId,
                                discount_percentage: firstReq.discount_percentage || 0,
                                advance_payment: reqs.reduce((sum: number, r: any) => sum + (Number(r.advance_payment) || 0), 0)
                            });

                            const initialPrices: Record<string, number> = {};
                            const initialQuantities: Record<string, number> = {};
                            reqs.forEach((r: any) => {
                                initialPrices[r.id] = r.unit_price || 0;
                                initialQuantities[r.id] = r.quantity_approved || r.quantity_requested || 0;
                            });
                            setBatchItemPrices(initialPrices);
                            setBatchItemQuantities(initialQuantities);

                            setIsApproveDialogOpen(true);
                        };

                        return (
                            <Card
                                key={key}
                                className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                            >
                                {/* Accordion Header */}
                                <div
                                    onClick={() => togglePOKey(key)}
                                    className="p-4 sm:p-5 bg-gradient-to-r from-indigo-50/50 via-white to-slate-50/50 hover:from-indigo-100/50 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                                >
                                    <div className="flex items-center gap-3.5 flex-1">
                                        <div className="text-slate-400 transition-transform duration-200">
                                            {isExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                        </div>

                                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                                            <Building2 size={18} />
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                    {supplierName}
                                                </h3>
                                                <Badge variant="outline" className="font-mono text-[10px] text-blue-900 bg-blue-50 border-blue-200 font-bold">
                                                    {poNumber}
                                                </Badge>
                                                <Badge className="bg-orange-50 text-orange-700 border-orange-200 uppercase text-[10px] font-bold">
                                                    Awaiting Approval
                                                </Badge>
                                                {totalAdvance > 0 && (
                                                    <Badge className="bg-blue-50 text-blue-800 border-blue-200 uppercase text-[10px] font-bold">
                                                        Advance: {totalAdvance.toLocaleString()} TZS
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                Vendor Quotations & Purchase Orders • Latest: {formatDate(firstReq.created_at)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Financial Breakdown & Action Button on Header */}
                                    <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200" onClick={(e) => e.stopPropagation()}>
                                        <div className="space-y-0.5 text-right">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Est. PO Total</span>
                                            <div className="text-sm font-black text-indigo-900 leading-none">
                                                {poTotal.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">TZS</span>
                                            </div>
                                            {totalAdvance > 0 ? (
                                                <span className="text-[10px] text-slate-500 font-semibold block">
                                                    Adv: <strong className="text-blue-700">{totalAdvance.toLocaleString()}</strong> | Bal: <strong className="text-amber-700">{remainingBalance.toLocaleString()}</strong>
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400 block">
                                                    {reqs.length} Parts Allocated
                                                </span>
                                            )}
                                        </div>

                                        <Button
                                            size="sm"
                                            className="h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase rounded-xl shadow-xs gap-1.5"
                                            onClick={handleOpenBatchDialog}
                                        >
                                            <FileCheck size={12} />
                                            Review PO Batch
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded Items List (Active Operations Style) */}
                                {isExpanded && (
                                    <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                        {reqs.map((r: any, rIdx: number) => (
                                            <div
                                                key={r.id}
                                                className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4 overflow-hidden"
                                            >
                                                {/* Left Accent Bar */}
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600" />

                                                {/* Item Details */}
                                                <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                                                    <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                        {(rIdx + 1).toString().padStart(2, '0')}
                                                    </span>

                                                    <div className="space-y-1 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                <Package size={14} className="text-indigo-600" />
                                                                {r.item_name}
                                                            </span>

                                                            {r.vehicle && (
                                                                <Badge variant="outline" className="text-[10px] font-bold border-slate-200 text-slate-700 bg-slate-50 gap-1 rounded">
                                                                    <Truck size={10} className="text-blue-700" />
                                                                    <span>{r.vehicle.vehicle_no || r.vehicle.horse_number}</span>
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                            <span>Quantity: <strong className="text-slate-800">{r.quantity_requested} Units</strong></span>
                                                            <span>•</span>
                                                            <span>Unit Price: <strong className="text-slate-800">{(r.unit_price || 0).toLocaleString()} TZS</strong></span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Financial Line Total */}
                                                <div className="flex items-center justify-between xl:justify-end gap-6 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 xl:pl-6">
                                                    <div className="space-y-0.5 text-right min-w-[120px]">
                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Line Total</span>
                                                        <div className="text-sm font-black text-indigo-900 leading-none">
                                                            {(r.total_price || 0).toLocaleString()} TZS
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Attachments & Payment Terms */}
                                        {(uploads.length > 0 || firstReq.payment_details) && (
                                            <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 mt-3">
                                                {firstReq.payment_details && (
                                                    <div className="space-y-0.5">
                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Payment Terms</span>
                                                        <span className="text-xs font-bold text-slate-800">
                                                            {firstReq.payment_details.method_type} - {firstReq.payment_details.bank_name} ({firstReq.payment_details.account_number})
                                                        </span>
                                                    </div>
                                                )}

                                                {uploads.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Attachments:</span>
                                                        {uploads.map((url, idx) => (
                                                            <a
                                                                key={idx}
                                                                href={url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
                                                            >
                                                                <Paperclip size={11} /> Quote/Receipt {idx + 1}
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex justify-end pt-2">
                                            <Button
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs uppercase text-xs font-bold px-6 h-9 rounded-xl gap-2"
                                                onClick={handleOpenBatchDialog}
                                            >
                                                <FileCheck size={14} />
                                                Review PO Batch
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4 sm:space-y-6 p-2.5 sm:p-4 md:p-6 animate-fade-in bg-slate-50/30 min-h-screen max-w-[100vw] overflow-x-hidden">
            {/* Unified Management Approval Navigation Bar */}
            <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto">
                    <Button
                        variant="default"
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shadow-xs shrink-0"
                    >
                        <Package className="w-4 h-4" />
                        <span>Procurement POs & Requisitions</span>
                        <Badge className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0 h-4 border-none">
                            {poBatchesCount}
                        </Badge>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/logistics/fund-approvals")}
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                    >
                        <Truck className="w-4 h-4 text-indigo-500" />
                        <span>Trip Orders & Road Funds</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/garage")}
                        className="text-slate-700 hover:text-amber-600 hover:bg-amber-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                    >
                        <Wrench className="w-4 h-4 text-amber-500" />
                        <span>Garage Workshop & Job Cards</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                </div>
                <div className="text-[11px] text-slate-400 font-semibold hidden md:block shrink-0">
                    Executive Authorization Center
                </div>
            </div>

            {/* Header Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="w-6 h-6 md:w-7 md:h-7 text-indigo-600" />
                        Management Approvals
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs font-bold">
                            {poBatchesCount} Pending PO Batches
                        </Badge>
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                        Review garage requests, approve quantities, and authorize purchase orders for procurement.
                    </p>
                </div>
            </div>

            {/* ── 1. Executive Top Metric Cards ────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Pending Garage Reviews */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending Reviews</span>
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{pendingReviewsCount}</span>
                        <span className="text-xs font-bold text-amber-600">Garage Requests</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Awaiting management review & qty confirmation
                    </div>
                </Card>

                {/* 2. POs for Approval */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PO's For Approval</span>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <FileCheck size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{poBatchesCount}</span>
                        <span className="text-xs font-bold text-indigo-600">PO Batches</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        {(approvals || []).length} parts queued for final sign-off
                    </div>
                </Card>

                {/* 3. Total PO Financial Commitment */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total PO Value</span>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {totalPOCommitmentTZS.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-blue-600 mt-0.5">
                            Committed Vendor Purchase
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Total value of orders pending authorization
                    </div>
                </Card>

                {/* 4. Advance Cash Outlay */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Advance Outlay</span>
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <Receipt size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {totalAdvanceCommittedTZS.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-emerald-600 mt-0.5">
                            Immediate Deposit Required
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Upfront payment required upon approval
                    </div>
                </Card>
            </div>

            {/* ── 2. Operations Control Toolbar ────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                        placeholder="Search by vehicle plate, item name, supplier, PO #, requester..."
                        className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Filter Toggle Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                    <button
                        type="button"
                        onClick={() => setApprovalFilterTab('all')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            approvalFilterTab === 'all'
                                ? "bg-slate-900 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                    >
                        All ({pendingReviewsCount + (approvals || []).length})
                    </button>

                    <button
                        type="button"
                        onClick={() => setApprovalFilterTab('reviews')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                            approvalFilterTab === 'reviews'
                                ? "bg-amber-600 text-white shadow-xs"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                        )}
                    >
                        <Eye size={12} />
                        <span>Garage Reviews ({pendingReviewsCount})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setApprovalFilterTab('pos')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                            approvalFilterTab === 'pos'
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                        )}
                    >
                        <FileCheck size={12} />
                        <span>Final POs ({poBatchesCount})</span>
                    </button>
                </div>

                {/* Expand All / Collapse All */}
                <div className="flex items-center gap-2 ml-auto lg:ml-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleToggleAllGroups}
                        className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl"
                    >
                        <Layers size={13} className="text-slate-400" />
                        <span>{isAllExpanded ? "Collapse All" : "Expand All"}</span>
                    </Button>
                </div>
            </div>

            {/* ── 3. Content Sections ────────────────────────────────────────── */}
            {(isReviewsLoading || isApprovalsLoading) ? (
                <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                    <Loader2 size={28} className="mx-auto text-indigo-600 animate-spin mb-3" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Loading Management Approval Queue...
                    </p>
                </Card>
            ) : (
                <div className="space-y-8">
                    {(approvalFilterTab === 'all' || approvalFilterTab === 'reviews') && renderReviewTable()}
                    {(approvalFilterTab === 'all' || approvalFilterTab === 'pos') && renderPOCards()}
                </div>
            )}

            {/* ACTION DIALOG */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0 bg-slate-50 border-0">
                    <div className="p-6 bg-white border-b sticky top-0 z-10 shadow-sm flex justify-between items-center">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <Receipt className="w-6 h-6 text-indigo-600" />
                                Finalize Purchase Order
                            </DialogTitle>
                        </DialogHeader>
                        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 uppercase text-xs px-3 py-1">
                            {selectedPOItems.length} Items
                        </Badge>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* Supplier & Payment Details */}
                        <div className="grid grid-cols-2 gap-6 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Supplier</Label>
                                <Popover open={singleSupplierOpen} onOpenChange={setSingleSupplierOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={singleSupplierOpen}
                                            className="w-full justify-between h-9 text-xs font-normal"
                                        >
                                            {batchSharedDetails.supplier_id
                                                ? (suppliers || []).find((s: any) => s.id === batchSharedDetails.supplier_id)?.name
                                                : "Choose Supplier..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search supplier..." />
                                            <CommandList>
                                                <CommandEmpty>No supplier found.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        key="none"
                                                        value="None (Unassign Supplier)"
                                                        onSelect={() => {
                                                            setBatchSharedDetails({ ...batchSharedDetails, supplier_id: "" });
                                                            setSingleSupplierOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={`mr-2 h-4 w-4 ${!batchSharedDetails.supplier_id ? "opacity-100" : "opacity-0"}`}
                                                        />
                                                        <span className="italic text-slate-500">None (Unassign Supplier)</span>
                                                    </CommandItem>
                                                    {(suppliers || []).map((s: any) => (
                                                        <CommandItem
                                                            key={s.id}
                                                            value={s.name}
                                                            onSelect={() => {
                                                                setBatchSharedDetails({ ...batchSharedDetails, supplier_id: s.id });
                                                                setSingleSupplierOpen(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${batchSharedDetails.supplier_id === s.id ? "opacity-100" : "opacity-0"}`}
                                                            />
                                                            {s.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Payment Mode</Label>
                                <Select
                                    value={batchSharedDetails.payment_method_id}
                                    onValueChange={(val) => setBatchSharedDetails({ ...batchSharedDetails, payment_method_id: val })}
                                    disabled={!batchSharedDetails.supplier_id}
                                >
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="Choose Account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(allPaymentMethods || [])
                                            .filter((m: any) => m.supplier_id === batchSharedDetails.supplier_id || m.type === 'Cash')
                                            .map((m: any) => (
                                                <SelectItem key={m.id} value={m.id} className="text-[11px]">
                                                    {m.method_type || m.type}: {m.bank_name || ''} {m.account_number ? `(${m.account_number})` : ''}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">PO Number</Label>
                                <Input
                                    value={batchSharedDetails.po_number}
                                    onChange={(e) => setBatchSharedDetails({ ...batchSharedDetails, po_number: e.target.value })}
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Discount (%)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={batchSharedDetails.discount_percentage}
                                    onChange={(e) => setBatchSharedDetails({ ...batchSharedDetails, discount_percentage: parseFloat(e.target.value) || 0 })}
                                    className="h-9 font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-2 flex flex-col justify-end">
                                <div className="flex items-center gap-2 border p-2 rounded-md bg-white">
                                    <Switch
                                        checked={batchSharedDetails.includes_vat}
                                        onCheckedChange={(val) => setBatchSharedDetails({ ...batchSharedDetails, includes_vat: val })}
                                        id="batch-vat"
                                    />
                                    <Label htmlFor="batch-vat" className="text-[11px] font-semibold cursor-pointer">Include VAT (18%)</Label>
                                </div>
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="space-y-3">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase border-b pb-1 flex justify-between">
                                <span>Items to Review</span>
                                <span>{selectedPOItems.length}</span>
                            </Label>
                            {selectedPOItems.map((req) => {
                                return (
                                <div key={req.id} className="flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-slate-800">{req.item_name}</p>
                                        <p className="text-[10px] text-slate-500 uppercase">Requested: {req.quantity_requested}</p>
                                    </div>
                                    <div className="w-24 space-y-1">
                                        <Label className="text-[9px] text-slate-500 uppercase">Qty to Buy</Label>
                                        <Input
                                            type="number"
                                            value={batchItemQuantities[req.id] || ''}
                                            onChange={(e) => setBatchItemQuantities({ ...batchItemQuantities, [req.id]: parseInt(e.target.value) || 0 })}
                                            className="h-8 font-semibold text-center"
                                            min={1}
                                        />
                                    </div>
                                    <div className="w-32 space-y-1">
                                        <Label className="text-[9px] text-slate-500 uppercase">Unit Price</Label>
                                        <Input
                                            type="number"
                                            value={batchItemPrices[req.id] || ''}
                                            onChange={(e) => setBatchItemPrices({ ...batchItemPrices, [req.id]: parseFloat(e.target.value) || 0 })}
                                            className="h-8 font-semibold text-right"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="w-28 text-right">
                                        <p className="text-[9px] text-slate-500 uppercase mb-1">Subtotal</p>
                                        <p className="font-bold text-sm">
                                            {((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                );
                            })}
                        </div>

                        {/* Totals */}
                        <div className="border-t pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Subtotal:</span>
                                <span className="font-semibold">
                                    {selectedPOItems.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0).toLocaleString()} TZS
                                </span>
                            </div>
                            {batchSharedDetails.discount_percentage > 0 && (
                                <div className="flex justify-between text-sm text-green-700 font-medium">
                                    <span>Discount ({batchSharedDetails.discount_percentage}%):</span>
                                    <span>
                                        -{ (selectedPOItems.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (batchSharedDetails.discount_percentage / 100)).toLocaleString() } TZS
                                    </span>
                                </div>
                            )}
                            {batchSharedDetails.includes_vat && (
                                <div className="flex justify-between text-sm text-indigo-900 font-medium">
                                    <span>VAT (18%):</span>
                                    <span>
                                        {((selectedPOItems.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * 0.18).toLocaleString()} TZS
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-black border-t pt-2">
                                <span>TOTAL:</span>
                                <span>
                                    {((selectedPOItems.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * (batchSharedDetails.includes_vat ? 1.18 : 1)).toLocaleString()} TZS
                                </span>
                            </div>

                            {/* Advance Payment Section */}
                            <div className="mt-3 pt-3 border-t border-dashed border-slate-300 space-y-2 bg-slate-50 p-3 rounded-lg">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <Label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                            Advance Payment (Optional)
                                        </Label>
                                        <p className="text-[11px] text-slate-500">Leave at 0 for 100% full payment</p>
                                    </div>
                                    <div className="relative w-48">
                                        <Input
                                            type="number"
                                            min="0"
                                            max={((selectedPOItems.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * (batchSharedDetails.includes_vat ? 1.18 : 1))}
                                            placeholder="0"
                                            className="font-bold text-right pr-12 h-9 bg-white"
                                            value={batchSharedDetails.advance_payment || ""}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setBatchSharedDetails({ ...batchSharedDetails, advance_payment: Math.max(0, val) });
                                            }}
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">TZS</span>
                                    </div>
                                </div>
                                {batchSharedDetails.advance_payment > 0 && (
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
                                        <span className="font-semibold text-slate-600">Remaining Balance on Arrival:</span>
                                        <span className="font-bold text-amber-600 text-sm">
                                            {Math.max(0, (((selectedPOItems.reduce((sum, req) => sum + ((batchItemPrices[req.id] || 0) * (batchItemQuantities[req.id] || 0)), 0) * (1 - (batchSharedDetails.discount_percentage / 100))) * (batchSharedDetails.includes_vat ? 1.18 : 1)) - batchSharedDetails.advance_payment)).toLocaleString()} TZS
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Revoke / Push Back */}
                        <div className="space-y-3 bg-rose-50/50 p-4 rounded-lg border border-rose-100">
                            <Label className="text-[11px] font-bold text-rose-600 uppercase flex items-center gap-2">
                                <AlertTriangle className="w-3 h-3" />
                                Reject / Push Back PO
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Enter reason to revoke/reject..."
                                    className="h-9 text-xs bg-white"
                                    value={revokeReason}
                                    onChange={(e) => setRevokeReason(e.target.value)}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-4 uppercase text-[10px] font-bold shrink-0 border-rose-200 text-rose-700 hover:bg-rose-100"
                                    disabled={pushBackMutation.isPending}
                                    onClick={() => pushBackMutation.mutate({ reqs: selectedPOItems })}
                                >
                                    {pushBackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Push Back"}
                                </Button>
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

                    <div className="flex gap-2 bg-white p-4 border-t sticky bottom-0 z-10 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} className="flex-1 h-11 font-semibold uppercase text-[11px]">Cancel</Button>
                        
                        <Button
                            variant="outline"
                            className="flex-1 h-11 border-indigo-200 text-indigo-900 hover:bg-indigo-50 font-semibold uppercase text-[11px]"
                            disabled={updatePOBatchMutation.isPending || selectedPOItems.some(r => !batchItemPrices[r.id] || batchItemPrices[r.id] <= 0 || !batchItemQuantities[r.id] || batchItemQuantities[r.id] <= 0)}
                            onClick={() => {
                                setSubmittingBatchType("update");
                                updatePOBatchMutation.mutate({
                                    reqs: selectedPOItems,
                                    sharedDetails: batchSharedDetails,
                                    itemPrices: batchItemPrices,
                                    itemQuantities: batchItemQuantities
                                });
                            }}
                        >
                            {updatePOBatchMutation.isPending && submittingBatchType === "update" ? "Updating..." : "Update"}
                        </Button>

                        <Button
                            className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase shadow-lg shadow-emerald-200"
                            disabled={!batchSharedDetails.supplier_id || !batchSharedDetails.payment_method_id || workflowMutation.isPending || selectedPOItems.some(r => !batchItemPrices[r.id] || batchItemPrices[r.id] <= 0 || !batchItemQuantities[r.id] || batchItemQuantities[r.id] <= 0)}
                            onClick={() => {
                                setSubmittingBatchType("send");
                                workflowMutation.mutate({ 
                                    reqs: selectedPOItems, 
                                    nextStatus: 'Approved',
                                    sharedDetails: batchSharedDetails,
                                    itemPrices: batchItemPrices,
                                    itemQuantities: batchItemQuantities
                                });
                            }}
                        >
                            {workflowMutation.isPending && submittingBatchType === "send" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
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
