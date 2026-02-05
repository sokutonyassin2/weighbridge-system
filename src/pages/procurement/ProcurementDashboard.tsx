import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Package, CheckCircle, XCircle, AlertCircle, TrendingUp, History as HistoryIcon, Filter, Truck, Plus, Printer, Building2, FileCheck, ArrowRight, ChevronDown, Users, FileText, Receipt, Upload, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const ProcurementDashboard = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [inventorySearch, setInventorySearch] = useState("");
    const [activeTab, setActiveTab] = useState("requisitions");
    const [isCreateReqOpen, setIsCreateReqOpen] = useState(false);

    // Professional Workflow States
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<any>(null);
    const [approvalDetails, setApprovalDetails] = useState({
        supplier_id: "",
        po_number: "",
        includes_vat: false,
        vat_amount: 0,
        temp_price: 0
    });

    const [newReq, setNewReq] = useState({
        item_name: "",
        quantity: 1,
        target_company: "SudEnergy Logistics"
    });

    const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
    const [newSupplier, setNewSupplier] = useState({
        name: "",
        contact_person: "",
        phone: "",
        email: "",
        category: "General Spare Parts",
        location: ""
    });

    const [isUpdatePriceOpen, setIsUpdatePriceOpen] = useState(false);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
    const [updatePriceDetails, setUpdatePriceDetails] = useState({
        unit_price: 0
    });

    // Revoke Dialog States
    const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
    const [revokeDialogReqId, setRevokeDialogReqId] = useState<string | null>(null);
    const [revokeReason, setRevokeReason] = useState("");

    // Selection State for Grouped POs
    const [selectedRequisitionIds, setSelectedRequisitionIds] = useState<string[]>([]);
    const [isGroupedPODialogOpen, setIsGroupedPODialogOpen] = useState(false);
    const [groupedPODetails, setGroupedPODetails] = useState({
        supplier_id: "",
        po_number: "",
        company: ""
    });

    // Generate PO Number (PO-YYYYMMDD-XXXX)
    const generatePONumber = () => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `PO-${date}-${rand}`;
    };

    // Fetch Inventory (with Prices)
    const { data: inventory, isLoading: isLoadingInventory } = useQuery({
        queryKey: ["procurement-inventory"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_inventory").select("*").order("item_name");
            if (error) throw error;
            return data;
        },
        refetchInterval: 3000
    });

    // Fetch Requisitions with Supplier info
    const { data: requisitions, isLoading: isLoadingRequisitions } = useQuery({
        queryKey: ["procurement-requisitions"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_requisitions")
                .select("*, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number)")
                .order("created_at", { ascending: false });

            console.log("📦 PROCUREMENT: Fetched requisitions:", data);
            console.log("📦 PROCUREMENT: Total count:", data?.length || 0);
            if (data && data.length > 0) {
                console.log("📦 PROCUREMENT: Sample requisition:", data[0]);
            }

            if (error) {
                console.error("📦 PROCUREMENT ERROR:", error);
                throw error;
            }
            return data;
        },
        refetchInterval: 3000
    });

    // Fetch Suppliers
    const { data: suppliers } = useQuery({
        queryKey: ["procurement-suppliers"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_suppliers").select("*").order("name");
            if (error) throw error;
            return data;
        }
    });

    // Mutations
    const approveMutation = useMutation({
        mutationFn: async ({ reqId, qty, itemId, details }: { reqId: string, qty: number, itemId?: string, details: any }) => {
            const item = (inventory || []).find((i: any) => i.id === itemId);
            const unitPrice = details.temp_price || item?.unit_price || 0;
            const subtotal = unitPrice * qty;
            const vat = details.includes_vat ? subtotal * 0.18 : 0;

            const { error: reqError } = await sb.from("garage_requisitions").update({
                status: 'Approved',
                quantity_approved: qty,
                unit_price: unitPrice,
                total_price: subtotal + vat,
                supplier_id: details.supplier_id,
                po_number: details.po_number,
                includes_vat: details.includes_vat,
                vat_amount: vat
            }).eq("id", reqId);
            if (reqError) throw reqError;

            // Reduce Stock
            if (itemId && item) {
                const { error: invError } = await sb.from("garage_inventory").update({
                    quantity: (item.quantity || 0) - qty
                }).eq("id", itemId);
                if (invError) throw invError;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            setIsApproveDialogOpen(false);
            toast({ title: "Approved & PO Generated", description: "Audit trail record created." });
        }
    });

    const addSupplierMutation = useMutation({
        mutationFn: async (supplier: any) => {
            const { error } = await sb.from("garage_suppliers").insert([supplier]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-suppliers"] });
            toast({ title: "Supplier Added", description: "New vendor registered." });
            setIsAddSupplierOpen(false);
            setNewSupplier({ name: "", contact_person: "", phone: "", email: "", category: "General Spare Parts", location: "" });
        },
        onError: (error: any) => {
            console.error("Vendor Registration Error:", error);
            toast({
                variant: "destructive",
                title: "Registration Failed",
                description: error.message || "Please check all fields and try again."
            });
        }
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ reqId, status, revokeReason }: { reqId: string, status: string, revokeReason?: string | null }) => {
            const updateData: any = {
                status,
                status_updated_at: new Date().toISOString()
            };

            if (status === 'Revoked' && revokeReason) {
                updateData.revoke_reason = revokeReason;
            }

            const { error } = await sb.from("garage_requisitions").update(updateData).eq("id", reqId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] }); // Also refresh garage side
            toast({ title: "Status Updated", description: "Requisition status has been updated successfully." });
        }
    });

    const bulkUpdateRequisitionsMutation = useMutation({
        mutationFn: async ({ ids, po_number, supplier_id }: { ids: string[], po_number: string, supplier_id: string }) => {
            const { error } = await sb.from("garage_requisitions").update({
                status: 'Purchased',
                po_number: po_number,
                supplier_id: supplier_id,
                status_updated_at: new Date().toISOString()
            }).in("id", ids);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            setIsGroupedPODialogOpen(false);
            setSelectedRequisitionIds([]);
            toast({ title: "Grouped PO Generated", description: `PO created for ${selectedRequisitionIds.length} items.` });
        }
    });

    const createReqMutation = useMutation({
        mutationFn: async (req: typeof newReq) => {
            const { data, error } = await sb.from("garage_requisitions").insert([{
                item_name: req.item_name,
                quantity_requested: req.quantity,
                target_company: req.target_company,
                status: 'Pending'
            }]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({ title: "Requisition Created", description: `Internal request for ${newReq.target_company} logged.` });
            setIsCreateReqOpen(false);
            setNewReq({ item_name: "", quantity: 1, target_company: "SudEnergy Logistics" });
        }
    });

    const updatePricingMutation = useMutation({
        mutationFn: async ({ id, price }: { id: string, price: number }) => {
            const { error } = await sb.from("garage_inventory").update({
                unit_price: price
            }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            toast({ title: "Unit Price Updated", description: "Pricing records saved." });
            setIsUpdatePriceOpen(false);
        }
    });

    const printPurchaseOrder = (params: { poNumber?: string, reqId?: string }) => {
        let relatedReqs: any[] = [];

        if (params.poNumber) {
            relatedReqs = (requisitions || []).filter((r: any) => r.po_number === params.poNumber);
        } else if (params.reqId) {
            const single = (requisitions || []).find((r: any) => r.id === params.reqId);
            if (single) relatedReqs = [single];
        }

        if (relatedReqs.length === 0) {
            toast({ variant: "destructive", title: "Error", description: "No items found to print." });
            return;
        }

        const firstReq = relatedReqs[0];
        const displayPONumber = params.poNumber || "REQ-" + firstReq.id.slice(0, 8).toUpperCase();
        let subtotal = 0;
        let totalVat = 0;

        const itemsHtml = relatedReqs.map((req: any) => {
            const item = inventory?.find((i: any) => i.id === req.item_id);
            const price = req.unit_price || item?.unit_price || 0;
            const qty = req.quantity_approved || req.quantity_requested;
            const lineTotal = price * qty;
            const lineVat = req.includes_vat ? (lineTotal * 0.18) : 0;

            subtotal += lineTotal;
            totalVat += lineVat;

            return `
                <tr>
                    <td>
                        <div style="font-weight: 700;">${req.item_name}</div>
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                            Vehicle: ${req.vehicle?.vehicle_no || 'N/A'} 
                            ${req.vehicle?.horse_number ? `(Horse: ${req.horse_number})` : ''}
                        </div>
                    </td>
                    <td style="text-align: center;">${qty}</td>
                    <td style="text-align: right;">${price.toLocaleString()}</td>
                    <td style="text-align: right;">${lineTotal.toLocaleString()}</td>
                </tr>
            `;
        }).join('');

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
                        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 40px; }
                        .sig-line { border-top: 1px solid #cbd5e1; text-align: center; padding-top: 4px; font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="company">${firstReq.target_company}</div>
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">Logistics & Engineering Procurement</div>
                        </div>
                        <div style="text-align: right">
                            <div class="po-label">PURCHASE ORDER</div>
                            <div style="font-size: 16px; font-weight: 800; color: #1e293b; margin-top: 8px;"># ${displayPONumber}</div>
                        </div>
                    </div>

                    <div class="meta-grid">
                        <div class="meta-box">
                            <h3>Vendor / Supplier</h3>
                            <p>${firstReq.supplier?.name || 'N/A'}</p>
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

                    <div class="sig-grid">
                        <div class="sig-line">Requested By (Garage)</div>
                        <div class="sig-line">Authorized By (Procurement)</div>
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

    // Helper: Get Badge for status
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Pending': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending</Badge>;
            case 'Approved': return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Approved</Badge>;
            case 'Purchased': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Purchased</Badge>;
            case 'Delivered': return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">Delivered</Badge>;
            case 'Rejected': return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Rejected</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6 p-6 animate-fade-in bg-slate-50/30 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-indigo-600" />
                        Procurement Command
                        <Badge className="ml-2 bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px] uppercase font-bold animate-pulse">Live Syncing</Badge>
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 font-medium tracking-tight">Purchase Order (PO) Management & Strategic Sourcing</p>
                </div>
                <div className="flex items-center gap-3">
                    {(isLoadingRequisitions || isLoadingInventory) && (
                        <div className="flex items-center gap-2 text-indigo-500 text-xs font-bold animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Fetching Data...
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Button onClick={() => setIsCreateReqOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-xs font-medium h-9 uppercase tracking-wider">
                            <Plus className="w-4 h-4 mr-1" /> New Requisition
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="requisitions" className="w-full" onValueChange={setActiveTab}>
                <TabsList className="bg-white border-b border-slate-200 w-full justify-start rounded-none h-12 p-0 gap-8">
                    <TabsTrigger value="requisitions" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none h-12 px-4 text-xs font-medium uppercase tracking-widest">
                        <FileText className="w-4 h-4 mr-2" /> Requisitions
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none h-12 px-4 text-xs font-bold uppercase tracking-widest">
                        <Package className="w-4 h-4 mr-2" /> Store Inventory
                    </TabsTrigger>
                    <TabsTrigger value="suppliers" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none h-12 px-4 text-xs font-bold uppercase tracking-widest">
                        <Users className="w-4 h-4 mr-2" /> Suppliers
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="requisitions" className="mt-6 space-y-6">
                    {/* Stats */}
                    <div className="grid gap-6 md:grid-cols-4">
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">Pending Actions</CardTitle>
                                <AlertCircle className="h-4 w-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-semibold text-slate-900">{(requisitions || []).filter((r: any) => r.status === 'Pending').length}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">PO's Issued</CardTitle>
                                <FileCheck className="h-4 w-4 text-indigo-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-semibold text-slate-900">{(requisitions || []).filter((r: any) => r.po_number).length}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">Low Stock Alert</CardTitle>
                                <Package className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-semibold text-slate-900">{(inventory || []).filter((i: any) => (i.quantity || 0) <= (i.min_threshold || 0)).length}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-indigo-600 text-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-medium text-indigo-100 uppercase tracking-widest">Total Valuation</CardTitle>
                                <TrendingUp className="h-4 w-4 text-indigo-200" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-semibold">
                                    {(inventory || []).reduce((acc: number, item: any) => acc + ((item.quantity || 0) * (item.unit_price || 0)), 0).toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-slate-700">Audit Trail: Requisitions & POs</CardTitle>
                                <Badge variant="outline" className="bg-slate-100/50 text-slate-500 border-slate-200 text-[10px] font-mono">
                                    Total: {requisitions?.length || 0} Records
                                </Badge>
                            </div>
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder="Search by item, company, or PO..."
                                    className="pl-8 h-8 text-[11px] bg-white border-slate-200"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b">
                                        <TableHead className="w-[40px] px-4">
                                            <Checkbox
                                                checked={selectedRequisitionIds.length === (requisitions || []).length && requisitions?.length > 0}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setSelectedRequisitionIds((requisitions || []).map((r: any) => r.id));
                                                    } else {
                                                        setSelectedRequisitionIds([]);
                                                    }
                                                }}
                                            />
                                        </TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Req Date</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Company</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">PO Number</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Item Details</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Vendor</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Status</TableHead>
                                        <TableHead className="text-right text-xs font-semibold uppercase px-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingRequisitions ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={7} className="p-4">
                                                    <Skeleton className="h-12 w-full bg-slate-100/50" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (requisitions || []).filter((r: any) => {
                                        const searchLower = searchTerm.toLowerCase();
                                        // Robust filter: check item, company, PO, and status
                                        return (
                                            (r.item_name || "").toLowerCase().includes(searchLower) ||
                                            (r.target_company || "unassigned").toLowerCase().includes(searchLower) ||
                                            (r.po_number || "").toLowerCase().includes(searchLower) ||
                                            (r.status || "").toLowerCase().includes(searchLower)
                                        );
                                    }).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-2 opacity-50">
                                                    <FileText className="w-10 h-10 text-slate-300" />
                                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">No Requisitions Found</h3>
                                                    <p className="text-xs text-slate-400 font-medium tracking-tight">Try clearing your search or check if the garage has sent any requests.</p>
                                                    {searchTerm && (
                                                        <Button variant="link" onClick={() => setSearchTerm("")} className="text-indigo-600 font-bold h-auto p-0 text-xs">Clear Search</Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (requisitions || []).filter((r: any) => {
                                        const searchLower = searchTerm.toLowerCase();
                                        return (
                                            (r.item_name || "").toLowerCase().includes(searchLower) ||
                                            (r.target_company || "unassigned").toLowerCase().includes(searchLower) ||
                                            (r.po_number || "").toLowerCase().includes(searchLower) ||
                                            (r.status || "").toLowerCase().includes(searchLower)
                                        );
                                    }).map((req: any) => (
                                        <TableRow key={req.id} className={`hover:bg-slate-50/50 transition-colors ${selectedRequisitionIds.includes(req.id) ? 'bg-indigo-50/30' : ''}`}>
                                            <TableCell className="px-4">
                                                <Checkbox
                                                    checked={selectedRequisitionIds.includes(req.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedRequisitionIds(prev => [...prev, req.id]);
                                                        } else {
                                                            setSelectedRequisitionIds(prev => prev.filter(id => id !== req.id));
                                                        }
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-slate-500 font-medium">{new Date(req.created_at).toLocaleDateString()}</span>
                                                    <span className="text-[13px] text-indigo-500 font-bold">{new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs font-bold bg-slate-50 text-slate-600 border-slate-200 uppercase">
                                                    {req.target_company}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-500">
                                                {req.po_number || <span className="text-slate-300">-- No PO --</span>}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm text-slate-800">{req.item_name}</span>
                                                    <span className="text-xs text-slate-400">Qty: {req.quantity_requested} units</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium text-slate-600">
                                                {req.supplier?.name || <span className="text-slate-300">Not Assigned</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={req.status || 'Pending'}
                                                    onValueChange={(status) => {
                                                        if (status === 'Revoked') {
                                                            // Show dialog for revoke reason
                                                            setRevokeDialogReqId(req.id);
                                                            setRevokeDialogOpen(true);
                                                        } else {
                                                            updateStatusMutation.mutate({ reqId: req.id, status, revokeReason: null });
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="w-40 h-8 text-[10px] font-bold uppercase bg-white border-slate-200">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Pending" className="text-[10px]">🟡 Pending Review</SelectItem>
                                                        <SelectItem value="Processing" className="text-[10px]">🔵 Processing</SelectItem>
                                                        <SelectItem value="Purchased" className="text-[10px]">🟢 Purchased</SelectItem>
                                                        <SelectItem value="Revoked" className="text-[10px]">🔴 Revoked</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="text-right px-6">
                                                <div className="flex items-center justify-end gap-2">
                                                    {req.status === 'Pending' ? (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-[10px] px-3 font-bold uppercase tracking-wider text-slate-600 hover:text-indigo-600 border-slate-200"
                                                                onClick={() => printPurchaseOrder({ reqId: req.id })}
                                                            >
                                                                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-[10px] px-4 font-bold uppercase tracking-wider"
                                                                onClick={() => {
                                                                    setSelectedReq(req);
                                                                    setApprovalDetails({
                                                                        supplier_id: "",
                                                                        po_number: generatePONumber(),
                                                                        includes_vat: false,
                                                                        vat_amount: 0,
                                                                        temp_price: (inventory || []).find(i => i.id === req.item_id)?.unit_price || 0
                                                                    });
                                                                    setIsApproveDialogOpen(true);
                                                                }}
                                                            >Review & Approve</Button>
                                                        </>
                                                    ) : (
                                                        <div className="flex gap-1 items-center">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-[10px] px-3 font-bold uppercase tracking-wider text-slate-600 hover:text-indigo-600 border-slate-200"
                                                                onClick={() => printPurchaseOrder({ poNumber: req.po_number })}
                                                            >
                                                                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print PO
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                            >
                                                                <Upload className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Floating Grouped Actions Bar */}
                    {selectedRequisitionIds.length > 0 && (
                        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 backdrop-blur-md bg-opacity-95">
                                <div className="flex items-center gap-3 border-r border-slate-700 pr-6">
                                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                                        {selectedRequisitionIds.length}
                                    </div>
                                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Items Selected</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-slate-400 hover:text-white hover:bg-slate-800 text-[10px] font-bold uppercase"
                                        onClick={() => setSelectedRequisitionIds([])}
                                    >
                                        Deselect All
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase px-6 h-9 rounded-full shadow-lg shadow-indigo-500/20"
                                        onClick={() => {
                                            // Validate same company
                                            const selectedReqs = (requisitions || []).filter((r: any) => selectedRequisitionIds.includes(r.id));
                                            const companies = new Set(selectedReqs.map((r: any) => r.target_company));

                                            if (companies.size > 1) {
                                                toast({
                                                    variant: "destructive",
                                                    title: "Invalid Selection",
                                                    description: "Please select requisitions from the same company to group them into a single PO."
                                                });
                                                return;
                                            }

                                            // Open Review Dialog
                                            setGroupedPODetails({
                                                supplier_id: "",
                                                po_number: generatePONumber(),
                                                company: [...companies][0] as string
                                            });
                                            setIsGroupedPODialogOpen(true);
                                        }}
                                    >
                                        <FileCheck className="w-4 h-4 mr-2" />
                                        Generate Grouped PO
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="inventory" className="mt-6">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-900 border-b pb-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xs font-semibold text-white uppercase tracking-widest flex items-center gap-2">
                                    <Package className="w-4 h-4 text-indigo-400" /> Professional Stock Control
                                </CardTitle>
                            </div>
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-500" />
                                <Input
                                    placeholder="Find items..."
                                    className="pl-8 h-8 text-[11px] bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                                    value={inventorySearch}
                                    onChange={(e) => setInventorySearch(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b bg-slate-50/50">
                                        <TableHead className="text-xs font-semibold uppercase py-4">Item Description</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Category</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Current Stock</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Unit Price (TZS)</TableHead>
                                        <TableHead className="text-xs font-semibold uppercase">Threshold</TableHead>
                                        <TableHead className="text-right text-xs font-semibold uppercase px-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(inventory || []).filter((i: any) =>
                                        i.item_name.toLowerCase().includes(inventorySearch.toLowerCase())
                                    ).map((item: any) => (
                                        <TableRow key={item.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-bold text-slate-700">{item.item_name}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-[10px] font-bold uppercase">{item.category}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={(item.quantity || 0) <= (item.min_threshold || 0) ? "bg-red-50 text-red-700 border-red-100" : "bg-green-50 text-green-700 border-green-100"} variant="outline">
                                                    {item.quantity} units
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-bold text-indigo-600">
                                                {item.unit_price?.toLocaleString()} TZS
                                            </TableCell>
                                            <TableCell className="text-slate-400 text-xs">Min: {item.min_threshold || 0}</TableCell>
                                            <TableCell className="text-right px-6">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-xs font-bold uppercase text-indigo-600"
                                                    onClick={() => {
                                                        setSelectedInventoryItem(item);
                                                        setUpdatePriceDetails({
                                                            unit_price: item.unit_price || 0
                                                        });
                                                        setIsUpdatePriceOpen(true);
                                                    }}
                                                >Update Price</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="suppliers" className="mt-6">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-slate-50/50">
                            <CardTitle className="text-[11px] font-medium uppercase tracking-widest text-slate-700">Vendor & Supplier Directory</CardTitle>
                            <Button onClick={() => setIsAddSupplierOpen(true)} className="h-8 bg-indigo-600 text-[10px] font-bold uppercase"><Plus className="w-3 h-3 mr-2" /> Add Supplier</Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b">
                                        <TableHead className="text-[11px] font-bold uppercase">Supplier Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Contact Person</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Phone/Email</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Specialty</TableHead>
                                        <TableHead className="text-right text-[11px] font-bold uppercase px-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(suppliers || []).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-40 text-center text-slate-400 italic">No suppliers registered. Add one to link purchases.</TableCell>
                                        </TableRow>
                                    ) : (suppliers || []).map((s: any) => (
                                        <TableRow key={s.id}>
                                            <TableCell className="font-bold text-slate-700">{s.name}</TableCell>
                                            <TableCell className="text-sm">{s.contact_person}</TableCell>
                                            <TableCell className="text-[11px] text-slate-500">{s.phone} / {s.email}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[10px] font-bold uppercase">{s.category}</Badge></TableCell>
                                            <TableCell className="text-right px-6">
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><ExternalLink className="w-4 h-4 text-slate-400" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Professional Approval Dialog */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-indigo-600" />
                            Final Review: Issue Purchase Order
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Planned PO Number</p>
                                <p className="font-mono text-lg font-bold text-slate-900">{approvalDetails.po_number}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Item</p>
                                <p className="font-bold text-indigo-600">{selectedReq?.item_name}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Select Supplier</Label>
                                <Select
                                    value={approvalDetails.supplier_id}
                                    onValueChange={(val) => setApprovalDetails({ ...approvalDetails, supplier_id: val })}
                                >
                                    <SelectTrigger className="h-10 text-xs">
                                        <SelectValue placeholder="Choose Vendor..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(suppliers || []).map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Confirmed Unit Price</Label>
                                <Input
                                    type="number"
                                    value={approvalDetails.temp_price}
                                    onChange={(e) => setApprovalDetails({ ...approvalDetails, temp_price: parseFloat(e.target.value) })}
                                    className="h-10 font-bold"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold">Include VAT (18%)</Label>
                                <p className="text-[10px] text-slate-500 italic">Tax will be added to the total valuation.</p>
                            </div>
                            <Switch
                                checked={approvalDetails.includes_vat}
                                onCheckedChange={(val) => setApprovalDetails({ ...approvalDetails, includes_vat: val })}
                            />
                        </div>

                        <div className="border-t pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Subtotal:</span>
                                <span className="font-bold">{(selectedReq?.quantity_requested * approvalDetails.temp_price).toLocaleString()} TZS</span>
                            </div>
                            {approvalDetails.includes_vat && (
                                <div className="flex justify-between text-sm text-indigo-600 font-medium">
                                    <span>VAT (18%):</span>
                                    <span>{((selectedReq?.quantity_requested * approvalDetails.temp_price) * 0.18).toLocaleString()} TZS</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-black border-t pt-2">
                                <span>TOTAL:</span>
                                <span>{((selectedReq?.quantity_requested * approvalDetails.temp_price) * (approvalDetails.includes_vat ? 1.18 : 1)).toLocaleString()} TZS</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} className="h-11 font-bold uppercase text-[11px]">Cancel</Button>
                        <Button
                            className="h-11 bg-indigo-600 hover:bg-indigo-700 font-bold uppercase text-[11px] px-8"
                            disabled={!approvalDetails.supplier_id || approveMutation.isPending}
                            onClick={() => approveMutation.mutate({
                                reqId: selectedReq?.id,
                                qty: selectedReq?.quantity_requested,
                                itemId: selectedReq?.item_id,
                                details: approvalDetails
                            })}
                        >
                            {approveMutation.isPending ? "Generating..." : "Finalize & Issue PO"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Supplier Dialog */}
            <Dialog open={isAddSupplierOpen} onOpenChange={setIsAddSupplierOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            Register New Vendor
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Supplier Name</Label>
                                <Input
                                    placeholder="Company Name"
                                    className="h-10 text-sm"
                                    value={newSupplier.name}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Category</Label>
                                <Select
                                    value={newSupplier.category}
                                    onValueChange={(val) => setNewSupplier({ ...newSupplier, category: val })}
                                >
                                    <SelectTrigger className="h-10 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="General Spare Parts">General Spare Parts</SelectItem>
                                        <SelectItem value="Tires & Alignment">Tires & Alignment</SelectItem>
                                        <SelectItem value="Oils & Lubricants">Oils & Lubricants</SelectItem>
                                        <SelectItem value="Fuel & Additives">Fuel & Additives</SelectItem>
                                        <SelectItem value="Engineering Tools">Engineering Tools</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Contact Person</Label>
                                <Input
                                    placeholder="Full Name"
                                    className="h-10 text-sm"
                                    value={newSupplier.contact_person}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Phone</Label>
                                <Input
                                    placeholder="+255..."
                                    className="h-10 text-sm"
                                    value={newSupplier.phone}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Email Address</Label>
                            <Input
                                type="email"
                                placeholder="vendor@example.com"
                                className="h-10 text-sm"
                                value={newSupplier.email}
                                onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Location</Label>
                            <Input
                                placeholder="Physical Address"
                                className="h-10 text-sm"
                                value={newSupplier.location}
                                onChange={(e) => setNewSupplier({ ...newSupplier, location: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddSupplierOpen(false)} className="h-10 font-bold uppercase text-[11px]">Cancel</Button>
                        <Button
                            className="h-10 bg-indigo-600 hover:bg-indigo-700 font-bold uppercase text-[11px] px-8"
                            disabled={addSupplierMutation.isPending}
                            onClick={() => {
                                if (!newSupplier.name.trim()) {
                                    toast({
                                        variant: "destructive",
                                        title: "Name Required",
                                        description: "Please enter the supplier name."
                                    });
                                    return;
                                }
                                addSupplierMutation.mutate(newSupplier);
                            }}
                        >
                            {addSupplierMutation.isPending ? "Registering..." : "Register Vendor"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Update Pricing Dialog */}
            <Dialog open={isUpdatePriceOpen} onOpenChange={setIsUpdatePriceOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            Update Unit Pricing
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-3 bg-slate-50 rounded border text-center">
                            <Label className="text-xs uppercase font-bold text-slate-500">Selected Item</Label>
                            <p className="font-bold text-slate-900">{selectedInventoryItem?.item_name}</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase">Current Market Price (TZS)</Label>
                            <Input
                                type="number"
                                className="h-10 text-sm border-slate-200 font-bold text-indigo-600"
                                value={updatePriceDetails.unit_price}
                                onChange={(e) => setUpdatePriceDetails({ ...updatePriceDetails, unit_price: parseFloat(e.target.value) })}
                            />
                            <p className="text-[11px] text-slate-400 italic">This price will be used for all future requisitions of this item.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUpdatePriceOpen(false)} className="h-10 text-xs font-bold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold uppercase px-8"
                            onClick={() => updatePricingMutation.mutate({
                                id: selectedInventoryItem?.id,
                                price: updatePriceDetails.unit_price
                            })}
                            disabled={updatePricingMutation.isPending}
                        >
                            {updatePricingMutation.isPending ? "Saving..." : "Save Pricing"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Requisition Dialog (Keep as is) */}
            <Dialog open={isCreateReqOpen} onOpenChange={setIsCreateReqOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-indigo-600" />
                            Internal Requisition
                        </DialogTitle>
                    </DialogHeader>
                    {/* ... (Existing dialog content) */}
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Target Company</Label>
                            <Select
                                value={newReq.target_company}
                                onValueChange={(val) => setNewReq({ ...newReq, target_company: val })}
                            >
                                <SelectTrigger className="h-10 text-sm border-slate-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Energy Oil">Energy Oil</SelectItem>
                                    <SelectItem value="Energy Feeds">Energy Feeds</SelectItem>
                                    <SelectItem value="SudEnergy Logistics">SudEnergy Logistics</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Item Description</Label>
                            <Input
                                placeholder="Enter item name"
                                className="h-10 text-sm border-slate-200"
                                value={newReq.item_name}
                                onChange={(e) => setNewReq({ ...newReq, item_name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Quantity Requested</Label>
                            <Input
                                type="number"
                                className="h-10 text-sm border-slate-200"
                                value={newReq.quantity}
                                onChange={(e) => setNewReq({ ...newReq, quantity: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateReqOpen(false)} className="h-10 text-[11px] font-bold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold uppercase"
                            onClick={() => createReqMutation.mutate(newReq)}
                            disabled={!newReq.item_name || createReqMutation.isPending}
                        >
                            {createReqMutation.isPending ? "Submitting..." : "Send Request"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Revoke Reason Dialog */}
            <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-700">
                            <XCircle className="w-5 h-5 text-red-500" />
                            Revoke Requisition
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                            <p className="text-xs text-red-700 font-medium">
                                This requisition will be marked as <strong>Revoked</strong>. The garage team will see this status and the reason you provide below.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Management's Reason for Rejection</Label>
                            <Textarea
                                placeholder="Enter the reason from management (e.g., 'Not in budget', 'Item not needed', etc.)"
                                className="min-h-[100px] text-sm"
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                            />
                            <p className="text-xs text-slate-400 italic">This reason will be visible to the requester</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setRevokeDialogOpen(false);
                                setRevokeReason("");
                                setRevokeDialogReqId(null);
                            }}
                            className="h-10"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="h-10 bg-red-600 hover:bg-red-700"
                            onClick={() => {
                                if (!revokeReason.trim()) {
                                    toast({
                                        variant: "destructive",
                                        title: "Reason Required",
                                        description: "Please enter a reason for revoking this requisition."
                                    });
                                    return;
                                }
                                if (revokeDialogReqId) {
                                    updateStatusMutation.mutate({
                                        reqId: revokeDialogReqId,
                                        status: 'Revoked',
                                        revokeReason: revokeReason
                                    });
                                    setRevokeDialogOpen(false);
                                    setRevokeReason("");
                                    setRevokeDialogReqId(null);
                                }
                            }}
                            disabled={updateStatusMutation.isPending || !revokeReason.trim()}
                        >
                            {updateStatusMutation.isPending ? "Revoking..." : "Confirm Revoke"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Grouped PO Review Dialog */}
            <Dialog open={isGroupedPODialogOpen} onOpenChange={setIsGroupedPODialogOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-slate-900 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileCheck className="w-6 h-6 text-indigo-600" />
                                Grouped PO Review
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold uppercase py-1 bg-indigo-50 text-indigo-600 border-indigo-200">
                                {groupedPODetails.company}
                            </Badge>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden py-4 flex flex-col gap-6">
                        {/* Selected Items List */}
                        <div className="space-y-3">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Package className="w-4 h-4" /> Selected Items ({selectedRequisitionIds.length})
                            </Label>
                            <ScrollArea className="h-[200px] rounded-xl border border-slate-100 bg-slate-50/50 p-1">
                                <div className="p-3 space-y-2">
                                    {requisitions?.filter((r: any) => selectedRequisitionIds.includes(r.id)).map((req: any) => (
                                        <div key={req.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between group">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{req.item_name}</p>
                                                <p className="text-[10px] text-slate-400 font-medium">Requested on {new Date(req.created_at).toLocaleDateString()}</p>
                                            </div>
                                            <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-200 border-none font-bold">
                                                Qty: {req.quantity_requested}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* PO Finalization Details */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Vendor / Supplier</Label>
                                <Select
                                    value={groupedPODetails.supplier_id}
                                    onValueChange={(val) => setGroupedPODetails({ ...groupedPODetails, supplier_id: val })}
                                >
                                    <SelectTrigger className="h-11 border-slate-200 shadow-sm">
                                        <SelectValue placeholder="Select Vendor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(suppliers || []).map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Generated PO Number</Label>
                                <Input
                                    value={groupedPODetails.po_number}
                                    onChange={(e) => setGroupedPODetails({ ...groupedPODetails, po_number: e.target.value })}
                                    className="h-11 font-mono font-bold text-indigo-600 border-slate-200 shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="border-t pt-6">
                        <Button
                            variant="ghost"
                            onClick={() => setIsGroupedPODialogOpen(false)}
                            className="h-11 font-bold uppercase text-[11px] px-6 text-slate-500 hover:text-slate-700"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="h-11 bg-indigo-600 hover:bg-indigo-700 font-bold uppercase text-[11px] px-10 shadow-lg shadow-indigo-100"
                            disabled={!groupedPODetails.supplier_id || !groupedPODetails.po_number || bulkUpdateRequisitionsMutation.isPending}
                            onClick={() => bulkUpdateRequisitionsMutation.mutate({
                                ids: selectedRequisitionIds,
                                po_number: groupedPODetails.po_number,
                                supplier_id: groupedPODetails.supplier_id
                            })}
                        >
                            {bulkUpdateRequisitionsMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                "Finalize Grouped PO"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ProcurementDashboard;
