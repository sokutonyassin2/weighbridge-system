import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, FileCheck, Truck, CheckCircle, Calculator, AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ReconciliationsReview() {
    const [searchTerm, setSearchTerm] = useState("");
    const [reviewModalOpen, setReviewModalOpen] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState<any>(null);
    
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch trips that have settlements (reconciliations) entered
    const { data: reconciliations, isLoading } = useQuery({
        queryKey: ["finance-reconciliations"],
        queryFn: async () => {
            // First fetch trips that might be settled
            const { data: trips, error: tripError } = await supabase
                .from("logistics_trip_sheets")
                .select(`
                    id, sheet_number, reference_number, status, expenses, created_at, client_name, origin, destination,
                    vehicle:vehicle_id ( vehicle_no ),
                    driver:driver_id ( full_name )
                `)
                .order("created_at", { ascending: false })
                .limit(50); // Just recent ones for performance

            if (tripError) throw tripError;

            // Then fetch settlements for these trips
            if (trips && trips.length > 0) {
                const tripIds = trips.map(t => t.id);
                const { data: settlements, error: setError } = await supabase
                    .from("logistics_trip_settlements" as any)
                    .select("*")
                    .in("trip_id", tripIds);

                if (setError) throw setError;

                // Combine them
                const combined = trips.map(trip => {
                    const tripSettlements = (settlements || []).filter((s: any) => s.trip_id === trip.id);
                    return {
                        ...trip,
                        settlements: tripSettlements
                    };
                }).filter(trip => trip.settlements.length > 0); // Only show trips WITH settlements

                return combined;
            }

            return [];
        }
    });

    // Mark as Financially Closed (Mock mutation since we don't have a specific field, we'll update status if it exists, or just show success)
    const approveReconciliationMutation = useMutation({
        mutationFn: async (tripId: string) => {
            // For now, we will just update the status to 'Financially Closed' if it's supported, 
            // or we'll just mock the success to not break the schema.
            // Let's assume we update status to 'Closed'
            const { error } = await supabase
                .from("logistics_trip_sheets" as any)
                .update({ status: "Closed" })
                .eq("id", tripId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["finance-reconciliations"] });
            toast({ title: "Reconciliation Approved", description: "The trip has been financially closed." });
            setReviewModalOpen(false);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error Approving", description: error.message });
        }
    });

    const calculateBudgeted = (expenses: any[]) => {
        if (!expenses) return 0;
        return expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    };

    const calculateActual = (settlements: any[]) => {
        if (!settlements) return 0;
        return settlements.reduce((sum, set) => sum + (parseFloat(set.amount_tzs) || 0), 0);
    };

    const filteredReconciliations = useMemo(() => {
        if (!reconciliations) return [];
        const lowerSearch = searchTerm.toLowerCase();
        
        return reconciliations.filter((trip: any) => 
            trip.sheet_number?.toLowerCase().includes(lowerSearch) ||
            trip.vehicle?.vehicle_no?.toLowerCase().includes(lowerSearch) ||
            trip.driver?.full_name?.toLowerCase().includes(lowerSearch)
        );
    }, [reconciliations, searchTerm]);

    const handleOpenReview = (trip: any) => {
        setSelectedTrip(trip);
        setReviewModalOpen(true);
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6 min-h-screen bg-slate-50/30">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <FileCheck className="w-6 h-6" />
                        </div>
                        Trip Reconciliations Review
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Review and approve actual receipts submitted by logistics vs budgeted trip expenses.
                    </p>
                </div>
                
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input 
                        placeholder="Search trip, vehicle, driver..." 
                        className="pl-9 h-10 bg-slate-50 border-slate-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isLoading ? (
                    <div className="p-12 text-center text-slate-500 col-span-full">Loading reconciliations...</div>
                ) : filteredReconciliations.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 border-2 border-dashed rounded-xl bg-white col-span-full">
                        No pending reconciliations to review.
                    </div>
                ) : (
                    filteredReconciliations.map((trip: any) => {
                        const budgeted = calculateBudgeted(trip.expenses);
                        const actual = calculateActual(trip.settlements);
                        const variance = budgeted - actual;
                        const isOverBudget = variance < 0;

                        return (
                            <Card key={trip.id} className="border-slate-200 hover:shadow-md transition-shadow flex flex-col">
                                <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline" className="bg-white tracking-widest text-[10px]">
                                                    {trip.sheet_number}
                                                </Badge>
                                                <Badge className={cn("", trip.status === 'Closed' ? "bg-slate-400" : "bg-amber-500")}>
                                                    {trip.status === 'Closed' ? "Approved" : "Pending Review"}
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-2 mt-2">
                                                <Truck className="w-4 h-4 text-primary" />
                                                {trip.vehicle?.vehicle_no}
                                            </CardTitle>
                                            <CardDescription className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                                                {trip.origin} <ArrowRight className="w-3 h-3" /> {trip.destination}
                                            </CardDescription>
                                        </div>
                                        <div className="text-right bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Koridor Variance</p>
                                            <p className={cn("text-lg font-black", isOverBudget ? "text-rose-600" : "text-emerald-600")}>
                                                {isOverBudget ? '-' : '+'} TShs {Math.abs(variance).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 flex-grow flex flex-col justify-between">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                                                <Calculator className="w-3 h-3" /> Budgeted (Disbursed)
                                            </p>
                                            <p className="font-bold text-slate-700">TShs {budgeted.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                                                <FileCheck className="w-3 h-3" /> Actual Receipts
                                            </p>
                                            <p className="font-bold text-slate-900">TShs {actual.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    
                                    <Button 
                                        onClick={() => handleOpenReview(trip)}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                        disabled={trip.status === 'Closed'}
                                    >
                                        {trip.status === 'Closed' ? "Already Approved" : "Review & Approve"}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* REVIEW MODAL */}
            <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
                <DialogContent className="sm:max-w-[700px] bg-slate-50">
                    <DialogHeader className="bg-white p-6 pb-4 border-b border-slate-100 rounded-t-lg">
                        <DialogTitle className="flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-emerald-600" />
                            Reconciliation Review
                        </DialogTitle>
                        <DialogDescription>
                            Verify actual receipts entered by logistics against the initial disbursed budget.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedTrip && (
                        <div className="p-6 pt-2 space-y-6 max-h-[70vh] overflow-y-auto">
                            {/* Summary Box */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-400">Trip Sheet</p>
                                    <p className="font-black text-slate-800">{selectedTrip.sheet_number}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-slate-400">Driver</p>
                                    <p className="font-bold text-slate-700">{selectedTrip.driver?.full_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-slate-400">Vehicle</p>
                                    <p className="font-bold text-primary">{selectedTrip.vehicle?.vehicle_no}</p>
                                </div>
                            </div>

                            {/* Receipts List */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-slate-400" /> Submitted Receipts ({selectedTrip.settlements.length})
                                </h3>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <div className="col-span-8">Receipt Description</div>
                                        <div className="col-span-4 text-right">Amount (TShs)</div>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {selectedTrip.settlements.map((settlement: any, idx: number) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 p-3 items-center hover:bg-slate-50 transition-colors">
                                                <div className="col-span-8 font-medium text-sm text-slate-700">
                                                    {settlement.receipt_description}
                                                    {settlement.is_excel_upload && (
                                                        <Badge variant="outline" className="ml-2 text-[8px] h-4 px-1 bg-blue-50 text-blue-600 border-blue-200">EXCEL</Badge>
                                                    )}
                                                </div>
                                                <div className="col-span-4 text-right font-bold text-slate-900">
                                                    {parseFloat(settlement.amount_tzs).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Variance Calculation */}
                            {(() => {
                                const budgeted = calculateBudgeted(selectedTrip.expenses);
                                const actual = calculateActual(selectedTrip.settlements);
                                const variance = budgeted - actual;
                                const isOverBudget = variance < 0;

                                return (
                                    <div className={cn("p-4 rounded-xl border flex justify-between items-center", 
                                        isOverBudget ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100"
                                    )}>
                                        <div>
                                            <p className={cn("text-[10px] uppercase font-bold mb-1", isOverBudget ? "text-rose-500" : "text-emerald-600")}>
                                                Final Assessment
                                            </p>
                                            <p className={cn("font-bold text-sm", isOverBudget ? "text-rose-900" : "text-emerald-900")}>
                                                {isOverBudget ? (
                                                    <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Driver overspent by TShs {Math.abs(variance).toLocaleString()}</span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Driver returns TShs {variance.toLocaleString()} to Koridor</span>
                                                )}
                                            </p>
                                        </div>
                                        <Button 
                                            className={cn("text-white font-bold", isOverBudget ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700")}
                                            onClick={() => approveReconciliationMutation.mutate(selectedTrip.id)}
                                            disabled={approveReconciliationMutation.isPending}
                                        >
                                            {approveReconciliationMutation.isPending ? "Approving..." : "Approve & Close Trip"}
                                        </Button>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
