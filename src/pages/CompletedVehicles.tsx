import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Calendar, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getShiftTimeWindow } from "@/lib/shiftUtils";

export default function CompletedVehicles() {
  const { userRole, user } = useAuth();
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedShift, setSelectedShift] = useState<"All" | "Day" | "Night">("All");

  // Fetch current shift for operators
  const { data: currentShift } = useQuery({
    queryKey: ["current-shift", user?.id],
    queryFn: async () => {
      if (userRole !== "operator") return null;
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("operator_id", user?.id)
        .is("end_time", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: userRole === "operator",
  });

  // Fetch completed vehicles using time-based filtering for accurate shift attribution
  const { data: completedVehicles, isLoading } = useQuery({
    queryKey: ["completed-vehicles", dateFrom, dateTo, vehicleSearch, selectedShift],
    queryFn: async () => {
      // For specific shift selection, use time windows
      if (selectedShift !== "All") {
        // Get completed vehicles where their weigh time falls within the shift window
        const { startTime, endTime } = getShiftTimeWindow(dateTo, selectedShift as "Day" | "Night");
        
        // Query weigh_records to find vehicles completed within the shift time window
        const { data: weighRecords } = await supabase
          .from("weigh_records")
          .select("entry_id, weigh_time")
          .gte("weigh_time", startTime)
          .lte("weigh_time", endTime);
        
        const entryIds = [...new Set(weighRecords?.map(w => w.entry_id).filter(Boolean) || [])];
        
        if (entryIds.length === 0) return [];
        
        let query = supabase
          .from("vehicle_entries")
          .select(`
            *,
            vehicle_types(type_name),
            shifts(shift_name, id, shift_date)
          `)
          .eq("completed", true)
          .in("id", entryIds)
          .order("created_at", { ascending: false });

        if (vehicleSearch) {
          query = query.ilike("vehicle_no", `%${vehicleSearch}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      }
      
      // For "All" shifts, use date range filtering
      let query = supabase
        .from("vehicle_entries")
        .select(`
          *,
          vehicle_types(type_name),
          shifts(shift_name, id, shift_date)
        `)
        .eq("completed", true)
        .gte("created_at", `${dateFrom}T00:00:00+03:00`)
        .lte("created_at", `${dateTo}T23:59:59+03:00`)
        .order("created_at", { ascending: false });

      if (vehicleSearch) {
        query = query.ilike("vehicle_no", `%${vehicleSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Simple summary
  const totalVehicles = completedVehicles?.length || 0;

  // Admin-only: Time-based totals
  const { data: timeTotals } = useQuery({
    queryKey: ["time-totals"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      // Rolling 7 days instead of calendar week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
      const yearStart = format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd");

      const fetchTotal = async (from: string, to: string) => {
        const { data: vehicles } = await supabase
          .from("vehicle_entries")
          .select("id")
          .eq("completed", true)
          .gte("created_at", `${from}T00:00:00+03:00`)
          .lte("created_at", `${to}T23:59:59+03:00`);

        if (!vehicles || vehicles.length === 0) return 0;

        const payments = await Promise.all(
          vehicles.map(async (v) => {
            const [paymentsResult, penaltiesResult] = await Promise.all([
              supabase.from("payments").select("amount").eq("entry_id", v.id),
              supabase.from("penalties").select("amount").eq("entry_id", v.id),
            ]);
            return (
              (paymentsResult.data?.reduce((s, p) => s + Number(p.amount), 0) || 0) +
              (penaltiesResult.data?.reduce((s, p) => s + Number(p.amount), 0) || 0)
            );
          })
        );

        return payments.reduce((sum, p) => sum + p, 0);
      };

      const [todayTotal, weekTotal, monthTotal, yearTotal] = await Promise.all([
        fetchTotal(today, today),
        fetchTotal(format(weekStart, "yyyy-MM-dd"), today),
        fetchTotal(monthStart, today),
        fetchTotal(yearStart, today),
      ]);

      return { todayTotal, weekTotal, monthTotal, yearTotal };
    },
    enabled: userRole === "admin",
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Completed Vehicles</h1>
        <p className="text-muted-foreground">
          View all completed vehicle records
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Total Completed Vehicles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{totalVehicles}</div>
          <p className="text-xs text-muted-foreground">View financial details in Cashier Dashboard</p>
        </CardContent>
      </Card>

      {/* Admin Only: Time-based Totals */}
      {userRole === "admin" && timeTotals && (
        <Card>
          <CardHeader>
            <CardTitle>Overall Financial Summary</CardTitle>
            <CardDescription>Comprehensive totals across all shifts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-xl font-bold">TShs {timeTotals.todayTotal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last 7 Days</p>
                <p className="text-xl font-bold">TShs {timeTotals.weekTotal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-xl font-bold">TShs {timeTotals.monthTotal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Year</p>
                <p className="text-xl font-bold">TShs {timeTotals.yearTotal.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={selectedShift} onValueChange={(value: "All" | "Day" | "Night") => setSelectedShift(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Shifts</SelectItem>
                  <SelectItem value="Day">Day Shift (07:00 - 18:00)</SelectItem>
                  <SelectItem value="Night">Night Shift (18:00 - 07:00)</SelectItem>
                </SelectContent>
              </Select>
              {selectedShift === "Night" && (
                <p className="text-xs text-muted-foreground">
                  Night shift spans from previous day 18:00 to selected date 07:00
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Vehicle Number</Label>
              <Input
                placeholder="Search vehicle..."
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vehicles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Completed Vehicles</CardTitle>
          <CardDescription>
            All completed vehicles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : completedVehicles?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No completed vehicles found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Vehicle Type</TableHead>
                  <TableHead>Driver Name</TableHead>
                  <TableHead>Entry Time</TableHead>
                  <TableHead>Completion Time</TableHead>
                  <TableHead>Entered By</TableHead>
                  <TableHead>Shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedVehicles?.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.vehicle_no}</TableCell>
                    <TableCell>{vehicle.vehicle_types?.type_name || "N/A"}</TableCell>
                    <TableCell>{vehicle.driver_name || "N/A"}</TableCell>
                    <TableCell>{format(new Date(vehicle.entry_time), "MMM dd, HH:mm")}</TableCell>
                    <TableCell>{format(new Date(vehicle.created_at), "MMM dd, HH:mm")}</TableCell>
                    <TableCell>{vehicle.entered_by || "N/A"}</TableCell>
                    <TableCell>{vehicle.shifts?.shift_name || "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
