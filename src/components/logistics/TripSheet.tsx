import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
    TrendingUp,
    DollarSign,
    ArrowRight,
    Map,
    Plus,
    Trash2,
    Truck,
    Calculator,
    Save,
    User,
    Package,
    FileText,
    TrendingDown,
    MapPin,
    Navigation,
    Globe,
    Fuel,
    Calculator as TotalIcon
} from "lucide-react";

interface TripSheetProps {
    tripId?: string;
    onSaveSuccess?: () => void;
}

interface ExpenseItem {
    id?: string;
    item_name: string;
    amount: string;
    category: 'TZ' | 'Zambia' | 'DRC' | 'Fixed';
    currency: 'USD' | 'TZS';
}

export const TripSheet = ({ tripId, onSaveSuccess }: TripSheetProps) => {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Trip Planning State (For New Sheets)
    const [tripData, setTripData] = useState({
        vehicle_id: "",
        trailer_id: "",
        driver_id: "",
        origin: "Headquarters",
        destination: "",
        cargo_outbound: "",
        notes: ""
    });

    // Summary State
    const [revenueData, setRevenueData] = useState({
        revenue_type: 'Without Fuel' as 'With Fuel' | 'Without Fuel',
        revenue_amount: ''
    });

    // Expenses State
    const [expenses, setExpenses] = useState<ExpenseItem[]>([
        { item_name: "Fuel", amount: "", category: "Fixed", currency: "TZS" },
        { item_name: "Driver Allowance", amount: "", category: "Fixed", currency: "TZS" }
    ]);

    // Financial Totals
    const [totals, setTotals] = useState({
        totalExpenses: 0,
        netProfit: 0
    });

    // Data fetching states
    const [fleet, setFleet] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);

    // Fetch existing data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Fetch Assets for selection (Transit Only)
                const { data: fleetData } = await supabase
                    .from('logistics_fleet' as any)
                    .select('*')
                    .eq('fleet_category', 'Transit')
                    .eq('is_active', true);

                const { data: driverData } = await supabase
                    .from('logistics_drivers' as any)
                    .select('*')
                    .eq('classification', 'Transit')
                    .eq('is_active', true);

                if (fleetData) setFleet(fleetData);

                if (driverData && driverData.length > 0) {
                    setDrivers(driverData);
                } else {
                    // Fallback: Fetch all active drivers if no Transit classified drivers exist yet
                    const { data: allDrivers } = await supabase
                        .from('logistics_drivers' as any)
                        .select('*')
                        .eq('is_active', true);
                    if (allDrivers) setDrivers(allDrivers || []);
                }

                if (!tripId) {
                    setIsLoading(false);
                    return;
                }

                // Fetch Trip Details
                const { data: tripDoc } = await supabase
                    .from('logistics_trips' as any)
                    .select('*')
                if (!tripId) {
                    setIsLoading(false);
                    return;
                }

                // Fetch Standalone Trip Sheet Details
                const { data: sheetData, error: fetchError } = await supabase
                    .from('logistics_trip_sheets' as any)
                    .select('*')
                    .eq('id', tripId)
                    .single();

                if (fetchError) throw fetchError;

                if (sheetData) {
                    const doc = sheetData as any;
                    setTripData({
                        vehicle_id: doc.vehicle_id,
                        trailer_id: doc.trailer_id || "",
                        driver_id: doc.driver_id,
                        origin: doc.origin,
                        destination: doc.destination,
                        cargo_outbound: doc.cargo_outbound,
                        notes: doc.notes || ""
                    });
                    setRevenueData({
                        revenue_type: doc.revenue_type,
                        revenue_amount: (doc.revenue_amount || 0).toString()
                    });
                }

                // Fetch Expenses
                const { data: expenseData } = await supabase
                    .from('logistics_trip_expenses' as any)
                    .select('*')
                    .eq('trip_sheet_id', tripId);

                if (expenseData && expenseData.length > 0) {
                    setExpenses((expenseData as any[]).map(e => ({
                        id: e.id,
                        item_name: e.item_name,
                        amount: e.amount.toString(),
                        category: e.category,
                        currency: e.currency
                    })));
                }
            } catch (error) {
                console.error("Error fetching financials:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [tripId]);

    // Calculate Totals
    useEffect(() => {
        const totalExp = expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        const revenue = parseFloat(revenueData.revenue_amount) || 0;

        setTotals({
            totalExpenses: totalExp,
            netProfit: revenue - totalExp
        });
    }, [expenses, revenueData]);

    const addExpense = (category: 'TZ' | 'Zambia' | 'DRC' | 'Fixed') => {
        setExpenses([...expenses, { item_name: "", amount: "", category, currency: category === 'TZ' ? 'TZS' : 'USD' }]);
    };

    const removeExpense = (index: number) => {
        const newExpenses = [...expenses];
        newExpenses.splice(index, 1);
        setExpenses(newExpenses);
    };

    const updateExpense = (index: number, field: keyof ExpenseItem, value: string) => {
        const newExpenses = [...expenses];
        newExpenses[index] = { ...newExpenses[index], [field]: value };
        setExpenses(newExpenses);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (!tripData.vehicle_id || !tripData.driver_id || !tripData.destination) {
                throw new Error("Please complete the Assignment & Destination fields first.");
            }

            const sheetPayload = {
                vehicle_id: tripData.vehicle_id,
                trailer_id: tripData.trailer_id || null,
                driver_id: tripData.driver_id,
                origin: tripData.origin,
                destination: tripData.destination,
                cargo_outbound: tripData.cargo_outbound,
                notes: tripData.notes,
                revenue_type: revenueData.revenue_type,
                revenue_amount: parseFloat(revenueData.revenue_amount) || 0,
                total_expenses: totals.totalExpenses,
                net_profit: totals.netProfit,
                status: 'Planned',
                updated_at: new Date().toISOString()
            };

            let activeSheetId = tripId;

            if (!activeSheetId) {
                // Create New Standalone Trip Sheet
                const { data: newSheet, error: insertError } = await supabase
                    .from('logistics_trip_sheets' as any)
                    .insert(sheetPayload)
                    .select()
                    .single();

                if (insertError) throw insertError;
                activeSheetId = (newSheet as any).id;
            } else {
                // Update Existing
                const { error: updateError } = await supabase
                    .from('logistics_trip_sheets' as any)
                    .update(sheetPayload)
                    .eq('id', activeSheetId);

                if (updateError) throw updateError;
            }

            // Sync Expenses
            const { error: deleteError } = await supabase
                .from('logistics_trip_expenses' as any)
                .delete()
                .eq('trip_sheet_id', activeSheetId);

            if (deleteError) throw deleteError;

            if (expenses.length > 0) {
                const { error: expenseError } = await supabase
                    .from('logistics_trip_expenses' as any)
                    .insert(expenses.map(e => ({
                        trip_sheet_id: activeSheetId,
                        category: e.category,
                        item_name: e.item_name,
                        amount: parseFloat(e.amount) || 0,
                        currency: e.currency
                    })));

                if (expenseError) throw expenseError;
            }

            toast({
                title: "Trip Sheet Saved",
                description: activeSheetId === tripId ? "Plan updated successfully." : "New standalone trip sheet created.",
            });

            if (onSaveSuccess) onSaveSuccess();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Save Failed",
                description: error.message,
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center">Loading Trip Financials...</div>;

    const renderExpenseSection = (title: string, category: 'TZ' | 'Zambia' | 'DRC' | 'Fixed', icon: any) => {
        const filteredExpenses = expenses
            .map((e, i) => ({ ...e, originalIndex: i }))
            .filter(e => e.category === category);

        const Icon = icon;

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${category === 'TZ' ? 'bg-blue-100 text-blue-600' : category === 'Zambia' ? 'bg-green-100 text-green-600' : category === 'DRC' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}>
                            <Icon size={18} />
                        </div>
                        <h3 className="font-bold text-lg">{title}</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => addExpense(category)} className="text-primary hover:text-primary/80">
                        <Plus size={16} className="mr-1" /> Add Item
                    </Button>
                </div>

                <div className="grid gap-3">
                    {filteredExpenses.map((item) => (
                        <div key={item.originalIndex} className="flex gap-3 items-end animate-fade-in">
                            <div className="flex-1">
                                <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Description</Label>
                                <Input
                                    className="h-9"
                                    placeholder="Enter expense name..."
                                    value={item.item_name}
                                    onChange={(e) => updateExpense(item.originalIndex, 'item_name', e.target.value)}
                                />
                            </div>
                            <div className="w-32">
                                <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Amount ({item.currency})</Label>
                                <Input
                                    className="h-9"
                                    type="number"
                                    placeholder="0"
                                    value={item.amount}
                                    onChange={(e) => updateExpense(item.originalIndex, 'amount', e.target.value)}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:bg-destructive/10"
                                onClick={() => removeExpense(item.originalIndex)}
                            >
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    ))}
                    {filteredExpenses.length === 0 && (
                        <div className="text-center py-4 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
                            No {title} expenses recorded yet
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4 max-w-5xl mx-auto pb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Main Tabs for better layout */}
            <Tabs defaultValue="assignment" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-slate-100/50 p-1">
                    <TabsTrigger value="assignment" className="data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold">
                        <Truck size={16} className="mr-2" /> 1. Assets & Route
                    </TabsTrigger>
                    <TabsTrigger value="financials" className="data-[state=active]:bg-white data-[state=active]:shadow-sm font-bold">
                        <DollarSign size={16} className="mr-2" /> 2. Financial Pro-Forma
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="assignment" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
                    <Card className="border-none shadow-lg bg-white overflow-hidden ring-1 ring-slate-200/50">
                        <CardHeader className="bg-slate-50/50 border-b py-3 px-6">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                                <Navigation size={16} /> Assignment & Routing Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-tight flex items-center gap-1.5 text-slate-600">
                                            <Truck size={14} className="text-primary" /> Vehicle (Horse)
                                        </Label>
                                        <Select
                                            value={tripData.vehicle_id}
                                            onValueChange={(v) => setTripData({ ...tripData, vehicle_id: v })}
                                        >
                                            <SelectTrigger className="h-10 bg-slate-50 border-slate-200">
                                                <SelectValue placeholder="Select Transit Vehicle" />
                                            </SelectTrigger>
                                            <SelectContent className="z-[100]">
                                                {fleet.filter(f => f.asset_type === 'Truck' || f.asset_type === 'Horse').map(v => (
                                                    <SelectItem key={v.id} value={v.id}>{v.vehicle_no} - {v.make_model}</SelectItem>
                                                ))}
                                                {fleet.length === 0 && <div className="p-2 text-xs text-muted-foreground text-center">No Transit vehicles found.</div>}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-tight flex items-center gap-1.5 text-slate-600">
                                            <User size={14} className="text-primary" /> Assigned Driver
                                        </Label>
                                        <Select
                                            value={tripData.driver_id}
                                            onValueChange={(v) => setTripData({ ...tripData, driver_id: v })}
                                        >
                                            <SelectTrigger className="h-10 bg-slate-50 border-slate-200">
                                                <SelectValue placeholder="Select Driver" />
                                            </SelectTrigger>
                                            <SelectContent className="z-[100]">
                                                {drivers.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                                                ))}
                                                {drivers.length === 0 && <div className="p-2 text-xs text-muted-foreground text-center">No drivers found. Check classification.</div>}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-tight flex items-center gap-1.5 text-slate-600">
                                            <Plus size={14} className="text-primary" /> Trailer / Other Assets
                                        </Label>
                                        <Select
                                            value={tripData.trailer_id}
                                            onValueChange={(v) => setTripData({ ...tripData, trailer_id: v })}
                                        >
                                            <SelectTrigger className="h-10 bg-slate-50 border-slate-200">
                                                <SelectValue placeholder="Select Trailer (Optional)" />
                                            </SelectTrigger>
                                            <SelectContent className="z-[100]">
                                                <SelectItem value="none">No Trailer</SelectItem>
                                                {fleet.filter(f => f.asset_type === 'Trailer').map(v => (
                                                    <SelectItem key={v.id} value={v.id}>{v.vehicle_no} - {v.make_model}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold uppercase tracking-tight text-slate-600">Origin</Label>
                                            <Input
                                                value={tripData.origin}
                                                onChange={(e) => setTripData({ ...tripData, origin: e.target.value })}
                                                className="h-10 bg-slate-100/50 border-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold uppercase tracking-tight text-slate-600">Destination</Label>
                                            <Input
                                                value={tripData.destination}
                                                onChange={(e) => setTripData({ ...tripData, destination: e.target.value })}
                                                className="h-10 bg-slate-50"
                                                placeholder="e.g. Lubumbashi"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-tight text-slate-600">Cargo / Consignment</Label>
                                        <Input
                                            value={tripData.cargo_outbound}
                                            onChange={(e) => setTripData({ ...tripData, cargo_outbound: e.target.value })}
                                            className="h-10"
                                            placeholder="Nature of goods being transported..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-tight text-slate-600">Internal Planning Notes</Label>
                                        <textarea
                                            className="w-full p-3 rounded-md border border-slate-200 bg-slate-50 text-sm h-24 resize-none"
                                            value={tripData.notes}
                                            onChange={(e) => setTripData({ ...tripData, notes: e.target.value })}
                                            placeholder="Add any specific requirements for this trip..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="financials" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
                    {/* Header Summary Cards - More compact */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gradient-to-br from-primary/5 to-white border-primary/10 shadow-sm">
                            <CardHeader className="pb-2 py-3">
                                <CardTitle className="text-xs font-bold uppercase text-primary tracking-wider">Revenue Type</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-3">
                                <Select
                                    value={revenueData.revenue_type}
                                    onValueChange={(v: any) => setRevenueData({ ...revenueData, revenue_type: v })}
                                >
                                    <SelectTrigger className="h-9 border-primary/20 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="With Fuel">With Fuel</SelectItem>
                                        <SelectItem value="Without Fuel">Without Fuel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900 border-slate-800 text-white shadow-xl scale-[1.02]">
                            <CardHeader className="pb-1 py-3">
                                <CardTitle className="text-xs font-bold uppercase text-slate-400 tracking-wider">Gross Revenue</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4">
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-slate-500 font-bold">$</span>
                                    <Input
                                        className="pl-7 font-black text-2xl h-11 bg-slate-800 border-none text-white placeholder:text-slate-600"
                                        placeholder="0.00"
                                        type="number"
                                        value={revenueData.revenue_amount}
                                        onChange={(e) => setRevenueData({ ...revenueData, revenue_amount: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100 shadow-sm">
                            <CardHeader className="pb-1 py-3">
                                <CardTitle className="text-xs font-bold uppercase text-emerald-600 tracking-wider">Expected Net Profit</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4">
                                <div className={`text-2xl font-black ${totals.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    ${totals.netProfit.toLocaleString()}
                                </div>
                                <div className="text-[10px] text-emerald-600/70 font-bold uppercase mt-1">
                                    After ${totals.totalExpenses.toLocaleString()} Total Costs
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Regional Sections - More compact layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="shadow-sm border-slate-200/60 bg-white ring-1 ring-slate-100/50">
                            <CardContent className="p-4 pt-6 space-y-6">
                                {renderExpenseSection("Tanzania (TZ) Borders", "TZ", Map)}
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-slate-200/60 bg-white ring-1 ring-slate-100/50">
                            <CardContent className="p-4 pt-6 space-y-6">
                                {renderExpenseSection("Zambia Section", "Zambia", Globe)}
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-slate-200/60 bg-white ring-1 ring-slate-100/50">
                            <CardContent className="p-4 pt-6 space-y-6">
                                {renderExpenseSection("DR Congo (DRC)", "DRC", MapPin)}
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-primary/10 bg-slate-50/30 ring-1 ring-primary/5">
                            <CardContent className="p-4 pt-6 space-y-6">
                                {renderExpenseSection("Fixed & Operational", "Fixed", Fuel)}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Actions Footer - Always visible */}
            <div className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-primary/10 mt-6 animate-in slide-in-from-bottom-4 duration-700 delay-200 sticky bottom-2 z-50">
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex h-12 w-12 items-center justify-center bg-primary/10 rounded-xl text-primary">
                        <Calculator size={24} />
                    </div>
                    <div>
                        <h4 className="font-black text-slate-800 leading-tight">Master Trip Plan</h4>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Standalone Pro-Forma Entry</p>
                    </div>
                </div>
                <Button
                    size="lg"
                    className="px-10 font-black shadow-xl transition-all active:scale-95 bg-primary hover:bg-primary/90 rounded-xl h-12"
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? "Syncing Logic..." : "Finalize & Save Sheet"}
                    {!isSaving && <ArrowRight size={18} className="ml-2" />}
                </Button>
            </div>
        </div>
    );
};

// Simple Flag helper
const FlagIcon = ({ country }: { country: 'ZM' | 'CD' }) => (
    <div className="w-5 h-4 overflow-hidden rounded-sm border inline-block mr-1">
        {country === 'ZM' ? (
            <div className="bg-green-600 w-full h-full flex flex-col items-end">
                <div className="bg-black w-2 h-2"></div>
                <div className="bg-orange-600 w-2 h-2"></div>
            </div>
        ) : (
            <div className="bg-blue-600 w-full h-full relative">
                <div className="absolute top-0 bottom-0 left-0 right-0 bg-yellow-400 transform translate-x-[80%] rotate-45"></div>
            </div>
        )}
    </div>
);
