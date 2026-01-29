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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Search, Package, CheckCircle, XCircle, AlertCircle, TrendingUp, History, Filter, Truck, Plus, Printer, Building2, FileCheck, ArrowRight, ChevronDown, Users, FileText, Receipt, Upload, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

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

    const [isUpdateStockOpen, setIsUpdateStockOpen] = useState(false);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
    const [updateStockDetails, setUpdateStockDetails] = useState({
        quantity: 0,
        unit_price: 0
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
        }
    });

    // Fetch Requisitions with Supplier info
    const { data: requisitions, isLoading: isLoadingRequisitions } = useQuery({
        queryKey: ["procurement-requisitions"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_requisitions")
                .select("*, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number), supplier:garage_suppliers(name)")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
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
        }
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ reqId, status }: { reqId: string, status: string }) => {
            const { error } = await sb.from("garage_requisitions").update({ status }).eq("id", reqId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({ title: "Status Updated", description: "Requisition workflow moved forward." });
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

    const updateInventoryMutation = useMutation({
        mutationFn: async ({ id, price, qty }: { id: string, price: number, qty: number }) => {
            const { error } = await sb.from("garage_inventory").update({
                unit_price: price,
                quantity: qty
            }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            toast({ title: "Price/Qty Updated", description: "Storage records saved." });
            setIsUpdateStockOpen(false);
        }
    });

    const printRequisition = (req: any) => {
        const item = inventory?.find((i: any) => i.id === req.item_id);
        const price = req.unit_price || item?.unit_price || 0;
        const total = req.total_price || (price * (req.quantity_approved || req.quantity_requested));
        const vat = req.vat_amount || 0;
        const subtotal = total - (req.includes_vat ? vat : 0);

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Purchase Order - ${req.po_number || 'REQ'}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: auto; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
                        .company { font-size: 28px; font-weight: 800; color: #4f46e5; letter-spacing: -1px; }
                        .po-label { background: #4f46e5; color: white; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 800; margin-top: 10px; display: inline-block; }
                        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                        .meta-box h3 { font-size: 10px; text-transform: uppercase; color: #64748b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
                        .meta-box p { font-size: 13px; font-weight: 600; margin: 2px 0; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                        th { text-align: left; background: #f8fafc; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                        td { padding: 16px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                        .summary-table { width: 300px; margin-left: auto; }
                        .summary-table td { padding: 8px 12px; border: none; }
                        .total-row { font-size: 16px; font-weight: 900; color: #1e293b; border-top: 2px solid #e2e8f0 !important; }
                        .footer { margin-top: 80px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; margin-top: 60px; }
                        .sig-line { border-top: 1px solid #cbd5e1; text-align: center; padding-top: 8px; font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="company">${req.target_company}</div>
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">Logistics & Engineering Procurement</div>
                        </div>
                        <div style="text-align: right">
                            <div class="po-label">PURCHASE ORDER</div>
                            <div style="font-size: 16px; font-weight: 800; color: #1e293b; margin-top: 8px;"># ${req.po_number || 'PENDING'}</div>
                        </div>
                    </div>

                    <div class="meta-grid">
                        <div class="meta-box">
                            <h3>Vendor / Supplier</h3>
                            <p>${req.supplier?.name || 'N/A'}</p>
                            <p style="font-size: 11px; font-weight: 400; color: #64748b;">Official Registered Vendor</p>
                        </div>
                        <div class="meta-box" style="text-align: right;">
                            <h3>Order Details</h3>
                            <p>Date: ${new Date(req.created_at).toLocaleDateString()}</p>
                            <p>Ref: REQ-${req.id.slice(0, 8).toUpperCase()}</p>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Unit Price (TZS)</th>
                                <th style="text-align: right;">Amount (TZS)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight: 700;">${req.item_name}</td>
                                <td style="text-align: center;">${req.quantity_approved || req.quantity_requested}</td>
                                <td style="text-align: right;">${price.toLocaleString()}</td>
                                <td style="text-align: right;">${subtotal.toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table class="summary-table">
                        <tr>
                            <td>Subtotal</td>
                            <td style="text-align: right;">${subtotal.toLocaleString()}</td>
                        </tr>
                        ${req.includes_vat ? `
                        <tr style="color: #4f46e5; font-weight: 600;">
                            <td>VAT (18%)</td>
                            <td style="text-align: right;">+ ${vat.toLocaleString()}</td>
                        </tr>
                        ` : ''}
                        <tr class="total-row">
                            <td>TOTAL TZS</td>
                            <td style="text-align: right;">${total.toLocaleString()}</td>
                        </tr>
                    </table>

                    <div class="sig-grid">
                        <div class="sig-line">Requested By (Mechanic/Garage)</div>
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
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-indigo-600" />
                        Procurement Command
                    </h1>
                    <p className="text-[11px] text-slate-500 mt-1 uppercase font-bold tracking-wider">Multi-Company Requisition & Store Management</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsCreateReqOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold h-9 uppercase tracking-wider">
                        <Plus className="w-4 h-4 mr-1" /> New Requisition
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="requisitions" className="w-full" onValueChange={setActiveTab}>
                <TabsList className="bg-white border-b border-slate-200 w-full justify-start rounded-none h-12 p-0 gap-8">
                    <TabsTrigger value="requisitions" className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none h-12 px-4 text-xs font-bold uppercase tracking-widest">
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
                                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Pending Actions</CardTitle>
                                <AlertCircle className="h-4 w-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{(requisitions || []).filter((r: any) => r.status === 'Pending').length}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">PO's Issued</CardTitle>
                                <FileCheck className="h-4 w-4 text-indigo-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{(requisitions || []).filter((r: any) => r.po_number).length}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Low Stock Alert</CardTitle>
                                <Package className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{(inventory || []).filter((i: any) => (i.quantity || 0) <= (i.min_threshold || 0)).length}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-indigo-600 text-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">Total Valuation</CardTitle>
                                <TrendingUp className="h-4 w-4 text-indigo-200" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {(inventory || []).reduce((acc: number, item: any) => acc + ((item.quantity || 0) * (item.unit_price || 0)), 0).toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-slate-50/50">
                            <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Audit Trail: Requisitions & POs</CardTitle>
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
                                        <TableHead className="text-[11px] font-bold uppercase">Req Date</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Company</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">PO Number</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Item Details</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Vendor</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                                        <TableHead className="text-right text-[11px] font-bold uppercase px-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(requisitions || []).filter((r: any) =>
                                        r.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (r.target_company || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (r.po_number || "").toLowerCase().includes(searchTerm.toLowerCase())
                                    ).map((req: any) => (
                                        <TableRow key={req.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] text-slate-500">{new Date(req.created_at).toLocaleDateString()}</span>
                                                    <span className="text-[10px] text-indigo-500 font-bold">{new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] font-bold bg-slate-50 text-slate-600 border-slate-200 uppercase">
                                                    {req.target_company}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-[11px] text-slate-500">
                                                {req.po_number || <span className="text-slate-300">-- No PO --</span>}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-[12px] text-slate-800">{req.item_name}</span>
                                                    <span className="text-[10px] text-slate-400">Qty: {req.quantity_requested} units</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-[11px] font-medium text-slate-600">
                                                {req.supplier?.name || <span className="text-slate-300">Not Assigned</span>}
                                            </TableCell>
                                            <TableCell>
                                                {req.status === 'Pending' ? (
                                                    getStatusBadge(req.status)
                                                ) : (
                                                    <Select
                                                        value={req.status}
                                                        onValueChange={(status) => updateStatusMutation.mutate({ reqId: req.id, status })}
                                                    >
                                                        <SelectTrigger className="w-32 h-7 text-[10px] font-bold uppercase bg-white border-slate-200">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Approved" className="text-[10px]">Approved</SelectItem>
                                                            <SelectItem value="Purchased" className="text-[10px]">Purchased</SelectItem>
                                                            <SelectItem value="Delivered" className="text-[10px]">Delivered</SelectItem>
                                                            <SelectItem value="Rejected" className="text-[10px]">Rejected</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right px-6">
                                                <div className="flex items-center justify-end gap-2">
                                                    {req.status === 'Pending' ? (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-[10px] px-3 font-bold uppercase tracking-wider text-slate-600 hover:text-indigo-600 border-slate-200"
                                                                onClick={() => printRequisition(req)}
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
                                                                onClick={() => printRequisition(req)}
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
                </TabsContent>

                <TabsContent value="inventory" className="mt-6">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-900 border-b pb-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
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
                                        <TableHead className="text-[10px] font-bold uppercase py-4">Item Description</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase">Category</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase">Current Stock</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase">Unit Price (Snapshot)</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase">Threshold</TableHead>
                                        <TableHead className="text-right text-[10px] font-bold uppercase px-6">Actions</TableHead>
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
                                                    className="h-8 text-[10px] font-bold uppercase text-indigo-600"
                                                    onClick={() => {
                                                        setSelectedInventoryItem(item);
                                                        setUpdateStockDetails({
                                                            quantity: item.quantity || 0,
                                                            unit_price: item.unit_price || 0
                                                        });
                                                        setIsUpdateStockOpen(true);
                                                    }}
                                                >Update Stock</Button>
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
                            <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Vendor & Supplier Directory</CardTitle>
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
                            disabled={!newSupplier.name || addSupplierMutation.isPending}
                            onClick={() => addSupplierMutation.mutate(newSupplier)}
                        >
                            {addSupplierMutation.isPending ? "Registering..." : "Register Vendor"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Update Stock Dialog */}
            <Dialog open={isUpdateStockOpen} onOpenChange={setIsUpdateStockOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            Update Stock & Pricing
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-3 bg-slate-50 rounded border text-center">
                            <Label className="text-[10px] uppercase font-bold text-slate-500">Selected Item</Label>
                            <p className="font-bold text-slate-900">{selectedInventoryItem?.item_name}</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Current Market Price (TZS)</Label>
                            <Input
                                type="number"
                                className="h-10 text-sm border-slate-200 font-bold text-indigo-600"
                                value={updateStockDetails.unit_price}
                                onChange={(e) => setUpdateStockDetails({ ...updateStockDetails, unit_price: parseFloat(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Stock Quantity available</Label>
                            <Input
                                type="number"
                                className="h-10 text-sm border-slate-200 font-bold"
                                value={updateStockDetails.quantity}
                                onChange={(e) => setUpdateStockDetails({ ...updateStockDetails, quantity: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUpdateStockOpen(false)} className="h-10 text-[11px] font-bold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold uppercase px-8"
                            onClick={() => updateInventoryMutation.mutate({
                                id: selectedInventoryItem?.id,
                                price: updateStockDetails.unit_price,
                                qty: updateStockDetails.quantity
                            })}
                            disabled={updateInventoryMutation.isPending}
                        >
                            {updateInventoryMutation.isPending ? "Saving..." : "Save Changes"}
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
        </div>
    );
};

export default ProcurementDashboard;
