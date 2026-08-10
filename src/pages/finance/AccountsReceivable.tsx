import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CreditCard, CheckCircle, Clock, AlertCircle, Building2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function AccountsReceivable() {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("All");
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Trip Sheets that have been invoiced
    const { data: invoicedSheets, isLoading } = useQuery({
        queryKey: ["finance-accounts-receivable"],
        queryFn: async () => {
            const { data: sheets, error } = await supabase
                .from("logistics_trip_sheets")
                .select(`
                    id, invoice_no, invoice_date, payment_status, revenue_currency, revenue_amount, client_name,
                    return_invoice_no, return_invoice_date, return_payment_status, return_revenue_currency, return_revenue_amount, return_client_name,
                    vehicle:vehicle_id ( vehicle_no )
                `)
                .not("invoice_no", "is", null)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return sheets || [];
        }
    });

    // Mark as Paid Mutation
    const markPaidMutation = useMutation({
        mutationFn: async (invoiceData: any) => {
            const updates = invoiceData.trips.map((trip: any) => {
                if (trip._leg === 'RETURN') {
                    return supabase
                        .from("logistics_trip_sheets" as any)
                        .update({ return_payment_status: "Paid" })
                        .eq("id", trip.id);
                } else {
                    return supabase
                        .from("logistics_trip_sheets" as any)
                        .update({ payment_status: "Paid" })
                        .eq("id", trip.id);
                }
            });

            await Promise.all(updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["finance-accounts-receivable"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-finance-revenue"] }); // Update dashboard too
            toast({ title: "Payment Recorded", description: "The invoice has been marked as paid." });
            setPaymentModalOpen(false);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error Saving", description: error.message });
        }
    });

    // Grouping by Client -> then by Invoice
    const groupedData = useMemo(() => {
        if (!invoicedSheets) return {};

        const acc: any = {};
        const searchLower = searchTerm.toLowerCase();

        // 1. First extract all invoices
        const allInvoices: any = {};
        
        invoicedSheets.forEach((sheet: any) => {
            // Outbound Leg
            if (sheet.invoice_no) {
                const invNo = sheet.invoice_no;
                if (!allInvoices[invNo]) {
                    allInvoices[invNo] = {
                        invoice_no: invNo,
                        invoice_date: sheet.invoice_date,
                        payment_status: sheet.payment_status || "Pending",
                        currency: sheet.revenue_currency || 'TZS',
                        client_name: sheet.client_name || 'Unspecified',
                        total_amount: 0,
                        trips: []
                    };
                }
                const outboundSheet = { ...sheet, _leg: 'OUTBOUND' };
                allInvoices[invNo].trips.push(outboundSheet);
                allInvoices[invNo].total_amount += parseFloat(sheet.revenue_amount || 0);
            }

            // Return Leg
            if (sheet.return_invoice_no) {
                const retInvNo = sheet.return_invoice_no;
                if (!allInvoices[retInvNo]) {
                    allInvoices[retInvNo] = {
                        invoice_no: retInvNo,
                        invoice_date: sheet.return_invoice_date,
                        payment_status: sheet.return_payment_status || 'Pending',
                        currency: sheet.return_revenue_currency || 'TZS',
                        client_name: sheet.return_client_name || sheet.client_name || 'Unspecified',
                        total_amount: 0,
                        trips: []
                    };
                }
                const returnSheet = { ...sheet, _leg: 'RETURN' };
                allInvoices[retInvNo].trips.push(returnSheet);
                allInvoices[retInvNo].total_amount += parseFloat(sheet.return_revenue_amount || 0);
            }
        });

        // 2. Filter by search & tab, then group by Client
        Object.values(allInvoices).forEach((inv: any) => {
            const matchesSearch = !searchTerm || 
                inv.invoice_no.toLowerCase().includes(searchLower) || 
                inv.client_name.toLowerCase().includes(searchLower);
                
            const matchesTab = activeTab === "All" || inv.payment_status === activeTab;

            if (matchesSearch && matchesTab) {
                const client = inv.client_name;
                if (!acc[client]) {
                    acc[client] = {
                        client_name: client,
                        total_due_usd: 0,
                        invoices: []
                    };
                }
                acc[client].invoices.push(inv);
                if (inv.currency === 'USD') {
                    acc[client].total_due_usd += inv.total_amount;
                }
            }
        });

        return acc;
    }, [invoicedSheets, searchTerm, activeTab]);

    const handleOpenPayment = (invoice: any) => {
        setSelectedInvoice(invoice);
        setPaymentModalOpen(true);
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6 min-h-screen bg-slate-50/30">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        Accounts Receivable
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Track outstanding logistics invoices and log received payments.
                    </p>
                </div>
                
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input 
                        placeholder="Search invoice or client..." 
                        className="pl-9 h-10 bg-slate-50 border-slate-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Tabs defaultValue="All" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-white border shadow-sm">
                    <TabsTrigger value="All">All Invoices</TabsTrigger>
                    <TabsTrigger value="Pending" className="data-[state=active]:text-amber-700 data-[state=active]:bg-amber-50">Pending</TabsTrigger>
                    <TabsTrigger value="Partial" className="data-[state=active]:text-orange-700 data-[state=active]:bg-orange-50">Partial</TabsTrigger>
                    <TabsTrigger value="Paid" className="data-[state=active]:text-emerald-700 data-[state=active]:bg-emerald-50">Paid</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="space-y-8">
                {isLoading ? (
                    <div className="p-12 text-center text-slate-500 font-medium">Loading receivables...</div>
                ) : Object.keys(groupedData).length === 0 ? (
                    <div className="p-12 text-center text-slate-500 border-2 border-dashed rounded-xl bg-white">
                        No invoices found for this criteria.
                    </div>
                ) : (
                    Object.values(groupedData).map((clientGroup: any) => (
                        <div key={clientGroup.client_name} className="space-y-4">
                            {/* Client Header */}
                            <div className="flex items-center gap-3 py-2 border-b-2 border-slate-200">
                                <Building2 className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                                    {clientGroup.client_name}
                                </h2>
                                <Badge variant="secondary" className="ml-auto bg-white border font-bold text-slate-600">
                                    {clientGroup.invoices.length} Invoices
                                </Badge>
                            </div>

                            {/* Invoices for this Client */}
                            <div className="grid gap-4">
                                {clientGroup.invoices.map((inv: any) => (
                                    <Card key={inv.invoice_no} className="border-slate-200 hover:shadow-md transition-shadow">
                                        <CardHeader className="bg-white pb-4 flex flex-row items-center justify-between border-b border-slate-100">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <CardTitle className="text-lg font-black text-slate-800">
                                                        {inv.invoice_no}
                                                    </CardTitle>
                                                    <Badge className={cn("",
                                                        inv.payment_status === 'Paid' ? "bg-emerald-500 hover:bg-emerald-600" : 
                                                        inv.payment_status === 'Partial' ? "bg-amber-500 hover:bg-amber-600" : 
                                                        "bg-slate-400 hover:bg-slate-500"
                                                    )}>
                                                        {inv.payment_status}
                                                    </Badge>
                                                </div>
                                                <CardDescription className="text-sm font-medium flex items-center gap-2">
                                                    <span className="text-slate-500 font-medium text-xs">
                                                        {inv.invoice_date ? format(new Date(inv.invoice_date), "MMM dd, yyyy") : 'No Date'}
                                                    </span>
                                                </CardDescription>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-right">
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider">Total Amount Due</p>
                                                    <p className="text-xl font-black text-slate-900">
                                                        {inv.currency} {inv.total_amount.toLocaleString()}
                                                    </p>
                                                </div>
                                                {inv.payment_status !== 'Paid' && (
                                                    <Button 
                                                        onClick={() => handleOpenPayment(inv)}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                                    >
                                                        <CheckCircle className="w-4 h-4 mr-2" />
                                                        Log Payment
                                                    </Button>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="bg-slate-50/50 p-4">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Included Vehicles ({inv.trips.length})</p>
                                            <div className="flex flex-wrap gap-2">
                                                {inv.trips.map((trip: any, idx: number) => (
                                                    <Badge key={idx} variant="outline" className="bg-white font-semibold text-slate-700 border-slate-200 py-1 px-3">
                                                        {trip.vehicle?.vehicle_no} 
                                                        <span className="text-slate-400 ml-2 font-normal text-[10px]">
                                                            {trip._leg === 'RETURN' ? '(Return Leg)' : ''}
                                                        </span>
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* PAYMENT MODAL */}
            <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Confirm Payment Receipt</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to mark this invoice as fully paid?
                        </DialogDescription>
                    </DialogHeader>
                    {selectedInvoice && (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mt-2 space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Invoice No:</span>
                                <span className="font-bold">{selectedInvoice.invoice_no}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Client:</span>
                                <span className="font-bold text-indigo-600">{selectedInvoice.client_name}</span>
                            </div>
                            <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                                <span className="text-slate-500 font-medium">Total Amount:</span>
                                <span className="text-lg font-black text-emerald-600">
                                    {selectedInvoice.currency} {selectedInvoice.total_amount.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => markPaidMutation.mutate(selectedInvoice)}
                            disabled={markPaidMutation.isPending}
                        >
                            {markPaidMutation.isPending ? "Saving..." : "Confirm Payment"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
