import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { 
    Route, 
    DollarSign, 
    Plus, 
    Trash2, 
    Edit, 
    Search, 
    ArrowRight, 
    Layers, 
    MapPin,
    Globe,
    RefreshCw,
    FileText,
    TrendingUp,
    Check,
    ChevronsUpDown
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Country config matching TripSheet exactly
const COUNTRY_SECTIONS = [
    { id: "TZ", name: "Tanzania Operations", color: "blue", defaultCurrency: "TZS" },
    { id: "Zambia", name: "Zambia Operations", color: "green", defaultCurrency: "ZMW" },
    { id: "DRC", name: "DR Congo Operations", color: "yellow", defaultCurrency: "USD" },
    { id: "Rwanda", name: "Rwanda Operations", color: "purple", defaultCurrency: "RWF" },
    { id: "Burundi", name: "Burundi Operations", color: "orange", defaultCurrency: "BIF" },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badgeBg: string; badgeText: string; headerBg: string }> = {
    blue: { bg: "bg-blue-50/60", border: "border-blue-100", text: "text-blue-900", badgeBg: "bg-blue-100", badgeText: "text-blue-800", headerBg: "bg-blue-50/60" },
    green: { bg: "bg-green-50/60", border: "border-green-100", text: "text-green-900", badgeBg: "bg-green-100", badgeText: "text-green-800", headerBg: "bg-green-50/60" },
    yellow: { bg: "bg-yellow-50/60", border: "border-yellow-100", text: "text-yellow-900", badgeBg: "bg-yellow-100", badgeText: "text-yellow-800", headerBg: "bg-yellow-50/60" },
    purple: { bg: "bg-purple-50/60", border: "border-purple-100", text: "text-purple-900", badgeBg: "bg-purple-100", badgeText: "text-purple-800", headerBg: "bg-purple-50/60" },
    orange: { bg: "bg-orange-50/60", border: "border-orange-100", text: "text-orange-900", badgeBg: "bg-orange-100", badgeText: "text-orange-800", headerBg: "bg-orange-50/60" },
};

const formatWithCommas = (val: string | number) => {
    if (val === undefined || val === null || val === '') return '';
    const numStr = val.toString().replace(/,/g, '');
    if (numStr === '-' || numStr === '') return numStr;
    const parts = numStr.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join('.');
};

function ExpenseCombobox({ 
    value, 
    onChange, 
    items 
}: { 
    value: string; 
    onChange: (val: string) => void; 
    items: any[]; 
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full h-8 justify-between bg-slate-50/80 border-slate-200 hover:bg-slate-100 font-semibold text-xs text-slate-800",
                        !value && "text-slate-400 font-normal"
                    )}
                >
                    <span className="truncate">{value || "Search or select expense..."}</span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 z-[9999]" align="start">
                <Command>
                    <CommandInput placeholder="Search expense item..." className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty className="p-2 text-xs text-center text-slate-500">
                            No match. Press Enter to use typed text.
                        </CommandEmpty>
                        <CommandGroup className="max-h-[260px] overflow-auto">
                            {items.map((expItem) => (
                                <CommandItem
                                    key={expItem.id}
                                    value={expItem.item_name}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue);
                                        setOpen(false);
                                    }}
                                    className="text-xs cursor-pointer py-1.5"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3.5 w-3.5 text-indigo-600",
                                            value === expItem.item_name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {expItem.item_name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export default function MasterCollection() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { userRole } = useAuth();
    const isSuperAdmin = userRole === "super_admin";

    const [activeTab, setActiveTab] = useState<"routes" | "expenses">("routes");
    const [searchTerm, setSearchTerm] = useState("");

    // Selected Route for Expense Master tab
    const [selectedRouteKey, setSelectedRouteKey] = useState<string>("");

    // Route Modal State
    const [isAddRouteOpen, setIsAddRouteOpen] = useState(false);
    const [editingRoute, setEditingRoute] = useState<any>(null);
    const [routeForm, setRouteForm] = useState({
        origin: "DAR ES SALAAM",
        destination: "",
        default_rate_usd: "",
        default_exchange_rate: "2700",
        default_cargo: "",
        agreed_days: "",
        notes: ""
    });

    // Fetch Real Destinations from logistics_routes DB table
    const { data: dbRoutes = [] } = useQuery({
        queryKey: ["logistics_routes_master_collection"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_routes" as any)
                .select("*")
                .eq("is_active", true)
                .order("location_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Pre-entered Expense Items from logistics_expense_items table (matching TripSheet)
    const { data: expenseItemsList = [] } = useQuery({
        queryKey: ["logistics-expense-items-for-master"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_expense_items" as any)
                .select("*")
                .order("item_name", { ascending: true });
            if (error) return [];
            return data || [];
        }
    });

    // Local Storage based sync for Route Master table
    const [customRoutes, setCustomRoutes] = useState<any[]>(() => {
        try {
            const saved = localStorage.getItem("master_collection_routes");
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.warn("Failed to load local saved routes", e);
        }
        return [];
    });

    // Save custom routes helper
    const persistRoutes = (routes: any[]) => {
        setCustomRoutes(routes);
        localStorage.setItem("master_collection_routes", JSON.stringify(routes));
    };

    // Exchange rates for standard currency conversions (identical to TripSheet)
    const [countryRates, setCountryRates] = useState<Record<string, number>>(() => {
        try {
            const savedRates = localStorage.getItem('latest_market_rates');
            if (savedRates) {
                const parsed = JSON.parse(savedRates);
                if (Object.keys(parsed).length > 0) {
                    return {
                        "TZ": parsed["TZ"] || 2700,
                        "Zambia": parsed["Zambia"] || 100,
                        "DRC": parsed["DRC"] || 1.0,
                        "Rwanda": parsed["Rwanda"] || 2,
                        "Burundi": parsed["Burundi"] || 1,
                        ...parsed
                    };
                }
            }
        } catch (e) {
            console.warn("Could not load latest_market_rates in MasterCollection");
        }
        return {
            "TZ": 2700,
            "Zambia": 100,
            "DRC": 1.0,
            "Rwanda": 2,
            "Burundi": 1
        };
    });

    const updateRate = (country: string, val: string) => {
        const num = parseFloat(val) || 0;
        setCountryRates(prev => {
            const updated = { ...prev, [country]: num };
            try {
                localStorage.setItem('latest_market_rates', JSON.stringify(updated));
            } catch (e) {}
            return updated;
        });
    };

    // Expenses Master State (per destination)
    const [masterExpenses, setMasterExpenses] = useState<Record<string, any[]>>(() => {
        try {
            const saved = localStorage.getItem("master_collection_route_expenses");
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.warn("Failed to load local saved expenses master", e);
        }
        return {};
    });

    const persistExpenses = (expensesMap: Record<string, any[]>) => {
        setMasterExpenses(expensesMap);
        localStorage.setItem("master_collection_route_expenses", JSON.stringify(expensesMap));
    };

    // Active Countries for the selected route (so we only show active ones by default!)
    const [activeCountries, setActiveCountries] = useState<string[]>(['TZ', 'Zambia']);

    const toggleCountry = (countryId: string) => {
        setActiveCountries(prev => 
            prev.includes(countryId)
                ? prev.filter(c => c !== countryId)
                : [...prev, countryId]
        );
    };

    // Fetch Real Destinations from logistics_trip_sheets (distinct destinations used in actual trips)
    const { data: recentTripSheets = [] } = useQuery({
        queryKey: ["logistics_recent_trip_sheets_for_master"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("id, reference_number, invoice_no, destination, origin, created_at")
                .order("created_at", { ascending: false })
                .limit(100);
            if (error) return [];
            return data || [];
        }
    });

    const tripSheetDestinations = (recentTripSheets as any[])
        .map((t: any) => t.destination?.trim().toUpperCase())
        .filter(Boolean);

    // Build the full unique destinations list by merging DB routes + trip sheet destinations + custom routes
    const allDestinations: string[] = (() => {
        const fromDb = (dbRoutes as any[]).map((r: any) => r.location_name?.trim().toUpperCase()).filter(Boolean);
        const fromTrips = tripSheetDestinations;
        const fromCustom = customRoutes.map((r: any) => r.destination?.trim().toUpperCase()).filter(Boolean);
        return [...new Set([...fromDb, ...fromTrips, ...fromCustom])].sort();
    })();

    // Helper: auto-fetch expenses from latest real trip sheet for a destination
    const [isLoadingTripTemplate, setIsLoadingTripTemplate] = useState(false);
    const [manualTripSearch, setManualTripSearch] = useState("");

    // Directly load expenses from a specific trip sheet ID
    const loadExpensesFromTripId = async (targetTripSheet: any, targetDestination?: string) => {
        const dest = targetDestination || selectedRouteKey || targetTripSheet.destination?.trim().toUpperCase();
        if (!dest) {
            toast({ variant: "destructive", title: "Select Destination First", description: "Please choose which destination this template belongs to." });
            return;
        }

        setIsLoadingTripTemplate(true);
        try {
            const { data: tripExpenses, error } = await supabase
                .from("logistics_trip_expenses" as any)
                .select("*")
                .eq("trip_sheet_id", targetTripSheet.id)
                .eq("is_extra", false);

            if (error) throw error;

            if (tripExpenses && tripExpenses.length > 0) {
                const mapped = tripExpenses.map((e: any, idx: number) => ({
                    id: `trip-exp-${Date.now()}-${idx}`,
                    item_name: e.item_name,
                    category: e.category || "TZ",
                    amount: String(e.amount || "0"),
                    currency: e.currency || (e.category === "TZ" ? "TZS" : e.category === "Zambia" ? "ZMW" : "USD"),
                    nature: e.nature || "Go & Return"
                }));

                const updatedMap = {
                    ...masterExpenses,
                    [dest]: mapped
                };
                persistExpenses(updatedMap);
                setSelectedRouteKey(dest);

                // Auto-set active countries based on what is in the loaded trip sheet!
                const activeCats = [...new Set(mapped.map((e: any) => e.category))];
                if (activeCats.length > 0) {
                    setActiveCountries(activeCats);
                }

                toast({
                    title: "Trip Expenses Imported!",
                    description: `Successfully loaded ${mapped.length} line items from ${targetTripSheet.reference_number || targetTripSheet.invoice_no || "trip sheet"} into ${dest}.`
                });
            } else {
                toast({
                    title: "No Expenses Found",
                    description: `Trip sheet ${targetTripSheet.reference_number || targetTripSheet.invoice_no} has no recorded expense items.`
                });
            }
        } catch (err: any) {
            console.error("Failed to load trip expenses by trip ID:", err);
            toast({ variant: "destructive", title: "Import Failed", description: err.message });
        } finally {
            setIsLoadingTripTemplate(false);
        }
    };

    const loadExpensesForDestination = async (destinationName: string, forcePull = false) => {
        setSelectedRouteKey(destinationName);
        if (!destinationName) return;

        // If this destination already has saved expenses in masterExpenses and not force pulling, keep it
        if (!forcePull && masterExpenses[destinationName] && masterExpenses[destinationName].length > 0) {
            return;
        }

        setIsLoadingTripTemplate(true);
        try {
            // 1. Try exact match on reference_number or destination
            let { data: previousTrip } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("id, reference_number, destination")
                .ilike("destination", destinationName.trim())
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            // 2. If not found by exact string, search if destination contains the keyword (e.g. Chambishi)
            if (!previousTrip?.id) {
                const keyword = destinationName.trim().split("/")[0].trim();
                const { data: fuzzyTrip } = await supabase
                    .from("logistics_trip_sheets" as any)
                    .select("id, reference_number, destination")
                    .ilike("destination", `%${keyword}%`)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                previousTrip = fuzzyTrip;
            }

            if (previousTrip?.id) {
                await loadExpensesFromTripId(previousTrip, destinationName);
            } else {
                toast({
                    title: "No Automatic Match Found",
                    description: `Could not auto-find trip sheet named "${destinationName}". Use the 'Search by Trip #' tool above to select ${destinationName}'s exact trip.`
                });
            }
        } catch (err: any) {
            console.error("Failed to load previous trip expenses for master:", err);
            toast({
                variant: "destructive",
                title: "Error Loading Expenses",
                description: err.message
            });
        } finally {
            setIsLoadingTripTemplate(false);
        }
    };

    // Add / Edit Route Form Handlers
    const handleSaveRoute = () => {
        if (!routeForm.destination.trim()) {
            toast({ variant: "destructive", title: "Destination Required", description: "Please specify destination location." });
            return;
        }

        const normalizedDest = routeForm.destination.trim().toUpperCase();

        if (editingRoute) {
            const updated = customRoutes.map(r => r.id === editingRoute.id ? {
                ...r,
                origin: routeForm.origin.trim().toUpperCase(),
                destination: normalizedDest,
                default_rate_usd: routeForm.default_rate_usd ? parseFloat(routeForm.default_rate_usd) : null,
                default_exchange_rate: parseFloat(routeForm.default_exchange_rate) || 2700,
                default_cargo: routeForm.default_cargo.trim() || null,
                agreed_days: routeForm.agreed_days ? parseInt(routeForm.agreed_days) : null,
                notes: routeForm.notes.trim()
            } : r);
            persistRoutes(updated);
            toast({ title: "Route Updated", description: `Updated route: ${normalizedDest}` });
        } else {
            // Check if already exists
            const exists = customRoutes.some(r => r.destination?.toUpperCase() === normalizedDest);
            if (exists) {
                toast({ variant: "destructive", title: "Route Already Exists", description: `"${normalizedDest}" is already in your Master Routes.` });
                return;
            }
            const newRoute = {
                id: `route-${Date.now()}`,
                origin: routeForm.origin.trim().toUpperCase(),
                destination: normalizedDest,
                default_rate_usd: routeForm.default_rate_usd ? parseFloat(routeForm.default_rate_usd) : null,
                default_exchange_rate: parseFloat(routeForm.default_exchange_rate) || 2700,
                default_cargo: routeForm.default_cargo.trim() || null,
                agreed_days: routeForm.agreed_days ? parseInt(routeForm.agreed_days) : null,
                notes: routeForm.notes.trim()
            };
            persistRoutes([...customRoutes, newRoute]);
            toast({ title: "Route Saved", description: `Created new master route: ${normalizedDest}` });
        }

        setIsAddRouteOpen(false);
        setEditingRoute(null);
        setRouteForm({
            origin: "DAR ES SALAAM",
            destination: "",
            default_rate_usd: "",
            default_exchange_rate: "2700",
            default_cargo: "",
            agreed_days: "",
            notes: ""
        });
    };

    const handleDeleteRoute = (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete route "${name}" from Master Collection?`)) return;
        const updated = customRoutes.filter(r => r.id !== id);
        persistRoutes(updated);
        toast({ title: "Route Deleted", description: `Removed route: ${name}` });
    };

    // Calculate total expenses for any destination across all categories
    const getRouteTotalExpenses = (destination: string) => {
        const items = masterExpenses[destination] || [];
        if (items.length === 0) return { count: 0, totalUSD: 0, totalTZS: 0 };

        const tzRate = countryRates["TZ"] || 2700;
        const zambiaRate = countryRates["Zambia"] || 100;
        const rwandaRate = countryRates["Rwanda"] || 2;
        const burundiRate = countryRates["Burundi"] || 1;
        const drcRate = countryRates["DRC"] || 1.0;

        let totalTZS = 0;
        let totalUSD = 0;

        items.forEach(item => {
            const inputAmount = parseFloat(item.amount) || 0;
            const category = item.category || 'TZ';
            const effectiveCurrency = (category === 'DRC') ? 'USD' : item.currency;

            if (effectiveCurrency === 'USD') {
                const tzs = inputAmount * tzRate;
                totalTZS += tzs;
                totalUSD += inputAmount;
            } else {
                if (category === 'TZ') {
                    totalTZS += inputAmount;
                    totalUSD += inputAmount / tzRate;
                } else if (category === 'Zambia') {
                    const tzs = inputAmount * zambiaRate;
                    totalTZS += tzs;
                    totalUSD += tzs / tzRate;
                } else if (category === 'DRC') {
                    totalUSD += inputAmount / drcRate;
                    totalTZS += (inputAmount / drcRate) * tzRate;
                } else if (category === 'Rwanda') {
                    const tzs = inputAmount * rwandaRate;
                    totalTZS += tzs;
                    totalUSD += tzs / tzRate;
                } else if (category === 'Burundi') {
                    const tzs = inputAmount * burundiRate;
                    totalTZS += tzs;
                    totalUSD += tzs / tzRate;
                }
            }
        });

        return { count: items.length, totalUSD, totalTZS };
    };

    // Combine all known system destinations into the Master Routes list
    const combinedRoutes = (() => {
        const customMap = new Map<string, any>();
        customRoutes.forEach(r => {
            if (r.destination) {
                customMap.set(r.destination.trim().toUpperCase(), r);
            }
        });

        // Ensure every known system destination is included
        const fullList: any[] = allDestinations.map(dest => {
            const existing = customMap.get(dest);
            if (existing) return existing;
            return {
                id: `auto-dest-${dest}`,
                destination: dest,
                origin: "DAR ES SALAAM",
                default_rate_usd: null,
                default_exchange_rate: 2700,
                default_cargo: null,
                agreed_days: null,
                notes: "",
                isAuto: true
            };
        });

        return fullList;
    })();

    // Filter routes by search term
    const filteredRoutes = combinedRoutes.filter(r => 
        !searchTerm ||
        r.destination?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.origin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.default_cargo && r.default_cargo.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Current route expenses by country section
    const currentRouteExpenses: any[] = masterExpenses[selectedRouteKey] || [];
    const getExpensesByCategory = (catId: string) => currentRouteExpenses.filter(e => e.category === catId);

    // Add expense item inline to the selected route
    const [newExpense, setNewExpense] = useState({
        item_name: "",
        category: "TZ",
        amount: "",
        currency: "TZS",
        nature: "Go & Return"
    });

    const handleAddExpenseItem = () => {
        if (!newExpense.item_name.trim() || !newExpense.amount) {
            toast({ variant: "destructive", title: "Item Name & Amount Required" });
            return;
        }

        const newItem = {
            id: `exp-${Date.now()}`,
            item_name: newExpense.item_name.trim(),
            category: newExpense.category,
            amount: newExpense.amount,
            currency: newExpense.currency,
            nature: newExpense.nature
        };

        const existing = masterExpenses[selectedRouteKey] || [];
        const updatedMap = {
            ...masterExpenses,
            [selectedRouteKey]: [...existing, newItem]
        };

        persistExpenses(updatedMap);
        setNewExpense({
            item_name: "",
            category: newExpense.category,
            amount: "",
            currency: newExpense.currency,
            nature: "Go & Return"
        });
        toast({ title: "Expense Item Added", description: `Added "${newItem.item_name}" to master route.` });
    };

    const handleDeleteExpenseItem = (itemId: string) => {
        const existing = masterExpenses[selectedRouteKey] || [];
        const updated = existing.filter(e => e.id !== itemId);
        persistExpenses({
            ...masterExpenses,
            [selectedRouteKey]: updated
        });
        toast({ title: "Expense Item Removed" });
    };

    const handleUpdateExpenseAmount = (itemId: string, newAmount: string) => {
        const existing = masterExpenses[selectedRouteKey] || [];
        const updated = existing.map(e => e.id === itemId ? { ...e, amount: newAmount } : e);
        persistExpenses({
            ...masterExpenses,
            [selectedRouteKey]: updated
        });
    };

    const handleUpdateExpenseNature = (itemId: string, newNature: string) => {
        const existing = masterExpenses[selectedRouteKey] || [];
        const updated = existing.map(e => e.id === itemId ? { ...e, nature: newNature } : e);
        persistExpenses({
            ...masterExpenses,
            [selectedRouteKey]: updated
        });
    };

    // Calculate Subtotals per category using active exchange rates
    const getCategoryTotals = (category: string) => {
        const items = getExpensesByCategory(category);
        const tzRate = countryRates["TZ"] || 2700;
        const zambiaRate = countryRates["Zambia"] || 100;
        const rwandaRate = countryRates["Rwanda"] || 2;
        const burundiRate = countryRates["Burundi"] || 1;
        const drcRate = countryRates["DRC"] || 1.0;

        let totalTZS = 0;
        let totalUSD = 0;
        let totalLocal = 0;

        items.forEach(item => {
            const inputAmount = parseFloat(item.amount) || 0;
            const effectiveCurrency = (category === 'DRC') ? 'USD' : item.currency;

            if (effectiveCurrency === 'USD') {
                const tzs = inputAmount * tzRate;
                totalTZS += tzs;
                totalUSD += inputAmount;
                totalLocal += (category === 'Zambia' ? tzs / zambiaRate : inputAmount);
            } else {
                if (category === 'TZ') {
                    totalTZS += inputAmount;
                    totalUSD += inputAmount / tzRate;
                    totalLocal += inputAmount;
                } else if (category === 'Zambia') {
                    totalLocal += inputAmount;
                    const tzs = inputAmount * zambiaRate;
                    totalTZS += tzs;
                    totalUSD += tzs / tzRate;
                } else if (category === 'DRC') {
                    totalLocal += inputAmount;
                    totalUSD += inputAmount / drcRate;
                    totalTZS += (inputAmount / drcRate) * tzRate;
                } else if (category === 'Rwanda') {
                    totalLocal += inputAmount;
                    const tzs = inputAmount * rwandaRate;
                    totalTZS += tzs;
                    totalUSD += tzs / tzRate;
                } else if (category === 'Burundi') {
                    totalLocal += inputAmount;
                    const tzs = inputAmount * burundiRate;
                    totalTZS += tzs;
                    totalUSD += tzs / tzRate;
                }
            }
        });

        return { totalTZS, totalUSD, totalLocal };
    };

    const handleAddBlankExpenseItem = (category: string) => {
        if (!selectedRouteKey) return;
        const section = COUNTRY_SECTIONS.find(s => s.id === category);
        const newItem = {
            id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            item_name: "",
            category: category,
            amount: "",
            currency: section?.defaultCurrency || "TZS",
            nature: "Go & Return"
        };
        const existing = masterExpenses[selectedRouteKey] || [];
        persistExpenses({
            ...masterExpenses,
            [selectedRouteKey]: [...existing, newItem]
        });
    };

    const handleUpdateExpenseItemField = (itemId: string, field: string, value: any) => {
        const existing = masterExpenses[selectedRouteKey] || [];
        let finalValue = value;
        if (field === 'amount' && typeof value === 'string') {
            finalValue = value.replace(/,/g, '').replace(/[^\d.]/g, '');
        }
        const updated = existing.map(e => e.id === itemId ? { ...e, [field]: finalValue } : e);
        persistExpenses({
            ...masterExpenses,
            [selectedRouteKey]: updated
        });
    };

    // Render a single country expense card (matching TripSheet 1:1)
    const renderCountryExpenseCard = (section: typeof COUNTRY_SECTIONS[0]) => {
        const colors = COLOR_MAP[section.color];
        const items = getExpensesByCategory(section.id);
        const { totalTZS, totalUSD, totalLocal } = getCategoryTotals(section.id);

        const tzRate = countryRates["TZ"] || 2700;
        const zambiaRate = countryRates["Zambia"] || 100;
        const rwandaRate = countryRates["Rwanda"] || 2;
        const burundiRate = countryRates["Burundi"] || 1;
        const drcRate = countryRates["DRC"] || 1.0;

        return (
            <Card key={section.id} className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                <CardHeader className={`${colors.headerBg} border-b py-4 px-6`}>
                    <CardTitle className={`text-xs font-bold flex items-center justify-between ${colors.text}`}>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-black">{section.name}</span>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleAddBlankExpenseItem(section.id)} 
                                className="h-6 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-white/60 border border-blue-200/50 bg-white/40 shadow-xs" 
                            >
                                <Plus size={10} className="mr-1" /> Add Item
                            </Button>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="flex gap-2 text-[10px] items-baseline">
                                <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                <span className="text-blue-700 font-black">{Math.round(totalTZS).toLocaleString()}</span>
                            </div>
                            <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-500">
                                {section.id === 'TZ' ? (
                                    <span>USD: ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                ) : section.id === 'Zambia' ? (
                                    <span className="text-green-700 font-bold">ZMW: {Math.round(totalLocal).toLocaleString()}</span>
                                ) : (
                                    <span>USD: ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                )}
                            </div>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="space-y-4">
                        {/* Table Header exactly matching TripSheet */}
                        <div className="flex gap-4 px-4 py-2 bg-slate-100/60 rounded-lg text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            <div className="flex-[8] min-w-[180px]">Expense Description</div>
                            <div className="w-28 text-center">Nature</div>
                            <div className="w-44 text-right pr-4">Currency & Amount</div>
                            <div className="w-24 text-right">
                                {section.id === 'TZ' ? 'USD' : 'TZS Equiv.'}
                            </div>
                            <div className="w-6"></div>
                        </div>

                        {/* Line Items exactly matching TripSheet */}
                        <div className="grid gap-1.5 max-h-[460px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                            {items.length === 0 ? (
                                <div className="text-center py-6 border-2 border-dashed rounded-xl text-slate-400 text-xs">
                                    No {section.name} expenses registered. Click <span className="font-bold">+ Add Item</span> to add one.
                                </div>
                            ) : (
                                items.map((item) => {
                                    const inputAmount = parseFloat(item.amount) || 0;
                                    let amountTSh = 0;
                                    let amountUSD = 0;

                                    if (item.currency === 'USD') {
                                        amountTSh = inputAmount * tzRate;
                                        amountUSD = inputAmount;
                                    } else {
                                        if (section.id === 'TZ') {
                                            amountTSh = inputAmount;
                                            amountUSD = inputAmount / tzRate;
                                        } else if (section.id === 'Zambia') {
                                            amountTSh = inputAmount * zambiaRate;
                                            amountUSD = amountTSh / tzRate;
                                        } else if (section.id === 'DRC') {
                                            amountUSD = inputAmount / drcRate;
                                            amountTSh = amountUSD * tzRate;
                                        } else if (section.id === 'Rwanda') {
                                            amountTSh = inputAmount * rwandaRate;
                                            amountUSD = amountTSh / tzRate;
                                        } else if (section.id === 'Burundi') {
                                            amountTSh = inputAmount * burundiRate;
                                            amountUSD = amountTSh / tzRate;
                                        }
                                    }

                                    return (
                                        <div key={item.id} className="group flex gap-2 items-center bg-white p-1 md:p-1.5 rounded-xl border border-slate-100 hover:border-slate-300 transition-all">
                                            {/* 1. Description (Searchable Combobox from DB matching TripSheet) */}
                                            <div className="flex-[8] min-w-[200px]">
                                                <ExpenseCombobox
                                                    value={item.item_name}
                                                    onChange={(val) => handleUpdateExpenseItemField(item.id, 'item_name', val)}
                                                    items={expenseItemsList || []}
                                                />
                                            </div>

                                            {/* 2. Nature Dropdown */}
                                            <div className="w-28 shrink-0">
                                                <Select
                                                    value={item.nature || "Go & Return"}
                                                    onValueChange={(val) => handleUpdateExpenseItemField(item.id, 'nature', val)}
                                                >
                                                    <SelectTrigger className="h-8 text-[11px] bg-white border-slate-200 shadow-none font-normal text-slate-600">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Go & Return">Go & Return</SelectItem>
                                                        <SelectItem value="Going Only">Going Only</SelectItem>
                                                        <SelectItem value="Returning Only">Returning Only</SelectItem>
                                                        <SelectItem value="Single Trip">Single Trip</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* 3. Currency & Amount with Commas */}
                                            <div className="w-44 flex items-center gap-1 shrink-0">
                                                <Select
                                                    value={item.currency || section.defaultCurrency}
                                                    onValueChange={(val) => handleUpdateExpenseItemField(item.id, 'currency', val)}
                                                >
                                                    <SelectTrigger className="h-8 w-16 shrink-0 text-[10px] font-bold bg-slate-100 border-none px-1.5 text-slate-700">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={section.defaultCurrency} className="text-xs font-bold">{section.defaultCurrency}</SelectItem>
                                                        {section.defaultCurrency !== 'USD' && (
                                                            <SelectItem value="USD" className="text-xs font-bold text-emerald-700">USD $</SelectItem>
                                                        )}
                                                        {section.defaultCurrency !== 'TZS' && section.defaultCurrency !== 'USD' && (
                                                            <SelectItem value="TZS" className="text-xs font-bold">TZS</SelectItem>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                                <Input
                                                    className="h-8 text-right font-bold text-slate-800 bg-slate-50 border-slate-200 text-xs w-full tabular-nums"
                                                    type="text"
                                                    placeholder="0"
                                                    value={formatWithCommas(item.amount || '')}
                                                    onChange={(e) => handleUpdateExpenseItemField(item.id, 'amount', e.target.value)}
                                                />
                                            </div>

                                            {/* 4. Equivalent Calculation */}
                                            <div className="w-24 text-right shrink-0">
                                                {section.id === 'TZ' ? (
                                                    <p className="text-[11px] font-semibold text-slate-500">
                                                        ${Math.round(amountUSD).toLocaleString()}
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px] font-bold text-slate-700">
                                                        TShs {Math.round(amountTSh).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>

                                            {/* 5. Delete Action */}
                                            <div className="w-6 flex justify-end shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-slate-300 hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteExpenseItem(item.id)}
                                                >
                                                    <Trash2 size={13} />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
            {/* TOP HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
                            <Layers className="w-6 h-6" />
                        </div>
                        Master Collection
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Central library for all logistics routes and standardized trip expense templates. 
                        These templates are used when creating new trip orders and generating trip sheets.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button 
                        onClick={() => {
                            setEditingRoute(null);
                            setRouteForm({
                                origin: "DAR ES SALAAM",
                                destination: "",
                                default_rate_usd: "",
                                default_exchange_rate: "2700",
                                default_cargo: "",
                                agreed_days: "",
                                notes: ""
                            });
                            setIsAddRouteOpen(true);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold gap-2 h-10 px-4 rounded-xl shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Master Route
                    </Button>
                </div>
            </div>

            {/* TABS NAVIGATION */}
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
                <div className="flex items-center justify-between border-b pb-3">
                    <TabsList className="bg-slate-100 p-1 rounded-xl">
                        <TabsTrigger value="routes" className="data-[state=active]:bg-white shadow-sm px-5 py-2 text-xs font-bold gap-2">
                            <Route className="w-4 h-4 text-indigo-600" />
                            Route Master
                            <Badge variant="secondary" className="ml-1 text-[10px] bg-slate-200">{combinedRoutes.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="expenses" className="data-[state=active]:bg-white shadow-sm px-5 py-2 text-xs font-bold gap-2">
                            <DollarSign className="w-4 h-4 text-emerald-600" />
                            Route Expense Master
                            <Badge variant="secondary" className="ml-1 text-[10px] bg-emerald-100 text-emerald-800">
                                {Object.keys(masterExpenses).filter(k => masterExpenses[k]?.length > 0).length} Routes Configured
                            </Badge>
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === "routes" && (
                        <div className="relative w-[280px]">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search route or cargo..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9 h-9 text-xs bg-white"
                            />
                        </div>
                    )}
                </div>

                {/* TAB 1: ROUTE MASTER */}
                <TabsContent value="routes" className="mt-6 space-y-4">
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b py-3 px-6">
                            <CardTitle className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                <span>Master Routes Directory</span>
                                <span className="text-[11px] font-normal text-slate-400">
                                    Destinations listed here will auto-fill details when creating Trip Orders.
                                    Leave fields blank if not yet determined — the logistics team can fill them in.
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-12 text-center text-xs">#</TableHead>
                                        <TableHead className="text-xs">Destination (Target)</TableHead>
                                        <TableHead className="text-xs">Origin</TableHead>
                                        <TableHead className="text-xs">Standard Cargo</TableHead>
                                        <TableHead className="text-xs text-right">Default Rate (USD)</TableHead>
                                        <TableHead className="text-xs text-center">Agreed Days</TableHead>
                                        <TableHead className="text-xs">Expense Status</TableHead>
                                        <TableHead className="text-xs text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRoutes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-12 text-center text-xs text-slate-400">
                                                No routes found in Master Collection. Click "Add Master Route" to create one.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRoutes.map((r, idx) => {
                                            const hasExpenses = masterExpenses[r.destination] && masterExpenses[r.destination].length > 0;

                                            return (
                                                <TableRow key={r.id} className="hover:bg-slate-50/70">
                                                    <TableCell className="text-center text-xs font-bold text-slate-400">
                                                        {(idx + 1).toString().padStart(2, "0")}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                                            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                                                            {r.destination}
                                                        </div>
                                                        {r.notes && <div className="text-[10px] text-slate-400 mt-0.5">{r.notes}</div>}
                                                    </TableCell>
                                                    <TableCell className="text-xs font-semibold text-slate-600">
                                                        {r.origin}
                                                    </TableCell>
                                                    <TableCell>
                                                        {r.default_cargo ? (
                                                            <Badge variant="outline" className="text-[10px] font-semibold bg-indigo-50/40 text-indigo-700 border-indigo-200">
                                                                {r.default_cargo}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-300 italic">Not set</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-slate-900 text-xs">
                                                        {r.default_rate_usd ? `$${Number(r.default_rate_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-slate-300 font-normal italic">—</span>}
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold text-xs text-slate-700">
                                                        {r.agreed_days ? `${r.agreed_days} Days` : <span className="text-slate-300 font-normal italic">—</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {(() => {
                                                            const stats = getRouteTotalExpenses(r.destination);
                                                            if (stats.count === 0) {
                                                                return (
                                                                    <Badge variant="outline" className="text-slate-400 text-[10px]">
                                                                        No Expenses Set
                                                                    </Badge>
                                                                );
                                                            }
                                                            return (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-black text-xs text-indigo-950">
                                                                            ${Math.round(stats.totalUSD).toLocaleString()} USD
                                                                        </span>
                                                                        <Badge className="bg-emerald-100/80 text-emerald-800 text-[9px] font-bold px-1.5 py-0 border-none">
                                                                            {stats.count} items
                                                                        </Badge>
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                                        ≈ TShs {Math.round(stats.totalTZS).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    loadExpensesForDestination(r.destination);
                                                                    setActiveTab("expenses");
                                                                }}
                                                                className="h-8 px-2 text-[11px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                                                                title="Manage Expenses for this route"
                                                            >
                                                                <DollarSign className="w-3.5 h-3.5 mr-1" />
                                                                Expenses
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setEditingRoute(r);
                                                                    setRouteForm({
                                                                        origin: r.origin || "DAR ES SALAAM",
                                                                        destination: r.destination,
                                                                        default_rate_usd: r.default_rate_usd ? String(r.default_rate_usd) : "",
                                                                        default_exchange_rate: String(r.default_exchange_rate || "2700"),
                                                                        default_cargo: r.default_cargo || "",
                                                                        agreed_days: r.agreed_days ? String(r.agreed_days) : "",
                                                                        notes: r.notes || ""
                                                                    });
                                                                    setIsAddRouteOpen(true);
                                                                }}
                                                                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                                                            >
                                                                <Edit className="w-3.5 h-3.5" />
                                                            </Button>
                                                            {isSuperAdmin && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleDeleteRoute(r.id, r.destination)}
                                                                    className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 2: ROUTE EXPENSE MASTER */}
                <TabsContent value="expenses" className="mt-6 space-y-6">
                    {/* Destination Selector Header */}
                    <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-white to-white shadow-sm p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-600 text-white rounded-lg">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-bold text-slate-500 uppercase">Selected Master Route Destination</Label>
                                    <div className="font-black text-slate-900 text-base flex items-center gap-2">
                                        DAR ES SALAAM <ArrowRight className="w-4 h-4 text-indigo-500" /> {selectedRouteKey || "Select a route →"}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Select value={selectedRouteKey} onValueChange={v => loadExpensesForDestination(v)}>
                                    <SelectTrigger className="w-[240px] h-10 bg-white border-slate-300 font-bold text-xs shadow-sm">
                                        <SelectValue placeholder={isLoadingTripTemplate ? "Loading from trip sheet..." : "Pick route to edit..."} />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                        {allDestinations.map(dest => (
                                            <SelectItem key={dest} value={dest} className="text-xs font-semibold">
                                                {dest}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {selectedRouteKey && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isLoadingTripTemplate}
                                        onClick={() => loadExpensesForDestination(selectedRouteKey, true)}
                                        className="h-10 px-3 text-xs font-bold gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 bg-white shadow-sm"
                                        title="Auto-search database for latest trip sheet to this destination"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTripTemplate ? "animate-spin" : ""}`} />
                                        Auto-Fetch
                                    </Button>
                                )}

                                {/* Dedicated Search by Trip Sheet Number */}
                                <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
                                    <FileText className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
                                    <Select 
                                        value="" 
                                        onValueChange={tripId => {
                                            const found = (recentTripSheets as any[]).find((t: any) => t.id === tripId);
                                            if (found) {
                                                loadExpensesFromTripId(found, selectedRouteKey);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[230px] h-8 bg-white border-none text-[11px] font-bold shadow-none">
                                            <SelectValue placeholder="Import from Trip # (e.g. T 265...)" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                            {(recentTripSheets as any[]).map((t: any) => (
                                                <SelectItem key={t.id} value={t.id} className="text-xs">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-900">{t.reference_number || t.invoice_no || "Unnamed Trip"}</span>
                                                        <span className="text-[10px] text-slate-500">{t.destination} {t.invoice_no ? `• ${t.invoice_no}` : ''}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* 🌍 Section: Market Exchange Rates & Regional Scope (Identical to TripSheet) */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Market Exchange Rates Card */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Globe size={12} className="text-primary" />
                                Market Exchange Rates (Standard Conversion for Master Templates)
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <div className="space-y-1 flex-1 min-w-[130px]">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">TZ (USD to TZS)</Label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-[10px]">$1 =</span>
                                        <Input
                                            className="pl-8 h-8 bg-slate-50 border-slate-200 font-bold text-slate-900 text-xs"
                                            type="number"
                                            value={countryRates["TZ"] || 2700}
                                            onChange={(e) => updateRate("TZ", e.target.value)}
                                        />
                                    </div>
                                </div>
                                {activeCountries.includes('Zambia') && (
                                    <div className="space-y-1 flex-1 min-w-[130px]">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Zambia (1 ZMW = TZS)</Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-[10px]">K1 =</span>
                                            <Input
                                                className="pl-8 h-8 bg-slate-50 border-slate-200 font-bold text-slate-900 text-xs"
                                                type="number"
                                                value={countryRates["Zambia"] || 100}
                                                onChange={(e) => updateRate("Zambia", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                                {activeCountries.includes('DRC') && (
                                    <div className="space-y-1 flex-1 min-w-[130px]">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">DRC ($ Price)</Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-[10px]">$1 =</span>
                                            <Input
                                                className="pl-8 h-8 bg-slate-50 border-slate-200 font-bold text-slate-900 text-xs"
                                                type="number"
                                                value={countryRates["DRC"] || 1.0}
                                                onChange={(e) => updateRate("DRC", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                                {activeCountries.includes('Rwanda') && (
                                    <div className="space-y-1 flex-1 min-w-[130px]">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Rwanda (1 RWF = TZS)</Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-[10px]">RWF 1 =</span>
                                            <Input
                                                className="pl-14 h-8 bg-slate-50 border-slate-200 font-bold text-slate-900 text-xs"
                                                type="number"
                                                value={countryRates["Rwanda"] || 2}
                                                onChange={(e) => updateRate("Rwanda", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                                {activeCountries.includes('Burundi') && (
                                    <div className="space-y-1 flex-1 min-w-[130px]">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Burundi (1 BIF = TZS)</Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-[10px]">BIF 1 =</span>
                                            <Input
                                                className="pl-12 h-8 bg-slate-50 border-slate-200 font-bold text-slate-900 text-xs"
                                                type="number"
                                                value={countryRates["Burundi"] || 1}
                                                onChange={(e) => updateRate("Burundi", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Regional Scope Toggle Card (Select which countries apply to this route) */}
                        <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Globe size={11} className="text-indigo-600" />
                                    Regional Scope (Toggle Countries)
                                </p>
                                <p className="text-[10px] text-slate-400 mb-3">
                                    Only countries active here will display cards. Countries with saved expenses stay visible automatically.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    { id: 'TZ', name: 'Tanzania' },
                                    { id: 'Zambia', name: 'Zambia' },
                                    { id: 'DRC', name: 'DR Congo' },
                                    { id: 'Rwanda', name: 'Rwanda' },
                                    { id: 'Burundi', name: 'Burundi' }
                                ].map(country => {
                                    const hasItems = getExpensesByCategory(country.id).length > 0;
                                    const isSelected = activeCountries.includes(country.id) || hasItems;
                                    return (
                                        <Badge
                                            key={country.id}
                                            variant={isSelected ? 'default' : 'outline'}
                                            className={`cursor-pointer text-[10px] px-2.5 py-1 font-bold transition-all ${
                                                isSelected 
                                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                                    : 'bg-white text-slate-500 hover:bg-slate-100 border-slate-200'
                                            }`}
                                            onClick={() => toggleCountry(country.id)}
                                        >
                                            {isSelected ? `✓ ${country.name}` : `+ ${country.name}`}
                                        </Badge>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ONLY ACTIVE COUNTRY EXPENSE CARDS SHOWN - Matching TripSheet layout exactly */}
                    {selectedRouteKey ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {COUNTRY_SECTIONS
                                .filter(section => activeCountries.includes(section.id) || getExpensesByCategory(section.id).length > 0)
                                .map(section => renderCountryExpenseCard(section))}
                        </div>
                    ) : (
                        <Card className="border-dashed border-slate-200 p-12 text-center">
                            <p className="text-sm text-slate-400">Select a destination above to view and manage its expense template.</p>
                        </Card>
                    )}

                    {/* ADD NEW EXPENSE ITEM TO MASTER TEMPLATE */}
                    {selectedRouteKey && (
                        <Card className="border-dashed border-indigo-200 bg-indigo-50/20 p-5 rounded-2xl">
                            <div className="text-xs font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                <Plus className="w-4 h-4 text-indigo-600" />
                                Add Standard Expense Item to Master for "{selectedRouteKey}"
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                <div className="md:col-span-2">
                                    <ExpenseCombobox
                                        value={newExpense.item_name}
                                        onChange={(val) => setNewExpense(prev => ({ ...prev, item_name: val }))}
                                        items={expenseItemsList || []}
                                    />
                                </div>
                                <div>
                                    <Select 
                                        value={newExpense.category} 
                                        onValueChange={v => {
                                            const section = COUNTRY_SECTIONS.find(s => s.id === v);
                                            setNewExpense(prev => ({ 
                                                ...prev, 
                                                category: v as any,
                                                currency: section?.defaultCurrency || "USD"
                                            }));
                                        }}
                                    >
                                        <SelectTrigger className="h-9 bg-white text-xs">
                                            <SelectValue placeholder="Country" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {COUNTRY_SECTIONS.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <div className="flex gap-2">
                                        <Select 
                                            value={newExpense.currency} 
                                            onValueChange={v => setNewExpense(prev => ({ ...prev, currency: v }))}
                                        >
                                            <SelectTrigger className="w-20 h-9 bg-white text-xs font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="TZS">TZS</SelectItem>
                                                <SelectItem value="USD">USD</SelectItem>
                                                <SelectItem value="ZMW">ZMW</SelectItem>
                                                <SelectItem value="RWF">RWF</SelectItem>
                                                <SelectItem value="BIF">BIF</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            placeholder="Amount"
                                            value={newExpense.amount}
                                            onChange={e => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                                            className="h-9 bg-white text-xs font-bold"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Select 
                                        value={newExpense.nature} 
                                        onValueChange={v => setNewExpense(prev => ({ ...prev, nature: v }))}
                                    >
                                        <SelectTrigger className="h-9 bg-white text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Go & Return">Go & Return</SelectItem>
                                            <SelectItem value="Going Only">Going Only</SelectItem>
                                            <SelectItem value="Returning Only">Returning Only</SelectItem>
                                            <SelectItem value="Single Trip">Single Trip</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Button 
                                        onClick={handleAddExpenseItem}
                                        className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                                    >
                                        Add To Master
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* MODAL: ADD / EDIT MASTER ROUTE */}
            <Dialog open={isAddRouteOpen} onOpenChange={setIsAddRouteOpen}>
                <DialogContent className="max-w-lg rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Route className="w-5 h-5 text-indigo-600" />
                            {editingRoute ? "Edit Master Route" : "Create Master Route"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Route Origin</Label>
                            <Input
                                value={routeForm.origin}
                                onChange={e => setRouteForm(prev => ({ ...prev, origin: e.target.value }))}
                                placeholder="DAR ES SALAAM"
                                className="h-10 text-xs font-bold uppercase"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Route Destination *</Label>
                            {editingRoute ? (
                                <Input
                                    value={routeForm.destination}
                                    onChange={e => setRouteForm(prev => ({ ...prev, destination: e.target.value }))}
                                    placeholder="e.g. LUBUMBASHI / DRC"
                                    className="h-10 text-xs font-bold uppercase"
                                />
                            ) : (
                                <>
                                    <Select 
                                        value={routeForm.destination} 
                                        onValueChange={v => setRouteForm(prev => ({ ...prev, destination: v }))}
                                    >
                                        <SelectTrigger className="h-10 text-xs font-bold uppercase bg-white">
                                            <SelectValue placeholder="Pick from existing routes..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[250px]">
                                            {allDestinations.map(d => (
                                                <SelectItem key={d} value={d} className="text-xs font-semibold">{d}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={routeForm.destination}
                                        onChange={e => setRouteForm(prev => ({ ...prev, destination: e.target.value }))}
                                        placeholder="Or type a new destination..."
                                        className="h-10 text-xs font-bold uppercase mt-2"
                                    />
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-600">Default Rate (USD)</Label>
                                <Input
                                    type="number"
                                    value={routeForm.default_rate_usd}
                                    onChange={e => setRouteForm(prev => ({ ...prev, default_rate_usd: e.target.value }))}
                                    placeholder="Leave blank if not set"
                                    className="h-10 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-600">Agreed Days</Label>
                                <Input
                                    type="number"
                                    value={routeForm.agreed_days}
                                    onChange={e => setRouteForm(prev => ({ ...prev, agreed_days: e.target.value }))}
                                    placeholder="Leave blank if not set"
                                    className="h-10 text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Standard Cargo Type</Label>
                            <Input
                                value={routeForm.default_cargo}
                                onChange={e => setRouteForm(prev => ({ ...prev, default_cargo: e.target.value }))}
                                placeholder="Leave blank if varies per trip"
                                className="h-10 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Notes</Label>
                            <Input
                                value={routeForm.notes}
                                onChange={e => setRouteForm(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder="Optional notes about this route"
                                className="h-10 text-xs"
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t gap-2">
                        <Button variant="outline" onClick={() => setIsAddRouteOpen(false)} className="text-xs">
                            Cancel
                        </Button>
                        <Button onClick={handleSaveRoute} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold gap-2 px-6">
                            {editingRoute ? "Save Changes" : "Create Route"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
