import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
    Search,
    Plus,
    Truck,
    AlertTriangle,
    CheckCircle2,
    Clock,
    User,
    ChevronsUpDown,
    Check,
    FileText,
    DollarSign,
    ShieldCheck,
    XCircle,
    Building2,
    Eye,
    TrendingUp,
    Filter,
    Calendar,
    ArrowRight,
    Trash2,
    ChevronDown,
    ChevronRight,
    Layers,
    Edit2,
    Save,
    Bell,
    ThumbsUp,
    ThumbsDown,
    AlertCircle,
    Sparkles,
    Send,
    Split,
    X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STANDARD_DESTINATIONS = [
    "LUSAKA / CHAMBISHI",
    "NDOLA / KITWE",
    "LUBUMBASHI / DRC",
    "KOLWEZI / DRC",
    "KIGALI / RWANDA",
    "BUJUMBURA / BURUNDI",
    "KAMPALA / UGANDA",
    "MUTARE / HARARE",
    "LILONGWE / MALAWI",
    "BLANTYRE / MALAWI",
    "MOMBASA / KENYA",
    "LOCAL / DAR ES SALAAM"
];

export default function TripOrders() {
    const { userRole, user, userProfile } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const isSuperAdmin = userRole === "super_admin";
    const isAdmin = userRole === "admin" || isSuperAdmin;

    // Filters & Search
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [clientFilter, setClientFilter] = useState<string>("ALL");
    const [pipelineTab, setPipelineTab] = useState<'all' | 'pending' | 'operations' | 'completed' | 'nominations'>('all');

    // Vehicle Nomination Modal State (Multi-vehicle selection, destination-based, persistent draft)
    const initialNominationState = {
        selected_vehicles: [] as Array<{ vehicle_id: string; truck_reg: string; trailer_id?: string; trailer_reg?: string }>,
        target_destination: "LUSAKA / CHAMBISHI",
        expected_departure_date: "",
        cargo_type: "General Cargo",
        logistics_notes: ""
    };

    const [isNominateOpen, setIsNominateOpen] = useState(false);
    const [nominationForm, setNominationForm] = useState(() => {
        try {
            const cached = localStorage.getItem("trip_orders_nomination_draft");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed === "object") {
                    return {
                        ...initialNominationState,
                        ...parsed
                    };
                }
            }
        } catch (e) {}
        return initialNominationState;
    });

    // Edit Order State
    const [editingOrder, setEditingOrder] = useState<any>(null);
    const [editFormData, setEditFormData] = useState<any>({});

    // Split / Re-assign Order State
    const [splittingGroup, setSplittingGroup] = useState<any>(null);
    const [splitSelectedIds, setSplitSelectedIds] = useState<string[]>([]);
    const [splitTargetClient, setSplitTargetClient] = useState<string>("");

    // Group dropdown accordion expansion state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroupExpand = (groupKey: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupKey]: !prev[groupKey]
        }));
    };

    // Modal state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const [orderToApprove, setOrderToApprove] = useState<any>(null);
    const [approvalAction, setApprovalAction] = useState<"Approve" | "Reject">("Approve");
    const [rejectionReason, setRejectionReason] = useState("");

    // Add Client inline
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [newClientName, setNewClientName] = useState("");
    const [clientComboboxOpen, setClientComboboxOpen] = useState(false);

    // Order Form State
    const initialFormState = {
        client_name: "",
        agreed_amount_usd: "",
        agreed_client_rate: "2700",
        vehicle_id: "",
        truck_reg: "",
        trailer_id: "",
        trailer_reg: "",
        driver_id: "",
        driver_name: "",
        contact_no: "",
        license_no: "",
        passport_no: "",
        origin: "DAR ES SALAAM",
        destination: "",
        agreed_days: "5",
        daily_penalty_fine: "0",
        journey_type: "Go & Return (Full Cycle)",
        cargo_description: "",
        bl_number: "",
        container_no: "",
        trip_number: "",
        notes: ""
    };
    // Load cached draft form from localStorage if user refreshed by mistake
    const [formData, setFormData] = useState(() => {
        try {
            const cached = localStorage.getItem("trip_orders_draft_form");
            if (cached) return { ...initialFormState, ...JSON.parse(cached) };
        } catch (e) {}
        return initialFormState;
    });

    // Multi-vehicle assignment state
    interface VehicleAssignment {
        id: string;
        vehicle_id: string;
        truck_reg: string;
        trailer_id: string;
        trailer_reg: string;
        driver_id: string;
        driver_name: string;
        contact_no: string;
        license_no: string;
        passport_no: string;
        trip_number: string;
        journey_type: string;
        is_tanker?: boolean;
        agreed_amount_usd?: string;
        load_quantity?: string; // Amount to be loaded (litres / kg)
        rate_per_thousand?: string; // Rate per 1000
    }

    const initialVehicleItem: VehicleAssignment = {
        id: "veh-1",
        vehicle_id: "",
        truck_reg: "",
        trailer_id: "",
        trailer_reg: "",
        driver_id: "",
        driver_name: "",
        contact_no: "",
        license_no: "",
        passport_no: "",
        trip_number: "",
        journey_type: "Go & Return (Full Cycle)",
        is_tanker: false,
        agreed_amount_usd: "",
        load_quantity: "",
        rate_per_thousand: ""
    };

    const [vehicleAssignments, setVehicleAssignments] = useState<VehicleAssignment[]>(() => {
        try {
            const cached = localStorage.getItem("trip_orders_draft_vehicles");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}
        return [initialVehicleItem];
    });

    // Auto-save form draft to localStorage whenever user edits
    useEffect(() => {
        try {
            localStorage.setItem("trip_orders_draft_form", JSON.stringify(formData));
        } catch (e) {}
    }, [formData]);

    useEffect(() => {
        try {
            localStorage.setItem("trip_orders_draft_vehicles", JSON.stringify(vehicleAssignments));
        } catch (e) {}
    }, [vehicleAssignments]);

    // Auto-save nomination draft to localStorage
    useEffect(() => {
        try {
            localStorage.setItem("trip_orders_nomination_draft", JSON.stringify(nominationForm));
        } catch (e) {}
    }, [nominationForm]);

    // Clear draft helper
    const clearFormDraft = () => {
        try {
            localStorage.removeItem("trip_orders_draft_form");
            localStorage.removeItem("trip_orders_draft_vehicles");
        } catch (e) {}
        setFormData(initialFormState);
        setVehicleAssignments([initialVehicleItem]);
    };

    const clearNominationDraft = () => {
        try {
            localStorage.removeItem("trip_orders_nomination_draft");
        } catch (e) {}
        setNominationForm(initialNominationState);
    };

    const handleAddVehicleSlot = () => {
        setVehicleAssignments(prev => [
            {
                ...initialVehicleItem,
                id: `veh-${Date.now()}`
            },
            ...prev
        ]);
    };

    const handleRemoveVehicleSlot = (index: number) => {
        if (vehicleAssignments.length <= 1) {
            toast({ variant: "destructive", title: "At least 1 vehicle is required." });
            return;
        }
        setVehicleAssignments(prev => prev.filter((_, i) => i !== index));
    };

    // Fetch Trip Orders
    const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
        queryKey: ["logistics_trip_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Vehicle Nominations
    const { data: nominations = [], isLoading: isLoadingNominations, refetch: refetchNominations } = useQuery({
        queryKey: ["logistics_vehicle_nominations"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_vehicle_nominations" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) {
                console.warn("logistics_vehicle_nominations query error:", error);
                return [];
            }
            return data || [];
        }
    });

    // Fetch Fleet for selection
    const { data: fleet = [] } = useQuery({
        queryKey: ["logistics_fleet_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet")
                .select("*")
                .order("vehicle_no", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Drivers with documents & credentials
    const { data: drivers = [] } = useQuery({
        queryKey: ["logistics_drivers_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_drivers")
                .select(`
                    *,
                    logistics_driver_documents(*)
                `)
                .order("full_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Active Couplings
    const { data: couplings = [] } = useQuery({
        queryKey: ["logistics_couplings_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_couplings")
                .select("*");
            if (error) throw error;
            // Filter active couplings safely checking is_active or status
            return (data || []).filter((c: any) => c.is_active === true || c.status === "Active");
        }
    });

    // Fetch Clients List
    const { data: clientsList = [], refetch: refetchClients } = useQuery({
        queryKey: ["logistics_clients_list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_clients")
                .select("*")
                .order("name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Real Routes from Database
    const { data: dbRoutes = [] } = useQuery({
        queryKey: ["logistics_routes_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_routes" as any)
                .select("location_name")
                .eq("is_active", true)
                .order("location_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Route Expense Master from Database for live rates across environments
    const { data: dbRouteMaster = [] } = useQuery({
        queryKey: ["logistics_route_expenses_master_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_route_expenses_master" as any)
                .select("destination, default_rate_usd, agreed_days, default_cargo");
            if (error) return [];
            return data || [];
        }
    });

    // Handle Register New Client
    const handleAddClient = async () => {
        if (!newClientName.trim()) return;
        setIsAddingClient(true);
        try {
            const { error } = await supabase
                .from("logistics_clients")
                .insert([{ name: newClientName.trim().toUpperCase() }]);
            if (error) throw error;
            toast({
                title: "Client Added",
                description: `Successfully registered "${newClientName.trim().toUpperCase()}".`
            });
            await refetchClients();
            setFormData(prev => ({ ...prev, client_name: newClientName.trim().toUpperCase() }));
            setNewClientName("");
            setClientComboboxOpen(false);
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Error adding client",
                description: err.message
            });
        } finally {
            setIsAddingClient(false);
        }
    };

    // Auto-calculate order total USD across all vehicle assignments inside modal
    const formAccumulatedUSD = useMemo(() => {
        return vehicleAssignments.reduce((sum, v) => {
            const usd = parseFloat(v.agreed_amount_usd || "") || 0;
            return sum + usd;
        }, 0);
    }, [vehicleAssignments]);

    // Auto-calculate local currency agreed total
    const agreedAmountLocal = useMemo(() => {
        const rate = parseFloat(formData.agreed_client_rate) || 0;
        return (formAccumulatedUSD * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }, [formAccumulatedUSD, formData.agreed_client_rate]);

    // Helper to extract driver details from driver record and documents
    const extractDriverDetails = (driver: any) => {
        if (!driver) return { phone: "", license: "", passport: "" };
        let resolvedLicense = driver.license_no || "";
        let resolvedPassport = driver.passport_no || driver.id_number || "";

        if (driver.logistics_driver_documents && Array.isArray(driver.logistics_driver_documents)) {
            const licenseDoc = driver.logistics_driver_documents.find((doc: any) =>
                doc.document_type?.toLowerCase().includes("licen")
            );
            if (licenseDoc?.document_number) {
                resolvedLicense = licenseDoc.document_number;
            }

            const passportDoc = driver.logistics_driver_documents.find((doc: any) =>
                doc.document_type?.toLowerCase().includes("pass") || doc.document_type?.toLowerCase().includes("id")
            );
            if (passportDoc?.document_number) {
                resolvedPassport = passportDoc.document_number;
            }
        }

        const resolvedPhone = driver.phone_no || driver.phone_secondary || driver.phone || "";
        return { phone: resolvedPhone, license: resolvedLicense, passport: resolvedPassport };
    };

    // Handle Manual Driver Selection for a vehicle row
    const handleSelectDriverForVehicle = (driver: any, index: number = 0) => {
        const details = extractDriverDetails(driver);
        setVehicleAssignments(prev => {
            const copy = [...prev];
            if (copy[index]) {
                copy[index] = {
                    ...copy[index],
                    driver_id: driver.id,
                    driver_name: driver.full_name,
                    contact_no: details.phone || copy[index].contact_no,
                    license_no: details.license || copy[index].license_no,
                    passport_no: details.passport || copy[index].passport_no
                };
            }
            return copy;
        });

        if (index === 0) {
            setFormData(prev => ({
                ...prev,
                driver_id: driver.id,
                driver_name: driver.full_name,
                contact_no: details.phone || prev.contact_no,
                license_no: details.license || prev.license_no,
                passport_no: details.passport || prev.passport_no
            }));
        }

        toast({
            title: "Driver Assigned",
            description: `Assigned driver ${driver.full_name} to vehicle slot #${index + 1}.`
        });
    };

    // Handle Horse Vehicle Selection for a specific vehicle row slot
    const handleSelectVehicle = async (v: any, index: number = 0) => {
        // Find trailer coupling
        const activeCoupling = couplings.find((c: any) => 
            String(c.horse_id).toLowerCase().trim() === String(v.id).toLowerCase().trim()
        );
        const trailerFound = activeCoupling 
            ? fleet.find((f: any) => String(f.id).toLowerCase().trim() === String(activeCoupling.trailer_id).toLowerCase().trim())
            : null;
        
        const trailerIsTanker = trailerFound?.asset_type?.toLowerCase().includes('tanker') || trailerFound?.fleet_category?.toLowerCase() === 'tanker';
        const isTanker = v.asset_type?.toLowerCase().includes('tanker') || v.fleet_category?.toLowerCase() === 'tanker' || trailerIsTanker;
        const journeyType = isTanker ? "Go Only (Return Empty)" : "Go & Return (Full Cycle)";

        // Generate Trip Number: per-vehicle sequential numbering with fixed year 2025
        const cleanHorse = v.vehicle_no.replace(/\s*[A-Z]+$/, "").trim();
        const legIndicator = isTanker ? "T" : "G";
        const fixedYear = "2025";

        // Query last trip number for THIS specific vehicle from both tables
        const vehicleId = v.id;
        const { data: lastOrderTrips } = await supabase
            .from('logistics_trip_orders' as any)
            .select('trip_number')
            .eq('vehicle_id', vehicleId)
            .order('created_at', { ascending: false })
            .limit(50);
        const { data: lastSheetTrips } = await supabase
            .from('logistics_trip_sheets' as any)
            .select('trip_number')
            .eq('vehicle_id', vehicleId)
            .order('created_at', { ascending: false })
            .limit(50);

        // Combine all trip numbers for this vehicle and extract the highest sequence
        const allVehicleTrips = [
            ...(lastOrderTrips || []).map((r: any) => r.trip_number),
            ...(lastSheetTrips || []).map((r: any) => r.trip_number)
        ].filter(Boolean);

        let highestSeq = 120; // Will start at 121 if no previous trips
        for (const tn of allVehicleTrips) {
            // Match patterns like G121, G122, T105, etc. at the end of trip number
            const seqMatch = tn.match(/[GT](\d+)\s*$/i);
            if (seqMatch) {
                const num = parseInt(seqMatch[1], 10);
                if (num > highestSeq) highestSeq = num;
            }
        }

        // Also check other vehicle slots in current form to avoid collision
        for (const slot of vehicleAssignments) {
            if (slot.vehicle_id === vehicleId && slot.trip_number) {
                const slotMatch = slot.trip_number.match(/[GT](\d+)\s*$/i);
                if (slotMatch) {
                    const num = parseInt(slotMatch[1], 10);
                    if (num > highestSeq) highestSeq = num;
                }
            }
        }

        const nextSeq = highestSeq + 1;
        const generatedTripId = `${cleanHorse}/${fixedYear}/${legIndicator}${nextSeq}`;

        // Find driver assigned to vehicle
        const assignedDriver = drivers.find((d: any) => 
            String(d.assigned_vehicle_id).toLowerCase().trim() === String(v.id).toLowerCase().trim()
        );

        const details = extractDriverDetails(assignedDriver);

        const updatedItem: VehicleAssignment = {
            id: vehicleAssignments[index]?.id || `veh-${Date.now()}`,
            vehicle_id: v.id,
            truck_reg: v.vehicle_no,
            trailer_id: activeCoupling ? activeCoupling.trailer_id : "",
            trailer_reg: trailerFound ? (trailerFound.vehicle_no || trailerFound.trailer_number) : (activeCoupling?.trailer_id || ""),
            driver_id: assignedDriver ? assignedDriver.id : "",
            driver_name: assignedDriver ? assignedDriver.full_name : "",
            contact_no: details.phone,
            license_no: details.license,
            passport_no: details.passport,
            trip_number: generatedTripId,
            journey_type: journeyType,
            is_tanker: isTanker,
            agreed_amount_usd: vehicleAssignments[index]?.agreed_amount_usd || formData.agreed_amount_usd || "",
            load_quantity: vehicleAssignments[index]?.load_quantity || "",
            rate_per_thousand: vehicleAssignments[index]?.rate_per_thousand || ""
        };

        setVehicleAssignments(prev => {
            const copy = [...prev];
            copy[index] = updatedItem;
            return copy;
        });

        // Also sync primary vehicle to formData for backwards compatibility
        if (index === 0) {
            setFormData(prev => ({
                ...prev,
                vehicle_id: v.id,
                truck_reg: v.vehicle_no,
                trailer_id: activeCoupling ? activeCoupling.trailer_id : "",
                trailer_reg: trailerFound ? (trailerFound.vehicle_no || trailerFound.trailer_number) : (activeCoupling?.trailer_id || ""),
                driver_id: assignedDriver ? assignedDriver.id : prev.driver_id,
                driver_name: assignedDriver ? assignedDriver.full_name : prev.driver_name,
                contact_no: details.phone || prev.contact_no,
                license_no: details.license || prev.license_no,
                passport_no: details.passport || prev.passport_no,
                trip_number: generatedTripId,
                journey_type: journeyType,
                agreed_amount_usd: updatedItem.agreed_amount_usd || prev.agreed_amount_usd
            }));
        }

        toast({
            title: "Vehicle & Trip Assigned",
            description: `Assigned ${v.vehicle_no} with Trip #${generatedTripId}.`
        });
    };

    const updateVehicleSlotField = (index: number, field: keyof VehicleAssignment, value: any) => {
        setVehicleAssignments(prev => {
            const copy = [...prev];
            if (copy[index]) {
                const currentSlot = { ...copy[index], [field]: value };

                // Auto-calculate for Tankers if load_quantity or rate_per_thousand changed
                if (field === "load_quantity" || field === "rate_per_thousand") {
                    const qty = parseFloat(field === "load_quantity" ? value : currentSlot.load_quantity || "0") || 0;
                    const rate = parseFloat(field === "rate_per_thousand" ? value : currentSlot.rate_per_thousand || "0") || 0;
                    if (qty > 0 && rate > 0) {
                        const calculatedUSD = ((qty / 1000) * rate).toFixed(2);
                        currentSlot.agreed_amount_usd = calculatedUSD;
                    }
                }

                copy[index] = currentSlot;
            }
            return copy;
        });
        if (index === 0 && field in formData) {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    // Submit Nomination Mutation (Supports batch multi-vehicle nominations)
    const createNominationMutation = useMutation({
        mutationFn: async (payloads: any[]) => {
            const { data, error } = await supabase
                .from("logistics_vehicle_nominations" as any)
                .insert(payloads)
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_vehicle_nominations"] });
            const count = data?.length || 1;
            toast({
                title: "Vehicles Nominated Successfully",
                description: `${count} vehicle(s) nominated and sent to the Garage Team for readiness inspection.`
            });
            setIsNominateOpen(false);
            clearNominationDraft();
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Nomination Failed",
                description: err.message
            });
        }
    });

    const deleteNominationMutation = useMutation({
        mutationFn: async (nomId: string) => {
            const { error } = await supabase
                .from("logistics_vehicle_nominations" as any)
                .delete()
                .eq("id", nomId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_vehicle_nominations"] });
            toast({ title: "Nomination Cancelled", description: "Nomination record removed." });
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Action Failed", description: err.message });
        }
    });

    // Submit Order Mutation (Supports batch insertions for multiple vehicles)
    const createOrderMutation = useMutation({
        mutationFn: async (payloads: any[]) => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .insert(payloads)
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            const count = data?.length || 1;
            toast({
                title: "Order Created Successfully",
                description: `${count} vehicle trip order${count > 1 ? 's' : ''} registered and submitted for Admin Approval.`
            });
            setIsCreateOpen(false);
            clearFormDraft();
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Failed to create order",
                description: err.message
            });
        }
    });

    const handleCreateOrderSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.client_name) {
            toast({ variant: "destructive", title: "Client Required", description: "Please choose or register a client." });
            return;
        }

        const validVehicles = vehicleAssignments.filter(v => v.vehicle_id && v.truck_reg);
        if (validVehicles.length === 0) {
            toast({ variant: "destructive", title: "Vehicle Required", description: "Please select at least one vehicle/horse." });
            return;
        }

        if (!formData.destination) {
            toast({ variant: "destructive", title: "Destination Required", description: "Please select a delivery destination." });
            return;
        }

        // Validate that no vehicle has an empty trip number
        for (let i = 0; i < validVehicles.length; i++) {
            if (!validVehicles[i].trip_number?.trim()) {
                toast({
                    variant: "destructive",
                    title: "Trip Number Required",
                    description: `Vehicle #${i + 1} (${validVehicles[i].truck_reg}) must have a Trip Reference Number.`
                });
                return;
            }
        }

        // Check for duplicate trip numbers across vehicles within the same order
        const enteredTripNumbers = validVehicles.map(v => v.trip_number.trim().toUpperCase());
        const uniqueSet = new Set(enteredTripNumbers);
        if (uniqueSet.size < enteredTripNumbers.length) {
            toast({
                variant: "destructive",
                title: "Duplicate Trip Number Detected",
                description: "Two or more vehicles in this order have the exact same Trip Reference Number. Please make sure each vehicle has a unique Trip Number."
            });
            return;
        }

        // Check for duplicate Trip Numbers against existing database records (both orders and trip sheets)
        try {
            const { data: existingOrders, error: orderCheckErr } = await supabase
                .from("logistics_trip_orders" as any)
                .select("trip_number")
                .in("trip_number", enteredTripNumbers);
            
            if (orderCheckErr) throw orderCheckErr;

            if (existingOrders && existingOrders.length > 0) {
                const dupNumber = existingOrders[0].trip_number;
                toast({
                    variant: "destructive",
                    title: "Trip Number Already Exists!",
                    description: `Trip Reference "${dupNumber}" is already in use by an existing Trip Order. Please edit and specify a unique Trip Number.`
                });
                return;
            }

            const { data: existingSheets, error: sheetCheckErr } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("trip_number")
                .in("trip_number", enteredTripNumbers);

            if (sheetCheckErr) throw sheetCheckErr;

            if (existingSheets && existingSheets.length > 0) {
                const dupNumber = existingSheets[0].trip_number;
                toast({
                    variant: "destructive",
                    title: "Trip Number Already Exists!",
                    description: `Trip Reference "${dupNumber}" already exists in active Trip Sheets. Please edit and specify a unique Trip Number.`
                });
                return;
            }
        } catch (err: any) {
            console.error("Trip number check error:", err);
        }

        // Calculate next SEL-xxxx sequential order number
        let nextOrderSeq = 1;
        try {
            const { data: allExistingOrders } = await supabase
                .from("logistics_trip_orders" as any)
                .select("order_number");
            
            if (allExistingOrders && allExistingOrders.length > 0) {
                let maxNum = 0;
                allExistingOrders.forEach((o: any) => {
                    const match = o.order_number?.match(/SEL-(\d+)/i);
                    if (match && match[1]) {
                        const parsed = parseInt(match[1], 10);
                        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
                    }
                });
                nextOrderSeq = maxNum > 0 ? maxNum + 1 : allExistingOrders.length + 1;
            }
        } catch (err) {
            nextOrderSeq = (orders?.length || 0) + 1;
        }

        const formattedOrderNumber = `SEL-${String(nextOrderSeq).padStart(4, '0')}`;

        const clientRate = parseFloat(formData.agreed_client_rate) || 1.0;

        // Create an order record for each assigned vehicle so each can follow its individual trip lifecycle
        const payloads = validVehicles.map((v, i) => {
            const vehicleUSD = parseFloat(v.agreed_amount_usd || formData.agreed_amount_usd) || 0;
            const vehicleLocal = vehicleUSD * clientRate;

            return {
                order_number: formattedOrderNumber,
                trip_number: v.trip_number.trim(),
                client_name: formData.client_name,
                agreed_amount_usd: vehicleUSD,
                agreed_client_rate: clientRate,
                agreed_amount_local: vehicleLocal,
                currency: "USD",
                vehicle_id: v.vehicle_id || null,
                truck_reg: v.truck_reg,
                trailer_id: v.trailer_id || null,
                trailer_reg: v.trailer_reg || null,
                driver_id: v.driver_id || null,
                driver_name: v.driver_name || null,
                contact_no: v.contact_no || null,
                license_no: v.license_no || null,
                passport_no: v.passport_no || null,
                origin: formData.origin || "DAR ES SALAAM",
                destination: formData.destination,
                agreed_days: parseInt(formData.agreed_days) || 0,
                daily_penalty_fine: parseFloat(formData.daily_penalty_fine) || 0,
                journey_type: v.journey_type || formData.journey_type,
                cargo_description: formData.cargo_description || null,
                bl_number: formData.bl_number || null,
                container_no: formData.container_no || null,
                notes: formData.notes || null,
                status: "Pending Approval",
                created_by: user?.id
            };
        });

        createOrderMutation.mutate(payloads);
    };

    // Approval / Rejection Action Mutation (Supports single ID or array of IDs)
    const approveOrderMutation = useMutation({
        mutationFn: async ({ orderIds, status, rejectionReason }: { orderIds: string[], status: string, rejectionReason?: string }) => {
            const payload: any = {
                status: status,
                updated_at: new Date().toISOString()
            };
            if (status === "Approved") {
                payload.approved_by = user?.id;
                let approverName = userProfile?.full_name || (userProfile as any)?.username;
                if (!approverName && user?.id) {
                    const { data: prof } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).maybeSingle();
                    approverName = prof?.full_name || prof?.username;
                }
                payload.approved_by_name = approverName || user?.email || "Yahya Kilua";
                payload.approved_at = new Date().toISOString();
                payload.rejection_reason = null;
            } else if (status === "Rejected") {
                payload.rejection_reason = rejectionReason || "Rejected by Admin";
            }

            const { error } = await supabase
                .from("logistics_trip_orders" as any)
                .update(payload)
                .in("id", orderIds);
            if (error) throw error;
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            queryClient.invalidateQueries({ queryKey: ["approved_trip_orders"] });
            const count = vars.orderIds.length;
            toast({
                title: vars.status === "Approved" ? "Orders Approved!" : "Orders Rejected",
                description: vars.status === "Approved" 
                    ? `${count} order(s) approved and ready for Finance to generate Trip Sheets.` 
                    : `${count} order(s) have been rejected.`
            });
            setIsApprovalDialogOpen(false);
            setOrderToApprove(null);
            setRejectionReason("");
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Action Failed",
                description: err.message
            });
        }
    });

    // Super Admin Delete Order Mutation (Supports deleting multiple IDs)
    const deleteOrderMutation = useMutation({
        mutationFn: async (orderIds: string[]) => {
            const { error } = await supabase
                .from("logistics_trip_orders" as any)
                .delete()
                .in("id", orderIds);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            toast({
                title: "Order(s) Deleted",
                description: "The selected trip order(s) have been removed successfully."
            });
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Delete Failed",
                description: err.message
            });
        }
    });

    // Update Order Mutation (for edit pencil)
    const updateOrderMutation = useMutation({
        mutationFn: async ({ orderId, updates }: { orderId: string, updates: any }) => {
            const { error } = await supabase
                .from("logistics_trip_orders" as any)
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq("id", orderId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            queryClient.invalidateQueries({ queryKey: ["approved_trip_orders"] });
            toast({
                title: "Order Updated",
                description: "Trip order details have been updated successfully."
            });
            setEditingOrder(null);
            setEditFormData({});
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: err.message
            });
        }
    });

    // Split / Re-assign Vehicles to New or Existing Client Order Mutation
    const splitOrderMutation = useMutation({
        mutationFn: async ({ 
            orderIds, 
            newClientName, 
            newOrderNumber 
        }: { 
            orderIds: string[]; 
            newClientName: string; 
            newOrderNumber: string; 
        }) => {
            const { error: orderError } = await supabase
                .from("logistics_trip_orders" as any)
                .update({
                    client_name: newClientName,
                    order_number: newOrderNumber,
                    updated_at: new Date().toISOString()
                })
                .in("id", orderIds);

            if (orderError) throw orderError;

            // Also check if any associated trip sheets exist for these orders, and update client_name there too
            try {
                // Find trip_numbers for these order IDs
                const affectedOrders = orders.filter((o: any) => orderIds.includes(o.id));
                const tripNumbers = affectedOrders.map((o: any) => o.trip_number).filter(Boolean);
                if (tripNumbers.length > 0) {
                    await supabase
                        .from("logistics_trip_sheets" as any)
                        .update({
                            client_name: newClientName,
                            updated_at: new Date().toISOString()
                        })
                        .in("trip_number", tripNumbers);
                }
            } catch (sheetSyncErr) {
                console.warn("Could not sync client name to trip sheets:", sheetSyncErr);
            }

            return { count: orderIds.length, newOrderNumber, newClientName };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            queryClient.invalidateQueries({ queryKey: ["approved_trip_orders"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_sheets"] });
            toast({
                title: "Vehicles Reassigned & Split Successfully!",
                description: `${data.count} vehicle(s) moved to new order ${data.newOrderNumber} under client "${data.newClientName}".`
            });
            setSplittingGroup(null);
            setSplitSelectedIds([]);
            setSplitTargetClient("");
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Split / Reassignment Failed",
                description: err.message
            });
        }
    });

    // Filtered Orders
    const filteredOrders = useMemo(() => {
        return orders.filter((o: any) => {
            const matchesSearch = 
                !searchTerm ||
                (o.trip_number && o.trip_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.truck_reg && o.truck_reg.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.client_name && o.client_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.driver_name && o.driver_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.destination && o.destination.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
            const matchesClient = clientFilter === "ALL" || o.client_name === clientFilter;

            return matchesSearch && matchesStatus && matchesClient;
        });
    }, [orders, searchTerm, statusFilter, clientFilter]);

    // Grouped Orders for Accordion Table Display
    const groupedOrderList = useMemo(() => {
        // Group by `${o.client_name || 'Unknown'}__${o.order_number || 'Single'}`
        const groupMap: { [key: string]: { key: string, order_number: string, client_name: string, items: any[] } } = {};
        
        filteredOrders.forEach((o: any) => {
            const groupKey = `${(o.client_name || "UNKNOWN").trim().toUpperCase()}__${(o.order_number || o.id).trim().toUpperCase()}`;
            if (!groupMap[groupKey]) {
                groupMap[groupKey] = {
                    key: groupKey,
                    order_number: o.order_number || "—",
                    client_name: o.client_name || "—",
                    items: []
                };
            }
            groupMap[groupKey].items.push(o);
        });

        return Object.values(groupMap);
    }, [filteredOrders]);

    // Unique clients for filtering
    const uniqueClients = useMemo(() => {
        const set = new Set<string>();
        orders.forEach((o: any) => {
            if (o.client_name) set.add(o.client_name);
        });
        return Array.from(set).sort();
    }, [orders]);

    // Metrics
    const pendingCount = orders.filter((o: any) => o.status === "Pending Approval").length;
    const approvedCount = orders.filter((o: any) => o.status === "Approved" || o.status === "Trip Sheet Created").length;
    const completedCount = orders.filter((o: any) => o.status === "Completed").length;
    const nominationsCount = (nominations || []).length;
    const clearedNominationsCount = (nominations || []).filter((n: any) => n.garage_readiness === 'Fit' || n.status === 'Cleared').length;
    const totalOrderUSD = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.agreed_amount_usd) || 0), 0);

    // Pipeline tab filtering applied on top of existing filters
    const pipelineFilteredOrders = useMemo(() => {
        if (pipelineTab === 'all') return groupedOrderList;
        return groupedOrderList.filter((group: any) => {
            return group.items.some((o: any) => {
                if (pipelineTab === 'pending') return o.status === 'Pending Approval';
                if (pipelineTab === 'operations') return o.status === 'Approved' || o.status === 'Trip Sheet Created';
                if (pipelineTab === 'completed') return o.status === 'Completed';
                return true;
            });
        });
    }, [groupedOrderList, pipelineTab]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header banner */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                            <Truck className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Logistics Trip Orders</h1>
                            <p className="text-xs md:text-sm text-slate-500 font-medium">Nominate vehicles to the garage, review mechanical readiness, capture client orders, and manage approvals.</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <Button 
                        variant="outline"
                        onClick={() => setIsNominateOpen(true)}
                        className="border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 font-bold text-xs uppercase tracking-wider h-11 px-4 rounded-xl shadow-xs gap-1.5"
                    >
                        <Bell className="w-4 h-4 text-indigo-600" />
                        Nominate Vehicle to Garage
                        {nominationsCount > 0 && (
                            <Badge className="ml-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0">
                                {nominationsCount}
                            </Badge>
                        )}
                    </Button>
                    <Button 
                        onClick={() => {
                            setFormData(initialFormState);
                            setIsCreateOpen(true);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider h-11 px-5 rounded-xl shadow-md shadow-indigo-100"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        New Trip Order
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card 
                    onClick={() => setPipelineTab('nominations')}
                    className="border-slate-200/80 shadow-sm bg-white cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group"
                    title="Click to view nominated vehicles and their clearance status"
                >
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">Garage Nominations</p>
                            <h3 className="text-2xl font-black text-indigo-600 mt-1">{nominationsCount}</h3>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ {clearedNominationsCount} Cleared / Fit
                                </span>
                                {nominationsCount - clearedNominationsCount > 0 && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        ⏱ {nominationsCount - clearedNominationsCount} Pending
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            <Sparkles className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Admin Approval</p>
                            <h3 className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</h3>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Orders awaiting review</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-2xl text-amber-600 border border-amber-100">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved Orders</p>
                            <h3 className="text-2xl font-black text-emerald-600 mt-1">{approvedCount}</h3>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Ready for Operations</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 border border-emerald-100">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contracted Revenue</p>
                            <h3 className="text-2xl font-black text-slate-800 mt-1">${totalOrderUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Total across all orders</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 border border-emerald-100">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter & Search Bar */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:w-80">
                            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                            <Input
                                placeholder="Search Trip #, Truck, Client, Driver..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 border-slate-200 text-xs rounded-xl"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                            {/* Status Filter */}
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full sm:w-[170px] h-10 text-xs rounded-xl border-slate-200">
                                    <SelectValue placeholder="Status Filter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Statuses</SelectItem>
                                    <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Trip Sheet Created">Trip Sheet Created</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Client Filter */}
                            <Select value={clientFilter} onValueChange={setClientFilter}>
                                <SelectTrigger className="w-full sm:w-[200px] h-10 text-xs rounded-xl border-slate-200">
                                    <SelectValue placeholder="Filter Client" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Clients</SelectItem>
                                    {uniqueClients.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Operational Pipeline Tabs */}
            <div className="flex items-center gap-1 bg-white p-1.5 rounded-xl border border-slate-200/80 shadow-sm flex-wrap">
                {[
                    { key: 'all', label: 'All Orders', count: groupedOrderList.length, color: 'slate' },
                    { key: 'pending', label: 'New / Pending Review', count: pendingCount, color: 'amber' },
                    { key: 'operations', label: 'Approved & In Operations', count: approvedCount, color: 'emerald' },
                    { key: 'completed', label: 'Completed Trips', count: completedCount, color: 'indigo' },
                    { key: 'nominations', label: 'Vehicle Nominations', count: nominationsCount, color: 'purple' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setPipelineTab(tab.key as any)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 flex-1 justify-center min-w-[140px]",
                            pipelineTab === tab.key
                                ? `bg-${tab.color}-600 text-white shadow-md`
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                            pipelineTab === tab.key && tab.color === 'slate' && 'bg-slate-800 text-white',
                            pipelineTab === tab.key && tab.color === 'amber' && 'bg-amber-600 text-white',
                            pipelineTab === tab.key && tab.color === 'emerald' && 'bg-emerald-600 text-white',
                            pipelineTab === tab.key && tab.color === 'indigo' && 'bg-indigo-600 text-white',
                            pipelineTab === tab.key && tab.color === 'purple' && 'bg-purple-600 text-white'
                        )}
                    >
                        {tab.key === 'nominations' && <Bell className="w-3.5 h-3.5 mr-0.5" />}
                        {tab.label}
                        <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-black min-w-[20px]",
                            pipelineTab === tab.key
                                ? "bg-white/20 text-white"
                                : "bg-slate-100 text-slate-500"
                        )}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Conditionally Render: Nominations Table or Orders Table */}
            {pipelineTab === 'nominations' ? (
                <Card className="border-slate-200/80 shadow-sm bg-white overflow-hidden">
                    <div className="p-4 bg-purple-50/50 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                                <Bell className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Garage Vehicle Readiness Pipeline</h3>
                                <p className="text-xs text-slate-500">Vehicles nominated by Logistics for upcoming orders awaiting or cleared by the Garage team.</p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => setIsNominateOpen(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs gap-1.5 self-start sm:self-auto"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Nominate Another Vehicle
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                                <TableRow>
                                    <TableHead className="w-12 text-center text-[11px] font-bold uppercase text-slate-500">#</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Nominated Vehicle</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Target Route & Cargo</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Nominated By & Date</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-center">Garage Readiness</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Garage Decision / Reason</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-slate-100">
                                {isLoadingNominations ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                                            Loading vehicle nominations...
                                        </TableCell>
                                    </TableRow>
                                ) : (nominations || []).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                                            No vehicle nominations found. Click "Nominate Vehicle to Garage" above to alert the workshop about upcoming orders.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    (nominations || []).map((nom: any, nIdx: number) => {
                                        const isFit = nom.garage_readiness === 'Fit' || nom.status === 'Cleared';
                                        const isUnfit = nom.garage_readiness === 'Unfit' || nom.status === 'Rejected';
                                        const isConditional = nom.garage_readiness === 'Conditional' || nom.status === 'Conditional';
                                        const isPending = !isFit && !isUnfit && !isConditional;

                                        return (
                                            <TableRow key={nom.id} className="hover:bg-slate-50/70 transition-colors">
                                                <TableCell className="text-center text-xs font-semibold text-slate-400">
                                                    {(nIdx + 1).toString().padStart(2, '0')}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                                        <Truck className="w-3.5 h-3.5 text-indigo-600" />
                                                        {nom.truck_reg}
                                                    </div>
                                                    {nom.trailer_reg && (
                                                        <div className="text-[11px] text-slate-500 font-medium">
                                                            Trailer: {nom.trailer_reg}
                                                        </div>
                                                    )}
                                                    {nom.driver_name && (
                                                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                            <User className="w-3 h-3" />
                                                            {nom.driver_name}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold text-slate-800 text-xs">
                                                        {nom.target_destination || "Route Unspecified"}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500">
                                                        {nom.cargo_type || "General Cargo"}
                                                    </div>
                                                    {nom.expected_departure_date && (
                                                        <div className="text-[10px] text-indigo-600 flex items-center gap-1 mt-0.5">
                                                            <Calendar className="w-3 h-3" />
                                                            Target Departure: {format(new Date(nom.expected_departure_date), "dd MMM yyyy")}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs font-semibold text-slate-700">
                                                        {nom.nominated_by_name || "Logistics Staff"}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {nom.created_at ? format(new Date(nom.created_at), "dd MMM yyyy, HH:mm") : "—"}
                                                    </div>
                                                    {nom.logistics_notes && (
                                                        <div className="text-[10px] text-slate-500 italic mt-0.5 max-w-[200px] truncate" title={nom.logistics_notes}>
                                                            "{nom.logistics_notes}"
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {isFit && (
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-2.5 py-1">
                                                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                                                            Fit for Trip
                                                        </Badge>
                                                    )}
                                                    {isUnfit && (
                                                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold px-2.5 py-1">
                                                            <XCircle className="w-3 h-3 mr-1 text-rose-600" />
                                                            Not Fit (Faults)
                                                        </Badge>
                                                    )}
                                                    {isConditional && (
                                                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold px-2.5 py-1">
                                                            <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
                                                            Conditional Fit
                                                        </Badge>
                                                    )}
                                                    {isPending && (
                                                        <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-bold px-2.5 py-1">
                                                            <Clock className="w-3 h-3 mr-1 text-purple-600" />
                                                            Awaiting Garage
                                                        </Badge>
                                                    )}
                                                    {nom.garage_reviewed_by_name && (
                                                        <div className="text-[9px] text-slate-400 mt-1">
                                                            By: {nom.garage_reviewed_by_name}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {nom.garage_decision_notes ? (
                                                        <div className="space-y-0.5">
                                                            <p className="text-xs text-slate-700 font-medium leading-tight">
                                                                {nom.garage_decision_notes}
                                                            </p>
                                                            {nom.estimated_readiness_date && (
                                                                <p className="text-[10px] text-amber-700 font-semibold">
                                                                    Est. Ready: {format(new Date(nom.estimated_readiness_date), "dd MMM yyyy")}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">No notes logged</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {isFit && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setFormData({
                                                                        ...initialFormState,
                                                                        vehicle_id: nom.vehicle_id || "",
                                                                        truck_reg: nom.truck_reg,
                                                                        trailer_id: nom.trailer_id || "",
                                                                        trailer_reg: nom.trailer_reg || "",
                                                                        driver_id: nom.driver_id || "",
                                                                        driver_name: nom.driver_name || "",
                                                                        destination: nom.target_destination || "",
                                                                        cargo_description: nom.cargo_type || ""
                                                                    });
                                                                    setVehicleAssignments([{
                                                                        id: "veh-1",
                                                                        vehicle_id: nom.vehicle_id || "",
                                                                        truck_reg: nom.truck_reg,
                                                                        trailer_id: nom.trailer_id || "",
                                                                        trailer_reg: nom.trailer_reg || "",
                                                                        driver_id: nom.driver_id || "",
                                                                        driver_name: nom.driver_name || "",
                                                                        contact_no: "",
                                                                        license_no: "",
                                                                        passport_no: "",
                                                                        trip_number: "",
                                                                        journey_type: "Go & Return (Full Cycle)"
                                                                    }]);
                                                                    setIsCreateOpen(true);
                                                                }}
                                                                className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-xs gap-1"
                                                            >
                                                                <Plus className="w-3 h-3" />
                                                                Create Order
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                if (window.confirm(`Remove nomination for vehicle ${nom.truck_reg}?`)) {
                                                                    deleteNominationMutation.mutate(nom.id);
                                                                }
                                                            }}
                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                            title="Cancel Nomination"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            ) : (
                /* Orders Table */
                <Card className="border-slate-200/80 shadow-sm bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                                <TableRow>
                                    <TableHead className="w-12 text-center text-[11px] font-bold uppercase text-slate-500">#</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Trip Reference</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Client / Company</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Vehicle & Crew</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Route & Cargo</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-right">Agreed Amount ($ / Rate)</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-center">Status</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100">
                            {isLoadingOrders ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                        Loading trip orders...
                                    </TableCell>
                                </TableRow>
                            ) : groupedOrderList.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                        No trip orders found matching your filters. Click "New Trip Order" to create one.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pipelineFilteredOrders.map((group: any, gIdx: number) => {
                                    const isMulti = group.items.length > 1;
                                    // If only 1 order in group, render as standard row
                                    if (!isMulti) {
                                        const order = group.items[0];
                                        const isPending = order.status === "Pending Approval";
                                        const isApproved = order.status === "Approved" || order.status === "Trip Sheet Created";
                                        const isRejected = order.status === "Rejected";

                                        return (
                                            <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                                                <TableCell className="text-center text-xs font-semibold text-slate-400">
                                                    {(gIdx + 1).toString().padStart(2, '0')}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-slate-900 text-xs">{order.trip_number || "—"}</div>
                                                    <div className="text-[10px] text-slate-400 font-medium">{order.order_number}</div>
                                                    <div className="text-[9px] font-semibold text-indigo-600 mt-0.5">{order.journey_type}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                        {order.client_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="space-y-0.5">
                                                        <div className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                                                            <Truck className="w-3 h-3 text-slate-400" />
                                                            {order.truck_reg} {order.trailer_reg && <span className="text-slate-400 font-normal">/ {order.trailer_reg}</span>}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                                            <User className="w-3 h-3 text-slate-400" />
                                                            {order.driver_name || "No driver assigned"}
                                                        </div>
                                                        {order.contact_no && (
                                                            <div className="text-[10px] text-slate-400">{order.contact_no}</div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="space-y-0.5">
                                                        <div className="font-semibold text-slate-800 text-xs">{order.destination}</div>
                                                        <div className="text-[10px] text-slate-500 font-medium">From: {order.origin || 'DAR ES SALAAM'}</div>
                                                        {order.cargo_description && (
                                                            <div className="text-[10px] text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50 w-fit">
                                                                {order.cargo_description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-black text-slate-900 text-xs">
                                                        ${(parseFloat(order.agreed_amount_usd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium">
                                                        Rate: @{order.agreed_client_rate || "2700"}
                                                    </div>
                                                    <div className="text-[10px] font-semibold text-emerald-700">
                                                        {(parseFloat(order.agreed_amount_local) || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })} Local
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge
                                                        className={cn(
                                                            "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                                                            isPending && "bg-amber-50 text-amber-700 border-amber-200",
                                                            isApproved && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                            isRejected && "bg-rose-50 text-rose-700 border-rose-200"
                                                        )}
                                                    >
                                                        {isApproved && order.approved_by_name ? `Approved by ${order.approved_by_name}` : order.status}
                                                    </Badge>
                                                    {order.approved_at && (
                                                        <div className="text-[9px] text-slate-400 mt-1">
                                                            {format(new Date(order.approved_at), "dd MMM yy")}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={isApproved}
                                                            onClick={() => {
                                                                setEditingOrder(order);
                                                                setEditFormData({
                                                                    truck_reg: order.truck_reg || '',
                                                                    trailer_reg: order.trailer_reg || '',
                                                                    driver_name: order.driver_name || '',
                                                                    contact_no: order.contact_no || '',
                                                                    destination: order.destination || '',
                                                                    agreed_amount_usd: order.agreed_amount_usd || '',
                                                                    agreed_client_rate: order.agreed_client_rate || '2700',
                                                                    cargo_description: order.cargo_description || '',
                                                                    notes: order.notes || ''
                                                                });
                                                            }}
                                                            className={cn(
                                                                "h-8 w-8 p-0 rounded-lg",
                                                                isApproved
                                                                    ? "text-slate-300 cursor-not-allowed opacity-30"
                                                                    : "text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                                                            )}
                                                            title={isApproved ? "Locked: Approved orders cannot be modified" : "Edit order details"}
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setSelectedOrderDetails(order)}
                                                            className="h-8 px-2.5 text-[11px] text-slate-600 hover:text-slate-900"
                                                        >
                                                            <Eye className="w-3.5 h-3.5 mr-1" />
                                                            View
                                                        </Button>

                                                        {isAdmin && isPending && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setOrderToApprove(order);
                                                                        setApprovalAction("Approve");
                                                                        setIsApprovalDialogOpen(true);
                                                                    }}
                                                                    className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm"
                                                                >
                                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                    Approve
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setOrderToApprove(order);
                                                                        setApprovalAction("Reject");
                                                                        setIsApprovalDialogOpen(true);
                                                                    }}
                                                                    className="h-8 px-2.5 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-lg"
                                                                >
                                                                    <XCircle className="w-3.5 h-3.5 mr-1" />
                                                                    Reject
                                                                </Button>
                                                            </>
                                                        )}

                                                        {isSuperAdmin && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (window.confirm(`Are you sure you want to delete order "${order.trip_number || order.order_number}"? This cannot be undone.`)) {
                                                                        deleteOrderMutation.mutate([order.id]);
                                                                    }
                                                                }}
                                                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                                title="Delete Order (Super Admin Only)"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }

                                    // Multi-vehicle group: render expandable parent header row + sub-rows
                                    const isExpanded = Boolean(expandedGroups[group.key]); // default collapsed (closed)
                                    const totalGroupUSD = group.items.reduce((sum: number, o: any) => sum + (parseFloat(o.agreed_amount_usd) || 0), 0);
                                    const totalGroupLocal = group.items.reduce((sum: number, o: any) => sum + (parseFloat(o.agreed_amount_local) || 0), 0);
                                    const sampleOrder = group.items[0];
                                    const allPending = group.items.every((o: any) => o.status === "Pending Approval");
                                    const allApproved = group.items.every((o: any) => o.status === "Approved" || o.status === "Trip Sheet Created");
                                    const hasPending = group.items.some((o: any) => o.status === "Pending Approval");

                                    return (
                                        <div key={group.key} className="contents">
                                            {/* Group Parent Row */}
                                            <TableRow 
                                                className="bg-indigo-50/50 hover:bg-indigo-50/80 border-y border-indigo-100/80 transition-colors cursor-pointer select-none font-medium"
                                                onClick={() => toggleGroupExpand(group.key)}
                                            >
                                                <TableCell className="text-center text-xs font-bold text-indigo-700">
                                                    {(gIdx + 1).toString().padStart(2, '0')}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 text-indigo-700 hover:text-indigo-950 hover:bg-indigo-100 rounded-md"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleGroupExpand(group.key);
                                                            }}
                                                        >
                                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                        </Button>
                                                        <div>
                                                            <div className="font-black text-indigo-900 text-xs flex items-center gap-1.5">
                                                                {group.order_number}
                                                                <Badge className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0 h-4 border-none">
                                                                    {group.items.length} Vehicles
                                                                </Badge>
                                                            </div>
                                                            <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                                                                Click to {isExpanded ? 'collapse' : 'expand'} order drop-down
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                                        {group.client_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                                        <Truck className="w-3.5 h-3.5 text-slate-500" />
                                                        {group.items.map((it: any) => it.truck_reg).filter(Boolean).join(", ")}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500">
                                                        {group.items.length} assigned driver(s)
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold text-slate-800 text-xs">{sampleOrder.destination}</div>
                                                    <div className="text-[10px] text-slate-500 font-medium">From: {sampleOrder.origin || 'DAR ES SALAAM'}</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-black text-indigo-950 text-xs">
                                                        ${totalGroupUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium">
                                                        Rate: @{sampleOrder.agreed_client_rate || "2700"}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-emerald-700">
                                                        {totalGroupLocal.toLocaleString(undefined, { minimumFractionDigits: 0 })} Local Total
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                    <Badge
                                                        className={cn(
                                                            "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                                                            allPending && "bg-amber-50 text-amber-700 border-amber-200",
                                                            allApproved && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                            !allPending && !allApproved && "bg-slate-100 text-slate-700 border-slate-300"
                                                        )}
                                                    >
                                                        {allPending ? "Pending All" : allApproved ? "All Approved" : "Mixed Status"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {isAdmin && hasPending && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setOrderToApprove({
                                                                            order_number: group.order_number,
                                                                            trip_number: `${group.order_number} (${group.items.length} vehicles)`,
                                                                            items: group.items.filter((it: any) => it.status === "Pending Approval")
                                                                        });
                                                                        setApprovalAction("Approve");
                                                                        setIsApprovalDialogOpen(true);
                                                                    }}
                                                                    className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm"
                                                                    title="Approve all vehicles in this order"
                                                                >
                                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                    Approve All
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setOrderToApprove({
                                                                            order_number: group.order_number,
                                                                            trip_number: `${group.order_number} (${group.items.length} vehicles)`,
                                                                            items: group.items.filter((it: any) => it.status === "Pending Approval")
                                                                        });
                                                                        setApprovalAction("Reject");
                                                                        setIsApprovalDialogOpen(true);
                                                                    }}
                                                                    className="h-8 px-2.5 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-lg"
                                                                    title="Reject all vehicles in this order"
                                                                >
                                                                    <XCircle className="w-3.5 h-3.5 mr-1" />
                                                                    Reject All
                                                                </Button>
                                                            </>
                                                        )}

                                                        {/* Split / Re-assign Vehicles Button */}
                                                        {group.items.length > 1 && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSplittingGroup(group);
                                                                    setSplitSelectedIds([]);
                                                                    setSplitTargetClient("");
                                                                }}
                                                                className="h-8 px-2.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[11px] font-bold rounded-lg gap-1"
                                                                title="Split or re-assign vehicles in this order to another client"
                                                            >
                                                                <Split className="w-3.5 h-3.5" />
                                                                Split Order
                                                            </Button>
                                                        )}

                                                        {isSuperAdmin && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (window.confirm(`Are you sure you want to delete entire Order "${group.order_number}" with all ${group.items.length} vehicles? This cannot be undone.`)) {
                                                                        const allIds = group.items.map((it: any) => it.id);
                                                                        deleteOrderMutation.mutate(allIds);
                                                                    }
                                                                }}
                                                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                                title="Delete Grouped Order (Super Admin Only)"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>

                                            {/* Sub-Rows (Child Vehicles) inside Drop-down Accordion */}
                                            {isExpanded && group.items.map((subOrder: any, subIdx: number) => {
                                                const isSubPending = subOrder.status === "Pending Approval";
                                                const isSubApproved = subOrder.status === "Approved" || subOrder.status === "Trip Sheet Created";
                                                const isSubRejected = subOrder.status === "Rejected";

                                                return (
                                                    <TableRow key={subOrder.id} className="bg-slate-50/40 hover:bg-slate-100/60 border-b border-slate-100 transition-colors">
                                                        <TableCell className="text-center text-[11px] font-semibold text-slate-400 pl-4">
                                                            ↳ {subIdx + 1}
                                                        </TableCell>
                                                        <TableCell className="pl-6">
                                                            <div className="font-black text-indigo-900 text-xs">{subOrder.trip_number || "—"}</div>
                                                            <div className="text-[10px] text-slate-400 font-medium">{subOrder.order_number}</div>
                                                            <div className="text-[9px] font-semibold text-indigo-600 mt-0.5">{subOrder.journey_type}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-semibold text-slate-600 text-xs flex items-center gap-1">
                                                                <Building2 className="w-3 h-3 text-slate-400" />
                                                                {subOrder.client_name}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <div className="font-bold text-slate-800 text-xs flex items-center gap-1">
                                                                    <Truck className="w-3 h-3 text-indigo-500" />
                                                                    {subOrder.truck_reg} {subOrder.trailer_reg && <span className="text-slate-400 font-normal">/ {subOrder.trailer_reg}</span>}
                                                                </div>
                                                                <div className="text-[11px] text-slate-600 flex items-center gap-1">
                                                                    <User className="w-3 h-3 text-slate-400" />
                                                                    {subOrder.driver_name || "No driver assigned"}
                                                                </div>
                                                                {subOrder.contact_no && (
                                                                    <div className="text-[10px] text-slate-400">{subOrder.contact_no}</div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <div className="font-semibold text-slate-800 text-xs">{subOrder.destination}</div>
                                                                <div className="text-[10px] text-slate-500 font-medium">From: {subOrder.origin || 'DAR ES SALAAM'}</div>
                                                                {subOrder.cargo_description && (
                                                                    <div className="text-[10px] text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50 w-fit">
                                                                        {subOrder.cargo_description}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="font-black text-slate-900 text-xs">
                                                                ${(parseFloat(subOrder.agreed_amount_usd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 font-medium">
                                                                Rate: @{subOrder.agreed_client_rate || "2700"}
                                                            </div>
                                                            <div className="text-[10px] font-semibold text-emerald-700">
                                                                {(parseFloat(subOrder.agreed_amount_local) || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })} Local
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge
                                                                className={cn(
                                                                    "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                                                                    isSubPending && "bg-amber-50 text-amber-700 border-amber-200",
                                                                    isSubApproved && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                                    isSubRejected && "bg-rose-50 text-rose-700 border-rose-200"
                                                                )}
                                                            >
                                                                {isSubApproved && subOrder.approved_by_name ? `Approved by ${subOrder.approved_by_name}` : subOrder.status}
                                                            </Badge>
                                                            {subOrder.approved_at && (
                                                                <div className="text-[9px] text-slate-400 mt-1">
                                                                    {format(new Date(subOrder.approved_at), "dd MMM yy")}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    disabled={isSubApproved}
                                                                    onClick={() => {
                                                                        setEditingOrder(subOrder);
                                                                        setEditFormData({
                                                                            client_name: subOrder.client_name || '',
                                                                            truck_reg: subOrder.truck_reg || '',
                                                                            trailer_reg: subOrder.trailer_reg || '',
                                                                            driver_name: subOrder.driver_name || '',
                                                                            contact_no: subOrder.contact_no || '',
                                                                            destination: subOrder.destination || '',
                                                                            agreed_amount_usd: subOrder.agreed_amount_usd || '',
                                                                            agreed_client_rate: subOrder.agreed_client_rate || '2700',
                                                                            cargo_description: subOrder.cargo_description || '',
                                                                            notes: subOrder.notes || ''
                                                                        });
                                                                    }}
                                                                    className={cn(
                                                                        "h-8 w-8 p-0 rounded-lg",
                                                                        isSubApproved
                                                                            ? "text-slate-300 cursor-not-allowed opacity-30"
                                                                            : "text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                                                                    )}
                                                                    title={isSubApproved ? "Locked: Approved orders cannot be modified" : "Edit order details"}
                                                                >
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setSelectedOrderDetails(subOrder)}
                                                                    className="h-8 px-2.5 text-[11px] text-slate-600 hover:text-slate-900"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                                                    View
                                                                </Button>

                                                                {isAdmin && isSubPending && (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                setOrderToApprove(subOrder);
                                                                                setApprovalAction("Approve");
                                                                                setIsApprovalDialogOpen(true);
                                                                            }}
                                                                            className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm"
                                                                        >
                                                                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                            Approve
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                setOrderToApprove(subOrder);
                                                                                setApprovalAction("Reject");
                                                                                setIsApprovalDialogOpen(true);
                                                                            }}
                                                                            className="h-8 px-2.5 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-lg"
                                                                        >
                                                                            <XCircle className="w-3.5 h-3.5 mr-1" />
                                                                            Reject
                                                                        </Button>
                                                                    </>
                                                                )}

                                                                {isSuperAdmin && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            if (window.confirm(`Are you sure you want to delete order "${subOrder.trip_number || subOrder.order_number}"? This cannot be undone.`)) {
                                                                                deleteOrderMutation.mutate([subOrder.id]);
                                                                            }
                                                                        }}
                                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                                        title="Delete Order (Super Admin Only)"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </div>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
            )}

            {/* CREATE NEW ORDER MODAL */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-indigo-600" />
                            Create Logistics Trip Order (Order Master)
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            Enter the client order details, negotiated USD amount and exchange rate, select vehicle to auto-generate trip reference, and submit for approval.
                        </p>
                    </DialogHeader>

                    <form onSubmit={handleCreateOrderSubmit} className="space-y-6 pt-3">
                        {/* Section 1: Client & Commercial Terms */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                Client & Commercial Agreement
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold text-slate-600">Client / Company Name *</Label>
                                    </div>
                                    <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn("w-full h-10 justify-between bg-white border-slate-200 text-xs font-semibold", !formData.client_name && "text-slate-400")}
                                            >
                                                {formData.client_name || "Select Client..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search client..." className="h-8 text-xs" />
                                                <CommandList>
                                                    <CommandEmpty className="p-2 text-xs text-center text-slate-500">No client found.</CommandEmpty>
                                                    <CommandGroup className="max-h-[200px] overflow-auto">
                                                        {clientsList.map((c: any) => (
                                                            <CommandItem
                                                                key={c.id || c.name}
                                                                value={c.name}
                                                                onSelect={() => {
                                                                    setFormData(prev => ({ ...prev, client_name: c.name }));
                                                                    setClientComboboxOpen(false);
                                                                }}
                                                                className="text-xs font-medium"
                                                            >
                                                                <Check className={cn("mr-2 h-3.5 w-3.5", formData.client_name === c.name ? "opacity-100" : "opacity-0")} />
                                                                {c.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                            <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center gap-1.5">
                                                <Input
                                                    placeholder="Register new client..."
                                                    value={newClientName}
                                                    onChange={e => setNewClientName(e.target.value)}
                                                    className="h-8 text-xs bg-white border-slate-200"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={isAddingClient || !newClientName.trim()}
                                                    onClick={handleAddClient}
                                                    className="h-8 px-2.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Client Agreed Rate (USD to Local / TSh) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g. 2700"
                                        value={formData.agreed_client_rate}
                                        onChange={e => setFormData(prev => ({ ...prev, agreed_client_rate: e.target.value }))}
                                        className="h-10 bg-white border-slate-200 text-xs font-bold text-slate-900"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200/60 shadow-2xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-slate-600">Total Order Contracted USD:</span>
                                    <span className="font-black text-indigo-700 text-sm">
                                        ${formAccumulatedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-3">
                                    <span className="font-semibold text-slate-600">Total in Local Currency (TSh):</span>
                                    <span className="font-black text-emerald-700 text-sm">
                                        {agreedAmountLocal}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Vehicle Selection & Auto-generated Trip Number (Supports Multi-Vehicle Assignment) */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-indigo-600" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                        Vehicle Assignment & Trip Reference
                                    </h4>
                                    {vehicleAssignments.length > 1 && (
                                        <Badge className="bg-indigo-100 text-indigo-800 text-[10px] font-bold border-none px-2">
                                            {vehicleAssignments.length} Vehicles
                                        </Badge>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleAddVehicleSlot}
                                    className="h-7 text-[11px] font-bold text-indigo-700 border-indigo-200 bg-white hover:bg-indigo-50 gap-1.5 shadow-xs"
                                    title="Add another vehicle to this order"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Vehicle
                                </Button>
                            </div>

                            <div className="space-y-4">
                                {vehicleAssignments.map((veh, vIdx) => (
                                    <div 
                                        key={veh.id} 
                                        className={cn(
                                            "p-3.5 rounded-xl border transition-all",
                                            vehicleAssignments.length > 1 
                                                ? "bg-white border-indigo-100 shadow-xs relative" 
                                                : "bg-transparent border-transparent p-0"
                                        )}
                                    >
                                        {vehicleAssignments.length > 1 && (
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                <span className="text-[11px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                                                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px]">
                                                        {vIdx + 1}
                                                    </span>
                                                    Vehicle #{vIdx + 1} {veh.truck_reg ? `• ${veh.truck_reg}` : ''}
                                                </span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleRemoveVehicleSlot(vIdx)}
                                                    className="h-6 px-2 text-[10px] text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-1" /> Remove
                                                </Button>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Vehicle (Horse) *</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            className={cn(
                                                                "w-full h-9 justify-between bg-white border-slate-200 text-xs font-bold",
                                                                !veh.vehicle_id && "text-slate-400 font-normal"
                                                            )}
                                                        >
                                                            {veh.vehicle_id
                                                                ? `${veh.truck_reg} ${fleet.find(f => f.id === veh.vehicle_id)?.make_model ? `(${fleet.find(f => f.id === veh.vehicle_id)?.make_model})` : ''}`
                                                                : "Search Vehicle / Horse..."}
                                                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Type to search vehicle..." className="h-8 text-xs" />
                                                            <CommandList>
                                                                <CommandEmpty className="p-2 text-xs text-center text-slate-500">No vehicle found.</CommandEmpty>
                                                                <CommandGroup className="max-h-[220px] overflow-auto">
                                                                    {fleet
                                                                        .filter(f => f.asset_type === 'Truck' || f.asset_type === 'Horse')
                                                                        .map(v => (
                                                                            <CommandItem
                                                                                key={v.id}
                                                                                value={`${v.vehicle_no} ${v.make_model || ''}`}
                                                                                onSelect={() => handleSelectVehicle(v, vIdx)}
                                                                                className="text-xs font-medium cursor-pointer"
                                                                            >
                                                                                <Check
                                                                                    className={cn(
                                                                                        "mr-2 h-3.5 w-3.5 text-indigo-600",
                                                                                        veh.vehicle_id === v.id ? "opacity-100" : "opacity-0"
                                                                                    )}
                                                                                />
                                                                                <span className="font-bold text-slate-800">{v.vehicle_no}</span>
                                                                                {v.make_model && <span className="ml-1 text-slate-500">({v.make_model})</span>}
                                                                            </CommandItem>
                                                                        ))
                                                                    }
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>

                                                {/* Garage Readiness Badge */}
                                                {veh.vehicle_id && (() => {
                                                    const vehNom = (nominations || []).find((n: any) => n.vehicle_id === veh.vehicle_id || n.truck_reg === veh.truck_reg);
                                                    if (!vehNom) {
                                                        return (
                                                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mt-1">
                                                                <AlertCircle className="w-3 h-3 text-slate-400" />
                                                                Not nominated to garage
                                                            </div>
                                                        );
                                                    }
                                                    if (vehNom.garage_readiness === 'Fit' || vehNom.status === 'Cleared') {
                                                        return (
                                                            <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                                Garage Cleared (Fit for Trip)
                                                            </div>
                                                        );
                                                    }
                                                    if (vehNom.garage_readiness === 'Unfit' || vehNom.status === 'Rejected') {
                                                        return (
                                                            <div className="flex items-center gap-1 text-[10px] text-rose-700 font-bold mt-1 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 w-fit" title={vehNom.garage_decision_notes || "Unfit"}>
                                                                <XCircle className="w-3 h-3 text-rose-600" />
                                                                Garage Warning: Vehicle Unfit!
                                                            </div>
                                                        );
                                                    }
                                                    if (vehNom.garage_readiness === 'Conditional') {
                                                        return (
                                                            <div className="flex items-center gap-1 text-[10px] text-amber-700 font-bold mt-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 w-fit" title={vehNom.garage_decision_notes || "Conditional"}>
                                                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                                Conditional Garage Clearance
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div className="flex items-center gap-1 text-[10px] text-purple-700 font-semibold mt-1 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 w-fit">
                                                            <Clock className="w-3 h-3 text-purple-600" />
                                                            Nomination Awaiting Inspection
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Trip Reference Number (Auto-Generated)</Label>
                                                <Input
                                                    value={veh.trip_number}
                                                    onChange={e => updateVehicleSlotField(vIdx, "trip_number", e.target.value)}
                                                    placeholder="Auto-generated on vehicle select..."
                                                    className="h-9 bg-indigo-50/40 border-indigo-200 text-xs font-bold text-indigo-900"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Linked Trailer</Label>
                                                <Input
                                                    value={veh.trailer_reg}
                                                    onChange={e => updateVehicleSlotField(vIdx, "trailer_reg", e.target.value)}
                                                    placeholder="Linked Trailer plate..."
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium text-slate-800"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Driver Name *</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            className={cn(
                                                                "w-full h-9 justify-between bg-white border-slate-200 text-xs font-semibold",
                                                                !veh.driver_name && "text-slate-400 font-normal"
                                                            )}
                                                        >
                                                            <span className="truncate">
                                                                {veh.driver_name || "Select / Search Driver..."}
                                                            </span>
                                                            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Search driver name..." className="h-8 text-xs" />
                                                            <CommandList>
                                                                <CommandEmpty className="p-2 text-xs text-center text-slate-500">No driver found.</CommandEmpty>
                                                                <CommandGroup className="max-h-[220px] overflow-auto">
                                                                    {drivers.map((d: any) => {
                                                                        const isExpired = d.license_expiry && new Date(d.license_expiry) < new Date();
                                                                        return (
                                                                            <CommandItem
                                                                                key={d.id}
                                                                                value={`${d.full_name} ${d.license_no || ''}`}
                                                                                onSelect={() => handleSelectDriverForVehicle(d, vIdx)}
                                                                                className="text-xs font-medium cursor-pointer"
                                                                            >
                                                                                <Check
                                                                                    className={cn(
                                                                                        "mr-2 h-3.5 w-3.5 text-indigo-600",
                                                                                        (veh.driver_id === d.id || veh.driver_name === d.full_name) ? "opacity-100" : "opacity-0"
                                                                                    )}
                                                                                />
                                                                                <div className="flex flex-col flex-1">
                                                                                    <span className="font-semibold text-slate-800">{d.full_name}</span>
                                                                                    <span className="text-[10px] text-slate-400">{d.phone_no || d.license_no || "No phone listed"}</span>
                                                                                </div>
                                                                                {isExpired && (
                                                                                    <Badge variant="outline" className="text-[8px] text-red-500 border-red-200">Expired</Badge>
                                                                                )}
                                                                            </CommandItem>
                                                                        );
                                                                    })}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Contact No</Label>
                                                <Input
                                                    value={veh.contact_no}
                                                    onChange={e => updateVehicleSlotField(vIdx, "contact_no", e.target.value)}
                                                    placeholder="e.g. +255..."
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">License No</Label>
                                                <Input
                                                    value={veh.license_no}
                                                    onChange={e => updateVehicleSlotField(vIdx, "license_no", e.target.value)}
                                                    placeholder="License #"
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Passport No</Label>
                                                <Input
                                                    value={veh.passport_no}
                                                    onChange={e => updateVehicleSlotField(vIdx, "passport_no", e.target.value)}
                                                    placeholder="Passport #"
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium"
                                                />
                                            </div>
                                        </div>

                                        {/* Vehicle Commercial & Pricing Details (Tanker vs Cargo Truck) */}
                                        <div className="mt-3 p-3 rounded-lg bg-slate-50/70 border border-slate-200/80">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                                                        Vehicle Commercial Agreement {veh.is_tanker ? "(Tanker Calculation)" : "(Cargo / Flat Rate)"}
                                                    </span>
                                                </div>
                                                {veh.is_tanker && (
                                                    <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[10px] font-bold px-2 py-0 h-5">
                                                        Tanker Unit Formula: (Qty ÷ 1000) × Rate
                                                    </Badge>
                                                )}
                                            </div>

                                            {veh.is_tanker ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-semibold text-slate-600">Amount to be Loaded (Litres / KG) *</Label>
                                                        <Input
                                                            type="number"
                                                            step="any"
                                                            placeholder="e.g. 35000"
                                                            value={veh.load_quantity || ""}
                                                            onChange={e => updateVehicleSlotField(vIdx, "load_quantity", e.target.value)}
                                                            className="h-8 bg-white border-slate-200 text-xs font-bold text-slate-800"
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-semibold text-slate-600">Rate per 1,000 *</Label>
                                                        <Input
                                                            type="number"
                                                            step="any"
                                                            placeholder="e.g. 100.00"
                                                            value={veh.rate_per_thousand || ""}
                                                            onChange={e => updateVehicleSlotField(vIdx, "rate_per_thousand", e.target.value)}
                                                            className="h-8 bg-white border-slate-200 text-xs font-bold text-slate-800"
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-semibold text-slate-600">= Calculated USD ($) *</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="0.00"
                                                            value={veh.agreed_amount_usd || ""}
                                                            onChange={e => updateVehicleSlotField(vIdx, "agreed_amount_usd", e.target.value)}
                                                            className="h-8 bg-emerald-50/50 border-emerald-300 text-xs font-black text-emerald-800"
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-semibold text-slate-600">= Equivalent (TSh)</Label>
                                                        <div className="h-8 px-2.5 bg-slate-100/90 border border-slate-200 rounded-md flex items-center justify-between text-xs font-bold text-slate-800">
                                                            <span className="text-[10px] text-slate-400">TSh</span>
                                                            <span className="font-mono text-emerald-700">
                                                                {(((parseFloat(veh.agreed_amount_usd || "0") || 0) * (parseFloat(formData.agreed_client_rate) || 0))).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-semibold text-slate-600">Vehicle Agreed Amount ($ USD) *</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="e.g. 3500.00"
                                                            value={veh.agreed_amount_usd || ""}
                                                            onChange={e => updateVehicleSlotField(vIdx, "agreed_amount_usd", e.target.value)}
                                                            className="h-8 bg-white border-slate-200 text-xs font-bold text-slate-900"
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-semibold text-slate-600">Equivalent in Local Currency (TSh)</Label>
                                                        <div className="h-8 px-2.5 bg-slate-100/90 border border-slate-200 rounded-md flex items-center justify-between text-xs font-bold text-slate-800">
                                                            <span className="text-[10px] text-slate-400">@ {formData.agreed_client_rate || "2700"}</span>
                                                            <span className="font-mono text-emerald-700">
                                                                {(((parseFloat(veh.agreed_amount_usd || "0") || 0) * (parseFloat(formData.agreed_client_rate) || 0))).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TSh
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Section 3: Consignment & Routing Details */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                Consignment & Routing Details
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5 sm:col-span-3">
                                    <Label className="text-xs font-semibold text-slate-600">Cargo Description</Label>
                                    <Input
                                        value={formData.cargo_description}
                                        onChange={e => setFormData(prev => ({ ...prev, cargo_description: e.target.value }))}
                                        placeholder="e.g. Copper Cathodes, 40FT Container, Fuel..."
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">BL / Consignment No</Label>
                                    <Input
                                        value={formData.bl_number}
                                        onChange={e => setFormData(prev => ({ ...prev, bl_number: e.target.value }))}
                                        placeholder="e.g. BL-984392"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Container No</Label>
                                    <Input
                                        value={formData.container_no}
                                        onChange={e => setFormData(prev => ({ ...prev, container_no: e.target.value }))}
                                        placeholder="e.g. MSKU-129482-1"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Delivery Destination *</Label>
                                    <Select 
                                        value={formData.destination} 
                                        onValueChange={v => {
                                            let autoRate = formData.agreed_amount_usd;
                                            let autoDays = formData.agreed_days;
                                            let autoCargo = formData.cargo_description;
                                            
                                            // Check Master Collection (DB first, then localStorage)
                                            const dbMatch = (dbRouteMaster as any[]).find((r: any) => r.destination?.toUpperCase() === v?.toUpperCase());
                                            if (dbMatch) {
                                                if (dbMatch.default_rate_usd) autoRate = String(dbMatch.default_rate_usd);
                                                if (dbMatch.agreed_days) autoDays = String(dbMatch.agreed_days);
                                                if (dbMatch.default_cargo && !formData.cargo_description) autoCargo = dbMatch.default_cargo;
                                            } else {
                                                try {
                                                    const savedRoutes = localStorage.getItem("master_collection_routes");
                                                    if (savedRoutes) {
                                                        const parsed = JSON.parse(savedRoutes);
                                                        const matched = parsed.find((r: any) => r.destination?.toUpperCase() === v?.toUpperCase());
                                                        if (matched) {
                                                            if (matched.default_rate_usd) autoRate = String(matched.default_rate_usd);
                                                            if (matched.agreed_days) autoDays = String(matched.agreed_days);
                                                            if (matched.default_cargo && !formData.cargo_description) autoCargo = matched.default_cargo;
                                                        }
                                                    }
                                                } catch (e) {}
                                            }

                                            setFormData(prev => ({ 
                                                ...prev, 
                                                destination: v,
                                                agreed_amount_usd: autoRate,
                                                agreed_days: autoDays,
                                                cargo_description: autoCargo
                                            }));

                                            // If cargo vehicles don't have an agreed amount yet, auto-fill with default route rate
                                            if (autoRate) {
                                                setVehicleAssignments(prev => prev.map(slot => {
                                                    if (!slot.is_tanker && (!slot.agreed_amount_usd || slot.agreed_amount_usd === "0")) {
                                                        return { ...slot, agreed_amount_usd: autoRate };
                                                    }
                                                    return slot;
                                                }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="h-10 bg-white border-slate-200 text-xs font-semibold">
                                            <SelectValue placeholder="Select Destination..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[220px]">
                                            {(() => {
                                                const dbNames = (dbRoutes as any[]).map((r: any) => r.location_name?.toUpperCase()).filter(Boolean);
                                                const masterNames = (dbRouteMaster as any[]).map((r: any) => r.destination?.toUpperCase()).filter(Boolean);
                                                const allDests = [...new Set([...dbNames, ...masterNames, ...STANDARD_DESTINATIONS])].sort();
                                                return allDests.map(d => (
                                                    <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                                                ));
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Route Origin</Label>
                                    <Input
                                        value={formData.origin}
                                        onChange={e => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                                        placeholder="DAR ES SALAAM"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs font-semibold text-slate-600">Agreed Duration (Days)</Label>
                                    <Input
                                        type="number"
                                        value={formData.agreed_days}
                                        onChange={e => setFormData(prev => ({ ...prev, agreed_days: e.target.value }))}
                                        placeholder="e.g. 5"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Order Accumulation Summary */}
                        <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    Order Accumulation Summary ({vehicleAssignments.length} Vehicle{vehicleAssignments.length > 1 ? 's' : ''})
                                </span>
                                <span className="text-[11px] text-slate-400">
                                    USD / TSh Rate: <span className="text-white font-mono font-bold">@{formData.agreed_client_rate || "2700"}</span>
                                </span>
                            </div>

                            <div className="space-y-1.5 text-xs max-h-40 overflow-y-auto pr-1">
                                {vehicleAssignments.map((veh, idx) => {
                                    const vUSD = parseFloat(veh.agreed_amount_usd || "0") || 0;
                                    const vLocal = vUSD * (parseFloat(formData.agreed_client_rate) || 0);
                                    return (
                                        <div key={veh.id || idx} className="flex items-center justify-between py-1 border-b border-slate-800/60 text-slate-300">
                                            <div className="flex items-center gap-2">
                                                <span className="w-4 h-4 rounded bg-slate-800 text-[10px] flex items-center justify-center font-bold text-slate-400">
                                                    {idx + 1}
                                                </span>
                                                <span className="font-semibold text-white">
                                                    {veh.truck_reg || `Vehicle #${idx + 1}`}
                                                </span>
                                                {veh.is_tanker ? (
                                                    <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[9px] px-1.5 py-0 h-4">
                                                        Tanker {veh.load_quantity ? `(${veh.load_quantity}L @ $${veh.rate_per_thousand})` : ''}
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[9px] px-1.5 py-0 h-4">
                                                        Cargo
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold text-emerald-400">
                                                    ${vUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="font-mono text-slate-400 text-[11px]">
                                                    {vLocal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TSh
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs font-bold">
                                <span className="text-white uppercase tracking-wider">Total Contracted Accumulated:</span>
                                <div className="text-right">
                                    <div className="text-base text-emerald-400 font-mono font-black">
                                        ${formAccumulatedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                    </div>
                                    <div className="text-[11px] text-slate-300 font-mono font-semibold">
                                        ≈ {agreedAmountLocal} TSh
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="flex items-center justify-between gap-3 pt-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsCreateOpen(false)}
                                className="h-10 text-xs font-bold"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={createOrderMutation.isPending}
                                className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider px-6 rounded-xl shadow-md"
                            >
                                {createOrderMutation.isPending ? "Submitting..." : "Submit Order For Approval"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ORDER DETAILS VIEW MODAL */}
            {selectedOrderDetails && (
                <Dialog open={!!selectedOrderDetails} onOpenChange={() => setSelectedOrderDetails(null)}>
                    <DialogContent className="max-w-2xl rounded-2xl p-6">
                        <DialogHeader>
                            <div className="flex items-center justify-between">
                                <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-indigo-600" />
                                    Trip Order Details: {selectedOrderDetails.trip_number || selectedOrderDetails.order_number}
                                </DialogTitle>
                                <Badge className="text-xs font-bold">
                                    {selectedOrderDetails.status}
                                </Badge>
                            </div>
                        </DialogHeader>

                        <div className="space-y-4 py-3 text-xs">
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div>
                                    <span className="text-slate-400 block font-medium">Client Name</span>
                                    <span className="font-bold text-slate-800 text-sm">{selectedOrderDetails.client_name}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Contracted USD</span>
                                    <span className="font-bold text-indigo-700 text-sm">${(parseFloat(selectedOrderDetails.agreed_amount_usd) || 0).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Negotiated Client Rate</span>
                                    <span className="font-semibold text-slate-700">@{selectedOrderDetails.agreed_client_rate}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Local Equivalent</span>
                                    <span className="font-bold text-emerald-700">{(parseFloat(selectedOrderDetails.agreed_amount_local) || 0).toLocaleString()} Local</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border p-4 rounded-xl border-slate-200">
                                <div>
                                    <span className="text-slate-400 block font-medium">Vehicle Reg (Horse)</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.truck_reg}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Linked Trailer</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.trailer_reg || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Driver Name</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.driver_name || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Driver Contact</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.contact_no || "—"}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border p-4 rounded-xl border-slate-200">
                                <div>
                                    <span className="text-slate-400 block font-medium">Destination</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.destination}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Cargo</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.cargo_description || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">BL / Consignment #</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.bl_number || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Container #</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.container_no || "—"}</span>
                                </div>
                            </div>

                            {selectedOrderDetails.status === "Approved" && (
                                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        <span className="font-bold text-emerald-900 text-xs">
                                            Approved by {selectedOrderDetails.approved_by_name || "Admin"}
                                        </span>
                                    </div>
                                    {selectedOrderDetails.approved_at && (
                                        <span className="text-[11px] text-emerald-700 font-medium">
                                            {format(new Date(selectedOrderDetails.approved_at), "dd MMM yyyy, HH:mm")}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button 
                                variant="outline" 
                                onClick={() => setSelectedOrderDetails(null)}
                                className="w-full text-xs font-bold"
                            >
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* APPROVAL / REJECTION CONFIRMATION MODAL */}
            <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
                <DialogContent className="max-w-md rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            {approvalAction === "Approve" ? (
                                <>
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                    Approve Trip Order{orderToApprove?.items?.length > 1 ? `s (${orderToApprove.items.length} Vehicles)` : ''}
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-5 h-5 text-rose-600" />
                                    Reject Trip Order{orderToApprove?.items?.length > 1 ? `s (${orderToApprove.items.length} Vehicles)` : ''}
                                </>
                            )}
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            {approvalAction === "Approve" 
                                ? `Are you sure you want to approve Order ${orderToApprove?.order_number || orderToApprove?.trip_number}? This will release the order${orderToApprove?.items?.length > 1 ? ` (${orderToApprove.items.length} vehicles)` : ''} to Finance for Trip Sheet creation.`
                                : `Please specify why you are rejecting Order ${orderToApprove?.order_number || orderToApprove?.trip_number}.`
                            }
                        </p>
                    </DialogHeader>

                    {approvalAction === "Reject" && (
                        <div className="space-y-2 py-2">
                            <Label className="text-xs font-semibold text-slate-600">Rejection Reason</Label>
                            <Textarea
                                placeholder="Explain why the order is rejected..."
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                className="text-xs border-slate-200 rounded-xl"
                            />
                        </div>
                    )}

                    <DialogFooter className="flex items-center gap-2 pt-2">
                        <Button 
                            variant="outline" 
                            onClick={() => setIsApprovalDialogOpen(false)}
                            className="h-9 text-xs font-bold flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (orderToApprove) {
                                    const idsToProcess = orderToApprove.items 
                                        ? orderToApprove.items.map((it: any) => it.id)
                                        : [orderToApprove.id];
                                    approveOrderMutation.mutate({
                                        orderIds: idsToProcess,
                                        status: approvalAction === "Approve" ? "Approved" : "Rejected",
                                        rejectionReason: rejectionReason
                                    });
                                }
                            }}
                            disabled={approveOrderMutation.isPending}
                            className={cn(
                                "h-9 text-xs font-bold text-white flex-1 rounded-xl shadow-sm",
                                approvalAction === "Approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                            )}
                        >
                            {approveOrderMutation.isPending ? "Processing..." : `Confirm ${approvalAction}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* EDIT ORDER MODAL */}
            <Dialog open={!!editingOrder} onOpenChange={(open) => { if (!open) { setEditingOrder(null); setEditFormData({}); } }}>
                <DialogContent className="max-w-lg rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Edit2 className="w-5 h-5 text-indigo-600" />
                            Edit Order — {editingOrder?.trip_number || editingOrder?.order_number}
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            Modify order details. Changes are saved immediately upon clicking Update.
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 pt-3">
                        <div>
                            <Label className="text-[11px] font-bold text-slate-600">Client</Label>
                            <Select
                                value={editFormData.client_name || ''}
                                onValueChange={(val) => setEditFormData((prev: any) => ({ ...prev, client_name: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs rounded-lg">
                                    <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientsList.map((c: any) => (
                                        <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-[11px] font-bold text-slate-600">Truck Reg</Label>
                                <Input
                                    value={editFormData.truck_reg || ''}
                                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, truck_reg: e.target.value }))}
                                    className="h-9 text-xs rounded-lg"
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-bold text-slate-600">Trailer Reg</Label>
                                <Input
                                    value={editFormData.trailer_reg || ''}
                                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, trailer_reg: e.target.value }))}
                                    className="h-9 text-xs rounded-lg"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-[11px] font-bold text-slate-600">Driver Name</Label>
                                <Input
                                    value={editFormData.driver_name || ''}
                                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, driver_name: e.target.value }))}
                                    className="h-9 text-xs rounded-lg"
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-bold text-slate-600">Contact No</Label>
                                <Input
                                    value={editFormData.contact_no || ''}
                                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, contact_no: e.target.value }))}
                                    className="h-9 text-xs rounded-lg"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[11px] font-bold text-slate-600">Destination</Label>
                            <Select
                                value={editFormData.destination || ''}
                                onValueChange={(val) => setEditFormData((prev: any) => ({ ...prev, destination: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs rounded-lg">
                                    <SelectValue placeholder="Select destination" />
                                </SelectTrigger>
                                <SelectContent>
                                    {STANDARD_DESTINATIONS.map(d => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-[11px] font-bold text-slate-600">Agreed Amount (USD)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={editFormData.agreed_amount_usd || ''}
                                    onChange={(e) => {
                                        const usd = e.target.value;
                                        const rate = parseFloat(editFormData.agreed_client_rate) || 2700;
                                        setEditFormData((prev: any) => ({
                                            ...prev,
                                            agreed_amount_usd: usd,
                                            agreed_amount_local: String((parseFloat(usd) || 0) * rate)
                                        }));
                                    }}
                                    className="h-9 text-xs rounded-lg"
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-bold text-slate-600">Exchange Rate</Label>
                                <Input
                                    type="number"
                                    value={editFormData.agreed_client_rate || ''}
                                    onChange={(e) => {
                                        const rate = e.target.value;
                                        const usd = parseFloat(editFormData.agreed_amount_usd) || 0;
                                        setEditFormData((prev: any) => ({
                                            ...prev,
                                            agreed_client_rate: rate,
                                            agreed_amount_local: String(usd * (parseFloat(rate) || 0))
                                        }));
                                    }}
                                    className="h-9 text-xs rounded-lg"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[11px] font-bold text-slate-600">Cargo Description</Label>
                            <Input
                                value={editFormData.cargo_description || ''}
                                onChange={(e) => setEditFormData((prev: any) => ({ ...prev, cargo_description: e.target.value }))}
                                className="h-9 text-xs rounded-lg"
                            />
                        </div>
                        <div>
                            <Label className="text-[11px] font-bold text-slate-600">Notes</Label>
                            <Textarea
                                value={editFormData.notes || ''}
                                onChange={(e) => setEditFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
                                className="text-xs rounded-lg min-h-[60px]"
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter className="flex items-center gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => { setEditingOrder(null); setEditFormData({}); }}
                            className="h-9 text-xs font-bold flex-1 rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (editingOrder) {
                                    const updates: any = {};
                                    if (editFormData.client_name) updates.client_name = editFormData.client_name;
                                    if (editFormData.truck_reg) updates.truck_reg = editFormData.truck_reg;
                                    if (editFormData.trailer_reg) updates.trailer_reg = editFormData.trailer_reg;
                                    if (editFormData.driver_name) updates.driver_name = editFormData.driver_name;
                                    if (editFormData.contact_no !== undefined) updates.contact_no = editFormData.contact_no;
                                    if (editFormData.destination) updates.destination = editFormData.destination;
                                    if (editFormData.agreed_amount_usd) updates.agreed_amount_usd = editFormData.agreed_amount_usd;
                                    if (editFormData.agreed_client_rate) updates.agreed_client_rate = editFormData.agreed_client_rate;
                                    if (editFormData.agreed_amount_local) updates.agreed_amount_local = editFormData.agreed_amount_local;
                                    if (editFormData.cargo_description !== undefined) updates.cargo_description = editFormData.cargo_description;
                                    if (editFormData.notes !== undefined) updates.notes = editFormData.notes;
                                    updateOrderMutation.mutate({ orderId: editingOrder.id, updates });
                                }
                            }}
                            disabled={updateOrderMutation.isPending}
                            className="h-9 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex-1 rounded-xl shadow-sm gap-1.5"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {updateOrderMutation.isPending ? "Saving..." : "Update Order"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* SPLIT / RE-ASSIGN ORDER MODAL */}
            <Dialog 
                open={!!splittingGroup} 
                onOpenChange={(open) => { 
                    if (!open) { 
                        setSplittingGroup(null); 
                        setSplitSelectedIds([]); 
                        setSplitTargetClient(""); 
                    } 
                }}
            >
                <DialogContent className="max-w-2xl rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Split className="w-5 h-5 text-indigo-600" />
                            Split Order — {splittingGroup?.order_number}
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            Move selected vehicles from current client (<strong className="text-slate-800">{splittingGroup?.client_name}</strong>) to a different client under a new sequential order reference.
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 pt-3">
                        {/* Target Client Selection */}
                        <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100">
                            <Label className="text-xs font-bold text-indigo-950 mb-1 block">
                                Destination Client for Split Vehicles *
                            </Label>
                            <Select
                                value={splitTargetClient}
                                onValueChange={setSplitTargetClient}
                            >
                                <SelectTrigger className="h-9 text-xs bg-white rounded-lg border-indigo-200">
                                    <SelectValue placeholder="-- Select New Client (e.g. Olympic Petroleum(T) Limited) --" />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientsList
                                        .filter((c: any) => c.name !== splittingGroup?.client_name)
                                        .map((c: any) => (
                                            <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-indigo-600 mt-1.5 font-medium">
                                Selected vehicles will be transferred to this client with their own new Order Number (e.g. SEL-0002).
                            </p>
                        </div>

                        {/* Vehicle Selection Table */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs font-bold text-slate-700">
                                    Select Vehicles to Move ({splitSelectedIds.length} of {splittingGroup?.items?.length || 0} selected)
                                </Label>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            if (splittingGroup?.items) {
                                                setSplitSelectedIds(splittingGroup.items.map((it: any) => it.id));
                                            }
                                        }}
                                        className="h-7 text-[11px] text-indigo-600 hover:text-indigo-800"
                                    >
                                        Select All
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSplitSelectedIds([])}
                                        className="h-7 text-[11px] text-slate-500 hover:text-slate-800"
                                    >
                                        Deselect All
                                    </Button>
                                </div>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="w-10 text-center">#</TableHead>
                                            <TableHead className="text-xs font-bold">Vehicle / Plate</TableHead>
                                            <TableHead className="text-xs font-bold">Trip #</TableHead>
                                            <TableHead className="text-xs font-bold">Driver</TableHead>
                                            <TableHead className="text-xs font-bold">Destination</TableHead>
                                            <TableHead className="text-xs font-bold text-right">Amount (USD)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {splittingGroup?.items?.map((item: any, idx: number) => {
                                            const isChecked = splitSelectedIds.includes(item.id);
                                            return (
                                                <TableRow 
                                                    key={item.id}
                                                    onClick={() => {
                                                        if (isChecked) {
                                                            setSplitSelectedIds(prev => prev.filter(id => id !== item.id));
                                                        } else {
                                                            setSplitSelectedIds(prev => [...prev, item.id]);
                                                        }
                                                    }}
                                                    className={cn(
                                                        "cursor-pointer transition-colors text-xs",
                                                        isChecked ? "bg-indigo-50/70 hover:bg-indigo-100/70" : "hover:bg-slate-50"
                                                    )}
                                                >
                                                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                                                        <input 
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSplitSelectedIds(prev => [...prev, item.id]);
                                                                } else {
                                                                    setSplitSelectedIds(prev => prev.filter(id => id !== item.id));
                                                                }
                                                            }}
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-bold text-slate-800">
                                                        {item.truck_reg} {item.trailer_reg && <span className="text-slate-400 font-normal text-[11px]">/ {item.trailer_reg}</span>}
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-indigo-900">
                                                        {item.trip_number || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-slate-600">
                                                        {item.driver_name || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-slate-600">
                                                        {item.destination || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-slate-900">
                                                        ${(parseFloat(item.agreed_amount_usd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Summary preview */}
                        {splitSelectedIds.length > 0 && splitTargetClient && (
                            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    Split Outcome Summary:
                                </div>
                                <div className="pl-5 text-[11px] space-y-0.5">
                                    <div>
                                        • Remaining under <strong>{splittingGroup?.client_name}</strong>: <strong>{(splittingGroup?.items?.length || 0) - splitSelectedIds.length}</strong> vehicle(s) in Order <strong>{splittingGroup?.order_number}</strong>
                                    </div>
                                    <div>
                                        • Moving to <strong>{splitTargetClient}</strong>: <strong>{splitSelectedIds.length}</strong> vehicle(s) under a <strong>New Sequential Order Number</strong>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex items-center gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSplittingGroup(null);
                                setSplitSelectedIds([]);
                                setSplitTargetClient("");
                            }}
                            className="h-9 text-xs font-bold flex-1 rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!splitTargetClient) {
                                    toast({ variant: "destructive", title: "Client Required", description: "Please select a target client." });
                                    return;
                                }
                                if (splitSelectedIds.length === 0) {
                                    toast({ variant: "destructive", title: "Selection Required", description: "Please select at least one vehicle to move." });
                                    return;
                                }

                                // Calculate next SEL-xxxx sequential order number
                                let nextOrderSeq = 1;
                                try {
                                    const { data: allExistingOrders } = await supabase
                                        .from("logistics_trip_orders" as any)
                                        .select("order_number");
                                    
                                    if (allExistingOrders && allExistingOrders.length > 0) {
                                        let maxNum = 0;
                                        allExistingOrders.forEach((o: any) => {
                                            const match = o.order_number?.match(/SEL-(\d+)/i);
                                            if (match && match[1]) {
                                                const parsed = parseInt(match[1], 10);
                                                if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
                                            }
                                        });
                                        nextOrderSeq = maxNum > 0 ? maxNum + 1 : allExistingOrders.length + 1;
                                    }
                                } catch (err) {
                                    nextOrderSeq = (orders?.length || 0) + 1;
                                }

                                const newOrderNumber = `SEL-${String(nextOrderSeq).padStart(4, '0')}`;

                                splitOrderMutation.mutate({
                                    orderIds: splitSelectedIds,
                                    newClientName: splitTargetClient,
                                    newOrderNumber
                                });
                            }}
                            disabled={splitOrderMutation.isPending || splitSelectedIds.length === 0 || !splitTargetClient}
                            className="h-9 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex-1 rounded-xl shadow-sm gap-1.5"
                        >
                            <Split className="w-3.5 h-3.5" />
                            {splitOrderMutation.isPending ? "Splitting..." : `Confirm Split (${splitSelectedIds.length} Vehicles)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* NOMINATE VEHICLE MODAL */}
            <Dialog open={isNominateOpen} onOpenChange={setIsNominateOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Bell className="w-5 h-5 text-purple-600" />
                            Nominate Vehicle to Garage
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            Notify the garage team that this vehicle is targeted for an upcoming order. The workshop will perform a pre-trip readiness check and mark it as Fit, Unfit, or Conditional.
                        </p>
                    </DialogHeader>

                    <form 
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!nominationForm.selected_vehicles || nominationForm.selected_vehicles.length === 0) {
                                toast({ variant: "destructive", title: "Vehicle(s) Required", description: "Please select at least one vehicle to nominate." });
                                return;
                            }
                            if (!nominationForm.target_destination) {
                                toast({ variant: "destructive", title: "Destination Required", description: "Please select a destination route." });
                                return;
                            }

                            // Generate nomination records for each selected vehicle with the shared destination route
                            const payloads = nominationForm.selected_vehicles.map(veh => ({
                                vehicle_id: veh.vehicle_id,
                                truck_reg: veh.truck_reg,
                                trailer_id: veh.trailer_id || null,
                                trailer_reg: veh.trailer_reg || null,
                                driver_id: null,
                                driver_name: null,
                                target_destination: nominationForm.target_destination || null,
                                expected_departure_date: nominationForm.expected_departure_date || null,
                                cargo_type: nominationForm.cargo_type || null,
                                logistics_notes: nominationForm.logistics_notes || null,
                                nominated_by: user?.id,
                                nominated_by_name: userProfile?.full_name || user?.email || "Logistics",
                                status: "Pending Inspection",
                                garage_readiness: "Pending"
                            }));

                            createNominationMutation.mutate(payloads);
                        }}
                        className="space-y-4 pt-2"
                    >
                        {/* Multi-Vehicle Selection */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold text-slate-700">
                                    Select Vehicles / Horses *
                                </Label>
                                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                    {nominationForm.selected_vehicles.length} vehicle(s) chosen
                                </span>
                            </div>

                            {/* Selected Vehicle Chips */}
                            {nominationForm.selected_vehicles.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl min-h-[42px] items-center">
                                    {nominationForm.selected_vehicles.map(v => (
                                        <Badge
                                            key={v.vehicle_id}
                                            variant="secondary"
                                            className="bg-white border border-indigo-200 text-indigo-900 text-xs font-bold pl-2.5 pr-1 py-1 flex items-center gap-1 shadow-2xs"
                                        >
                                            <Truck className="w-3.5 h-3.5 text-indigo-600 mr-0.5" />
                                            <span>{v.truck_reg}</span>
                                            {v.trailer_reg && <span className="text-[10px] text-slate-400 font-normal">({v.trailer_reg})</span>}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNominationForm(prev => ({
                                                        ...prev,
                                                        selected_vehicles: prev.selected_vehicles.filter(sv => sv.vehicle_id !== v.vehicle_id)
                                                    }));
                                                }}
                                                className="ml-1 hover:bg-rose-100 hover:text-rose-700 rounded p-0.5 text-slate-400"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            {/* Vehicle Selector Popover */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        type="button"
                                        className="w-full h-10 justify-between bg-white border-slate-200 text-xs font-medium"
                                    >
                                        <span className="flex items-center gap-2 text-slate-600">
                                            <Plus className="w-4 h-4 text-indigo-600" />
                                            Click to add vehicles for this nomination...
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[380px] p-0 z-[9999]" align="start">
                                    <Command>
                                        <CommandInput placeholder="Type to search horse / truck..." className="h-8 text-xs" />
                                        <CommandList>
                                            <CommandEmpty className="p-2 text-xs text-center text-slate-500">No vehicle found.</CommandEmpty>
                                            <CommandGroup className="max-h-[240px] overflow-auto">
                                                {fleet
                                                    .filter(f => f.asset_type === 'Truck' || f.asset_type === 'Horse')
                                                    .map(v => {
                                                        const isSelected = nominationForm.selected_vehicles.some(sv => sv.vehicle_id === v.id);
                                                        return (
                                                            <CommandItem
                                                                key={v.id}
                                                                value={`${v.vehicle_no} ${v.make_model || ''}`}
                                                                onSelect={() => {
                                                                    if (isSelected) {
                                                                        // Deselect
                                                                        setNominationForm(prev => ({
                                                                            ...prev,
                                                                            selected_vehicles: prev.selected_vehicles.filter(sv => sv.vehicle_id !== v.id)
                                                                        }));
                                                                    } else {
                                                                        // Select
                                                                        const activeCoupling = couplings.find((c: any) => c.horse_id === v.id);
                                                                        const pairedTrailer = activeCoupling ? fleet.find(f => f.id === activeCoupling.trailer_id) : null;
                                                                        setNominationForm(prev => ({
                                                                            ...prev,
                                                                            selected_vehicles: [
                                                                                ...prev.selected_vehicles,
                                                                                {
                                                                                    vehicle_id: v.id,
                                                                                    truck_reg: v.vehicle_no,
                                                                                    trailer_id: pairedTrailer?.id,
                                                                                    trailer_reg: pairedTrailer?.vehicle_no
                                                                                }
                                                                            ]
                                                                        }));
                                                                    }
                                                                }}
                                                                className="text-xs font-medium cursor-pointer flex items-center justify-between"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Check
                                                                        className={cn(
                                                                            "h-3.5 w-3.5 text-indigo-600",
                                                                            isSelected ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    <span className="font-bold text-slate-800">{v.vehicle_no}</span>
                                                                    {v.make_model && <span className="text-[11px] text-slate-400">({v.make_model})</span>}
                                                                </div>
                                                                {isSelected && (
                                                                    <Badge className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200">
                                                                        Selected
                                                                    </Badge>
                                                                )}
                                                            </CommandItem>
                                                        );
                                                    })
                                                }
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Shared Destination & Expected Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Target Route / Destination *</Label>
                                <Select
                                    value={nominationForm.target_destination}
                                    onValueChange={val => setNominationForm(prev => ({ ...prev, target_destination: val }))}
                                >
                                    <SelectTrigger className="h-9 text-xs bg-white">
                                        <SelectValue placeholder="Select Destination" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STANDARD_DESTINATIONS.map(d => (
                                            <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Expected Departure Date</Label>
                                <Input
                                    type="date"
                                    value={nominationForm.expected_departure_date}
                                    onChange={e => setNominationForm(prev => ({ ...prev, expected_departure_date: e.target.value }))}
                                    className="h-9 text-xs"
                                />
                            </div>
                        </div>

                        {/* Cargo Type */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">Cargo Type / Planned Load</Label>
                            <Input
                                value={nominationForm.cargo_type}
                                onChange={e => setNominationForm(prev => ({ ...prev, cargo_type: e.target.value }))}
                                placeholder="e.g. Copper Cathodes, Fuel, Bagged Cement, Container..."
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Logistics Notes to Garage */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">Notes / Inspection Instructions for Garage</Label>
                            <Textarea
                                value={nominationForm.logistics_notes}
                                onChange={e => setNominationForm(prev => ({ ...prev, logistics_notes: e.target.value }))}
                                placeholder="e.g. Route has rough terrain; check tyre tread, suspensions, and brakes for all selected vehicles..."
                                className="text-xs min-h-[70px]"
                            />
                        </div>

                        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2">
                            <div>
                                {nominationForm.selected_vehicles.length > 0 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={clearNominationDraft}
                                        className="h-9 text-[11px] text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2"
                                    >
                                        Clear Form
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsNominateOpen(false)}
                                    className="h-9 text-xs font-bold rounded-xl"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={createNominationMutation.isPending}
                                    className="h-9 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs gap-1.5"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    {createNominationMutation.isPending
                                        ? "Sending to Garage..."
                                        : `Nominate ${nominationForm.selected_vehicles.length > 0 ? `${nominationForm.selected_vehicles.length} Vehicle(s)` : 'Vehicles'}`}
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
