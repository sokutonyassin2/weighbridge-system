import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Calendar, Truck, Users, Activity, FileText, Settings, Clock, Plus, Trash2 } from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const ComplianceCenter = () => {
    const { toast } = useToast();
    // Fetch Driver Documents
    const { data: driverDocs } = useQuery({
        queryKey: ["compliance-drivers"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_driver_documents" as any)
                .select(`
                    *,
                    driver:logistics_drivers(full_name, license_no)
                `)
                .order("expiry_date", { ascending: true });
            if (error) throw error;
            return data as any[];
        }
    });

    // Fetch Fleet Documents
    const { data: fleetDocs } = useQuery({
        queryKey: ["compliance-fleet"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet_documents" as any)
                .select(`
                    *,
                    fleet:logistics_fleet(vehicle_no, make_model)
                `)
                .order("expiry_date", { ascending: true });
            if (error) throw error;
            return data as any[];
        }
    });

    // Fetch Fleet for Maintenance
    const { data: fleetMaintenance } = useQuery({
        queryKey: ["compliance-maintenance"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet" as any)
                .select("id, vehicle_no, make_model, current_odometer, next_service_odometer, last_service_date")
                .eq("is_active", true)
                .order("next_service_odometer", { ascending: true });
            if (error) throw error;
            return data as any[];
        }
    });

    const getStatusInfo = (expiryDate: string) => {
        const date = new Date(expiryDate);
        const daysLeft = differenceInDays(date, new Date());

        if (isPast(date)) return { label: "Expired", color: "bg-rose-600", text: "text-rose-600", icon: <ShieldAlert className="w-4 h-4" />, daysLeft };
        if (daysLeft <= 30) return { label: "Expiring Soon", color: "bg-amber-500", text: "text-amber-600", icon: <Clock className="w-4 h-4" />, daysLeft };
        return { label: "Valid", color: "bg-slate-900", text: "text-slate-900", icon: <ShieldCheck className="w-4 h-4" />, daysLeft };
    };

    const getMaintenanceStatus = (current: number, target: number) => {
        const remaining = (target || 0) - (current || 0);
        const percentage = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;

        if (remaining <= 0) return { label: "Overdue", color: "bg-rose-600", remaining, percentage };
        if (remaining <= 1000) return { label: "Due Soon", color: "bg-amber-500", remaining, percentage };
        return { label: "Healthy", color: "bg-slate-900", remaining, percentage };
    };

    const allDocs = [...(driverDocs || []), ...(fleetDocs || [])];
    const expiredCount = allDocs.filter(d => isPast(new Date(d.expiry_date))).length;
    const warningCount = allDocs.filter(d => {
        const days = differenceInDays(new Date(d.expiry_date), new Date());
        return days > 0 && days <= 30;
    }).length;

    const location = useLocation();
    const isProcurementView = location.pathname.startsWith("/procurement");

    // Procurement Renewal Logic
    const [selectedDocForRenewal, setSelectedDocForRenewal] = useState<any>(null);
    const [isRenewalDialogOpen, setIsRenewalDialogOpen] = useState(false);
    const [renewalDetails, setRenewalDetails] = useState({
        supplier_id: "",
        payment_method_id: "",
        amount: 0,
        includes_vat: false
    });

    // Fetch Suppliers for Renewal
    const { data: suppliers } = useQuery({
        queryKey: ["procurement-suppliers"],
        queryFn: async () => {
            const { data, error } = await supabase.from("garage_suppliers" as any).select("*").order("name");
            if (error) throw error;
            return data;
        },
        enabled: isProcurementView
    });

    // Fetch Payment Methods for Selected Supplier
    const { data: supplierPaymentMethods } = useQuery({
        queryKey: ["supplier-payments", renewalDetails.supplier_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("garage_supplier_payments" as any)
                .select("*")
                .eq("supplier_id", renewalDetails.supplier_id);
            if (error) throw error;
            return data;
        },
        enabled: !!renewalDetails.supplier_id && isRenewalDialogOpen
    });

    const createRenewalPOMutation = useMutation({
        mutationFn: async () => {
            const supplier = suppliers?.find((s: any) => s.id === renewalDetails.supplier_id);
            const paymentMethod = supplierPaymentMethods?.find((m: any) => m.id === renewalDetails.payment_method_id);

            const itemName = `[RENEWAL] ${selectedDocForRenewal.document_type} - ${selectedDocForRenewal.fleet?.vehicle_no}`;
            const vatAmount = renewalDetails.includes_vat ? renewalDetails.amount * 0.18 : 0;
            const totalPrice = renewalDetails.amount + vatAmount;

            // Generate a PO number (serial based)
            const today = new Date();
            const dateStr = format(today, "yyyyMMdd");
            const { count } = await supabase
                .from("garage_requisitions" as any)
                .select("id", { count: 'exact', head: true })
                .eq("is_deleted", false)
                .gte("created_at", today.toISOString().split('T')[0]);
            const serial = (count || 0) + 1;
            const poNumber = `PO-${dateStr}-${serial.toString().padStart(4, '0')}`;

            const { error } = await supabase.from("garage_requisitions" as any).insert([{
                item_name: itemName,
                quantity_requested: 1,
                quantity_approved: 1,
                unit_price: renewalDetails.amount,
                total_price: totalPrice,
                status: 'Approved',
                supplier_id: renewalDetails.supplier_id,
                po_number: poNumber,
                includes_vat: renewalDetails.includes_vat,
                vat_amount: vatAmount,
                payment_details: paymentMethod as any,
                notes: `Automated renewal PO created via Compliance Centre. Document Plate: ${selectedDocForRenewal.fleet?.vehicle_no}`,
                department: 'Logistics', // Document renewals are typically logistics department
                requested_by: (await supabase.auth.getUser()).data.user?.id
            } as any]);

            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Renewal PO Created", description: "The purchase order has been generated and approved." });
            setIsRenewalDialogOpen(false);
            setRenewalDetails({ supplier_id: "", payment_method_id: "", amount: 0, includes_vat: false });
        }
    });

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in bg-slate-50/30 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/5 p-2.5 rounded-xl border border-primary/10 shadow-sm">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">Compliance Center</h1>
                        <p className="text-sm text-slate-500 font-semibold">Monitoring fleet and driver regulatory health</p>
                    </div>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Critical Alerts</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-rose-600">{expiredCount}</div>
                        <p className="text-xs font-medium text-muted-foreground mt-1">Expired Documents</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Warning</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-amber-500">{warningCount}</div>
                        <p className="text-xs font-medium text-muted-foreground mt-1">Expiring in 30 Days</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Maintenance</CardTitle>
                        <Activity className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-indigo-600">
                            {fleetMaintenance?.filter(f => ((f.next_service_odometer || 0) - (f.current_odometer || 0)) <= 1000).length || 0}
                        </div>
                        <p className="text-xs font-medium text-muted-foreground mt-1">Vehicles Due Service</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md bg-slate-900 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-200">Overall Health</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black">
                            {allDocs.length > 0 ? Math.round(((allDocs.length - expiredCount) / allDocs.length) * 100) : 100}%
                        </div>
                        <p className="text-xs font-medium text-slate-400 mt-1">Compliance score</p>
                    </CardContent>
                </Card>
            </div>

            {isProcurementView ? (
                <div className="space-y-6">
                    <div className="flex items-center gap-2 px-4 py-3 bg-white border border-blue-100 rounded-xl shadow-sm w-fit">
                        <Truck className="w-5 h-5 text-blue-900" />
                        <span className="font-semibold text-slate-800">Fleet Documents Monitoring</span>
                    </div>
                    <Card className="border-none shadow-xl bg-white overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow>
                                    <TableHead>Vehicle / Unit</TableHead>
                                    <TableHead>Document Type</TableHead>
                                    <TableHead>Expiry Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Remaining</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fleetDocs?.map((doc: any) => {
                                    const status = getStatusInfo(doc.expiry_date);
                                    return (
                                        <TableRow key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="font-semibold text-slate-700">
                                                <div className="flex flex-col">
                                                    <span>{doc.fleet?.vehicle_no}</span>
                                                    <span className="text-[10px] text-slate-400 font-normal">{doc.fleet?.make_model}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                                                    {doc.document_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium text-slate-600">
                                                {format(new Date(doc.expiry_date), "MMM dd, yyyy")}
                                            </TableCell>
                                            <TableCell>
                                                <div className={`flex items-center gap-2 text-xs font-bold uppercase ${status.text}`}>
                                                    {status.icon}
                                                    {status.label}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge className={`${status.color} text-white font-bold h-6 px-3`}>
                                                    {status.daysLeft < 0 ? `${Math.abs(status.daysLeft)} days ago` : `${status.daysLeft} days`}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-[10px] font-bold uppercase border-blue-900 text-blue-900 hover:bg-blue-50"
                                                    onClick={() => {
                                                        setSelectedDocForRenewal(doc);
                                                        setIsRenewalDialogOpen(true);
                                                    }}
                                                >
                                                    Create Renewal PO
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {(!fleetDocs || fleetDocs.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-12 text-slate-400 italic">
                                            No fleet documents found in registry.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            ) : (
                <Tabs defaultValue="drivers" className="space-y-6">
                    <TabsList className="bg-white border p-1 h-12 gap-2 shadow-sm rounded-xl">
                        <TabsTrigger value="drivers" className="rounded-lg px-6 font-bold gap-2 text-slate-600 data-[state=active]:text-slate-800 data-[state=active]:bg-slate-100">
                            <Users className="w-4 h-4" /> Driver Compliance
                        </TabsTrigger>
                        <TabsTrigger value="fleet" className="rounded-lg px-6 font-bold gap-2 text-slate-600 data-[state=active]:text-slate-800 data-[state=active]:bg-slate-100">
                            <Truck className="w-4 h-4" /> Fleet Documents
                        </TabsTrigger>
                        <TabsTrigger value="maintenance" className="rounded-lg px-6 font-bold gap-2 text-slate-600 data-[state=active]:text-slate-800 data-[state=active]:bg-slate-100">
                            <Activity className="w-4 h-4" /> Maintenance Log
                        </TabsTrigger>
                        <TabsTrigger value="setup" className="rounded-lg px-6 font-bold gap-2 text-slate-600 data-[state=active]:text-slate-800 data-[state=active]:bg-slate-100">
                            <Settings className="w-4 h-4" /> System Setup
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="drivers">
                        <Card className="border-none shadow-xl bg-white overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow>
                                        <TableHead>Driver Name</TableHead>
                                        <TableHead>Document Type</TableHead>
                                        <TableHead>Expiry Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Remaining</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {driverDocs?.map((doc: any) => {
                                        const status = getStatusInfo(doc.expiry_date);
                                        return (
                                            <TableRow key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="font-semibold text-slate-700">{doc.driver?.full_name}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                                                        {doc.document_type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm font-medium text-slate-600">
                                                    {format(new Date(doc.expiry_date), "MMM dd, yyyy")}
                                                </TableCell>
                                                <TableCell>
                                                    <div className={`flex items-center gap-2 text-xs font-bold uppercase ${status.text}`}>
                                                        {status.icon}
                                                        {status.label}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge className={`${status.color} text-white font-bold h-6 px-3`}>
                                                        {status.daysLeft < 0 ? `${Math.abs(status.daysLeft)} days ago` : `${status.daysLeft} days`}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {(!driverDocs || driverDocs.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                                                No driver documents found in registry.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>

                    <TabsContent value="fleet">
                        <Card className="border-none shadow-xl bg-white overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow>
                                        <TableHead>Vehicle / Unit</TableHead>
                                        <TableHead>Document Type</TableHead>
                                        <TableHead>Expiry Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Remaining</TableHead>
                                        {isProcurementView && <TableHead className="text-right">Action</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fleetDocs?.map((doc: any) => {
                                        const status = getStatusInfo(doc.expiry_date);
                                        return (
                                            <TableRow key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="font-semibold text-slate-700">
                                                    <div className="flex flex-col">
                                                        <span>{doc.fleet?.vehicle_no}</span>
                                                        <span className="text-[10px] text-slate-400 font-normal">{doc.fleet?.make_model}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                                                        {doc.document_type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm font-medium text-slate-600">
                                                    {format(new Date(doc.expiry_date), "MMM dd, yyyy")}
                                                </TableCell>
                                                <TableCell>
                                                    <div className={`flex items-center gap-2 text-xs font-bold uppercase ${status.text}`}>
                                                        {status.icon}
                                                        {status.label}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge className={`${status.color} text-white font-bold h-6 px-3`}>
                                                        {status.daysLeft < 0 ? `${Math.abs(status.daysLeft)} days ago` : `${status.daysLeft} days`}
                                                    </Badge>
                                                </TableCell>
                                                {isProcurementView && (
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 text-[10px] font-bold uppercase border-blue-900 text-blue-900 hover:bg-blue-50"
                                                            onClick={() => {
                                                                setSelectedDocForRenewal(doc);
                                                                setIsRenewalDialogOpen(true);
                                                            }}
                                                        >
                                                            Create Renewal PO
                                                        </Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        );
                                    })}
                                    {(!fleetDocs || fleetDocs.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                                                No fleet documents found in registry.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>

                    <TabsContent value="maintenance">
                        <Card className="border-none shadow-xl bg-white overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow>
                                        <TableHead>Vehicle / Unit</TableHead>
                                        <TableHead>Current Odo</TableHead>
                                        <TableHead>Target Odo</TableHead>
                                        <TableHead>Health Meter</TableHead>
                                        <TableHead className="text-right">Remaining KM</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fleetMaintenance?.map((asset: any) => {
                                        const status = getMaintenanceStatus(asset.current_odometer, asset.next_service_odometer);
                                        return (
                                            <TableRow key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="font-bold text-slate-700">
                                                    <div className="flex flex-col">
                                                        <span>{asset.vehicle_no}</span>
                                                        <span className="text-[10px] text-slate-400 font-normal">{asset.make_model}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm font-medium text-slate-600">{(asset.current_odometer || 0).toLocaleString()} KM</TableCell>
                                                <TableCell className="text-sm font-medium text-slate-600">{(asset.next_service_odometer || 0).toLocaleString()} KM</TableCell>
                                                <TableCell className="min-w-[150px]">
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                                                            <span className={status.remaining <= 1000 ? "text-rose-600" : "text-slate-900"}>{status.label}</span>
                                                            <span>{Math.round(status.percentage)}%</span>
                                                        </div>
                                                        <Progress value={status.percentage} className={`h-1.5 ${status.remaining <= 1000 ? '[&>div]:bg-rose-600' : '[&>div]:bg-slate-900'}`} />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge className={`${status.color} text-white font-black h-6 px-3`}>
                                                        {status.remaining <= 0 ? `${Math.abs(status.remaining)} KM OVER` : `${status.remaining} KM LEFT`}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>

                    <TabsContent value="setup">
                        <DocumentTypesManager />
                    </TabsContent>
                </Tabs>
            )}

            {/* Renewal PO Dialog */}
            <Dialog open={isRenewalDialogOpen} onOpenChange={setIsRenewalDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-900" />
                            Document Renewal PO
                        </DialogTitle>
                    </DialogHeader>
                    {selectedDocForRenewal && (
                        <div className="grid gap-4 py-4">
                            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                                <p className="text-[10px] uppercase font-bold text-blue-900/60 mb-1">Target Document</p>
                                <p className="font-semibold text-slate-900">{selectedDocForRenewal.document_type}</p>
                                <p className="text-xs text-slate-500">{selectedDocForRenewal.fleet?.vehicle_no} ({selectedDocForRenewal.fleet?.make_model})</p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase">Select Supplier</Label>
                                <Select
                                    value={renewalDetails.supplier_id}
                                    onValueChange={(val) => setRenewalDetails({ ...renewalDetails, supplier_id: val, payment_method_id: "" })}
                                >
                                    <SelectTrigger className="h-10 text-xs">
                                        <SelectValue placeholder="Chose vendor..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers?.map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {renewalDetails.supplier_id && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase">Payment Mode</Label>
                                    <Select
                                        value={renewalDetails.payment_method_id}
                                        onValueChange={(val) => setRenewalDetails({ ...renewalDetails, payment_method_id: val })}
                                    >
                                        <SelectTrigger className="h-10 text-xs">
                                            <SelectValue placeholder="Select account..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {supplierPaymentMethods?.map((m: any) => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    {m.method_type} - {m.bank_name || 'Mobile'} ({m.account_number})
                                                </SelectItem>
                                            ))}
                                            {(!supplierPaymentMethods || supplierPaymentMethods.length === 0) && (
                                                <p className="p-2 text-[10px] text-amber-600 italic">No payment methods found for this supplier.</p>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase">Renewal Cost (TShs)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        className="h-10 text-sm font-semibold"
                                        value={renewalDetails.amount || ""}
                                        onChange={(e) => setRenewalDetails({ ...renewalDetails, amount: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="flex flex-col justify-end gap-2 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="vat-renewal"
                                            checked={renewalDetails.includes_vat}
                                            onCheckedChange={(val) => setRenewalDetails({ ...renewalDetails, includes_vat: val })}
                                        />
                                        <Label htmlFor="vat-renewal" className="text-xs font-semibold text-slate-700">Include VAT (18%)</Label>
                                    </div>
                                </div>
                            </div>

                            {renewalDetails.amount > 0 && (
                                <div className="p-3 bg-slate-900 rounded-xl text-white flex justify-between items-center px-4">
                                    <span className="text-xs font-medium text-slate-400">Total PO Value</span>
                                    <span className="text-lg font-bold">
                                        {(renewalDetails.amount + (renewalDetails.includes_vat ? renewalDetails.amount * 0.18 : 0)).toLocaleString()} /=
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenewalDialogOpen(false)} className="h-10 text-xs font-semibold uppercase">Cancel</Button>
                        <Button
                            className="h-10 bg-blue-950 hover:bg-black text-xs font-semibold uppercase px-8"
                            onClick={() => createRenewalPOMutation.mutate()}
                            disabled={!renewalDetails.supplier_id || !renewalDetails.payment_method_id || !renewalDetails.amount || createRenewalPOMutation.isPending}
                        >
                            {createRenewalPOMutation.isPending ? "Generating..." : "Generate & Approve PO"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const DocumentTypesManager = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [newItem, setNewItem] = useState({ name: "", category: "Driver", is_mandatory: false });

    const { data: docTypes, isLoading } = useQuery({
        queryKey: ["logistics-document-types"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_document_types" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.from("logistics_document_types" as any).insert([newItem]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-document-types"] });
            setNewItem({ name: "", category: "Driver", is_mandatory: false });
            toast({ title: "Type Added", description: "New document type has been registered." });
        },
        onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message })
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("logistics_document_types" as any).delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-document-types"] });
            toast({ title: "Type Removed", description: "Document type has been deleted." });
        }
    });

    return (
        <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 border-none shadow-xl bg-white h-fit">
                <CardHeader>
                    <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Plus className="w-5 h-5" /> Add New Type
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-slate-700">Document Name</Label>
                        <Input
                            placeholder="e.g. Hazardous Materials Permit"
                            className="bg-slate-50/50"
                            value={newItem.name}
                            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-slate-700">Category</Label>
                        <Select value={newItem.category} onValueChange={v => setNewItem({ ...newItem, category: v })}>
                            <SelectTrigger className="bg-slate-50/50">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Driver">Driver</SelectItem>
                                <SelectItem value="Vehicle">Vehicle / Horse</SelectItem>
                                <SelectItem value="Trailer">Trailer</SelectItem>
                                <SelectItem value="General">General / All</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50">
                        <Label className="text-sm font-semibold text-slate-700 cursor-pointer">Mandatory?</Label>
                        <Switch
                            checked={newItem.is_mandatory}
                            onCheckedChange={v => setNewItem({ ...newItem, is_mandatory: v })}
                        />
                    </div>
                    <Button
                        className="w-full font-bold bg-slate-900 hover:bg-slate-800 shadow-md h-11"
                        onClick={() => createMutation.mutate()}
                        disabled={!newItem.name || createMutation.isPending}
                    >
                        {createMutation.isPending ? "Saving..." : "Create Document Type"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-xl bg-white">
                <CardHeader>
                    <CardTitle className="text-base font-bold text-slate-800">Managed Document Types</CardTitle>
                </CardHeader>
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {docTypes?.map((type: any) => (
                            <TableRow key={type.id} className="group">
                                <TableCell className="font-bold text-slate-700">{type.name}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className="font-bold">
                                        {type.category}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {type.is_mandatory ? (
                                        <Badge variant="destructive" className="font-bold text-[10px]">MANDATORY</Badge>
                                    ) : (
                                        <Badge variant="outline" className="font-bold text-[10px] text-slate-400">OPTIONAL</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                            if (confirm("Are you sure? This will remove this type from dropdowns.")) {
                                                deleteMutation.mutate(type.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {(!docTypes || docTypes.length === 0) && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-slate-400 italic">
                                    No document types defined. Add one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
};

export default ComplianceCenter;
