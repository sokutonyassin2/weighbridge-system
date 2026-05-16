import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CheckCircle, Receipt, Search, Loader2, Filter, DollarSign, ArrowRight, Calendar, Hash, Printer, FileText, ChevronRight, History, HandCoins, PackageCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CashierPaymentPortal = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState("");
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<any>(null);
    const [paymentRef, setPaymentRef] = useState("");

    // Filtering states for History
    const [selectedMonth, setSelectedMonth] = useState<string>("All");
    const [selectedDay, setSelectedDay] = useState<string>("All");

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
                    profiles!requested_by(full_name)
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
                    profiles!requested_by(full_name)
                `)
                .eq("status", "Paid")
                .eq("is_deleted", false)
                .order("status_updated_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        refetchInterval: 5000
    });

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
                    profiles!requested_by(full_name)
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
    const paymentMutation = useMutation({
        mutationFn: async ({ reqId, reference, item }: { reqId: string, reference: string, item: any }) => {
            const { error } = await sb
                .from("garage_requisitions")
                .update({
                    status: 'Paid',
                    payment_reference: reference,
                    payment_details: item.payment_details,
                    status_updated_at: new Date().toISOString()
                })
                .eq("id", reqId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-authorized-items"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            setIsPaymentDialogOpen(false);
            setPaymentRef("");
            toast({
                title: "Payment Confirmed",
                description: "Requisition marked as paid.",
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

    // Confirm Arrival Mutation
    const arrivalMutation = useMutation({
        mutationFn: async (reqId: string) => {
            const { error } = await sb
                .from("garage_requisitions")
                .update({
                    status: 'Closed',
                    status_updated_at: new Date().toISOString()
                })
                .eq("id", reqId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cashier-waiting-arrival"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-payment-history"] });
            toast({
                title: "Arrival Confirmed",
                description: "Item has been received and requisition closed.",
            });
        }
    });

    const filteredItems = (authorizedItems || []).filter((item: any) =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.po_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen animate-fade-in">
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Wallet className="w-8 h-8 text-primary" />
                        Cashier Hub
                        {authorizedItems?.length > 0 && (
                            <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-emerald-200">
                                {authorizedItems?.length} Payouts
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
                <TabsList className="bg-slate-200/50 p-1 border">
                    <TabsTrigger value="pending" className="gap-2 px-8">
                        <DollarSign className="w-4 h-4" />
                        Pending
                    </TabsTrigger>
                    <TabsTrigger value="arrival" className="gap-2 px-8 relative">
                        <PackageCheck className="w-4 h-4" />
                        Arrival Confirmation
                        {waitingArrival && waitingArrival.length > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                                {waitingArrival.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-8">
                        <History className="w-4 h-4" />
                        Records
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    <Card className="border shadow-none overflow-hidden">
                        <CardHeader className="bg-white border-b py-3">
                            <CardTitle className="text-sm font-bold text-slate-600">
                                Ready for Disbursement
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isAuthorizedLoading ? (
                                <div className="flex items-center justify-center p-20">
                                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50/50">
                                            <TableHead className="text-xs font-bold py-4 pl-6">PO Number</TableHead>
                                            <TableHead className="text-xs font-bold">Item & Qty</TableHead>
                                            <TableHead className="text-xs font-bold">Supplier</TableHead>
                                            <TableHead className="text-xs font-bold">Amount</TableHead>
                                            <TableHead className="text-right text-xs font-bold pr-6">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-24 text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <CheckCircle className="w-10 h-10 text-slate-100" />
                                                        <span className="italic">No pending disbursements at this time.</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredItems.map((item: any) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50 transition-colors">
                                                    <TableCell className="font-mono text-xs font-bold text-primary pl-6">
                                                        {item.po_number || 'N/A'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-800">{item.item_name}</span>
                                                            <span className="text-xs text-slate-500">{item.quantity_approved} Units</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {item.garage_suppliers?.name || 'Manual Supplier'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-emerald-600">
                                                                {item.total_price?.toLocaleString()} TShs
                                                            </span>
                                                            {item.includes_vat && (
                                                                <span className="text-[10px] text-primary font-bold">Incl. 18% VAT</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Button
                                                            size="sm"
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 px-5 rounded-lg active:scale-95 transition-transform"
                                                            onClick={() => {
                                                                setSelectedReq(item);
                                                                setIsPaymentDialogOpen(true);
                                                            }}
                                                        >
                                                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                                                            Disburse
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
                </TabsContent>

                <TabsContent value="arrival">
                    <Card className="border shadow-none overflow-hidden">
                        <CardHeader className="bg-white border-b py-3">
                            <CardTitle className="text-sm font-bold text-slate-600">
                                Confirm Receipt of Paid Items
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isWaitingLoading ? (
                                <div className="flex items-center justify-center p-20">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50/50">
                                            <TableHead className="text-xs font-bold py-4 pl-6">Reference</TableHead>
                                            <TableHead className="text-xs font-bold">Item & PO</TableHead>
                                            <TableHead className="text-xs font-bold">Supplier</TableHead>
                                            <TableHead className="text-xs font-bold text-right pr-6">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(waitingArrival || []).length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-24 text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <HandCoins className="w-10 h-10 text-slate-100" />
                                                        <span className="italic">No items waiting for arrival confirmation.</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            waitingArrival.map((item: any) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50 transition-colors">
                                                    <TableCell className="font-mono text-xs font-bold text-emerald-600 pl-6">
                                                        {item.payment_reference || 'REF-N/A'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-800">{item.item_name}</span>
                                                            <span className="text-[10px] text-slate-500 font-mono">#{item.po_number} - {item.quantity_approved} Units</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {item.garage_suppliers?.name || 'Manual Supplier'}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Button
                                                            size="sm"
                                                            className="bg-primary hover:bg-primary/90 text-white font-bold h-8 px-5 rounded-lg active:scale-95 transition-transform"
                                                            onClick={() => arrivalMutation.mutate(item.id)}
                                                            disabled={arrivalMutation.isPending}
                                                        >
                                                            <PackageCheck className="w-3.5 h-3.5 mr-1" />
                                                            {arrivalMutation.isPending ? "Confirming..." : "Confirm Arrival"}
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

                        <Card className="border shadow-none overflow-hidden bg-white/50 border-dashed">
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-slate-100/50">
                                        <TableRow>
                                            <TableHead className="text-xs font-bold py-3 pl-6">Date</TableHead>
                                            <TableHead className="text-xs font-bold">Reference</TableHead>
                                            <TableHead className="text-xs font-bold">Item & PO</TableHead>
                                            <TableHead className="text-xs font-bold">Supplier</TableHead>
                                            <TableHead className="text-right text-xs font-bold pr-6">Amount Paid</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isHistoryLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10">
                                                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-300" />
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredArchived.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-16 text-slate-400 italic text-sm">
                                                    No archived records found for selection.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredArchived.map((item: any) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50/50">
                                                    <TableCell className="text-xs font-medium pl-6">
                                                        {formatDate(item.status_updated_at)}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs font-bold text-slate-600">
                                                        {item.payment_reference}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-700">{item.item_name}</span>
                                                            <span className="text-[10px] text-slate-400">PO: {item.po_number}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-600">
                                                        {item.garage_suppliers?.name || 'Manual'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-slate-700 pr-6 text-xs">
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
                </TabsContent>
            </Tabs>

            {/* Payment Confirmation Dialog */}
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Receipt className="w-6 h-6 text-slate-600" />
                            Confirm Disbursement
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Verify vendor payment details and enter reference.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Payable To</p>
                                    <p className="font-bold text-slate-900">{selectedReq?.garage_suppliers?.name || 'Manual Supplier'}</p>
                                </div>
                                <div className="text-right space-y-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase">PO Number</p>
                                    <p className="font-mono font-bold text-slate-700">{selectedReq?.po_number}</p>
                                </div>
                            </div>

                            <div className="py-3 px-4 bg-white rounded border border-slate-200 flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-600">Total Amount</span>
                                <span className="font-bold text-slate-900 text-xl">
                                    {selectedReq?.total_price?.toLocaleString()} <span className="text-xs font-medium text-slate-500">TShs</span>
                                </span>
                            </div>

                            {/* Bank Details */}
                            {selectedReq?.payment_details && (
                                <div className="space-y-3 pt-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                                        <Hash className="w-3.5 h-3.5" />
                                        Payment Instructions
                                    </div>
                                    <div className="grid grid-cols-2 gap-y-3 text-[11px]">
                                        <span className="text-slate-500 font-semibold">Method</span>
                                        <span className="font-bold text-right text-slate-900">{selectedReq.payment_details.method_name || selectedReq.payment_details.method_type}</span>

                                        {selectedReq.payment_details.bank_name && (
                                            <>
                                                <span className="text-slate-500 font-semibold">Bank Name</span>
                                                <span className="font-bold text-right text-slate-900">{selectedReq.payment_details.bank_name}</span>
                                                <span className="text-slate-500 font-semibold">Account Number</span>
                                                <code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono font-bold text-right text-slate-800">
                                                    {selectedReq.payment_details.account_number}
                                                </code>
                                            </>
                                        )}
                                        {selectedReq.payment_details.account_name && (
                                            <>
                                                <span className="text-slate-500 font-semibold">Beneficiary Name</span>
                                                <span className="font-bold text-right text-slate-900 truncate">{selectedReq.payment_details.account_name}</span>
                                            </>
                                        )}
                                        {selectedReq.payment_details.mobile_number && (
                                            <>
                                                <span className="text-slate-500 font-semibold">Mobile Number</span>
                                                <span className="font-bold text-right text-slate-900 font-mono tracking-wider">{selectedReq.payment_details.mobile_number}</span>
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
                                className="font-bold h-11"
                                value={paymentRef}
                                onChange={(e) => setPaymentRef(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setIsPaymentDialogOpen(false)} className="px-6 font-bold text-slate-500">Cancel</Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-white font-bold px-10 h-11"
                            disabled={!paymentRef || paymentMutation.isPending}
                            onClick={() => paymentMutation.mutate({
                                reqId: selectedReq.id,
                                reference: paymentRef,
                                item: selectedReq
                            })}
                        >
                            {paymentMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Processing...
                                </>
                            ) : "Confirm Disbursement"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default CashierPaymentPortal;
