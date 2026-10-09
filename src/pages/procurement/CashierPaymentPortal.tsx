import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { POPreviewDialog } from "@/components/POPreviewDialog";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CheckCircle, Receipt, Search, Loader2, Filter, DollarSign, ArrowRight, Calendar, Hash, Printer, FileText, ChevronRight, History, HandCoins, PackageCheck, Upload, Eye, Image, Building2, Truck, Paperclip, ChevronDown, ChevronUp, EyeOff, Pencil, Undo2, X, Layers, CheckCircle2, Clock, AlertCircle, ExternalLink, ClipboardCheck, BarChart3, Wrench, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { printPurchaseOrder } from "@/utils/printUtils";
import { cn } from "@/lib/utils";

const compressImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new window.Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/jpeg',
                    0.7
                );
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
};

const CashierPaymentPortal = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { userProfile, userRole } = useAuth();
    const navigate = useNavigate();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("pending");
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [selectedPOReqs, setSelectedPOReqs] = useState<any[]>([]);
    const [paymentRef, setPaymentRef] = useState("");
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const receiptInputRef = useRef<HTMLInputElement>(null);
    
    // PO Preview
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewSupplier, setPreviewSupplier] = useState("");
    const [previewReqs, setPreviewReqs] = useState<any[]>([]);
    
    // Receipt viewer
    const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
    const [isReceiptViewerOpen, setIsReceiptViewerOpen] = useState(false);
    const [receiptViewerTitle, setReceiptViewerTitle] = useState("");

    // Confirmation dialog for Unseen
    const [unseenConfirmReq, setUnseenConfirmReq] = useState<any>(null);

    // Admin Quick Edit
    const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
    const [quickEditData, setQuickEditData] = useState({ id: "", quantity_requested: 0, unit_price: 0, quantity_approved: 0, item_name: "" });

    // Filtering states for History
    const [selectedMonth, setSelectedMonth] = useState<string>("All");
    const [selectedDay, setSelectedDay] = useState<string>("All");

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const groupRequisitionsByPO = (reqs: any[]) => {
        const groups: Record<string, any[]> = {};
        reqs.forEach(req => {
            const poNum = req.po_number || 'NO-PO';
            const supplierId = req.supplier_id || 'Unknown';
            const key = `${poNum}-${supplierId}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(req);
        });
        return groups;
    };

    // Fetch Authorized Requisitions (Items ready for payment)
    const { data: authorizedItems, isLoading: isAuthorizedLoading } = useQuery({
        queryKey: ["cashier-authorized-items"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number),
                    garage_suppliers(name),
                    profiles!requested_by(full_name),
                    approved_by_profile:profiles!approved_by(full_name),
                    procurement_approved_by_profile:profiles!procurement_approved_by(full_name)
                `)
                .in("status", ["Approved", "Partially Paid", "Paid"])
                .eq("is_deleted", false)
                .order("status_updated_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000
    });

    // Fetch Items Waiting for Arrival Confirmation (Paid but not closed)
    const { data: waitingArrival, isLoading: isWaitingLoading } = useQuery({
        queryKey: ["cashier-waiting-arrival"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number),
                    garage_suppliers(name),
                    profiles!requested_by(full_name),
                    approved_by_profile:profiles!approved_by(full_name),
                    procurement_approved_by_profile:profiles!procurement_approved_by(full_name)
                `)
                .eq("status", "Paid")
                .eq("is_deleted", false)
                .order("status_updated_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000
    });

    const actualWaitingArrival = useMemo(() => (waitingArrival || []).filter(item => item.physically_unseen !== true), [waitingArrival]);
    const unseenItems = useMemo(() => (waitingArrival || []).filter(item => item.physically_unseen === true), [waitingArrival]);

    // Fetch Payment History (Closed items)
    const { data: paymentHistory, isLoading: isHistoryLoading } = useQuery({
        queryKey: ["cashier-payment-history"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(vehicle_no, horse_number),
                    garage_suppliers(name),
                    profiles!requested_by(full_name),
                    approved_by_profile:profiles!approved_by(full_name),
                    procurement_approved_by_profile:profiles!procurement_approved_by(full_name)
                `)
                .or("status.eq.Paid,status.eq.Closed")
                .eq("is_deleted", false)
                .order("status_updated_at", { ascending: false });

            if (error) throw error;
            return data;
        },
        refetchInterval: 10000
    });

    // Derived Data for History
    const { todayRecords, historicalRecords, availableMonths, availableDays } = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const allHistory = paymentHistory || [];

        const today = allHistory.filter(item => {
            const itemDate = item.status_updated_at?.split('T')[0];
            return itemDate === todayStr;
        });

        const history = allHistory.filter(item => {
            const itemDate = item.status_updated_at?.split('T')[0];
            return itemDate !== todayStr;
        });

        // Group available months for the dropdown
        const monthsMap: Record<string, string> = {};
        history.forEach(item => {
            const date = new Date(item.status_updated_at);
            const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthsMap[value] = label;
        });

        const sortedMonths = Object.entries(monthsMap).sort((a, b) => b[0].localeCompare(a[0]));

        // Days for selected month
        const days = new Set<string>();
        if (selectedMonth !== "All") {
            history.forEach(item => {
                const itemMonth = item.status_updated_at?.substring(0, 7);
                if (itemMonth === selectedMonth) {
                    days.add(item.status_updated_at.split('T')[0]);
                }
            });
        }

        return {
            todayRecords: today,
            historicalRecords: history,
            availableMonths: sortedMonths,
            availableDays: Array.from(days).sort((a, b) => b.localeCompare(a))
        };
    }, [paymentHistory, selectedMonth]);

    // Apply Filter to Archived Records
    const filteredArchived = useMemo(() => {
        let records = historicalRecords;

        if (selectedMonth !== "All") {
            records = records.filter(item => item.status_updated_at?.startsWith(selectedMonth));
        }

        if (selectedDay !== "All") {
            records = records.filter(item => item.status_updated_at?.startsWith(selectedDay));
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            records = records.filter(item =>
                item.item_name.toLowerCase().includes(term) ||
                item.po_number?.toLowerCase().includes(term) ||
                item.payment_reference?.toLowerCase().includes(term)
            );
        }

        return records;
    }, [historicalRecords, selectedMonth, selectedDay, searchTerm]);

    // Computed Executive Metrics for Cashier Portal
    const pendingMetrics = useMemo(() => {
        const items = (authorizedItems || []).filter((item: any) => {
            const total = Number(item.total_price) || 0;
            const paid = Number(item.amount_paid) || 0;
            const hasUnpaidBalance = (total - paid) > 1;
            return item.status !== 'Paid' || hasUnpaidBalance;
        });
        const totalPayable = items.reduce((sum: number, r: any) => {
            const total = Number(r.total_price) || 0;
            const paid = Number(r.amount_paid) || 0;
            const advance = Number(r.advance_payment) || 0;
            if (advance > 0 && paid === 0) return sum + advance;
            return sum + Math.max(0, total - paid);
        }, 0);
        const uniquePOs = new Set(items.map((r: any) => r.po_number || r.supplier_id)).size;
        return { count: items.length, poCount: uniquePOs, totalPayable };
    }, [authorizedItems]);

    const advanceMetrics = useMemo(() => {
        const advanceItems = (authorizedItems || []).filter((item: any) => {
            const advance = Number(item.advance_payment) || 0;
            const paid = Number(item.amount_paid) || 0;
            return advance > 0 && paid === 0 && item.status !== 'Paid' && item.status !== 'Partially Paid';
        });
        const totalAdvance = advanceItems.reduce((sum: number, r: any) => sum + (Number(r.advance_payment) || 0), 0);
        const poCount = new Set(advanceItems.map((r: any) => r.po_number || r.supplier_id)).size;
        return { count: advanceItems.length, poCount, totalAdvance };
    }, [authorizedItems]);

    const waitingArrivalTotal = useMemo(() => {
        return actualWaitingArrival.reduce((sum: number, r: any) => sum + (Number(r.total_price) || 0), 0);
    }, [actualWaitingArrival]);

    const todayDisbursedTotal = useMemo(() => {
        return todayRecords.reduce((sum: number, r: any) => sum + (Number(r.total_price) || 0), 0);
    }, [todayRecords]);

    // Payment Mutation
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
            queryClient.invalidateQueries({ queryKey: ["cashier-approved"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-history"] });
            setIsQuickEditOpen(false);
            toast({ title: "Updated", description: "Price, quantity and totals recalculated successfully." });
        }
    });

    const paymentMutation = useMutation({
        mutationFn: async ({ reqs, reference, file }: { reqs: any[], reference: string, file?: File | null }) => {
            let receiptUrl: string | null = null;
            
            // Upload receipt file if provided
            if (file) {
                const fileToUpload = file.type.startsWith('image/') ? await compressImage(file) : file;
                const fileExt = fileToUpload.name.split('.').pop() || 'jpeg';
                const filePath = `payment-receipts/PO-${reqs[0]?.po_number}-${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await (supabase as any).storage
                    .from('receipts')
                    .upload(filePath, fileToUpload);
                if (uploadError) throw uploadError;
                
                const { data: urlData } = (supabase as any).storage
                    .from('receipts')
                    .getPublicUrl(filePath);
                receiptUrl = urlData?.publicUrl || null;
            }

            // Check if this batch is paying an advance payment
            const isAdvancePayment = reqs.some(r => Number(r.advance_payment) > 0 && r.status !== 'Partially Paid' && (Number(r.amount_paid) || 0) === 0);

            for (const item of reqs) {
                const itemAdvance = Number(item.advance_payment) || 0;
                const itemTotal = Number(item.total_price) || 0;
                const currentPaid = Number(item.amount_paid) || 0;

                let nextStatus = 'Paid';
                let nextAmountPaid = itemTotal;

                if (isAdvancePayment && itemAdvance > 0) {
                    // First payment is the advance
                    nextStatus = 'Partially Paid';
                    nextAmountPaid = itemAdvance;
                } else {
                    // Paying balance or full amount
                    nextStatus = 'Paid';
                    nextAmountPaid = itemTotal;
                }

                const updateData: any = {
                    status: nextStatus,
                    amount_paid: nextAmountPaid,
                    payment_reference: reference,
                    status_updated_at: new Date().toISOString()
                };
                if (receiptUrl) {
                    updateData.payment_receipt_url = receiptUrl;
                }

                const { error } = await sb
                    .from("garage_requisitions")
                    .update(updateData)
                    .eq("id", item.id);

                if (error) throw error;
            }
        },
        onSuccess: (data, variables) => {
            const wasAdvance = variables.reqs.some((r: any) => Number(r.advance_payment) > 0 && r.status !== 'Partially Paid' && (Number(r.amount_paid) || 0) === 0);
            queryClient.invalidateQueries({ queryKey: ["cashier-authorized-items"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            setIsPaymentDialogOpen(false);
            setPaymentRef("");
            setReceiptFile(null);
            toast({
                title: wasAdvance ? "Advance Payment Confirmed" : "Payment Confirmed",
                description: wasAdvance 
                    ? "Advance payment recorded. The PO will remain in Cashier Hub awaiting remaining balance." 
                    : "Purchase Order marked as fully paid.",
                variant: "default"
            });
        },
        onError: (error: any) => {
            console.error("Payment failed:", error);
            toast({
                title: "Payment Failed",
                description: error.message || "Failed to process disbursement.",
                variant: "destructive"
            });
        }
    });

    const arrivalMutation = useMutation({
        mutationFn: async (req: any) => {
            const { error } = await sb
                .from("garage_requisitions")
                .update({
                    status: 'Closed',
                    status_updated_at: new Date().toISOString()
                })
                .eq("id", req.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-payment-history"] });
            toast({
                title: "Arrival Confirmed",
                description: "Item has been received, requisition closed, and store inventory updated automatically.",
            });
        },
        onError: (error: any) => {
            console.error("Arrival confirmation failed:", error);
            toast({
                title: "Action Failed",
                description: error?.message || "Failed to confirm arrival. Check permissions.",
                variant: "destructive"
            });
        }
    });

    const unseenMutation = useMutation({
        mutationFn: async (req: any) => {
            const { error } = await sb
                .from("garage_requisitions")
                .update({
                    physically_unseen: true
                })
                .eq("id", req.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            setUnseenConfirmReq(null);
            toast({
                title: "Marked as Unseen",
                description: "Item has been recorded as paid but not physically seen.",
            });
        },
        onError: (error: any) => {
            console.error("Unseen marking failed:", error);
            toast({
                title: "Action Failed",
                description: error?.message || "Failed to update item.",
                variant: "destructive"
            });
        }
    });

    const receiptUploadMutation = useMutation({
        mutationFn: async ({ reqId, file, type }: { reqId: string, file: File, type: 'payment' | 'delivery' }) => {
            const fileToUpload = file.type.startsWith('image/') ? await compressImage(file) : file;
            const fileExt = fileToUpload.name.split('.').pop() || 'jpeg';
            const filePath = `${type}-receipts/REQ-${reqId}-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await (supabase as any).storage
                .from('receipts')
                .upload(filePath, fileToUpload);
            if (uploadError) throw uploadError;
            
            const { data: urlData } = (supabase as any).storage
                .from('receipts')
                .getPublicUrl(filePath);
            
            const updateData: any = {};
            if (type === 'payment') updateData.payment_receipt_url = urlData.publicUrl;
            if (type === 'delivery') updateData.delivery_receipt_url = urlData.publicUrl;

            const { error } = await sb
                .from("garage_requisitions")
                .update(updateData)
                .eq("id", reqId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-payment-history"] });
            toast({
                title: "Receipt Uploaded",
                description: "The receipt has been successfully uploaded.",
            });
        }
    });

    const sendBackToApprovalMutation = useMutation({
        mutationFn: async (reqs: any[]) => {
            for (const item of reqs) {
                const { error } = await sb
                    .from("garage_requisitions")
                    .update({
                        status: 'Awaiting Approval',
                        status_updated_at: new Date().toISOString()
                    })
                    .eq("id", item.id);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-authorized-items"] });
            queryClient.invalidateQueries({ queryKey: ["management-approvals"] });
            toast({
                title: "Sent Back to Approval",
                description: "The PO has been sent back to Management Approvals for re-review.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Failed",
                description: error?.message || "Could not send back.",
                variant: "destructive"
            });
        }
    });

    const filteredItems = (authorizedItems || []).filter((item: any) => {
        // Only show in Pending if item is not fully paid
        const total = Number(item.total_price) || 0;
        const paid = Number(item.amount_paid) || 0;
        const hasUnpaidBalance = (total - paid) > 1;

        if (item.status === 'Paid' && !hasUnpaidBalance) {
            return false;
        }

        return (
            item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.po_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const renderPOCards = () => {
        if (!filteredItems || filteredItems.length === 0) return null;
        const grouped = groupRequisitionsByPO(filteredItems);

        return Object.entries(grouped).map(([key, reqs]) => {
            const firstReq = reqs[0];
            const supplierName = firstReq.garage_suppliers?.name || 'Manual/Unknown Supplier';
            const poNumber = firstReq.po_number || 'DRAFT-PO';
            let poTotal = 0;
            reqs.forEach((r: any) => { poTotal += r.total_price || 0; });
            const uploads = [...new Set(reqs.map((r:any) => r.shop_receipt_url).filter(Boolean))] as string[];
            const totalAdvance = reqs.reduce((sum: number, r: any) => sum + (Number(r.advance_payment) || 0), 0);
            const totalPaid = reqs.reduce((sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0);
            const remainingBalance = Math.max(0, poTotal - totalPaid);
            const hasAdvancePaid = (totalPaid > 0 && remainingBalance > 1) || reqs.some((r: any) => r.status === 'Partially Paid');
            const isAdvanceDue = totalAdvance > 0 && !hasAdvancePaid && totalPaid === 0;
            const currentPayable = isAdvanceDue ? totalAdvance : (hasAdvancePaid ? remainingBalance : poTotal);
            const isExpanded = !!expandedGroups[key];

            return (
                <Card key={key} className="overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white rounded-2xl">
                    <CardHeader className="bg-slate-50/60 border-b pb-4 cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleGroup(key)}>
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                            <div className="space-y-1.5 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-slate-200 rounded-lg">
                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                    <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200 font-bold px-2 py-0.5">
                                        PO #: {poNumber}
                                    </Badge>
                                    {hasAdvancePaid ? (
                                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 uppercase text-[10px] font-bold">
                                            Advance Paid — Waiting for Balance
                                        </Badge>
                                    ) : totalAdvance > 0 ? (
                                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 uppercase text-[10px] font-bold">
                                            Advance Due First
                                        </Badge>
                                    ) : (
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[10px] font-bold">
                                            Approved for Payment
                                        </Badge>
                                    )}
                                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold">
                                        {reqs.length} {reqs.length === 1 ? 'Item' : 'Items'}
                                    </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Building2 className="w-5 h-5 text-emerald-600" />
                                    <CardTitle className="text-lg font-black text-slate-900 tracking-tight uppercase">
                                        {supplierName}
                                    </CardTitle>
                                </div>
                                <p className="text-xs text-slate-400 font-medium">
                                    Requisition Authorized: {formatDate(firstReq.created_at)} • Payment Terms: {firstReq.payment_details?.method_type || 'Direct Transfer'}
                                </p>
                            </div>

                            <div className="flex flex-col items-start lg:items-end gap-1.5 w-full lg:w-auto text-left lg:text-right">
                                <div className="text-2xl font-black text-emerald-600 leading-none">
                                    {currentPayable.toLocaleString()} <span className="text-xs text-slate-500 font-normal">TZS</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    {isAdvanceDue ? "Advance Amount Due" : (hasAdvancePaid ? "Remaining Balance Due" : "Total Payable Amount")}
                                </div>
                                {(totalAdvance > 0 || hasAdvancePaid) && (
                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                        <span>PO Total: <strong className="text-slate-700">{poTotal.toLocaleString()} TZS</strong></span>
                                        {hasAdvancePaid && (
                                            <span className="text-emerald-600 font-semibold">(Advance Paid: {totalPaid.toLocaleString()} TZS)</span>
                                        )}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl" 
                                        onClick={(e) => { e.stopPropagation(); printPurchaseOrder({ requisitions: reqs, userProfile }); }}
                                    >
                                        <Printer className="w-3.5 h-3.5 mr-1 text-slate-500" /> Print PO
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleGroup(key);
                                        }}
                                    >
                                        {isExpanded ? "Collapse" : "View Items"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    {isExpanded && (
                        <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                            {reqs.map((r: any, rIdx: number) => (
                                <div
                                    key={r.id}
                                    className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 overflow-hidden"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                                    <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                                        <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                            {(rIdx + 1).toString().padStart(2, '0')}
                                        </span>
                                        <div className="space-y-1.5 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                    <Wrench size={14} className="text-emerald-600" />
                                                    {r.item_name}
                                                </span>
                                                {r.vehicle && (
                                                    <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100 font-bold">
                                                        <Truck className="w-3 h-3 mr-1" />
                                                        {r.vehicle.vehicle_no || r.vehicle.horse_number}
                                                    </Badge>
                                                )}
                                                {(userRole === 'admin' || userRole === 'super_admin') && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                                                        title="Admin Quick Edit"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setQuickEditData({
                                                                id: r.id,
                                                                item_name: r.item_name,
                                                                quantity_requested: r.quantity_requested || 0,
                                                                quantity_approved: r.quantity_approved || 0,
                                                                unit_price: r.unit_price || 0
                                                            });
                                                            setIsQuickEditOpen(true);
                                                        }}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                <span>Requested by: <strong className="text-slate-700">{r.profiles?.full_name || 'Workshop'}</strong></span>
                                                {r.created_at && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Date: <strong className="text-slate-700">{formatDate(r.created_at)}</strong></span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 w-full lg:w-auto">
                                        <div className="space-y-0.5 min-w-[80px]">
                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Qty Approved</span>
                                            <div className="text-xs font-black text-slate-800">
                                                {r.quantity_approved} Units
                                            </div>
                                            {r.quantity_requested && r.quantity_requested !== r.quantity_approved && (
                                                <span className="text-[10px] text-slate-400 font-medium">
                                                    Req: {r.quantity_requested}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-0.5 pl-4 border-l border-slate-100 min-w-[95px]">
                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Unit Price</span>
                                            <div className="text-xs font-black text-slate-800">
                                                {(r.unit_price || 0).toLocaleString()} TZS
                                            </div>
                                        </div>

                                        <div className="space-y-0.5 pl-4 border-l border-slate-100 text-right min-w-[110px]">
                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Total Amount</span>
                                            <div className="text-xs font-black text-emerald-600 leading-none">
                                                {(r.total_price || 0).toLocaleString()} TZS
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {(uploads.length > 0 || firstReq.payment_details) && (
                        <div className="bg-slate-50/80 border-t p-4 flex flex-wrap items-center justify-between gap-4">
                            {firstReq.payment_details && (
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Payment Instructions</p>
                                    <p className="text-xs font-semibold text-slate-700">
                                        {firstReq.payment_details.method_type} - {firstReq.payment_details.bank_name} 
                                        ({firstReq.payment_details.account_number}) 
                                        {firstReq.payment_details.account_name ? ` - ${firstReq.payment_details.account_name}` : ''}
                                    </p>
                                </div>
                            )}
                            
                            {uploads.length > 0 && (
                                <div className="space-y-1 text-right ml-auto">
                                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Quotation Attachments</p>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        {uploads.map((url, idx) => (
                                            <a key={idx} href={url} target="_blank" rel="noreferrer" className="flex items-center text-xs text-blue-600 hover:underline bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 font-medium">
                                                <Paperclip className="w-3 h-3 mr-1" /> Quote {idx + 1}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <CardFooter className="bg-white border-t p-4 flex justify-between items-center gap-3">
                        {(userRole === 'admin' || userRole === 'super_admin') && (
                            <Button
                                variant="outline"
                                className="border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 uppercase text-xs font-bold px-4 rounded-xl"
                                disabled={sendBackToApprovalMutation.isPending}
                                onClick={() => sendBackToApprovalMutation.mutate(reqs)}
                            >
                                {sendBackToApprovalMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
                                Send Back to Approval
                            </Button>
                        )}
                        <Button
                            className={`${isAdvanceDue ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white shadow-md uppercase text-xs font-bold px-6 ml-auto rounded-xl`}
                            onClick={() => {
                                setSelectedPOReqs(reqs);
                                setIsPaymentDialogOpen(true);
                            }}
                        >
                            <DollarSign className="w-4 h-4 mr-1.5" />
                            {isAdvanceDue ? "Disburse Advance" : (hasAdvancePaid ? "Disburse Remaining Balance" : "Disburse PO Batch")}
                        </Button>
                    </CardFooter>
                </Card>
            );
        });
    };

    return (
        <div className="space-y-4 sm:space-y-6 p-2.5 sm:p-4 md:p-6 animate-fade-in bg-slate-50/30 min-h-screen max-w-[100vw] overflow-x-hidden">
            {/* Unified Navigation Bar - Only visible to Admin and Super Admin */}
            {isAdmin && (
                <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement")}
                            className="text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <Package className="w-4 h-4 text-blue-900" />
                            <span>Procurement Overview</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/approvals")}
                            className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <ClipboardCheck className="w-4 h-4 text-indigo-500" />
                            <span>Management Approvals</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shadow-xs shrink-0"
                        >
                            <DollarSign className="w-4 h-4" />
                            <span>Cashier Hub</span>
                            <Badge className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0 h-4 border-none">
                                {pendingMetrics.poCount} Pending
                            </Badge>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/replaced-parts")}
                            className="text-slate-700 hover:text-teal-600 hover:bg-teal-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <Wrench className="w-4 h-4 text-teal-500" />
                            <span>Replaced Parts</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/reports")}
                            className="text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <BarChart3 className="w-4 h-4 text-blue-900" />
                            <span>Procurement Reports</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                    </div>
                    <div className="text-[11px] text-slate-400 font-semibold hidden md:block shrink-0">
                        Disbursement & Treasury Management
                    </div>
                </div>
            )}

            {/* Header Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Wallet className="w-6 h-6 md:w-7 md:h-7 text-emerald-600" />
                        Cashier Disbursement Hub
                        {pendingMetrics.poCount > 0 && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-bold">
                                {pendingMetrics.poCount} Batches Cleared
                            </Badge>
                        )}
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                        Manage vendor disbursements, advance payments, and confirm receipt of paid goods.
                    </p>
                </div>
            </div>

            {/* ── 1. Executive Top Metric Cards ────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ready for Disbursement */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ready for Disbursement</span>
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {pendingMetrics.totalPayable.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-emerald-600 mt-0.5">
                            {pendingMetrics.poCount} Batches • {pendingMetrics.count} Items
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Authorized POs cleared for release
                    </div>
                </Card>

                {/* 2. Advance Payments Due */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Advance Payments Due</span>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                            <HandCoins size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {advanceMetrics.totalAdvance.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-blue-600 mt-0.5">
                            {advanceMetrics.poCount} Batches Require Advance
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Upfront vendor commitment deposits
                    </div>
                </Card>

                {/* 3. Awaiting Store Arrival */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Awaiting Store Arrival</span>
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                            <PackageCheck size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{actualWaitingArrival.length}</span>
                        <span className="text-xs font-bold text-amber-600">Items Disbursed</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        {waitingArrivalTotal.toLocaleString()} TZS paid, awaiting delivery
                    </div>
                </Card>

                {/* 4. Today's Disbursed Total */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today's Disbursements</span>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Receipt size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {todayDisbursedTotal.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-indigo-600 mt-0.5">
                            {todayRecords.length} Transactions Settled
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Payments closed today
                    </div>
                </Card>
            </div>

            {/* ── 2. Operations Control Toolbar ────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                        placeholder="Search items, PO numbers, suppliers, or references..."
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

                {/* Master Expand / Collapse All */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const allKeys: string[] = [];
                            if (activeTab === "pending") {
                                const grouped = groupRequisitionsByPO(filteredItems);
                                Object.keys(grouped).forEach(k => allKeys.push(k));
                            } else if (activeTab === "arrival") {
                                const grouped = groupRequisitionsByPO(actualWaitingArrival);
                                Object.keys(grouped).forEach(k => allKeys.push(`arr_${k}`));
                            } else if (activeTab === "history") {
                                const grouped = groupRequisitionsByPO(filteredArchived);
                                Object.keys(grouped).forEach(k => allKeys.push(`hist_${k}`));
                            }
                            
                            const areAllExpanded = allKeys.length > 0 && allKeys.every(k => expandedGroups[k]);
                            if (areAllExpanded) {
                                setExpandedGroups({});
                            } else {
                                const newExpanded: Record<string, boolean> = {};
                                allKeys.forEach(k => { newExpanded[k] = true; });
                                setExpandedGroups(prev => ({ ...prev, ...newExpanded }));
                            }
                        }}
                        className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl ml-auto lg:ml-0"
                    >
                        <Layers size={13} className="text-slate-400" />
                        <span>Toggle Expand</span>
                    </Button>
                </div>
            </div>

            {/* ── 3. Tabs Navigation & Content ────────────────────────────── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <div className="w-full overflow-x-auto pb-1">
                    <TabsList className="bg-slate-100 p-1 border border-slate-200 rounded-2xl w-full grid grid-cols-2 md:grid-cols-4 h-auto">
                        <TabsTrigger value="pending" className="gap-2 py-2 px-3 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-xs">
                            <DollarSign className="w-4 h-4 text-emerald-600" />
                            <span>Pending Disbursement</span>
                            {filteredItems.length > 0 && (
                                <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-1.5 py-0 h-4 border-none ml-1">
                                    {pendingMetrics.poCount}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="arrival" className="gap-2 py-2 px-3 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-xs">
                            <PackageCheck className="w-4 h-4 text-orange-500" />
                            <span>Arrival Confirmation</span>
                            {actualWaitingArrival.length > 0 && (
                                <Badge className="bg-orange-100 text-orange-800 text-[10px] font-black px-1.5 py-0 h-4 border-none ml-1">
                                    {actualWaitingArrival.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="unseen" className="gap-2 py-2 px-3 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-xs">
                            <EyeOff className="w-4 h-4 text-slate-500" />
                            <span>Unseen Items</span>
                            {unseenItems.length > 0 && (
                                <Badge className="bg-slate-200 text-slate-800 text-[10px] font-black px-1.5 py-0 h-4 border-none ml-1">
                                    {unseenItems.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="history" className="gap-2 py-2 px-3 text-xs font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-xs">
                            <History className="w-4 h-4 text-blue-600" />
                            <span>Disbursement Records</span>
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="pending" className="space-y-4">
                    {isAuthorizedLoading ? (
                        <div className="flex items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <Card className="border-dashed border-2 border-slate-200 bg-white shadow-none rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl mb-2">
                                    <CheckCircle2 size={28} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">No Pending Disbursements</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                    All authorized purchase orders have been fully disbursed and processed.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {renderPOCards()}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="arrival" className="space-y-4">
                    {isWaitingLoading ? (
                        <div className="flex items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
                            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
                        </div>
                    ) : (
                        (() => {
                            const filteredWaiting = actualWaitingArrival.filter((item: any) =>
                                item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                item.po_number?.toLowerCase().includes(searchTerm.toLowerCase())
                            );
                            if (filteredWaiting.length === 0) {
                                return (
                                    <Card className="border-dashed border-2 border-slate-200 bg-white shadow-none rounded-2xl">
                                        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                                            <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl mb-2">
                                                <PackageCheck size={28} />
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">All Deliveries Confirmed</h3>
                                            <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                                No paid items currently waiting for store/garage physical receipt verification.
                                            </p>
                                        </CardContent>
                                    </Card>
                                );
                            }

                            const grouped = groupRequisitionsByPO(filteredWaiting);
                            return (
                                <div className="space-y-4">
                                    {Object.entries(grouped).map(([key, reqs]) => {
                                        const firstReq = reqs[0];
                                        const supplierName = firstReq.garage_suppliers?.name || 'Manual/Unknown Supplier';
                                        const poNumber = firstReq.po_number || 'DRAFT-PO';
                                        let poTotal = 0;
                                        reqs.forEach((r: any) => { poTotal += r.total_price || 0; });
                                        const isExpanded = expandedGroups[`arr_${key}`];

                                        return (
                                            <Card key={`arr_${key}`} className="overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white rounded-2xl">
                                                <CardHeader className="bg-slate-50/60 border-b pb-4 cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleGroup(`arr_${key}`)}>
                                                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                                                        <div className="space-y-1.5 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-slate-200 rounded-lg">
                                                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                                </Button>
                                                                <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200 font-bold px-2 py-0.5">
                                                                    PO #: {poNumber}
                                                                </Badge>
                                                                <Badge className="bg-orange-50 text-orange-700 border-orange-200 uppercase text-[10px] font-bold">
                                                                    Payment Confirmed
                                                                </Badge>
                                                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold">
                                                                    {reqs.length} {reqs.length === 1 ? 'Item' : 'Items'}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                                <Building2 className="w-5 h-5 text-orange-500" />
                                                                <CardTitle className="text-lg font-black text-slate-900 tracking-tight uppercase">
                                                                    {supplierName}
                                                                </CardTitle>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-medium">
                                                                <span>Paid Date: <strong className="text-emerald-700">{formatDate(firstReq.status_updated_at || firstReq.created_at)}</strong></span>
                                                                <span>•</span>
                                                                <span>Payment Ref: <strong className="text-slate-700">{firstReq.payment_reference || 'N/A'}</strong></span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col items-start lg:items-end gap-1.5 w-full lg:w-auto text-left lg:text-right">
                                                            <div className="text-2xl font-black text-slate-900 leading-none">
                                                                {poTotal.toLocaleString()} <span className="text-xs text-slate-500 font-normal">TZS</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2 justify-end mt-1">
                                                                {(() => {
                                                                    const payReceiptUrl = reqs.find((r: any) => r.payment_receipt_url)?.payment_receipt_url;
                                                                    const supplierReceiptUrl = reqs.find((r: any) => r.delivery_receipt_url)?.delivery_receipt_url;
                                                                    return (
                                                                        <>
                                                                            {payReceiptUrl && (
                                                                                <Button 
                                                                                    variant="outline" 
                                                                                    size="sm" 
                                                                                    className="h-8 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl"
                                                                                    onClick={(e) => { e.stopPropagation(); window.open(payReceiptUrl, '_blank'); }}
                                                                                >
                                                                                    <Receipt className="w-3.5 h-3.5 mr-1" /> View Receipt
                                                                                </Button>
                                                                            )}
                                                                            {supplierReceiptUrl && (
                                                                                <Button 
                                                                                    variant="outline" 
                                                                                    size="sm" 
                                                                                    className="h-8 text-xs font-bold border-purple-200 text-purple-700 hover:bg-purple-50 rounded-xl"
                                                                                    onClick={(e) => { e.stopPropagation(); window.open(supplierReceiptUrl, '_blank'); }}
                                                                                >
                                                                                    <FileText className="w-3.5 h-3.5 mr-1" /> Delivery Note
                                                                                </Button>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })()}
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="h-8 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl" 
                                                                    onClick={(e) => { e.stopPropagation(); printPurchaseOrder({ requisitions: reqs, userProfile }); }}
                                                                >
                                                                    <Printer className="w-3.5 h-3.5 mr-1" /> Print PO
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardHeader>

                                                {isExpanded && (
                                                    <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                                        {reqs.map((r: any, rIdx: number) => (
                                                            <div
                                                                key={r.id}
                                                                className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-orange-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 overflow-hidden"
                                                            >
                                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500" />
                                                                <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                                                                    <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                                        {(rIdx + 1).toString().padStart(2, '0')}
                                                                    </span>
                                                                    <div className="space-y-1.5 flex-1">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                                <Wrench size={14} className="text-orange-600" />
                                                                                {r.item_name}
                                                                            </span>
                                                                            {r.vehicle && (
                                                                                <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100 font-bold">
                                                                                    <Truck className="w-3 h-3 mr-1" />
                                                                                    {r.vehicle.vehicle_no || r.vehicle.horse_number}
                                                                                </Badge>
                                                                            )}
                                                                            <Badge className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] font-bold uppercase">
                                                                                Paid — Awaiting Arrival
                                                                            </Badge>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                                            <span>Qty: <strong className="text-slate-700">{r.quantity_approved}</strong></span>
                                                                            <span>•</span>
                                                                            <span>Unit: <strong className="text-slate-700">{(r.unit_price || 0).toLocaleString()} TZS</strong></span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 w-full lg:w-auto">
                                                                    <div className="text-right mr-2">
                                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Line Total</span>
                                                                        <div className="text-sm font-black text-slate-900">
                                                                            {(r.total_price || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">TZS</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="border-slate-300 text-slate-600 hover:bg-slate-100 shadow-xs text-xs font-bold h-8 px-3 rounded-xl"
                                                                            onClick={(e) => { e.stopPropagation(); setUnseenConfirmReq(r); }}
                                                                            disabled={unseenMutation.isPending}
                                                                            title="Item was not seen physically"
                                                                        >
                                                                            <EyeOff className="w-3.5 h-3.5 mr-1 text-slate-500" />
                                                                            Not Seen
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs text-xs font-bold h-8 px-3.5 rounded-xl"
                                                                            onClick={(e) => { e.stopPropagation(); arrivalMutation.mutate(r); }}
                                                                            disabled={arrivalMutation.isPending}
                                                                        >
                                                                            {arrivalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PackageCheck className="w-3.5 h-3.5 mr-1" />}
                                                                            Confirm Arrival
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </Card>
                                        );
                                    })}
                                </div>
                            );
                        })()
                    )}
                </TabsContent>

                <TabsContent value="unseen" className="space-y-4">
                    {isWaitingLoading ? (
                        <div className="flex items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    ) : unseenItems.length === 0 ? (
                        <Card className="border-dashed border-2 border-slate-200 bg-white shadow-none rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="p-3 bg-slate-100 text-slate-400 rounded-2xl mb-2">
                                    <Eye className="w-6 h-6" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">No Unseen Items</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                    Every disbursed item has been physically accounted for or verified at delivery.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {unseenItems.map((item: any, uIdx: number) => (
                                <div
                                    key={item.id}
                                    className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-400" />
                                    <div className="flex items-start gap-3 flex-1">
                                        <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                            {(uIdx + 1).toString().padStart(2, '0')}
                                        </span>
                                        <div className="space-y-1.5 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                    <EyeOff size={14} className="text-slate-500" />
                                                    {item.item_name}
                                                </span>
                                                <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200 font-bold">
                                                    PO #: {item.po_number || 'N/A'}
                                                </Badge>
                                                {item.vehicle && (
                                                    <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100 font-bold">
                                                        <Truck className="w-3 h-3 mr-1" />
                                                        {item.vehicle.vehicle_no || item.vehicle.horse_number}
                                                    </Badge>
                                                )}
                                                <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-bold uppercase">
                                                    Not Seen Physically
                                                </Badge>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                <span>Supplier: <strong className="text-slate-700">{item.garage_suppliers?.name || 'Unknown'}</strong></span>
                                                <span>•</span>
                                                <span>Disbursed Date: <strong className="text-slate-700">{formatDate(item.status_updated_at)}</strong></span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right sm:min-w-[130px]">
                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Disbursed Amount</span>
                                        <div className="text-sm font-black text-slate-900">
                                            {(item.total_price || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">TZS</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history" className="space-y-6">
                    {/* Today's Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Today's Disbursements</h3>
                                <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px] font-bold">
                                    {todayRecords.length} Settled
                                </Badge>
                            </div>
                        </div>

                        {todayRecords.length === 0 ? (
                            <Card className="border border-slate-200 bg-white rounded-xl shadow-xs p-8 text-center">
                                <p className="text-xs text-slate-400 italic">No disbursement records processed today yet.</p>
                            </Card>
                        ) : (
                            <div className="space-y-2">
                                {todayRecords.map((item: any, tIdx: number) => (
                                    <div
                                        key={item.id}
                                        className="relative group/card bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden"
                                    >
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                                        <div className="flex items-start gap-3 flex-1 pl-1">
                                            <span className="text-[10px] font-black text-slate-300 tabular-nums mt-0.5">
                                                {(tIdx + 1).toString().padStart(2, '0')}
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-bold text-slate-900">{item.item_name}</span>
                                                    <Badge variant="outline" className="font-mono text-[10px] text-blue-900 border-blue-200">
                                                        #{item.po_number}
                                                    </Badge>
                                                    {item.vehicle && (
                                                        <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100 font-bold">
                                                            <Truck className="w-3 h-3 mr-1" />
                                                            {item.vehicle.vehicle_no || item.vehicle.horse_number}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                                    <span>Ref: <strong className="font-mono text-emerald-700">{item.payment_reference || 'N/A'}</strong></span>
                                                    <span>•</span>
                                                    <span>Vendor: <strong className="text-slate-700">{item.garage_suppliers?.name || 'Verified Supplier'}</strong></span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right sm:min-w-[120px]">
                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Amount Paid</span>
                                            <div className="text-sm font-black text-slate-900">
                                                {(item.total_price || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">TZS</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <hr className="border-slate-200" />

                    {/* Archives Section */}
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <History className="w-4 h-4 text-slate-500" />
                                Archived Historical Disbursements
                            </h3>

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <Select value={selectedMonth} onValueChange={(val) => { setSelectedMonth(val); setSelectedDay("All"); }}>
                                        <SelectTrigger className="w-[170px] h-8 text-xs font-bold rounded-lg bg-white border-slate-200">
                                            <SelectValue placeholder="Select Month" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All Historical Months</SelectItem>
                                            {availableMonths.map(([val, label]) => (
                                                <SelectItem key={val} value={val}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <div className="w-px h-4 bg-slate-300" />

                                    <Select value={selectedDay} onValueChange={setSelectedDay} disabled={selectedMonth === "All"}>
                                        <SelectTrigger className="w-[120px] h-8 text-xs font-bold rounded-lg bg-white border-slate-200">
                                            <SelectValue placeholder="Select Day" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All Days</SelectItem>
                                            {availableDays.map(day => (
                                                <SelectItem key={day} value={day}>{formatDate(day)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 mt-4">
                            {isHistoryLoading ? (
                                <div className="text-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                                </div>
                            ) : filteredArchived.length === 0 ? (
                                <Card className="border border-slate-200 shadow-none overflow-hidden bg-white/70 border-dashed rounded-2xl">
                                    <CardContent className="text-center py-16 text-slate-400 italic text-sm">
                                        No archived records found for selected period.
                                    </CardContent>
                                </Card>
                            ) : (
                                Object.entries(groupRequisitionsByPO(filteredArchived)).map(([key, reqs]) => {
                                    const firstReq = reqs[0];
                                    const supplierName = firstReq.garage_suppliers?.name || 'Manual/Unknown Supplier';
                                    const poNumber = firstReq.po_number || 'DRAFT-PO';
                                    let poTotal = 0;
                                    reqs.forEach((r: any) => { poTotal += r.total_price || 0; });
                                    const isExpanded = expandedGroups[`hist_${key}`];
                                    
                                    return (
                                        <Card key={`hist_${key}`} className="overflow-hidden border border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white rounded-2xl">
                                            <CardHeader className="bg-slate-50/60 border-b pb-4 cursor-pointer hover:bg-slate-100/60 transition-colors" onClick={() => toggleGroup(`hist_${key}`)}>
                                                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                                                    <div className="space-y-1.5 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-slate-200 rounded-lg">
                                                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                            </Button>
                                                            <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200 font-bold px-2 py-0.5">
                                                                PO #: {poNumber}
                                                            </Badge>
                                                            <Badge className="bg-slate-100 text-slate-700 border-slate-300 uppercase text-[10px] font-bold">
                                                                Closed & Settled
                                                            </Badge>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                                            <Building2 className="w-5 h-5 text-slate-400" />
                                                            <CardTitle className="text-lg font-black text-slate-900 tracking-tight uppercase">
                                                                {supplierName}
                                                            </CardTitle>
                                                        </div>
                                                        <p className="text-xs text-slate-400 font-medium">Payment Ref: <strong className="text-slate-700 font-mono">{firstReq.payment_reference || 'N/A'}</strong></p>
                                                    </div>
                                                    <div className="flex flex-col items-start lg:items-end gap-1.5 w-full lg:w-auto text-left lg:text-right">
                                                        <div className="text-2xl font-black text-slate-900 leading-none">
                                                            {poTotal.toLocaleString()} <span className="text-xs text-slate-500 font-normal">TZS</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 justify-end mt-1">
                                                            {(() => {
                                                                const payReceiptUrl = reqs.find((r: any) => r.payment_receipt_url)?.payment_receipt_url;
                                                                const supplierReceiptUrl = reqs.find((r: any) => r.delivery_receipt_url)?.delivery_receipt_url;
                                                                return (
                                                                    <>
                                                                        {payReceiptUrl && (
                                                                            <Button 
                                                                                variant="outline" 
                                                                                size="sm" 
                                                                                className="h-8 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl"
                                                                                onClick={(e) => { e.stopPropagation(); window.open(payReceiptUrl, '_blank'); }}
                                                                            >
                                                                                <Receipt className="w-3.5 h-3.5 mr-1" /> View Receipt
                                                                            </Button>
                                                                        )}
                                                                        {supplierReceiptUrl && (
                                                                            <Button 
                                                                                variant="outline" 
                                                                                size="sm" 
                                                                                className="h-8 text-xs font-bold border-purple-200 text-purple-700 hover:bg-purple-50 rounded-xl"
                                                                                onClick={(e) => { e.stopPropagation(); window.open(supplierReceiptUrl, '_blank'); }}
                                                                            >
                                                                                <FileText className="w-3.5 h-3.5 mr-1" /> Delivery Receipt
                                                                            </Button>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl" 
                                                                onClick={(e) => { e.stopPropagation(); printPurchaseOrder({ requisitions: reqs, userProfile }); }}
                                                            >
                                                                <Printer className="w-3.5 h-3.5 mr-1" /> Print PO
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            {isExpanded && (
                                                <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                                    {reqs.map((r: any, rIdx: number) => (
                                                        <div
                                                            key={r.id}
                                                            className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden"
                                                        >
                                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-400" />
                                                            <div className="flex items-start gap-3 flex-1 min-w-[240px]">
                                                                <span className="text-[10px] font-black text-slate-300 tabular-nums mt-0.5">
                                                                    {(rIdx + 1).toString().padStart(2, '0')}
                                                                </span>
                                                                <div>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="font-bold text-slate-900 text-sm">{r.item_name}</span>
                                                                        {r.vehicle && (
                                                                            <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100 font-bold">
                                                                                <Truck className="w-3 h-3 mr-1" />
                                                                                {r.vehicle.vehicle_no || r.vehicle.horse_number}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                                        Settled Date: {formatDate(r.status_updated_at)} • Qty: {r.quantity_approved}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right sm:min-w-[120px]">
                                                                <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Line Total</span>
                                                                <div className="text-sm font-black text-slate-900">
                                                                    {(r.total_price || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">TZS</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Payment Confirmation Dialog */}
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0 bg-slate-50 border-0">
                    {(() => {
                        const poTotal = selectedPOReqs.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
                        const totalAdvance = selectedPOReqs.reduce((sum: number, r: any) => sum + (Number(r.advance_payment) || 0), 0);
                        const totalPaid = selectedPOReqs.reduce((sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0);
                        const remainingBalance = Math.max(0, poTotal - totalPaid);
                        const hasAdvancePaid = (totalPaid > 0 && remainingBalance > 1) || selectedPOReqs.some((r: any) => r.status === 'Partially Paid');
                        const isAdvanceDue = totalAdvance > 0 && !hasAdvancePaid && totalPaid === 0;
                        const payableNow = isAdvanceDue ? totalAdvance : (hasAdvancePaid ? remainingBalance : poTotal);

                        return (
                            <>
                                <div className="p-6 bg-white border-b sticky top-0 z-10 shadow-sm">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                            <Receipt className="w-6 h-6 text-emerald-600" />
                                            {isAdvanceDue ? "Confirm Advance Payment" : (hasAdvancePaid ? "Confirm Remaining Balance Payment" : "Confirm Disbursement")}
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="mt-4 flex justify-between items-center">
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                                                {isAdvanceDue ? "Advance Amount Due" : (hasAdvancePaid ? "Remaining Balance Due" : "Total Amount")}
                                            </p>
                                            <p className="text-3xl font-black text-emerald-600">
                                                {payableNow.toLocaleString()} <span className="text-sm text-slate-500 font-medium">TZS</span>
                                            </p>
                                            {(totalAdvance > 0 || hasAdvancePaid) && (
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Full PO Total: <strong>{poTotal.toLocaleString()} TZS</strong>
                                                    {hasAdvancePaid && ` (Advance already paid: ${totalPaid.toLocaleString()} TZS)`}
                                                    {isAdvanceDue && ` (Balance of ${remainingBalance.toLocaleString()} TZS due later)`}
                                                </p>
                                            )}
                                        </div>
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-xs px-3 py-1">
                                            {selectedPOReqs.length} Items
                                        </Badge>
                                    </div>
                                </div>
                            </>
                        );
                    })()}

                    <div className="p-6 space-y-6">
                        <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Payable To</p>
                                    <p className="font-bold text-slate-900">{selectedPOReqs[0]?.garage_suppliers?.name || 'Manual Supplier'}</p>
                                </div>
                                <div className="text-right space-y-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase">PO Number</p>
                                    <p className="font-mono font-bold text-slate-700">{selectedPOReqs[0]?.po_number}</p>
                                </div>
                            </div>

                            {/* Bank Details */}
                            {selectedPOReqs[0]?.payment_details && (
                                <div className="space-y-3 pt-4 border-t border-slate-100">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                                        <Hash className="w-3.5 h-3.5" />
                                        Payment Instructions
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-3 text-[11px] bg-slate-50 p-3 rounded">
                                        <span className="text-slate-500 font-semibold">Method</span>
                                        <span className="font-bold text-right text-slate-900">{selectedPOReqs[0].payment_details.method_name || selectedPOReqs[0].payment_details.method_type}</span>

                                        {selectedPOReqs[0].payment_details.bank_name && (
                                            <>
                                                <span className="text-slate-500 font-semibold">Bank Name</span>
                                                <span className="font-bold text-right text-slate-900">{selectedPOReqs[0].payment_details.bank_name}</span>
                                                <span className="text-slate-500 font-semibold">Account Number</span>
                                                <code className="text-xs bg-white border px-2 py-0.5 rounded font-mono font-bold text-right text-slate-800 flex justify-end">
                                                    {selectedPOReqs[0].payment_details.account_number}
                                                </code>
                                            </>
                                        )}
                                        {selectedPOReqs[0].payment_details.account_name && (
                                            <>
                                                <span className="text-slate-500 font-semibold">Beneficiary Name</span>
                                                <span className="font-bold text-right text-slate-900 truncate">{selectedPOReqs[0].payment_details.account_name}</span>
                                            </>
                                        )}
                                        {selectedPOReqs[0].payment_details.mobile_number && (
                                            <>
                                                <span className="text-slate-500 font-semibold">Mobile Number</span>
                                                <span className="font-bold text-right text-slate-900 font-mono tracking-wider">{selectedPOReqs[0].payment_details.mobile_number}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="payment-ref" className="text-xs font-bold text-slate-500 uppercase">
                                Transaction Reference / Receipt #
                            </Label>
                            <Input
                                id="payment-ref"
                                autoFocus
                                placeholder="Ref / Receipt Number"
                                className="font-bold h-11 bg-white"
                                value={paymentRef}
                                onChange={(e) => setPaymentRef(e.target.value)}
                            />
                        </div>

                        {/* Receipt Upload */}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase">
                                Upload Payment Receipt (Optional)
                            </Label>
                            <div 
                                className="border-2 border-dashed bg-white border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => receiptInputRef.current?.click()}
                            >
                                <input
                                    ref={receiptInputRef}
                                    type="file"
                                    accept="image/*,.pdf"
                                    className="hidden"
                                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                                />
                                {receiptFile ? (
                                    <div className="flex flex-col items-center justify-center gap-2 text-emerald-600">
                                        <CheckCircle className="w-6 h-6" />
                                        <span className="text-sm font-semibold">{receiptFile.name}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Upload className="w-8 h-8 opacity-50" />
                                        <span className="text-sm font-medium">Click to upload receipt (PDF or Image)</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {(() => {
                        const poTotal = selectedPOReqs.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
                        const totalAdvance = selectedPOReqs.reduce((sum: number, r: any) => sum + (Number(r.advance_payment) || 0), 0);
                        const totalPaid = selectedPOReqs.reduce((sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0);
                        const remainingBalance = Math.max(0, poTotal - totalPaid);
                        const hasAdvancePaid = (totalPaid > 0 && remainingBalance > 1) || selectedPOReqs.some((r: any) => r.status === 'Partially Paid');
                        const isAdvanceDue = totalAdvance > 0 && !hasAdvancePaid && totalPaid === 0;

                        return (
                            <div className="flex justify-between items-center bg-white p-4 border-t sticky bottom-0 z-10 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                                <Button variant="outline" onClick={() => { setIsPaymentDialogOpen(false); setReceiptFile(null); }}>Cancel</Button>
                                <Button
                                    className={`${isAdvanceDue ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold uppercase shadow-lg px-8`}
                                    disabled={!paymentRef || paymentMutation.isPending}
                                    onClick={() => paymentMutation.mutate({
                                        reqs: selectedPOReqs,
                                        reference: paymentRef,
                                        file: receiptFile
                                    })}
                                >
                                    {paymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                                    {isAdvanceDue ? "Confirm Advance Payment" : (hasAdvancePaid ? "Confirm Balance Payment" : "Confirm Disbursement")}
                                </Button>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Receipt Viewer Dialog */}
            <Dialog open={isReceiptViewerOpen} onOpenChange={setIsReceiptViewerOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-indigo-600" />
                            {receiptViewerTitle}
                        </DialogTitle>
                    </DialogHeader>
                    {viewReceiptUrl && (
                        viewReceiptUrl.endsWith('.pdf') ? (
                            <iframe src={viewReceiptUrl} className="w-full h-[60vh] rounded-md border" />
                        ) : (
                            <img src={viewReceiptUrl} alt="Receipt" className="w-full rounded-md border" />
                        )
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsReceiptViewerOpen(false)}>Close</Button>
                        {viewReceiptUrl && (
                            <a href={viewReceiptUrl} target="_blank" rel="noopener noreferrer">
                                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                    <ArrowRight className="w-4 h-4 mr-2" />
                                    Open Full Size
                                </Button>
                            </a>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Unseen Confirmation Dialog */}
            <Dialog open={!!unseenConfirmReq} onOpenChange={(open) => !open && setUnseenConfirmReq(null)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-900">
                            <EyeOff className="w-5 h-5 text-orange-500" />
                            Confirm Unseen Item
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-sm text-slate-600">
                            Are you sure you want to mark this item as paid but not seen physically?
                        </p>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase">Item</p>
                            <p className="font-semibold text-slate-900">{unseenConfirmReq?.item_name}</p>
                            <p className="text-xs font-bold text-slate-500 uppercase mt-2">Amount</p>
                            <p className="font-semibold text-emerald-600">{(unseenConfirmReq?.total_price || 0).toLocaleString()} TZS</p>
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setUnseenConfirmReq(null)}>
                            No, Cancel
                        </Button>
                        <Button 
                            className="bg-orange-500 hover:bg-orange-600 text-white"
                            onClick={() => {
                                if (unseenConfirmReq) {
                                    unseenMutation.mutate(unseenConfirmReq);
                                }
                            }}
                            disabled={unseenMutation.isPending}
                        >
                            {unseenMutation.isPending ? "Updating..." : "Yes, Mark Unseen"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PO Preview Dialog */}
            <POPreviewDialog
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                supplierName={previewSupplier}
                reqs={previewReqs}
            />
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
        </div >
    );
};

export default CashierPaymentPortal;
