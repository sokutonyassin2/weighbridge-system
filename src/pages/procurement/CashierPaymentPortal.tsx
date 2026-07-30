import React, { useState, useMemo, useRef } from "react";
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
import { Wallet, CheckCircle, Receipt, Search, Loader2, Filter, DollarSign, ArrowRight, Calendar, Hash, Printer, FileText, ChevronRight, History, HandCoins, PackageCheck, Upload, Eye, Image, Building2, Truck, Paperclip, ChevronDown, ChevronUp, EyeOff, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { printPurchaseOrder } from "@/utils/printUtils";

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

    const [searchTerm, setSearchTerm] = useState("");
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
                .eq("status", "Approved")
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

            for (const item of reqs) {
                const updateData: any = {
                    status: 'Paid',
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-authorized-items"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            setIsPaymentDialogOpen(false);
            setPaymentRef("");
            setReceiptFile(null);
            toast({
                title: "Payment Confirmed",
                description: "Purchase Order marked as paid.",
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

    const filteredItems = (authorizedItems || []).filter((item: any) =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.po_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
            const isExpanded = expandedGroups[key];
            
            return (
                <Card key={key} className="overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white">
                    <CardHeader className="bg-slate-50/50 border-b pb-4 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => toggleGroup(key)}>
                        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                            <div className="space-y-1 w-full md:w-auto">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-200">
                                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                    <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200">
                                        PO #: {poNumber}
                                    </Badge>
                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[10px]">
                                        Approved for Payment
                                    </Badge>
                                </div>
                                <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-2">
                                    <Building2 className="w-5 h-5 text-slate-400" />
                                    {supplierName}
                                </CardTitle>
                                <p className="text-sm text-slate-500 font-medium">{formatDate(firstReq.created_at)}</p>
                            </div>
                            <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto text-left md:text-right">
                                <div className="text-2xl font-black text-emerald-600">
                                    {poTotal.toLocaleString()} <span className="text-sm text-slate-500 font-medium">TZS</span>
                                </div>
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">Total Payable Amount</div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-xs border-slate-200" 
                                    onClick={(e) => { e.stopPropagation(); printPurchaseOrder({ requisitions: reqs, userProfile }); }}
                                >
                                    <Printer className="w-3 h-3 mr-1" /> Print PO
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    {isExpanded && (
                        <CardContent className="pt-0 pb-0 p-0 overflow-x-auto">
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
                                            <TableCell className="pl-6 font-semibold text-slate-800">
                                                <div className="flex items-center gap-1.5">
                                                    {r.item_name}
                                                    {(userRole === 'admin' || userRole === 'super_admin') && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
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
                                            </TableCell>
                                            <TableCell>
                                                {r.vehicle ? (
                                                    <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100">
                                                        <Truck className="w-3 h-3 mr-1" />
                                                        {r.vehicle.vehicle_no || r.vehicle.horse_number}
                                                    </Badge>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="font-medium">{r.quantity_approved}</TableCell>
                                            <TableCell>{(r.unit_price || 0).toLocaleString()} TZS</TableCell>
                                            <TableCell className="text-right pr-6 font-bold text-slate-900">
                                                {(r.total_price || 0).toLocaleString()} TZS
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    )}
                    
                    {(uploads.length > 0 || firstReq.payment_details) && (
                        <div className="bg-slate-50 border-t p-4 flex flex-wrap items-center justify-between gap-4">
                            {firstReq.payment_details && (
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-slate-500">Payment Terms</p>
                                    <p className="text-xs font-semibold text-slate-700">
                                        {firstReq.payment_details.method_type} - {firstReq.payment_details.bank_name} 
                                        ({firstReq.payment_details.account_number}) 
                                        {firstReq.payment_details.account_name ? ` - ${firstReq.payment_details.account_name}` : ''}
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
                    
                    <CardFooter className="bg-white border-t p-4 flex justify-end">
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md uppercase text-xs font-bold px-6"
                            onClick={() => {
                                setSelectedPOReqs(reqs);
                                setIsPaymentDialogOpen(true);
                            }}
                        >
                            <DollarSign className="w-4 h-4 mr-2" />
                            Disburse PO Batch
                        </Button>
                    </CardFooter>
                </Card>
            );
        });
    };

    return (
        <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen animate-fade-in">
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Wallet className="w-8 h-8 text-primary" />
                        Cashier Hub
                        {authorizedItems?.length > 0 && (
                            <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-emerald-200">
                                {new Set(authorizedItems.map((a:any) => a.po_number || a.supplier_id)).size} Pending POs
                            </Badge>
                        )}
                    </h1>
                    <p className="text-slate-500 text-sm">Disbursement portal for authorized purchase orders.</p>
                </div>

                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search items or references..."
                        className="pl-10 bg-white border-slate-200 h-10 text-sm shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            <Tabs defaultValue="pending" className="space-y-4">
                <div className="w-full overflow-x-auto pb-2">
                    <TabsList className="bg-slate-200/50 p-1 border w-max min-w-full justify-start md:w-full md:grid md:grid-cols-3">
                        <TabsTrigger value="pending" className="gap-2 px-8 flex items-center">
                            <DollarSign className="w-4 h-4" />
                            Pending
                        </TabsTrigger>
                        <TabsTrigger value="arrival" className="gap-2 px-8 relative flex items-center">
                            <PackageCheck className="w-4 h-4" />
                            Arrival Confirmation
                            {actualWaitingArrival.length > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                                    {actualWaitingArrival.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="unseen" className="gap-2 px-8 relative flex items-center">
                            <EyeOff className="w-4 h-4" />
                            Unseen Items
                            {unseenItems.length > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-[10px] font-bold text-white">
                                    {unseenItems.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="history" className="gap-2 px-8 flex items-center">
                            <History className="w-4 h-4" />
                            Records
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="pending">
                    <Card className="border shadow-none overflow-hidden bg-transparent">
                        <CardHeader className="bg-white border-b py-3 rounded-t-lg">
                            <CardTitle className="text-sm font-bold text-slate-600">
                                Ready for Disbursement
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isAuthorizedLoading ? (
                                <div className="flex items-center justify-center p-20 bg-white rounded-b-lg">
                                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                                </div>
                            ) : (
                                <div className="grid gap-6 mt-6">
                                    {filteredItems.length === 0 ? (
                                        <Card className="border-dashed border-2 border-slate-200 bg-white shadow-none">
                                            <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle className="w-10 h-10 text-slate-200" />
                                                    <span className="italic text-slate-400">No pending disbursements at this time.</span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        renderPOCards()
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="arrival">
                    <Card className="border shadow-none overflow-hidden bg-transparent">
                        <CardHeader className="bg-white border-b py-3 rounded-t-lg">
                            <CardTitle className="text-sm font-bold text-slate-600">
                                Confirm Receipt of Paid Items
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isWaitingLoading ? (
                                <div className="flex items-center justify-center p-20 bg-white rounded-b-lg">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
                                </div>
                            ) : (
                                <div className="grid gap-6 mt-6">
                                    {actualWaitingArrival.length === 0 ? (
                                        <Card className="border-dashed border-2 border-slate-200 bg-white shadow-none">
                                            <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <HandCoins className="w-10 h-10 text-slate-200" />
                                                    <span className="italic text-slate-400">No items waiting for arrival confirmation.</span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        (() => {
                                            const filteredWaiting = actualWaitingArrival.filter((item: any) =>
                                                item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                item.po_number?.toLowerCase().includes(searchTerm.toLowerCase())
                                            );
                                            if (filteredWaiting.length === 0) return null;
                                            
                                            const grouped = groupRequisitionsByPO(filteredWaiting);
                                            return Object.entries(grouped).map(([key, reqs]) => {
                                                const firstReq = reqs[0];
                                                const supplierName = firstReq.garage_suppliers?.name || 'Manual/Unknown Supplier';
                                                const poNumber = firstReq.po_number || 'DRAFT-PO';
                                                let poTotal = 0;
                                                reqs.forEach((r: any) => { poTotal += r.total_price || 0; });
                                                const isExpanded = expandedGroups[`arr_${key}`];
                                                
                                                return (
                                                    <Card key={`arr_${key}`} className="overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white">
                                                        <CardHeader className="bg-slate-50/50 border-b pb-4 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => toggleGroup(`arr_${key}`)}>
                                                            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                                                <div className="space-y-1 w-full md:w-auto">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-200">
                                                                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                                        </Button>
                                                                        <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200">
                                                                            PO #: {poNumber}
                                                                        </Badge>
                                                                        <Badge className="bg-orange-50 text-orange-700 border-orange-200 uppercase text-[10px]">
                                                                            Payment Confirmed
                                                                        </Badge>
                                                                    </div>
                                                                    <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-2">
                                                                        <Building2 className="w-5 h-5 text-slate-400" />
                                                                        {supplierName}
                                                                    </CardTitle>
                                                                    <p className="text-sm text-slate-500 font-medium">Payment Ref: {firstReq.payment_reference || 'N/A'}</p>
                                                                </div>
                                                                <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto text-left md:text-right">
                                                                    <div className="text-2xl font-black text-slate-700">
                                                                        {poTotal.toLocaleString()} <span className="text-sm text-slate-500 font-medium">TZS</span>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2 justify-end">
                                                                        {(() => {
                                                                            const payReceiptUrl = reqs.find((r: any) => r.payment_receipt_url)?.payment_receipt_url;
                                                                            const supplierReceiptUrl = reqs.find((r: any) => r.delivery_receipt_url)?.delivery_receipt_url;
                                                                            return (
                                                                                <>
                                                                                    {payReceiptUrl ? (
                                                                                        <div className="flex items-center">
                                                                                            <Button 
                                                                                                variant="outline" 
                                                                                                size="sm" 
                                                                                                className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-r-none"
                                                                                                onClick={(e) => { e.stopPropagation(); window.open(payReceiptUrl, '_blank'); }}
                                                                                            >
                                                                                                <Receipt className="w-3 h-3 mr-1" /> Payment Receipt
                                                                                            </Button>
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-7 px-2 border-emerald-200 border-l-0 text-emerald-700 hover:bg-emerald-50 rounded-l-none"
                                                                                                title="Replace Payment Receipt"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const input = document.createElement('input');
                                                                                                    input.type = 'file';
                                                                                                    input.accept = 'image/*,.pdf';
                                                                                                    input.onchange = (ev: any) => {
                                                                                                        const file = ev.target.files?.[0];
                                                                                                        if (file) receiptUploadMutation.mutate({ reqId: firstReq.id, file, type: 'payment' });
                                                                                                    };
                                                                                                    input.click();
                                                                                                }}
                                                                                            >
                                                                                                <Upload className="w-3 h-3" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <Button
                                                                                            variant="outline"
                                                                                            size="sm"
                                                                                            className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const input = document.createElement('input');
                                                                                                input.type = 'file';
                                                                                                input.accept = 'image/*,.pdf';
                                                                                                input.onchange = (ev: any) => {
                                                                                                    const file = ev.target.files?.[0];
                                                                                                    if (file) receiptUploadMutation.mutate({ reqId: firstReq.id, file, type: 'payment' });
                                                                                                };
                                                                                                input.click();
                                                                                            }}
                                                                                        >
                                                                                            <Upload className="w-3 h-3 mr-1" /> Upload Payment Receipt
                                                                                        </Button>
                                                                                    )}
                                                                                    {supplierReceiptUrl ? (
                                                                                        <div className="flex items-center">
                                                                                            <Button 
                                                                                                variant="outline" 
                                                                                                size="sm" 
                                                                                                className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 rounded-r-none"
                                                                                                onClick={(e) => { e.stopPropagation(); window.open(supplierReceiptUrl, '_blank'); }}
                                                                                            >
                                                                                                <FileText className="w-3 h-3 mr-1" /> Supplier Receipt
                                                                                            </Button>
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-7 px-2 border-purple-200 border-l-0 text-purple-700 hover:bg-purple-50 rounded-l-none"
                                                                                                title="Replace Supplier Receipt"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const input = document.createElement('input');
                                                                                                    input.type = 'file';
                                                                                                    input.accept = 'image/*,.pdf';
                                                                                                    input.onchange = (ev: any) => {
                                                                                                        const file = ev.target.files?.[0];
                                                                                                        if (file) receiptUploadMutation.mutate({ reqId: firstReq.id, file, type: 'delivery' });
                                                                                                    };
                                                                                                    input.click();
                                                                                                }}
                                                                                            >
                                                                                                <Upload className="w-3 h-3" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <Badge variant="outline" className="h-7 px-3 flex items-center bg-slate-50 text-slate-500 border-slate-200 uppercase text-[9px]">
                                                                                            Awaiting Supplier Receipt
                                                                                        </Badge>
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                        <Button 
                                                                            variant="outline" 
                                                                            size="sm" 
                                                                            className="h-7 text-xs border-slate-200" 
                                                                            onClick={(e) => { e.stopPropagation(); printPurchaseOrder({ requisitions: reqs, userProfile }); }}
                                                                        >
                                                                            <Printer className="w-3 h-3 mr-1" /> Print PO
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </CardHeader>
                                                        {isExpanded && (
                                                            <CardContent className="pt-0 pb-0 p-0 overflow-x-auto">
                                                                <Table>
                                                                    <TableHeader className="bg-slate-100/50">
                                                                        <TableRow>
                                                                            <TableHead className="pl-6 sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Item Description</TableHead>
                                                                            <TableHead>Qty</TableHead>
                                                                            <TableHead>Unit Price</TableHead>
                                                                            <TableHead className="text-right">Total</TableHead>
                                                                            <TableHead className="text-right pr-6">Action</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {reqs.map((r: any) => (
                                                                            <TableRow key={r.id}>
                                                                                <TableCell className="pl-6 py-4 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                                                    <div className="font-medium text-slate-900">{r.item_name}</div>
                                                                                    {r.vehicle && (
                                                                                        <div className="text-[10px] text-blue-700 font-bold mt-0.5 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 inline-block">
                                                                                            {r.vehicle.vehicle_no || r.vehicle.horse_number || 'N/A'}
                                                                                        </div>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="font-medium">{r.quantity_approved}</TableCell>
                                                                                <TableCell>{(r.unit_price || 0).toLocaleString()} TZS</TableCell>
                                                                                <TableCell className="text-right font-bold text-slate-900">
                                                                                    {(r.total_price || 0).toLocaleString()} TZS
                                                                                </TableCell>
                                                                                <TableCell className="text-right pr-6">
                                                                                    <div className="flex items-center justify-end gap-2">
                                                                                        <Button
                                                                                            size="sm"
                                                                                            variant="outline"
                                                                                            className="border-slate-300 text-slate-600 hover:bg-slate-100 shadow-sm text-[10px] uppercase font-bold h-7 max-w-[120px]"
                                                                                            onClick={(e) => { e.stopPropagation(); setUnseenConfirmReq(r); }}
                                                                                            disabled={unseenMutation.isPending}
                                                                                            title="Did not see physically"
                                                                                        >
                                                                                            <EyeOff className="w-3 h-3 mr-1" />
                                                                                            Not Seen
                                                                                        </Button>
                                                                                        <Button
                                                                                            size="sm"
                                                                                            className="bg-primary hover:bg-primary/90 text-white shadow-sm text-[10px] uppercase font-bold h-7 max-w-[120px]"
                                                                                            onClick={(e) => { e.stopPropagation(); arrivalMutation.mutate(r); }}
                                                                                            disabled={arrivalMutation.isPending}
                                                                                        >
                                                                                            <PackageCheck className="w-3 h-3 mr-1" />
                                                                                            Confirm Arrival
                                                                                        </Button>
                                                                                    </div>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </CardContent>
                                                        )}
                                                    </Card>
                                                );
                                            });
                                        })()
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="unseen">
                    <Card className="border shadow-none overflow-hidden bg-transparent">
                        <CardHeader className="bg-white border-b py-3 rounded-t-lg">
                            <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <EyeOff className="w-4 h-4 text-slate-500" />
                                Items Paid But Not Seen Physically
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 bg-white">
                            {isWaitingLoading ? (
                                <div className="flex items-center justify-center p-20">
                                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <div className="p-0">
                                    {unseenItems.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Eye className="w-10 h-10 text-slate-200" />
                                                <span className="italic text-slate-400">No unseen items recorded.</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader className="bg-slate-50">
                                                <TableRow>
                                                    <TableHead className="pl-6 font-bold text-xs">Date</TableHead>
                                                    <TableHead className="font-bold text-xs">PO Number</TableHead>
                                                    <TableHead className="font-bold text-xs">Supplier</TableHead>
                                                    <TableHead className="font-bold text-xs">Item Description</TableHead>
                                                    <TableHead className="font-bold text-xs">Vehicle</TableHead>
                                                    <TableHead className="font-bold text-xs text-right pr-6">Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {unseenItems.map((item: any) => (
                                                    <TableRow key={item.id} className="hover:bg-slate-50/50">
                                                        <TableCell className="pl-6 text-sm text-slate-500">{formatDate(item.status_updated_at)}</TableCell>
                                                        <TableCell className="font-medium text-slate-900">{item.po_number || 'N/A'}</TableCell>
                                                        <TableCell className="text-sm">{item.garage_suppliers?.name || 'Unknown'}</TableCell>
                                                        <TableCell className="font-medium">{item.item_name}</TableCell>
                                                        <TableCell>
                                                            {item.vehicle ? (
                                                                <span className="text-[10px] text-blue-700 font-bold bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                                                    {item.vehicle.vehicle_no || item.vehicle.horse_number || 'N/A'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400">—</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6 font-bold text-slate-900">
                                                            {(item.total_price || 0).toLocaleString()} TZS
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="space-y-6">
                    {/* Today's Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                                <h3 className="text-sm font-bold text-slate-900 uppercase">Today's Disbursements</h3>
                                <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px] font-bold">
                                    {todayRecords.length}
                                </Badge>
                            </div>
                        </div>

                        <Card className="border shadow-none overflow-hidden bg-white">
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow>
                                            <TableHead className="text-xs font-bold py-3 pl-6">Reference</TableHead>
                                            <TableHead className="text-xs font-bold">Item & PO</TableHead>
                                            <TableHead className="text-xs font-bold">Supplier</TableHead>
                                            <TableHead className="text-xs font-bold text-right pr-6">Amount Paid</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {todayRecords.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-10 text-slate-400 italic text-sm">
                                                    No payments made today.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            todayRecords.map((item: any) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50/30">
                                                    <TableCell className="font-mono text-xs font-bold text-emerald-600 pl-6">
                                                        {item.payment_reference}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-800">{item.item_name}</span>
                                                            <span className="text-[10px] text-slate-400 italic">#{item.po_number}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-medium">
                                                        {item.garage_suppliers?.name}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-slate-900 pr-6 text-xs">
                                                        {item.total_price?.toLocaleString()} TShs
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                    <hr className="border-slate-200" />

                    {/* Archives Section */}
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                            <h3 className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
                                <History className="w-4 h-4" />
                                Archived Records
                            </h3>

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border">
                                    <Select value={selectedMonth} onValueChange={(val) => { setSelectedMonth(val); setSelectedDay("All"); }}>
                                        <SelectTrigger className="w-[180px] h-8 text-xs font-bold">
                                            <SelectValue placeholder="Select Month" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="All">All History</SelectItem>
                                            {availableMonths.map(([val, label]) => (
                                                <SelectItem key={val} value={val}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <div className="w-px h-4 bg-slate-300" />

                                    <Select value={selectedDay} onValueChange={setSelectedDay} disabled={selectedMonth === "All"}>
                                        <SelectTrigger className="w-[130px] h-8 text-xs font-bold">
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

                        <div className="grid gap-4 mt-4">
                            {isHistoryLoading ? (
                                <div className="text-center py-10">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" />
                                </div>
                            ) : filteredArchived.length === 0 ? (
                                <Card className="border shadow-none overflow-hidden bg-white/50 border-dashed">
                                    <CardContent className="text-center py-16 text-slate-400 italic text-sm">
                                        No archived records found for selection.
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
                                        <Card key={`hist_${key}`} className="overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white">
                                            <CardHeader className="bg-slate-50/50 border-b pb-4 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => toggleGroup(`hist_${key}`)}>
                                                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                                    <div className="space-y-1 w-full md:w-auto">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-200">
                                                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                            </Button>
                                                            <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200">
                                                                PO #: {poNumber}
                                                            </Badge>
                                                            <Badge className="bg-slate-100 text-slate-700 border-slate-300 uppercase text-[10px]">
                                                                Closed
                                                            </Badge>
                                                        </div>
                                                        <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-2">
                                                            <Building2 className="w-5 h-5 text-slate-400" />
                                                            {supplierName}
                                                        </CardTitle>
                                                        <p className="text-sm text-slate-500 font-medium">Payment Ref: {firstReq.payment_reference || 'N/A'}</p>
                                                    </div>
                                                    <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto text-left md:text-right">
                                                        <div className="text-2xl font-black text-slate-700">
                                                            {poTotal.toLocaleString()} <span className="text-sm text-slate-500 font-medium">TZS</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 justify-end">
                                                            {(() => {
                                                                const payReceiptUrl = reqs.find((r: any) => r.payment_receipt_url)?.payment_receipt_url;
                                                                const supplierReceiptUrl = reqs.find((r: any) => r.delivery_receipt_url)?.delivery_receipt_url;
                                                                return (
                                                                    <>
                                                                        {payReceiptUrl ? (
                                                                            <div className="flex items-center">
                                                                                <Button 
                                                                                    variant="outline" 
                                                                                    size="sm" 
                                                                                    className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-r-none"
                                                                                    onClick={(e) => { e.stopPropagation(); window.open(payReceiptUrl, '_blank'); }}
                                                                                >
                                                                                    <Receipt className="w-3 h-3 mr-1" /> Payment Receipt
                                                                                </Button>
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-7 px-2 border-emerald-200 border-l-0 text-emerald-700 hover:bg-emerald-50 rounded-l-none"
                                                                                    title="Replace Payment Receipt"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const input = document.createElement('input');
                                                                                        input.type = 'file';
                                                                                        input.accept = 'image/*,.pdf';
                                                                                        input.onchange = (ev: any) => {
                                                                                            const file = ev.target.files?.[0];
                                                                                            if (file) receiptUploadMutation.mutate({ reqId: firstReq.id, file, type: 'payment' });
                                                                                        };
                                                                                        input.click();
                                                                                    }}
                                                                                >
                                                                                    <Upload className="w-3 h-3" />
                                                                                </Button>
                                                                            </div>
                                                                        ) : (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const input = document.createElement('input');
                                                                                    input.type = 'file';
                                                                                    input.accept = 'image/*,.pdf';
                                                                                    input.onchange = (ev: any) => {
                                                                                        const file = ev.target.files?.[0];
                                                                                        if (file) receiptUploadMutation.mutate({ reqId: firstReq.id, file, type: 'payment' });
                                                                                    };
                                                                                    input.click();
                                                                                }}
                                                                            >
                                                                                <Upload className="w-3 h-3 mr-1" /> Upload Payment Receipt
                                                                            </Button>
                                                                        )}
                                                                        {supplierReceiptUrl ? (
                                                                            <div className="flex items-center">
                                                                                <Button 
                                                                                    variant="outline" 
                                                                                    size="sm" 
                                                                                    className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 rounded-r-none"
                                                                                    onClick={(e) => { e.stopPropagation(); window.open(supplierReceiptUrl, '_blank'); }}
                                                                                >
                                                                                    <FileText className="w-3 h-3 mr-1" /> Supplier Receipt
                                                                                </Button>
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-7 px-2 border-purple-200 border-l-0 text-purple-700 hover:bg-purple-50 rounded-l-none"
                                                                                    title="Replace Supplier Receipt"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const input = document.createElement('input');
                                                                                        input.type = 'file';
                                                                                        input.accept = 'image/*,.pdf';
                                                                                        input.onchange = (ev: any) => {
                                                                                            const file = ev.target.files?.[0];
                                                                                            if (file) receiptUploadMutation.mutate({ reqId: firstReq.id, file, type: 'delivery' });
                                                                                        };
                                                                                        input.click();
                                                                                    }}
                                                                                >
                                                                                    <Upload className="w-3 h-3" />
                                                                                </Button>
                                                                            </div>
                                                                        ) : (
                                                                            <Badge variant="outline" className="h-7 px-3 flex items-center bg-slate-50 text-slate-500 border-slate-200 uppercase text-[9px]">
                                                                                Awaiting Supplier Receipt
                                                                            </Badge>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-7 text-xs border-slate-200" 
                                                                onClick={(e) => { e.stopPropagation(); printPurchaseOrder({ requisitions: reqs, userProfile }); }}
                                                            >
                                                                <Printer className="w-3 h-3 mr-1" /> Print PO
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            {isExpanded && (
                                                <CardContent className="pt-0 pb-0 p-0 overflow-x-auto">
                                                    <Table>
                                                        <TableHeader className="bg-slate-100/50">
                                                            <TableRow>
                                                                <TableHead className="pl-6">Date</TableHead>
                                                                <TableHead>Item Description</TableHead>
                                                                <TableHead>Qty</TableHead>
                                                                <TableHead className="text-right pr-6">Total</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {reqs.map((r: any) => (
                                                                <TableRow key={r.id}>
                                                                    <TableCell className="pl-6 text-xs">{formatDate(r.status_updated_at)}</TableCell>
                                                                    <TableCell className="font-semibold text-slate-800">{r.item_name}</TableCell>
                                                                    <TableCell className="font-medium">{r.quantity_approved}</TableCell>
                                                                    <TableCell className="text-right pr-6 font-bold text-slate-900">
                                                                        {(r.total_price || 0).toLocaleString()} TZS
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </CardContent>
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
                    <div className="p-6 bg-white border-b sticky top-0 z-10 shadow-sm">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <Receipt className="w-6 h-6 text-emerald-600" />
                                Confirm Disbursement
                            </DialogTitle>
                        </DialogHeader>
                        <div className="mt-4 flex justify-between items-center">
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Amount</p>
                                <p className="text-3xl font-black text-emerald-600">
                                    {selectedPOReqs.reduce((acc, curr) => acc + (curr.total_price || 0), 0).toLocaleString()} <span className="text-sm text-slate-500 font-medium">TZS</span>
                                </p>
                            </div>
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-xs px-3 py-1">
                                {selectedPOReqs.length} Items
                            </Badge>
                        </div>
                    </div>

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

                    <div className="flex justify-between items-center bg-white p-4 border-t sticky bottom-0 z-10 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={() => { setIsPaymentDialogOpen(false); setReceiptFile(null); }}>Cancel</Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase shadow-lg shadow-emerald-200 px-8"
                            disabled={!paymentRef || paymentMutation.isPending}
                            onClick={() => paymentMutation.mutate({
                                reqs: selectedPOReqs,
                                reference: paymentRef,
                                file: receiptFile
                            })}
                        >
                            {paymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                            Confirm Disbursement
                        </Button>
                    </div>
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
