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
import { useAuth } from "@/contexts/AuthContext";
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
    Calculator as TotalIcon,
    ShieldCheck,
    Zap
} from "lucide-react";

interface TripSheetProps {
    tripId?: string;
    duplicateData?: any;
    onSaveSuccess?: () => void;
}

interface ExpenseItem {
    id?: string;
    item_name: string;
    amount: string;
    category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed';
    currency: 'USD' | 'TZS';
}

export const TripSheet = ({ tripId, duplicateData, onSaveSuccess }: TripSheetProps) => {
    const { toast } = useToast();
    const { userRole, user, userProfile } = useAuth();
    const isSuperAdmin = userRole === 'super_admin';
    const isManager = userRole === 'logistics_manager' || userRole === 'admin' || userRole === 'super_admin';
    const [isSaving, setIsSaving] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<string>('Planned');
    const [isLoading, setIsLoading] = useState(true);
    const [auditTrail, setAuditTrail] = useState<{
        created_by_name?: string;
        created_at?: string;
        approved_by_name?: string;
        approved_at?: string;
        activated_by_name?: string;
        activated_at?: string;
    }>({});

    const [convoyInfo, setConvoyInfo] = useState<{ id?: string; name?: string }>({});

    const [activeCountries, setActiveCountries] = useState<string[]>(['TZ']);

    const isLocked = !isSuperAdmin && (currentStatus === 'Approved' || currentStatus === 'Active' || currentStatus === 'Completed');

    // Trip Planning State (For New Sheets)
    const [tripData, setTripData] = useState({
        vehicle_id: "",
        trailer_id: "",
        driver_id: "",
        origin: "Headquarters",
        destination: "",
        journey_type: "Go & Return",
        cargo_outbound: "",
        notes: "",
        agreed_days: "",
        daily_fine_amount: ""
    });

    // Summary State
    const [revenueData, setRevenueData] = useState({
        revenue_type: 'Without Fuel' as 'With Fuel' | 'Without Fuel',
        revenue_amount: '',
        revenue_currency: 'USD' as 'USD' | 'TZS',
        exchange_rate: '2700',
        fuel_liters: '',
        fuel_price: '',
        fuel_amount: '0' // Total fuel cost in USD (calculated)
    });

    // Expenses State
    const [expenses, setExpenses] = useState<ExpenseItem[]>([
        { item_name: "Driver Allowance", amount: "", category: "TZ", currency: "USD" }
    ]);

    // Financial Totals
    const [totals, setTotals] = useState({
        totalExpensesTZS: 0,
        totalExpensesUSD: 0,
        netProfitUSD: 0,
        categoryTotals: {} as Record<string, { usd: number, tzs: number }>
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
                    .select('id, full_name, license_expiry, classification')
                    .eq('classification', 'Transit')
                    .eq('is_active', true);

                if (fleetData) setFleet(fleetData);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const filterExpired = (list: any[]) =>
                    list.filter(d => !d.license_expiry || new Date(d.license_expiry) >= today);

                if (driverData && driverData.length > 0) {
                    setDrivers(filterExpired(driverData));
                } else {
                    // Fallback: Fetch all active drivers if no Transit classified drivers exist yet
                    const { data: allDrivers } = await supabase
                        .from('logistics_drivers' as any)
                        .select('id, full_name, license_expiry')
                        .eq('is_active', true);
                    if (allDrivers) setDrivers(filterExpired(allDrivers));
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
                    setCurrentStatus(doc.status || 'Planned');
                    setTripData({
                        vehicle_id: doc.vehicle_id || "",
                        trailer_id: doc.trailer_id || "",
                        driver_id: doc.driver_id || "",
                        origin: doc.origin,
                        destination: doc.destination,
                        journey_type: doc.journey_type || "Go & Return",
                        cargo_outbound: doc.cargo_outbound,
                        notes: doc.notes || "",
                        agreed_days: (doc.agreed_days || '').toString(),
                        daily_fine_amount: (doc.daily_fine_amount || '').toString()
                    });

                    setConvoyInfo({
                        id: doc.convoy_id,
                        name: doc.convoy_name
                    });

                    setRevenueData({
                        revenue_type: doc.revenue_type || 'Without Fuel',
                        revenue_amount: (doc.revenue_amount || 0).toString(),
                        revenue_currency: (doc.revenue_currency || 'USD') as 'USD' | 'TZS',
                        exchange_rate: (doc.exchange_rate || 2700).toString(),
                        fuel_liters: (doc.fuel_liters || '').toString(),
                        fuel_price: (doc.fuel_price || '').toString(),
                        fuel_amount: (doc.fuel_amount || 0).toString()
                    });
                    setAuditTrail({
                        created_by_name: doc.created_by_name,
                        created_at: doc.created_at,
                        approved_by_name: doc.approved_by_name,
                        approved_at: doc.approved_at,
                        activated_by_name: doc.activated_by_name,
                        activated_at: doc.activated_at,
                    });

                    // Load persistent layout if available
                    if (doc.active_countries && Array.isArray(doc.active_countries)) {
                        setActiveCountries(doc.active_countries);
                    }
                }

                // Fetch Expenses
                const { data: expenseData } = await supabase
                    .from('logistics_trip_expenses' as any)
                    .select('*')
                    .eq('trip_sheet_id', tripId);

                if (expenseData && expenseData.length > 0) {
                    const docExpenses = (expenseData as any[]).map(e => ({
                        id: e.id,
                        item_name: e.item_name,
                        amount: e.amount.toString(),
                        category: e.category,
                        currency: e.currency
                    })) as ExpenseItem[];

                    setExpenses(docExpenses);

                    // Auto-enable countries that have expenses
                    const countriesWithData = [...new Set(docExpenses.map(e => e.category))].filter(c => c !== 'Fixed');
                    if (countriesWithData.length > 0) {
                        setActiveCountries(countriesWithData as string[]);
                    }
                }
            } catch (error: any) {
                console.error("Error fetching financials:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [tripId]);

    // Pre-fill from duplicate source
    useEffect(() => {
        if (!duplicateData) return;
        const doc = duplicateData;

        // NEW: Helper to normalize legacy or descriptive category names from DB to internal keys
        const normalizeCategory = (cat: string): 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed' => {
            const c = cat ? cat.trim() : 'Fixed';
            if (c === 'Tanzania') return 'TZ';
            if (c === 'DR Congo' || c === 'Congo') return 'DRC';
            if (['TZ', 'Zambia', 'DRC', 'Rwanda', 'Burundi', 'Fixed'].includes(c)) return c as any;
            return 'Fixed';
        };

        const fetchDuplicateExpenses = async () => {
            try {
                const { data: expenseData } = await supabase
                    .from('logistics_trip_expenses' as any)
                    .select('*')
                    .eq('trip_sheet_id', doc.id);

                if (expenseData && expenseData.length > 0) {
                    const docExpenses = (expenseData as any[]).map(e => ({
                        item_name: e.item_name || e.description || "",
                        amount: e.amount.toString(),
                        category: normalizeCategory(e.category), // APPLY NORMALIZATION
                        currency: e.currency
                    })) as ExpenseItem[];

                    setExpenses(docExpenses);

                    // Auto-enable countries that have expenses
                    const countriesWithData = [...new Set(docExpenses.map(e => e.category))].filter(c => c !== 'Fixed');
                    if (countriesWithData.length > 0) {
                        setActiveCountries(countriesWithData as string[]);
                    }
                }
            } catch (err) {
                console.error("Scale-out error fetching duplicate expenses:", err);
            }
        };

        setTripData({
            vehicle_id: "", // Must be re-assigned for new trip
            trailer_id: doc.trailer_id || "", // PRESERVE TRAILER
            driver_id: "",  // Must be re-assigned for new trip
            origin: doc.origin || "Headquarters",
            destination: doc.destination || "",
            journey_type: doc.journey_type || "Go & Return",
            cargo_outbound: doc.cargo_outbound || "",
            notes: doc.notes || "",
            agreed_days: (doc.agreed_days || '').toString(),
            daily_fine_amount: (doc.daily_fine_amount || '').toString()
        });
        setRevenueData({
            revenue_type: doc.revenue_type || 'Without Fuel',
            revenue_amount: (doc.revenue_amount || 0).toString(),
            revenue_currency: (doc.revenue_currency || 'USD') as 'USD' | 'TZS',
            exchange_rate: (doc.exchange_rate || 2700).toString(),
            fuel_liters: (doc.fuel_liters || '').toString(),
            fuel_price: (doc.fuel_price || '').toString(),
            fuel_amount: (doc.fuel_amount || 0).toString()
        });

        // Ensure and set active countries (Regional Scope) from copied data
        if (doc.active_countries && Array.isArray(doc.active_countries)) {
            setActiveCountries(doc.active_countries);
        }

        fetchDuplicateExpenses();
        setIsLoading(false);
    }, [duplicateData]);

    // Form Persistence (Save to LocalStorage)
    useEffect(() => {
        if (tripId || isLoading) return; // Don't persist if editing an existing record or loading
        const draft = {
            tripData,
            revenueData,
            expenses
        };
        localStorage.setItem('trip_sheet_draft', JSON.stringify(draft));
    }, [tripData, revenueData, expenses, tripId, isLoading]);

    // Load Persistence
    useEffect(() => {
        if (tripId || duplicateData) return; // SKIP draft load if duplicating a trip!
        const saved = localStorage.getItem('trip_sheet_draft');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setTripData(prev => ({ ...prev, ...parsed.tripData }));
                setRevenueData(prev => ({ ...prev, ...parsed.revenueData }));
                setExpenses(parsed.expenses || []);

                // Auto-enable countries that have expenses from draft
                const countriesWithData = [...new Set((parsed.expenses || []).map((e: ExpenseItem) => e.category))].filter(c => c !== 'Fixed');
                if (countriesWithData.length > 0) {
                    setActiveCountries(countriesWithData as string[]);
                }
            } catch (e) {
                console.error("Failed to parse draft", e);
            }
        }
    }, [tripId]);

    // Migration: Force any 'TZ' or 'Fixed' category to USD if it's currently TZS (for existing drafts)
    useEffect(() => {
        const hasTZS = expenses.some(e => (e.category === 'TZ' || e.category === 'Fixed') && e.currency === 'TZS');
        if (hasTZS) {
            setExpenses(prev => prev.map(e =>
                ((e.category === 'TZ' || e.category === 'Fixed') && e.currency === 'TZS') ? { ...e, currency: 'USD' } : e
            ));
        }
    }, [expenses]);

    // Calculate Totals
    useEffect(() => {
        const rate = parseFloat(revenueData.exchange_rate) || 2700;

        // Fuel Calculation: Liters * Price = Total TZS -> / Rate = Total USD
        const liters = parseFloat(revenueData.fuel_liters) || 0;
        const pricePerLiter = parseFloat(revenueData.fuel_price) || 0;
        const fuelTotalTZS = liters * pricePerLiter;
        const fuelTotalUSD = fuelTotalTZS / rate;

        // Group Expenses & Subtotals
        const catTotals = expenses.reduce((acc, curr) => {
            const amt = parseFloat(curr.amount) || 0;
            const inUSD = curr.currency === 'USD' ? amt : amt / rate;
            const inTZS = curr.currency === 'TZS' ? amt : amt * rate;

            acc[curr.category] = {
                usd: (acc[curr.category]?.usd || 0) + inUSD,
                tzs: (acc[curr.category]?.tzs || 0) + inTZS
            };
            return acc;
        }, {} as Record<string, { usd: number, tzs: number }>);

        const totalOperationalUSD = expenses.reduce((sum, item) => {
            const amt = parseFloat(item.amount) || 0;
            return sum + (item.currency === 'USD' ? amt : amt / rate);
        }, 0);

        const revenueAmount = parseFloat(revenueData.revenue_amount) || 0;
        const revenueInUSD = revenueData.revenue_currency === 'USD'
            ? revenueAmount
            : (revenueAmount / rate);

        // Final Logic: Profit = Revenue - Operational - (isWithFuel ? Fuel : 0)
        const activeFuelUSD = revenueData.revenue_type === 'With Fuel' ? fuelTotalUSD : 0;
        const totalExpensesUSD = totalOperationalUSD + activeFuelUSD;

        setTotals({
            totalExpensesTZS: totalExpensesUSD * rate,
            totalExpensesUSD: totalExpensesUSD,
            netProfitUSD: revenueInUSD - totalExpensesUSD,
            categoryTotals: catTotals // Store for UI display
        });
    }, [expenses, revenueData]);

    const addExpense = (category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed') => {
        setExpenses([...expenses, {
            item_name: "",
            amount: "",
            category,
            currency: 'USD' // Default all to USD now as requested
        }]);
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
            if (!tripData.destination) {
                throw new Error("Please specify at least the Route Destination to save this plan.");
            }

            const sheetPayload = {
                vehicle_id: tripData.vehicle_id || null,
                trailer_id: tripData.trailer_id || null,
                driver_id: tripData.driver_id || null,
                origin: tripData.origin,
                destination: tripData.destination,
                journey_type: tripData.journey_type,
                cargo_outbound: tripData.cargo_outbound,
                notes: tripData.notes,
                agreed_days: parseInt(tripData.agreed_days) || null,
                daily_fine_amount: parseFloat(tripData.daily_fine_amount) || 0,
                revenue_type: revenueData.revenue_type,
                revenue_amount: parseFloat(revenueData.revenue_amount) || 0,
                revenue_currency: revenueData.revenue_currency,
                exchange_rate: parseFloat(revenueData.exchange_rate) || 2700,
                fuel_liters: parseFloat(revenueData.fuel_liters) || 0,
                fuel_price: parseFloat(revenueData.fuel_price) || 0,
                fuel_amount: parseFloat(revenueData.fuel_amount) || 0, // Calculated USD value
                total_expenses_tzs: totals.totalExpensesTZS,
                total_expenses_usd: totals.totalExpensesUSD,
                net_profit_usd: totals.netProfitUSD,
                status: currentStatus,
                active_countries: activeCountries, // PERSIST LAYOUT
                updated_at: new Date().toISOString()
            } as any;

            // Set creation metadata if first time saving
            if (!tripId && !duplicateData) {
                sheetPayload.created_by = user?.id;
                sheetPayload.created_by_name = userProfile?.full_name || user?.email;
            }

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
                        nature: e.category, // Sync both for compatibility
                        item_name: e.item_name,
                        description: e.item_name, // Sync both for compatibility
                        amount: parseFloat(e.amount) || 0,
                        currency: e.currency
                    })));

                if (expenseError) {
                    // Cleanup: If expenses fail, delete the partially created sheet to avoid "empty rows"
                    if (!tripId) {
                        await supabase.from('logistics_trip_sheets' as any).delete().eq('id', activeSheetId);
                    }
                    throw expenseError;
                }
            }

            toast({
                title: "Trip Sheet Saved",
                description: activeSheetId === tripId ? "Plan updated successfully." : "New standalone trip sheet created.",
            });

            // Clear draft if it was a new sheet
            if (!tripId) {
                localStorage.removeItem('trip_sheet_draft');
            }

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

    const handleApprove = async () => {
        if (!tripId) return;
        setIsApproving(true);
        try {
            const approverName = (userProfile as any)?.full_name || (userProfile as any)?.username || 'Super Admin';
            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    status: 'Approved',
                    approved_by: user?.id,
                    approved_by_name: userProfile?.full_name || user?.email,
                    approved_at: new Date().toISOString()
                })
                .eq('id', tripId);
            if (error) throw error;
            setCurrentStatus('Approved');
            setAuditTrail(prev => ({
                ...prev,
                approved_by_name: userProfile?.full_name || user?.email,
                approved_at: new Date().toISOString()
            }));
            toast({ title: "Budget Approved ✅", description: "This budget is now officially locked and ready for activation." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Approve Failed", description: error.message });
        } finally {
            setIsApproving(false);
        }
    };

    const handleActivate = async () => {
        if (!tripId) return;
        if (!tripData.vehicle_id || !tripData.driver_id) {
            toast({ variant: "destructive", title: "Missing Assignment", description: "Please assign a Vehicle and Driver before activating the trip." });
            return;
        }
        setIsActivating(true);
        try {
            // 1. Update the Trip Sheet Status to Active
            const { error: sheetError } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    status: 'Active',
                    vehicle_id: tripData.vehicle_id,
                    driver_id: tripData.driver_id,
                    trailer_id: tripData.trailer_id || null,
                    activated_by: user?.id,
                    activated_by_name: userProfile?.full_name || user?.email,
                    activated_at: new Date().toISOString()
                })
                .eq('id', tripId);
            if (sheetError) throw sheetError;

            // 2. CREATE THE OFFICIAL TRIP in logistics_trips
            // This makes it show up in the "Trip Management" (Planned) column.
            const tripFormattedData = {
                vehicle_id: tripData.vehicle_id,
                driver_id: tripData.driver_id,
                trailer_id: tripData.trailer_id || null,
                origin: tripData.origin,
                destination: tripData.destination,
                cargo_outbound: tripData.cargo_outbound,
                notes: tripData.notes,
                status: 'Planned', // Becomes Planned in the main board
                trip_sheet_id: tripId, // Link them
                fuel_liters: parseFloat(revenueData.fuel_liters) || 0,
                trip_allowance: totals.totalExpensesTZS, // Use the TZS subtotal for allowance
                created_by: user?.id // Track who activated/created this operational record
            };

            const { error: tripError } = await supabase
                .from('logistics_trips' as any)
                .insert([tripFormattedData]);

            if (tripError) {
                console.warn("Trip created in logistics_trips but failed to link correctly:", tripError.message);
                // We don't throw here to avoid Rollback confusion, but we notify.
            }

            setCurrentStatus('Active');
            setAuditTrail(prev => ({
                ...prev,
                activated_by_name: userProfile?.full_name || user?.email,
                activated_at: new Date().toISOString()
            }));
            toast({ title: "Trip Activated 🚛", description: "The plan is now an active trip in Trip Management." });
            if (onSaveSuccess) onSaveSuccess();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Activation Failed", description: error.message });
        } finally {
            setIsActivating(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Planned':
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Unapproved Draft</Badge>;
            case 'Approved':
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Budget Approved</Badge>;
            case 'Active':
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Trip Active</Badge>;
            case 'Completed':
                return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Completed</Badge>;
            default:
                return null;
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-400">Loading Trip Financials...</div>;

    const renderExpenseSection = (title: string, category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed', icon: any) => {
        const filteredExpenses = expenses
            .map((e, i) => ({ ...e, originalIndex: i }))
            .filter(e => e.category === category);

        const Icon = icon;

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${category === 'TZ' ? 'bg-blue-100 text-blue-600' : category === 'Zambia' ? 'bg-green-100 text-green-600' : category === 'DRC' ? 'bg-yellow-100 text-yellow-600' : 'bg-orange-100 text-orange-600'}`}>
                            <Icon size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight">{title}</h3>
                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none mt-1">
                                Sub-total: <span className="text-primary">${(totals.categoryTotals[category]?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                <span className="mx-1 opacity-20">|</span>
                                <span className="text-slate-500">{(totals.categoryTotals[category]?.tzs || 0).toLocaleString()} TSh</span>
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => addExpense(category)} className="text-primary hover:text-primary/80 print:hidden" disabled={isLocked}>
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
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="w-32">
                                <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                                    Amount ({item.currency})
                                    {item.currency === 'USD' && category === 'TZ' && (
                                        <span className="ml-1 text-emerald-600 font-bold italic">
                                            (~ {((parseFloat(item.amount) || 0) * (parseFloat(revenueData.exchange_rate) || 2700)).toLocaleString()} TSh)
                                        </span>
                                    )}
                                    {item.currency === 'TZS' && (
                                        <span className="ml-1 text-primary font-bold">
                                            (${((parseFloat(item.amount) || 0) / (parseFloat(revenueData.exchange_rate) || 2700)).toFixed(2)})
                                        </span>
                                    )}
                                </Label>
                                <Input
                                    className="h-9"
                                    type="number"
                                    placeholder="0"
                                    value={item.amount}
                                    onChange={(e) => updateExpense(item.originalIndex, 'amount', e.target.value)}
                                    disabled={isLocked}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:bg-destructive/10 print:hidden"
                                onClick={() => removeExpense(item.originalIndex)}
                                disabled={isLocked}
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
        <div id="print-logistics" className="space-y-8 max-w-5xl mx-auto pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* 📄 Header for Printing Only */}
            <div className="hidden print:block p-10 border-b-4 border-slate-900 mb-10 bg-white">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-5xl font-black uppercase tracking-tighter text-slate-900">Pro-Forma Trip Budget</h1>
                        <div className="flex gap-8 mt-4">
                            <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Date: {new Date().toLocaleDateString()}</p>
                            <p className="text-sm font-black text-primary uppercase tracking-widest">Rate: $1 = {revenueData.exchange_rate} TSh</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-black text-slate-900">{tripData.vehicle_id ? (fleet.find(f => f.id === tripData.vehicle_id)?.vehicle_no) : 'N/A'}</div>
                        <div className="flex flex-col items-end mt-2">
                            <p className="text-lg font-bold uppercase tracking-widest text-slate-700">{tripData.destination || 'Unplanned Route'}</p>
                            <Badge variant="outline" className="text-xs px-4 py-1.5 mt-3 border-slate-900 text-slate-900 font-black rounded-none border-2">
                                Official Budget Plan • SudPESA Logistics
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            {/* 📊 Financial Summary Bar (Stays on screen, hidden in print) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden sticky top-0 z-40 bg-slate-50/80 backdrop-blur-md p-4 rounded-2xl border shadow-lg">
                <div className="bg-white p-4 rounded-xl border shadow-sm col-span-1 md:col-span-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Exchange Rate</p>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 font-bold">$1 = </span>
                        <Input
                            className="pl-14 h-9 border-none bg-slate-100 font-bold text-slate-900 focus-visible:ring-1 ring-primary"
                            type="number"
                            value={revenueData.exchange_rate}
                            onChange={(e) => setRevenueData({ ...revenueData, exchange_rate: e.target.value })}
                            disabled={isLocked}
                        />
                    </div>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl shadow-xl col-span-1 md:col-span-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gross Revenue</p>
                    <div className="flex items-center gap-2">
                        <Select
                            value={revenueData.revenue_currency}
                            onValueChange={(v: any) => setRevenueData({ ...revenueData, revenue_currency: v })}
                            disabled={isLocked}
                        >
                            <SelectTrigger className="w-20 h-9 bg-slate-800 border-none text-white text-xs font-bold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[100]">
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="TZS">TZS</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            className="h-9 border-none bg-slate-800 text-white font-black text-lg focus-visible:ring-1 ring-primary"
                            type="number"
                            value={revenueData.revenue_amount}
                            onChange={(e) => setRevenueData({ ...revenueData, revenue_amount: e.target.value })}
                            disabled={isLocked}
                        />
                    </div>
                </div>
                <div className="bg-orange-500 p-4 rounded-xl shadow-lg col-span-1 md:col-span-1">
                    <p className="text-[10px] font-bold text-orange-100 uppercase tracking-wider mb-1 text-right">Total Operational Cost</p>
                    <div className="text-right">
                        <p className="text-xl font-black text-white">${totals.totalExpensesUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        <p className="text-[9px] text-orange-100 font-bold uppercase tracking-tighter">Approx. {totals.totalExpensesTZS.toLocaleString()} TSh</p>
                    </div>
                </div>
                <div className="bg-emerald-500 p-4 rounded-xl shadow-lg col-span-1 md:col-span-1">
                    <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-wider mb-1 text-right">Expected Net Profit</p>
                    <div className="text-right">
                        <p className={`text-2xl font-black text-white ${totals.netProfitUSD < 0 ? 'text-red-100' : ''}`}>
                            ${totals.netProfitUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[9px] text-emerald-100 font-bold uppercase tracking-tighter">
                            {totals.netProfitUSD >= 0 ? 'Surplus Expected' : 'Deficit Projected'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 🔒 Locking Badge Indicator */}
            {isLocked && (
                <div className="sticky top-0 z-50 bg-amber-500 text-white text-[10px] font-bold py-1 px-4 flex items-center justify-center gap-2 rounded-t-lg -mx-6 -mt-6">
                    <ShieldCheck size={14} />
                    READ-ONLY MODE: Budget is locked after Superadmin Approval. For accountability, no more changes are allowed.
                </div>
            )}

            {/* 🕰 Audit Trail Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 border-dashed mb-4">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Created By</span>
                    <span className="text-[11px] font-bold text-slate-700">
                        {auditTrail.created_by_name || "Unknown"}
                        {auditTrail.created_at && <span className="ml-1 text-slate-400 font-normal">on {new Date(auditTrail.created_at).toLocaleDateString()}</span>}
                    </span>
                </div>
                {auditTrail.approved_by_name && (
                    <div className="flex flex-col border-l border-slate-200 pl-4">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Approved By</span>
                        <span className="text-[11px] font-bold text-blue-700">
                            {auditTrail.approved_by_name}
                            {auditTrail.approved_at && <span className="ml-1 text-slate-400 font-normal">on {new Date(auditTrail.approved_at).toLocaleDateString()}</span>}
                        </span>
                    </div>
                )}
                {auditTrail.activated_by_name && (
                    <div className="flex flex-col border-l border-slate-200 pl-4">
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Activated By</span>
                        <span className="text-[11px] font-bold text-emerald-700">
                            {auditTrail.activated_by_name}
                            {auditTrail.activated_at && <span className="ml-1 text-slate-400 font-normal">on {new Date(auditTrail.activated_at).toLocaleDateString()}</span>}
                        </span>
                    </div>
                )}
            </div>
            {/* 📍 Section 1: Asset Assignment & Route Details */}
            <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900">
                <CardHeader className="bg-slate-50/80 border-b border-slate-200 py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                    <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary print:hidden">
                            <Navigation size={18} />
                        </div>
                        1. Asset Assignment & Route Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vehicle (Horse)</Label>
                                    <Select
                                        value={tripData.vehicle_id}
                                        onValueChange={(v) => {
                                            const selectedHorse = fleet.find(f => f.id === v);
                                            setTripData({
                                                ...tripData,
                                                vehicle_id: v,
                                                trailer_id: selectedHorse?.primary_trailer_id || tripData.trailer_id
                                            });
                                        }}
                                        disabled={isLocked}
                                    >
                                        <SelectTrigger className="h-11 bg-slate-50 border-slate-200 shadow-sm print:h-8 print:border-none print:p-0">
                                            <SelectValue placeholder="Select Horse" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[100]">
                                            {fleet.filter(f => f.asset_type === 'Truck' || f.asset_type === 'Horse').map(v => (
                                                <SelectItem key={v.id} value={v.id}>{v.vehicle_no} - {v.make_model}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Trailer</Label>
                                    <Select
                                        value={tripData.trailer_id}
                                        onValueChange={(v) => setTripData({ ...tripData, trailer_id: v })}
                                        disabled={isLocked}
                                    >
                                        <SelectTrigger className="h-11 bg-slate-50 border-slate-200 shadow-sm print:h-8 print:border-none print:p-0">
                                            <SelectValue placeholder="Select Trailer" />
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
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assigned Driver</Label>
                                <Select
                                    value={tripData.driver_id}
                                    onValueChange={(v) => setTripData({ ...tripData, driver_id: v })}
                                    disabled={isLocked}
                                >
                                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 shadow-sm print:h-8 print:border-none print:p-0">
                                        <SelectValue placeholder="Assign Driver" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[100]">
                                        {drivers.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Journey Type</Label>
                                <Select
                                    value={tripData.journey_type}
                                    onValueChange={(v) => setTripData({ ...tripData, journey_type: v })}
                                    disabled={isLocked}
                                >
                                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200 shadow-sm print:h-8 print:border-none print:p-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[100]">
                                        <SelectItem value="Go & Return">Go & Return (Full Cycle)</SelectItem>
                                        <SelectItem value="Go Only">Go Only (Return Empty)</SelectItem>
                                        <SelectItem value="One Way">One Way (Direct Delivery)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Route Origin</Label>
                                    <Input
                                        className="h-11 bg-slate-50 border-slate-200 shadow-sm print:border-none print:p-0"
                                        value={tripData.origin}
                                        onChange={(e) => setTripData({ ...tripData, origin: e.target.value })}
                                        disabled={isLocked}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Route Destination</Label>
                                    <Input
                                        className="h-11 bg-slate-50 border-slate-200 shadow-sm print:border-none print:p-0"
                                        value={tripData.destination}
                                        onChange={(e) => setTripData({ ...tripData, destination: e.target.value })}
                                        placeholder="Enter Destination"
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cargo Description</Label>
                                <Input
                                    className="h-11 bg-slate-50 border-slate-200 shadow-sm print:border-none print:p-0"
                                    value={tripData.cargo_outbound}
                                    onChange={(e) => setTripData({ ...tripData, cargo_outbound: e.target.value })}
                                    placeholder="e.g. 30 Tons of Copper Ore"
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operational Notes</Label>
                                <textarea
                                    className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm h-24 resize-none print:border-none print:p-0"
                                    value={tripData.notes}
                                    onChange={(e) => setTripData({ ...tripData, notes: e.target.value })}
                                    disabled={isLocked}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-6 mt-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Agreed Duration (Days)</Label>
                                    <Input
                                        className="h-11 bg-slate-50 border-slate-200 shadow-sm print:border-none print:p-0"
                                        type="number"
                                        placeholder="e.g. 5"
                                        value={tripData.agreed_days}
                                        onChange={(e) => setTripData({ ...tripData, agreed_days: e.target.value })}
                                        disabled={isLocked}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Daily Penalty Fine (USD)</Label>
                                    <div className="relative">
                                        <DollarSign size={14} className="absolute left-3 top-3.5 text-slate-400" />
                                        <Input
                                            className="pl-8 h-11 bg-slate-50 border-slate-200 shadow-sm print:border-none print:p-0"
                                            type="number"
                                            placeholder="e.g. 100"
                                            value={tripData.daily_fine_amount}
                                            onChange={(e) => setTripData({ ...tripData, daily_fine_amount: e.target.value })}
                                            disabled={isLocked}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ⛽ Section 2: Fuel Allocation & Logic Calculator */}
            <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                <CardHeader className="bg-orange-50/80 border-b border-orange-100 py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                    <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-orange-800 flex items-center gap-3">
                        <div className="p-2 bg-orange-200/50 rounded-lg text-orange-700 print:hidden">
                            <Fuel size={18} />
                        </div>
                        2. Fuel Allocation & Logic Calculator
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fuel Liters (Qty)</Label>
                            <div className="relative">
                                <Fuel size={14} className="absolute left-3 top-3.5 text-slate-400" />
                                <Input
                                    className="pl-10 h-12 bg-slate-50 border-slate-200 font-black text-lg focus-visible:ring-1 ring-orange-500"
                                    type="number"
                                    placeholder="e.g. 2575"
                                    value={revenueData.fuel_liters}
                                    onChange={(e) => setRevenueData({ ...revenueData, fuel_liters: e.target.value })}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Price Per Liter (TSh)</Label>
                            <div className="relative">
                                <DollarSign size={14} className="absolute left-3 top-3.5 text-slate-400" />
                                <Input
                                    className="pl-10 h-12 bg-slate-50 border-slate-200 font-black text-lg focus-visible:ring-1 ring-orange-500"
                                    type="number"
                                    placeholder="e.g. 2780"
                                    value={revenueData.fuel_price}
                                    onChange={(e) => setRevenueData({ ...revenueData, fuel_price: e.target.value })}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-orange-200 flex flex-col items-end justify-center h-24">
                            <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-1">Calculated Fuel Total</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">
                                    {(parseFloat(revenueData.fuel_liters) * parseFloat(revenueData.fuel_price) || 0).toLocaleString()} TZS
                                </span>
                                <span className="text-sm font-bold text-slate-400">
                                    Approx. ${((parseFloat(revenueData.fuel_liters) * parseFloat(revenueData.fuel_price) || 0) / (parseFloat(revenueData.exchange_rate) || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>
                    </div>
                    {/* Fuel Budget Toggle — moved from header into body */}
                    <div className="mt-6 pt-6 border-t border-orange-100 flex items-center justify-between print:hidden">
                        <div>
                            <p className="text-sm font-black text-slate-700">Include Fuel Cost in Trip Budget?</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                When <span className="font-bold text-orange-600">included</span>, fuel cost is deducted from profit. When <span className="font-bold text-slate-500">excluded</span>, client covers fuel separately.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge
                                variant={revenueData.revenue_type === 'With Fuel' ? 'default' : 'outline'}
                                className={`cursor-pointer text-sm px-4 py-1.5 transition-all ${revenueData.revenue_type === 'With Fuel' ? 'bg-orange-600 hover:bg-orange-700 border-orange-600' : 'hover:bg-orange-50'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => !isLocked && setRevenueData({ ...revenueData, revenue_type: 'With Fuel' })}
                            >
                                ✓ Include in Budget
                            </Badge>
                            <Badge
                                variant={revenueData.revenue_type === 'Without Fuel' ? 'default' : 'outline'}
                                className={`cursor-pointer text-sm px-4 py-1.5 transition-all ${revenueData.revenue_type === 'Without Fuel' ? 'bg-slate-700 hover:bg-slate-800 border-slate-700 text-white' : 'hover:bg-slate-50'}`}
                                onClick={() => setRevenueData({ ...revenueData, revenue_type: 'Without Fuel' })}
                            >
                                Exclude from Budget
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 🌍 Section 3: Regional Expense Breakdown */}
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200 print:hidden mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                    <Globe size={12} />
                    Regional Scope: Select countries involved in this journey
                </p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'TZ', name: 'Tanzania' },
                        { id: 'Zambia', name: 'Zambia' },
                        { id: 'DRC', name: 'DR Congo' },
                        { id: 'Rwanda', name: 'Rwanda' },
                        { id: 'Burundi', name: 'Burundi' }
                    ].map(country => (
                        <Badge
                            key={country.id}
                            variant={activeCountries.includes(country.id) ? 'default' : 'outline'}
                            className={`cursor-pointer px-4 py-2 text-xs transition-all ${activeCountries.includes(country.id) ? 'bg-slate-900' : 'hover:bg-slate-100'}`}
                            onClick={() => {
                                if (isLocked) return;
                                if (activeCountries.includes(country.id)) {
                                    // Don't remove if it's the last one? Or just allow it.
                                    setActiveCountries(prev => prev.filter(c => c !== country.id));
                                } else {
                                    setActiveCountries(prev => [...prev, country.id]);
                                }
                            }}
                        >
                            {country.name}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:block print:space-y-8">
                {activeCountries.includes('TZ') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                        <CardHeader className="bg-blue-50/50 border-b py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-between text-blue-900">
                                <span>Tanzania Operations</span>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="text-slate-400">SUBTOTAL:</span>
                                    <span className="text-blue-700 font-black">${(totals.categoryTotals['TZ']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Tanzania Operations", "TZ", MapPin)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('Zambia') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                        <CardHeader className="bg-green-50/50 border-b py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-between text-green-900">
                                <span>Zambia Operations</span>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="text-slate-400">SUBTOTAL:</span>
                                    <span className="text-green-700 font-black">${(totals.categoryTotals['Zambia']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Zambia Operations", "Zambia", Globe)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('DRC') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                        <CardHeader className="bg-yellow-50/50 border-b py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-between text-yellow-900">
                                <span>DR Congo Operations</span>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="text-slate-400">SUBTOTAL:</span>
                                    <span className="text-yellow-700 font-black">${(totals.categoryTotals['DRC']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("DR Congo Operations", "DRC", MapPin)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('Rwanda') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                        <CardHeader className="bg-purple-50/50 border-b py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-between text-purple-900">
                                <span>Rwanda Operations</span>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="text-slate-400">SUBTOTAL:</span>
                                    <span className="text-purple-700 font-black">${(totals.categoryTotals['Rwanda']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Rwanda Operations", "Rwanda", Navigation)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('Burundi') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                        <CardHeader className="bg-rose-50/50 border-b py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-between text-rose-900">
                                <span>Burundi Operations</span>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="text-slate-400">SUBTOTAL:</span>
                                    <span className="text-rose-700 font-black">${(totals.categoryTotals['Burundi']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Burundi Operations", "Burundi", Navigation)}
                        </CardContent>
                    </Card>
                )}

                <Card className="border-none shadow-xl bg-slate-50 overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                    <CardHeader className="bg-slate-200/50 border-b py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-between text-slate-800">
                            <span>Fixed Expenses</span>
                            <div className="flex gap-2 text-[10px]">
                                <span className="text-slate-400">SUBTOTAL:</span>
                                <span className="text-slate-900 font-black">${(totals.categoryTotals['Fixed']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        {renderExpenseSection("Fixed Expenses", "Fixed", Calculator)}
                    </CardContent>
                </Card>
            </div>

            {/* 🏆 Final Signature & Summary Footer */}
            <div className="mt-12 bg-slate-900 p-12 rounded-3xl shadow-2xl text-white print:bg-white print:text-black print:border-t-4 print:border-slate-900 print:shadow-none print:rounded-none break-inside-avoid">
                <div className="flex flex-col md:flex-row justify-between gap-12">
                    <div className="space-y-10 flex-1">
                        <div className="grid grid-cols-2 gap-x-20 max-w-lg">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gross Trip Revenue</p>
                                <p className="text-2xl font-black">${revenueData.revenue_currency === 'USD' ? parseFloat(revenueData.revenue_amount || '0').toLocaleString() : (parseFloat(revenueData.revenue_amount || '0') / (parseFloat(revenueData.exchange_rate) || 2700)).toLocaleString()}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cumulative Costs</p>
                                <p className="text-2xl font-black text-orange-400">${totals.totalExpensesUSD.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="pt-10 border-t border-slate-800 print:border-slate-900 space-y-4">
                            <div className="h-16 w-80 border-b-2 border-slate-700 border-dashed print:border-slate-900"></div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">AUTHORIZED BUDGET OFFICER SIGNATURE</p>
                        </div>
                    </div>
                    <div className="bg-white/5 p-10 rounded-2xl text-right md:w-80 flex flex-col justify-center print:bg-slate-50 print:border-2 print:border-slate-900">
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 mb-4">PROJECTED NET PROFIT</p>
                        <div className={`text-6xl font-black ${totals.netProfitUSD < 0 ? 'text-red-400' : 'text-emerald-400 print:text-emerald-700'}`}>
                            ${totals.netProfitUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className={`text-sm font-bold opacity-80 ${totals.netProfitUSD < 0 ? 'text-red-300' : 'text-emerald-300 print:text-emerald-600'} mt-1`}>
                            {(totals.netProfitUSD * (parseFloat(revenueData.exchange_rate) || 2700)).toLocaleString()} TSh
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-tighter">Budget valid for current exchange rate</p>
                    </div>
                </div>
            </div>

            {/* 💾 Actions Floating Footer (Sticky bottom) */}
            <div className="sticky bottom-6 flex flex-col md:flex-row items-center justify-end gap-3 p-4 bg-white/60 backdrop-blur-xl rounded-2xl shadow-2xl border ring-1 ring-slate-200 z-50 animate-in slide-in-from-bottom-8 duration-1000 print:hidden mx-4 md:mx-auto">
                <Button
                    variant="ghost"
                    size="lg"
                    className="font-bold text-slate-500 hover:text-slate-950 w-full md:w-auto h-12 order-last md:order-first"
                    onClick={() => {
                        if (confirm("Are you sure? Unsaved changes will be lost.")) {
                            if (onSaveSuccess) onSaveSuccess();
                        }
                    }}
                >
                    Cancel Edit
                </Button>

                <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    <Button
                        variant="outline"
                        size="lg"
                        className="font-black border-2 border-slate-900 hover:bg-slate-900 hover:text-white transition-all px-8 h-12 rounded-xl w-full md:w-auto"
                        onClick={() => window.print()}
                        disabled={isSaving}
                    >
                        <FileText size={20} className="mr-2" />
                        Print Budget Report
                    </Button>

                    {/* Superadmin: Approve Budget (only visible when status is Planned) */}
                    {isSuperAdmin && tripId && currentStatus === 'Planned' && (
                        <Button
                            size="lg"
                            className="font-black bg-blue-600 hover:bg-blue-700 text-white px-10 h-12 rounded-xl shadow-xl active:scale-95 transition-all w-full md:w-auto"
                            onClick={handleApprove}
                            disabled={isApproving}
                        >
                            <ShieldCheck size={20} className="mr-2" />
                            {isApproving ? "Approving..." : "Approve Budget"}
                        </Button>
                    )}

                    {/* Manager: Activate Trip (only visible when status is Approved) */}
                    {isManager && tripId && currentStatus === 'Approved' && (
                        <Button
                            size="lg"
                            className="font-black bg-emerald-600 hover:bg-emerald-700 text-white px-10 h-12 rounded-xl shadow-xl active:scale-95 transition-all w-full md:w-auto"
                            onClick={handleActivate}
                            disabled={isActivating}
                        >
                            <Zap size={20} className="mr-2" />
                            {isActivating ? "Activating..." : "Activate Trip"}
                        </Button>
                    )}

                    {/* Save Plan (always visible unless Active/Completed) */}
                    {currentStatus !== 'Active' && currentStatus !== 'Completed' && (
                        <Button
                            size="lg"
                            className="font-black bg-primary hover:bg-primary/90 text-white px-8 md:px-12 h-12 rounded-xl shadow-xl active:scale-95 transition-all w-full md:w-auto"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? "Finalizing..." : "Commit & Save Plan"}
                            {!isSaving && <Save size={20} className="ml-2" />}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

