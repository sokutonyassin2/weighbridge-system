import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Wallet, ArrowDownRight, ArrowUpRight, History } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function KoridorAccount() {
    const [searchTerm, setSearchTerm] = useState("");

    // Fetch all trips to build a virtual ledger
    const { data: ledgerEntries, isLoading } = useQuery({
        queryKey: ["finance-koridor-ledger"],
        queryFn: async () => {
            const { data: trips, error } = await supabase
                .from("logistics_trip_sheets")
                .select(`
                    id, sheet_number, status, expenses, created_at,
                    vehicle:vehicle_id ( vehicle_no ),
                    driver:driver_id ( full_name )
                `)
                .order("created_at", { ascending: false });

            if (error) throw error;

            // Also fetch settlements to calculate true variances
            const { data: settlements } = await (supabase as any)
                .from("logistics_trip_settlements")
                .select("trip_id, amount_tzs");

            const entries: any[] = [];
            let currentBalance = 15450000; // Starting Mock Balance

            (trips || []).forEach(trip => {
                const budgeted = trip.expenses?.reduce((sum: number, exp: any) => sum + (parseFloat(exp.amount) || 0), 0) || 0;
                
                // Add Disbursement Entry (Money Out)
                if (budgeted > 0) {
                    entries.push({
                        id: `${trip.id}-disb`,
                        date: trip.created_at,
                        type: 'DISBURSEMENT',
                        amount: budgeted,
                        description: `Trip Disbursement: ${trip.sheet_number}`,
                        reference: trip.vehicle?.vehicle_no,
                        driver: trip.driver?.full_name
                    });
                }

                // If closed/settled, add the Return/Variance Entry
                if (trip.status === 'Closed') {
                    const tripSettlements = (settlements || []).filter((s: any) => s.trip_id === trip.id);
                    const actual = tripSettlements.reduce((sum: number, set: any) => sum + (parseFloat(set.amount_tzs) || 0), 0);
                    const variance = budgeted - actual;

                    if (variance !== 0) {
                        entries.push({
                            id: `${trip.id}-ret`,
                            date: trip.created_at, // Ideally this would be settlement date, but we use trip date for mock sorting
                            type: variance > 0 ? 'RETURN' : 'OVERSPEND',
                            amount: Math.abs(variance),
                            description: variance > 0 ? `Unspent Return: ${trip.sheet_number}` : `Extra Disbursed: ${trip.sheet_number}`,
                            reference: trip.vehicle?.vehicle_no,
                            driver: trip.driver?.full_name
                        });
                    }
                }
            });

            // Sort by date descending
            entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return entries;
        }
    });

    const filteredEntries = useMemo(() => {
        if (!ledgerEntries) return [];
        const lowerSearch = searchTerm.toLowerCase();
        
        return ledgerEntries.filter((entry: any) => 
            entry.description.toLowerCase().includes(lowerSearch) ||
            entry.reference?.toLowerCase().includes(lowerSearch) ||
            entry.driver?.toLowerCase().includes(lowerSearch)
        );
    }, [ledgerEntries, searchTerm]);

    return (
        <div className="p-6 max-w-[1200px] mx-auto space-y-6 min-h-screen bg-slate-50/30">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Wallet className="w-6 h-6" />
                        </div>
                        Koridor Account Ledger
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Track driver virtual cash disbursements and end-of-trip returns.
                    </p>
                </div>
                
                <div className="text-right bg-slate-50 p-3 rounded-xl border border-slate-200 min-w-[200px]">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-widest">Current Balance</p>
                    <p className="text-2xl font-black text-blue-700">TShs 15,450,000</p>
                </div>
            </div>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-100 flex flex-row items-center justify-between py-4">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-400" />
                        <CardTitle className="text-base font-bold text-slate-800">Transaction History</CardTitle>
                    </div>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                            placeholder="Search transactions..." 
                            className="pl-9 h-9 bg-slate-50 border-slate-200 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-12 text-center text-slate-500 font-medium">Loading ledger...</div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            No transactions match your search.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 bg-white">
                            {filteredEntries.map((entry: any) => (
                                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-sm",
                                            entry.type === 'RETURN' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                            entry.type === 'DISBURSEMENT' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                            "bg-amber-50 text-amber-600 border-amber-100"
                                        )}>
                                            {entry.type === 'RETURN' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-slate-900">{entry.description}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-slate-500 font-medium">{format(new Date(entry.date), "MMM dd, yyyy • HH:mm")}</span>
                                                <span className="text-[10px] text-slate-400">•</span>
                                                <span className="text-[10px] text-slate-600 font-semibold">{entry.driver}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-right">
                                        <Badge variant="outline" className="bg-white text-[10px] text-slate-500 border-slate-200 hidden md:inline-flex">
                                            {entry.reference}
                                        </Badge>
                                        <p className={cn("font-black min-w-[100px]", 
                                            entry.type === 'RETURN' ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {entry.type === 'RETURN' ? '+' : '-'} {entry.amount.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
