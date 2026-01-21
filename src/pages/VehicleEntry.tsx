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
import { ArrowLeft, History } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { getCurrentShiftDate, getCurrentShiftName } from "@/lib/shiftUtils";
import offlineDataManager from "@/lib/offlineDataManager";

export default function VehicleEntry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousEntry, setPreviousEntry] = useState<any>(null);
  const [showPreviousData, setShowPreviousData] = useState(false);

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
        setVehicleTypes(data || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Normalize vehicle number (uppercase, trim whitespace)
    const normalizedVehicleNo = formData.vehicle_no.toUpperCase().trim();

    try {
      let existingEntries = [];

      if (navigator.onLine) {
        // Online: check with Supabase
        const { data, error: checkError } = await supabase
          .from("vehicle_entries")
          .select("id, vehicle_no, status, wb_number")
          .eq("vehicle_no", normalizedVehicleNo)
          .eq("completed", false);

        if (checkError) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to check for existing vehicle entries",
          });
          setIsSubmitting(false);
          return;
        }
        existingEntries = data;
      } else {
        // Offline: use cached data to check for duplicates
        const cachedEntries = JSON.parse(localStorage.getItem('cached_entries') || '{}');
        const cachedEntry = cachedEntries[normalizedVehicleNo];
        if (cachedEntry && !cachedEntry.completed) {
          existingEntries = [cachedEntry];
        }
      }

      if (existingEntries && existingEntries.length > 0) {
        const existingEntry = existingEntries[0];

        let pendingWeigh = null;

        if (navigator.onLine) {
          // Check if it's in pending weighs for more details
          const { data } = await supabase
            .from("pending_weighs")
            .select("*")
            .eq("vehicle_no", normalizedVehicleNo)
            .maybeSingle();
          pendingWeigh = data;
        } else {
          // In offline mode, use cached pending weighs if available
          const cachedPending = JSON.parse(localStorage.getItem('cached_pending_weighs') || '{}');
          pendingWeigh = cachedPending[normalizedVehicleNo] || null;
        }

        toast({
          variant: "destructive",
          title: "⚠️ Vehicle Already In System",
          description: pendingWeigh
            ? `Vehicle ${normalizedVehicleNo} is already in the system.

Entry ID: WB-${existingEntry.wb_number}
Status: ${pendingWeigh.return_status}
Attempts: ${(pendingWeigh.weigh_attempts || 0) + 1}/3
Expected Return: ${pendingWeigh.expected_return_time ? format(new Date(pendingWeigh.expected_return_time), "MMM dd, HH:mm") : "N/A"}

This vehicle cannot be added again until it's marked as completed.`
            : `Vehicle ${normalizedVehicleNo} is already in the system.

Entry ID: WB-${existingEntry.wb_number}
Status: ${existingEntry.status}

This vehicle cannot be added again until it's marked as completed.`,
        });
        setIsSubmitting(false);
        return;
      }
      // Get current shift using corrected night shift date logic
      const shiftDate = getCurrentShiftDate();
      const shiftName = getCurrentShiftName();

      let shiftId;

      if (navigator.onLine) {
        // Check if shift exists for current shift date with same name
        const { data: existingShift } = await supabase
          .from("shifts")
          .select("*")
          .eq("shift_name", shiftName)
          .eq("shift_date", shiftDate)
          .maybeSingle();

        shiftId = existingShift?.id;

        if (!shiftId) {
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
        }
      } else {
        // In offline mode, use a temporary shift ID or cached shift
        const cachedShifts = JSON.parse(localStorage.getItem('cached_shifts') || '{}');
        const key = `${shiftDate}_${shiftName}`;

        if (cachedShifts[key]) {
          shiftId = cachedShifts[key].id;
        } else {
          // Create a temporary offline shift
          const offlineShiftId = `offline_${Date.now()}`;
          cachedShifts[key] = {
            id: offlineShiftId,
            shift_name: shiftName,
            shift_date: shiftDate,
            operator_id: user?.id
          };
          localStorage.setItem('cached_shifts', JSON.stringify(cachedShifts));
          shiftId = offlineShiftId;
        }
      }

      // Get vehicle type details
      const vehicleType = vehicleTypes?.find((vt) => vt.id === formData.vehicle_type_id);

      // Get user profile for entered_by field
      let profile = null;

      if (navigator.onLine) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", user?.id)
          .single();
        profile = data;
      } else {
        // In offline mode, get cached user profile
        const cachedAuth = offlineDataManager.getCachedData('user_auth');
        profile = cachedAuth ? {
          full_name: cachedAuth.fullName,
          username: cachedAuth.username
        } : null;
      }

      const enteredByName = (profile?.full_name && profile?.full_name !== "User")
        ? profile?.full_name
        : profile?.username || "Unknown";

      // Insert vehicle entry with operator tracking (use normalized vehicle number)
      let entry;
      let entryError;

      if (navigator.onLine) {
        const result = await supabase
          .from("vehicle_entries")
          .insert({
            ...formData,
            vehicle_no: normalizedVehicleNo, // Use normalized vehicle number
            shift_id: shiftId,
            operator_id: user?.id,
            category: vehicleType?.category,
            status: "AwaitingFirstWeigh",
            entered_by: enteredByName,
          })
          .select()
          .single();

        entry = result.data;
        entryError = result.error;

        if (entryError) throw entryError;
      } else {
        // In offline mode, store the entry in localStorage
        const offlineEntryId = `offline_entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        entry = {
          id: offlineEntryId,
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

        // Store in offline queue
        const offlineQueue = JSON.parse(localStorage.getItem('offline_entry_queue') || '[]');
        offlineQueue.push({
          type: 'vehicle_entry',
          operation: 'create',
          data: entry,
          timestamp: Date.now()
        });
        localStorage.setItem('offline_entry_queue', JSON.stringify(offlineQueue));

        // Update cached entries
        const cachedEntries = JSON.parse(localStorage.getItem('cached_entries') || '{}');
        cachedEntries[normalizedVehicleNo] = entry;
        localStorage.setItem('cached_entries', JSON.stringify(cachedEntries));
      }

      toast({
        title: "Success",
        description: `Vehicle ${formData.vehicle_no} registered successfully. Proceed to weighing.`,
      });

      // Navigate to the weighing page
      navigate(`/weigh/${entry.id}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
            {isMVCategory && (
              <div className="space-y-2 p-4 border rounded-md bg-muted/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="came_loaded"
                    checked={formData.came_loaded}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, came_loaded: checked as boolean })
                    }
                  />
                  <Label htmlFor="came_loaded" className="font-medium cursor-pointer">
                    Vehicle arrived loaded (with cargo)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  {formData.came_loaded
                    ? "First weigh will record gross weight (loaded). Second weigh will record tare weight (empty)."
                    : "First weigh will record tare weight (empty). Second weigh will record gross weight (loaded)."}
                </p>
              </div>
            )}

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
    </div>
  );
}
