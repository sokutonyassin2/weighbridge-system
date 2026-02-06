import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, History, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { getCurrentShiftDate, getCurrentShiftName } from "@/lib/shiftUtils";
import offlineDataManager from "@/lib/offlineDataManager";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function VehicleEntry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousEntry, setPreviousEntry] = useState<any>(null);
  const [showPreviousData, setShowPreviousData] = useState(false);

  // New State for Overdue Warning
  const [overdueWarningOpen, setOverdueWarningOpen] = useState(false);
  const [overdueDetails, setOverdueDetails] = useState<any>(null);


  const [formData, setFormData] = useState({
    vehicle_no: "",
    vehicle_type_id: "",
    driver_name: "",
    driver_contact: "",
    cargo_description: "",
    customer_farmer_name: "",
    item_name: "",
    source_destination: "",
    came_loaded: true,
  });

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const isMVCategory = selectedCategory && ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(selectedCategory);

  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [loadingVehicleTypes, setLoadingVehicleTypes] = useState(true);

  useEffect(() => {
    const fetchVehicleTypes = async () => {
      setLoadingVehicleTypes(true);
      try {
        const data = await offlineDataManager.updateCachedData('vehicle_types', async () => {
          const { data, error } = await supabase
            .from("vehicle_types")
            .select("*")
            .order("type_name");
          if (error) throw error;
          return data;
        });
        const activeTypes = (data || []).filter((t: any) => !t.type_name.startsWith("[ARCHIVED]"));
        setVehicleTypes(activeTypes);
      } catch (error) {
        console.error('Error fetching vehicle types:', error);
        // Fallback to cached data if available
        const cachedData = offlineDataManager.getCachedData('vehicle_types');
        if (cachedData) {
          setVehicleTypes(cachedData);
        }
      } finally {
        setLoadingVehicleTypes(false);
      }
    };

    fetchVehicleTypes();

    // Listen for online/offline changes to update data accordingly
    const handleOnline = () => {
      fetchVehicleTypes();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Automate Arrived Loaded Checkbox for MV categories
  useEffect(() => {
    if (selectedCategory === "MV-Supplier" || selectedCategory === "MV-PublicSeller") {
      setFormData(prev => ({ ...prev, came_loaded: true }));
    } else if (selectedCategory === "MV-Company") {
      setFormData(prev => ({ ...prev, came_loaded: false }));
    }
  }, [selectedCategory]);

  // Check for prefill parameter from global search
  useEffect(() => {
    const prefillVehicle = searchParams.get("prefill");
    if (prefillVehicle) {
      setFormData(prev => ({ ...prev, vehicle_no: prefillVehicle.toUpperCase() }));
    }
  }, [searchParams]);

  // Search for previous entry when vehicle number changes (debounced)
  useEffect(() => {
    const searchPreviousEntry = async () => {
      const vehicleNo = formData.vehicle_no.trim().toUpperCase();

      if (vehicleNo.length < 3) {
        setPreviousEntry(null);
        setShowPreviousData(false);
        return;
      }

      try {
        let data = null;

        if (navigator.onLine) {
          // Online: fetch from Supabase
          const { data: result, error } = await supabase
            .from("vehicle_entries")
            .select(`
              *,
              vehicle_types (id, type_name, category)
            `)
            .eq("vehicle_no", vehicleNo)
            .eq("completed", true)
            .order("entry_time", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;
          data = result;
        } else {
          // Offline: try to get from localStorage cache
          const cachedEntries = JSON.parse(localStorage.getItem('cached_entries') || '{}');
          data = cachedEntries[vehicleNo] || null;
        }

        if (data) {
          setPreviousEntry(data);
          setShowPreviousData(true);
        } else {
          setPreviousEntry(null);
          setShowPreviousData(false);
        }
      } catch (error) {
        console.error("Error searching previous entries:", error);
        // If online search fails, try to use cached data
        if (!navigator.onLine) {
          const cachedEntries = JSON.parse(localStorage.getItem('cached_entries') || '{}');
          const cachedData = cachedEntries[vehicleNo] || null;
          if (cachedData) {
            setPreviousEntry(cachedData);
            setShowPreviousData(true);
          }
        }
      }
    };

    const debounce = setTimeout(searchPreviousEntry, 500);
    return () => clearTimeout(debounce);
  }, [formData.vehicle_no]);

  const handleUsePreviousDetails = () => {
    if (!previousEntry) return;

    setFormData(prev => ({
      ...prev,
      driver_name: previousEntry.driver_name || "",
      vehicle_type_id: previousEntry.vehicle_type_id || "",
      customer_farmer_name: previousEntry.customer_farmer_name || "",
      item_name: previousEntry.item_name || "",
      source_destination: previousEntry.source_destination || "",
      cargo_description: previousEntry.cargo_description || "",
    }));

    if (previousEntry.vehicle_types?.category) {
      setSelectedCategory(previousEntry.vehicle_types.category);
    }

    toast({
      title: "Previous Details Loaded",
      description: "Fields auto-filled with previous entry data. You can edit any field before submitting.",
    });
  };

  // Helper to normalize vehicle number (remove spaces and special chars)
  const normalizeVehicleNo = (no: string) => no.replace(/[^A-Z0-9]/g, '');

  const startEntryProcess = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    const normalizedInput = normalizeVehicleNo(formData.vehicle_no.toUpperCase());
    const displayVehicleNo = formData.vehicle_no.toUpperCase().trim();
    const shiftDate = getCurrentShiftDate();
    const shiftName = getCurrentShiftName();

    try {
      // START PARALLEL CHECKS: Existing, Overdue, and Shift in one go
      const [existingResult, overdueResult, shiftResult] = await Promise.all([
        // 1. DUPLICATE CHECK
        navigator.onLine ? (async () => {
          const { data, error } = await supabase
            .from("vehicle_entries")
            .select("id, vehicle_no, status, wb_number")
            .eq("completed", false)
            .ilike("vehicle_no", displayVehicleNo); // More efficient lookup

          if (error) return { data: [], error };
          // Still filter normalized to be safe
          return { data: data.filter(e => normalizeVehicleNo(e.vehicle_no) === normalizedInput), error: null };
        })() : (async () => {
          const cachedEntries = JSON.parse(localStorage.getItem('cached_entries') || '{}');
          const filtered = Object.values(cachedEntries).filter((e: any) =>
            !e.completed && normalizeVehicleNo(e.vehicle_no) === normalizedInput
          );
          return { data: filtered, error: null };
        })(),

        // 2. OVERDUE HISTORICAL CHECK
        navigator.onLine ? supabase
          .from("overdue_vehicles_history")
          .select("*")
          .ilike("vehicle_no", displayVehicleNo)
          .order("overdue_time", { ascending: false })
          .limit(1)
          .maybeSingle() : Promise.resolve({ data: null, error: null }),

        // 3. SHIFT CHECK (Get ID early)
        navigator.onLine ? supabase
          .from("shifts")
          .select("id")
          .eq("shift_name", shiftName)
          .eq("shift_date", shiftDate)
          .maybeSingle() : (async () => {
            const cachedShifts = JSON.parse(localStorage.getItem('cached_shifts') || '{}');
            const key = `${shiftDate}_${shiftName}`;
            return { data: cachedShifts[key] || null, error: null };
          })()
      ]);

      if (existingResult.error) throw existingResult.error;

      // --- Process Duplicate Check ---
      if (existingResult.data && existingResult.data.length > 0) {
        const existingEntry = existingResult.data[0] as any;
        let pendingWeigh = null;

        if (navigator.onLine) {
          const { data } = await supabase
            .from("pending_weighs")
            .select("*")
            .eq("entry_id", existingEntry.id)
            .maybeSingle();
          pendingWeigh = data;
        }

        toast({
          variant: "destructive",
          title: "⚠️ Vehicle Already In System",
          description: pendingWeigh
            ? `Vehicle ${displayVehicleNo} is already in the system (WB-${existingEntry.wb_number}). Status: ${pendingWeigh.return_status}.`
            : `Vehicle ${displayVehicleNo} is already in the system (WB-${existingEntry.wb_number}). Status: ${existingEntry.status}.`,
        });
        setIsSubmitting(false);
        return;
      }

      // --- Process Overdue Warning ---
      if (overdueResult.data) {
        setOverdueDetails(overdueResult.data);
        setOverdueWarningOpen(true);
        setIsSubmitting(false);
        return;
      }

      // --- Proceed to Creation with pre-fetched shift result ---
      await createVehicleEntry(shiftResult.data?.id);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
      setIsSubmitting(false);
    }
  };

  const createVehicleEntry = async (existingShiftId?: string) => {
    const normalizedVehicleNo = formData.vehicle_no.toUpperCase().trim();
    const shiftDate = getCurrentShiftDate();
    const shiftName = getCurrentShiftName();

    let shiftId = existingShiftId;

    if (navigator.onLine && !shiftId) {
      const { data: newShift, error: shiftError } = await supabase
        .from("shifts")
        .insert({
          shift_name: shiftName,
          shift_date: shiftDate,
          operator_id: user?.id,
          start_time: new Date().toISOString(),
          end_time: new Date(new Date().getTime() + 12 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (shiftError) throw shiftError;
      shiftId = newShift.id;
    } else if (!shiftId) {
      // Offline shift logic (Fallback)
      const offlineShiftId = `offline_${Date.now()}`;
      shiftId = offlineShiftId;
    }

    const vehicleType = vehicleTypes?.find((vt) => vt.id === formData.vehicle_type_id);

    // Use userProfile from AuthContext instead of fetching it again
    const enteredByName = (userProfile?.full_name && userProfile?.full_name !== "User")
      ? userProfile?.full_name
      : userProfile?.username || "Unknown";

    let entry;
    if (navigator.onLine) {
      const { data, error } = await supabase
        .from("vehicle_entries")
        .insert({
          ...formData,
          vehicle_no: normalizedVehicleNo,
          shift_id: shiftId,
          operator_id: user?.id,
          category: vehicleType?.category,
          status: "AwaitingFirstWeigh",
          entered_by: enteredByName,
        })
        .select()
        .single();

      if (error) throw error;
      entry = data;
    } else {
      entry = {
        id: `offline_entry_${Date.now()}`,
        ...formData,
        vehicle_no: normalizedVehicleNo,
        shift_id: shiftId,
        operator_id: user?.id,
        category: vehicleType?.category,
        status: "AwaitingFirstWeigh",
        entered_by: enteredByName,
        created_at: new Date().toISOString(),
        completed: false
      };

      const offlineQueue = JSON.parse(localStorage.getItem('offline_entry_queue') || '[]');
      offlineQueue.push({ type: 'vehicle_entry', operation: 'create', data: entry, timestamp: Date.now() });
      localStorage.setItem('offline_entry_queue', JSON.stringify(offlineQueue));
    }

    toast({ title: "Success", description: `Vehicle ${formData.vehicle_no} registered successfully.` });
    navigate(`/weigh/${entry.id}`);
    setIsSubmitting(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New Vehicle Entry</h1>
          <p className="text-muted-foreground">Register a new vehicle for weighing</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Details</CardTitle>
          <CardDescription>Enter the vehicle information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={startEntryProcess} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_no">Vehicle Number *</Label>
              <Input
                id="vehicle_no"
                placeholder="e.g., T-865-AHE"
                value={formData.vehicle_no}
                onChange={(e) =>
                  setFormData({ ...formData, vehicle_no: e.target.value })
                }
                required
              />

              {/* Previous Entry Suggestion */}
              {showPreviousData && previousEntry && (
                <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <History className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                          Found previous entry for {previousEntry?.vehicle_no || "N/A"}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Last entry: {previousEntry?.entry_time ? (() => {
                            const date = new Date(previousEntry?.entry_time);
                            return isNaN(date.getTime()) ? "Invalid date" : format(date, "MMM dd, yyyy");
                          })() : "N/A"}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Type: {previousEntry?.vehicle_types?.type_name || "N/A"} • Driver: {previousEntry?.driver_name || "N/A"}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          onClick={handleUsePreviousDetails}
                        >
                          <History className="mr-2 h-4 w-4" />
                          Use Previous Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vehicle_type">Vehicle Type *</Label>
              <Select
                value={formData.vehicle_type_id || ''}
                onValueChange={(value) => {
                  if (value !== 'loading' && value !== 'no-types') {
                    setFormData({ ...formData, vehicle_type_id: value });
                    const selectedType = vehicleTypes?.find((vt) => vt.id === value);
                    if (selectedType) {
                      setSelectedCategory(selectedType.category);
                    }
                  }
                }}
                disabled={loadingVehicleTypes}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingVehicleTypes ? "Loading vehicle types..." : "Select vehicle type"} />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" align="start" className="max-h-[300px]">
                  {loadingVehicleTypes ? (
                    <SelectItem value="loading" disabled>
                      Loading vehicle types...
                    </SelectItem>
                  ) : vehicleTypes && vehicleTypes.length > 0 ? (
                    vehicleTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.type_name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-types" disabled>
                      No vehicle types available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

              {/* Display selected vehicle type fee */}
              {formData.vehicle_type_id && (
                <div className="p-3 bg-muted rounded-md mt-2">
                  <p className="text-sm">
                    <span className="font-medium">Selected:</span>
                    {vehicleTypes?.find(vt => vt.id === formData.vehicle_type_id)?.type_name}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Fee:</span> TShs
                    {parseFloat(
                      vehicleTypes?.find(vt => vt.id === formData.vehicle_type_id)?.first_weigh_fee?.toString() || "0"
                    ).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver_name">Driver Name *</Label>
              <Input
                id="driver_name"
                placeholder="Driver's name"
                value={formData.driver_name}
                onChange={(e) =>
                  setFormData({ ...formData, driver_name: e.target.value })
                }
                required
              />
            </div>


            {/* MV-Category: Arrived Loaded Checkbox */}
            {/* MV-Category: Arrived Loaded Checkbox - HIDDEN as per user request (Auto-set in logic) 
            {isMVCategory && (
              <div className="space-y-2 p-4 border rounded-md bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="came_loaded"
                    checked={formData.came_loaded}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, came_loaded: checked as boolean })
                    }
                  />
                  <Label htmlFor="came_loaded" className="font-semibold cursor-pointer text-blue-900 dark:text-blue-100 flex items-center gap-2">
                    Vehicle arrived loaded (with cargo)
                    <Badge variant="outline" className="text-[10px] font-normal border-blue-200 text-blue-600 bg-white">Auto-set by category</Badge>
                  </Label>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 ml-6 font-medium">
                  {formData.came_loaded
                    ? "First weigh will record gross weight (loaded). Second weigh will record tare weight (empty)."
                    : "First weigh will record tare weight (empty). Second weigh will record gross weight (loaded)."}
                </p>
              </div>
            )}
            */ }

            {/* Conditional fields for MV categories */}
            {selectedCategory && !["JV-Payment", "JV-Free", "Transit"].includes(selectedCategory) && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="customer_farmer_name">Customer/Farmer Name</Label>
                  <Input
                    id="customer_farmer_name"
                    placeholder="Customer or farmer name"
                    value={formData.customer_farmer_name}
                    onChange={(e) =>
                      setFormData({ ...formData, customer_farmer_name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="item_name">Item Name</Label>
                  <Input
                    id="item_name"
                    placeholder="Item name"
                    value={formData.item_name}
                    onChange={(e) =>
                      setFormData({ ...formData, item_name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="source_destination">Source/Destination</Label>
                  <Input
                    id="source_destination"
                    placeholder="Source or destination"
                    value={formData.source_destination}
                    onChange={(e) =>
                      setFormData({ ...formData, source_destination: e.target.value })
                    }
                  />
                </div>

                {!isMVCategory && (
                  <div className="space-y-2">
                    <Label htmlFor="cargo_description">Cargo Description</Label>
                    <Textarea
                      id="cargo_description"
                      placeholder="Describe the cargo..."
                      value={formData.cargo_description}
                      onChange={(e) =>
                        setFormData({ ...formData, cargo_description: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Registering..." : "Register Vehicle"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={overdueWarningOpen} onOpenChange={setOverdueWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Vehicle Found in Overdue History
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vehicle <strong>{overdueDetails?.vehicle_no}</strong> was marked as overdue/expired from a previous session
              (Overdue since: {overdueDetails?.overdue_time ? format(new Date(overdueDetails.overdue_time), "MMM dd, HH:mm") : "Unknown"}).
              <br /><br />
              Do you want to create a NEW entry for this vehicle? This will start a fresh 12-hour cycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setOverdueWarningOpen(false);
              createVehicleEntry();
            }}>
              Yes, Create New Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
