import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Scale, Filter, Printer, Truck, CheckCircle, Clock } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";

type VehicleCategory = "MV-Company" | "MV-PublicSeller" | "MV-Supplier";

interface WeighRecord {
  weigh_number: number | null;
  gross_weight: number | null;
  tare_weight: number | null;
  net_weight: number | null;
  weigh_time: string | null;
}

interface VehicleType {
  type_name: string;
  category: string;
}

interface VehicleEntry {
  id: string;
  wb_number: number;
  vehicle_no: string;
  category: string;
  driver_name: string | null;
  customer_farmer_name: string | null;
  item_name: string | null;
  source_destination: string | null;
  entry_time: string;
  completed: boolean | null;
  vehicle_types: VehicleType | null;
  weigh_records: WeighRecord[];
}

const getShiftFromTime = (time: string) => {
  const hour = new Date(time).getHours();
  return hour >= 7 && hour < 18 ? "Day" : "Night";
};

export default function AdminCompanyWeights() {
  const [startDate, setStartDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftFilter, setShiftFilter] = useState<"All" | "Day" | "Night">("All");
  const [categoryFilter, setCategoryFilter] = useState<"All" | VehicleCategory>("All");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["company-weights", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_entries")
        .select(`
          id,
          wb_number,
          vehicle_no,
          category,
          driver_name,
          customer_farmer_name,
          item_name,
          source_destination,
          entry_time,
          completed,
          vehicle_types (type_name, category),
          weigh_records (weigh_number, gross_weight, tare_weight, net_weight, weigh_time)
        `)
        .in("category", ["MV-Company", "MV-PublicSeller", "MV-Supplier"])
        .gte("entry_time", startOfDay(new Date(startDate)).toISOString())
        .lte("entry_time", endOfDay(new Date(endDate)).toISOString())
        .order("entry_time", { ascending: false });

      if (error) throw error;
      return data as VehicleEntry[];
    },
  });

  const filteredEntries = entries?.filter((entry) => {
    const matchesShift =
      shiftFilter === "All" || getShiftFromTime(entry.entry_time) === shiftFilter;
    const matchesCategory =
      categoryFilter === "All" || entry.category === categoryFilter;
    return matchesShift && matchesCategory;
  });

  // Get first weigh data - show the actual weight captured (Gross if came loaded, Tare if empty)
  const getFirstWeighData = (records: WeighRecord[]) => {
    const first = records?.find((r) => r.weigh_number === 1);
    if (!first) return { weight: null, type: null };
    // First weigh captures either Gross (if loaded) or Tare (if empty)
    if (first.gross_weight !== null && first.gross_weight > 0) {
      return { weight: first.gross_weight, type: "Gross" };
    }
    if (first.tare_weight !== null && first.tare_weight > 0) {
      return { weight: first.tare_weight, type: "Tare" };
    }
    return { weight: null, type: null };
  };

  // Get second weigh data - the opposite of first weigh
  const getSecondWeighData = (records: WeighRecord[]) => {
    const second = records?.find((r) => r.weigh_number === 2);
    if (!second) return { weight: null, type: null };
    // Second weigh captures the opposite (Tare if first was Gross, Gross if first was Tare)
    if (second.gross_weight !== null && second.gross_weight > 0) {
      return { weight: second.gross_weight, type: "Gross" };
    }
    if (second.tare_weight !== null && second.tare_weight > 0) {
      return { weight: second.tare_weight, type: "Tare" };
    }
    return { weight: null, type: null };
  };

  const calculateNetWeight = (records: WeighRecord[]) => {
    const first = records?.find((r) => r.weigh_number === 1);
    const second = records?.find((r) => r.weigh_number === 2);
    
    if (!first || !second) return null;
    
    // Get actual gross and tare values
    const grossWeight = first.gross_weight || second.gross_weight;
    const tareWeight = first.tare_weight || second.tare_weight;
    
    if (grossWeight !== null && tareWeight !== null) {
      return Math.abs(grossWeight - tareWeight);
    }
    return null;
  };

  // Summary calculations
  const totalVehicles = filteredEntries?.length || 0;
  const completedVehicles =
    filteredEntries?.filter((e) => e.completed).length || 0;
  const pendingVehicles = totalVehicles - completedVehicles;
  const totalNetWeight =
    filteredEntries?.reduce((sum, entry) => {
      const net = calculateNetWeight(entry.weigh_records);
      return sum + (net || 0);
    }, 0) || 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <img 
            src="/images/energy-feeds-logo.jpg" 
            alt="Energy Feeds" 
            className="h-10 object-contain"
          />
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Scale className="h-8 w-8" />
              Company Weight Reports
            </h1>
            <p className="text-muted-foreground">
              Track MV-category vehicle weights and net cargo
            </p>
          </div>
        </div>
        <Button onClick={handlePrint} className="print:hidden">
          <Printer className="h-4 w-4 mr-2" />
          Print Report
        </Button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block text-center mb-6">
        <img 
          src="/images/energy-feeds-logo.jpg" 
          alt="Energy Feeds" 
          className="h-16 mx-auto mb-2"
        />
        <h1 className="text-2xl font-bold">ENERGY FEEDS LIMITED</h1>
        <p className="text-sm">Under SudSud Group</p>
        <h2 className="text-xl font-semibold mt-2">Company Weight Report</h2>
      </div>

      <div id="print-receipt">

      {/* Filters */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select
                value={shiftFilter}
                onValueChange={(v) => setShiftFilter(v as "All" | "Day" | "Night")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom">
                  <SelectItem value="All">All Shifts</SelectItem>
                  <SelectItem value="Day">Day Shift</SelectItem>
                  <SelectItem value="Night">Night Shift</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v as "All" | VehicleCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom">
                  <SelectItem value="All">All Categories</SelectItem>
                  <SelectItem value="MV-Company">MV-Company</SelectItem>
                  <SelectItem value="MV-PublicSeller">MV-PublicSeller</SelectItem>
                  <SelectItem value="MV-Supplier">MV-Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Vehicles</p>
                <p className="text-2xl font-bold">{totalVehicles}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedVehicles}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-500/10 rounded-full">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending 2nd Weigh</p>
                <p className="text-2xl font-bold">{pendingVehicles}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-full">
                <Scale className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Net Weight</p>
                <p className="text-2xl font-bold">
                  {totalNetWeight.toLocaleString()} kg
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Weight Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading...
            </div>
          ) : filteredEntries && filteredEntries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry ID</TableHead>
                    <TableHead>Vehicle No</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Customer/Farmer</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Source/Destination</TableHead>
                    <TableHead className="text-right">1st Weigh (kg)</TableHead>
                    <TableHead className="text-right">2nd Weigh (kg)</TableHead>
                    <TableHead className="text-right">Net Weight (kg)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entry Time</TableHead>
                    <TableHead>Shift</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const firstWeighData = getFirstWeighData(entry.weigh_records);
                    const secondWeighData = getSecondWeighData(entry.weigh_records);
                    const netWeight = calculateNetWeight(entry.weigh_records);
                    const shift = getShiftFromTime(entry.entry_time);

                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          WB-{entry.wb_number}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.vehicle_no}
                        </TableCell>
                        <TableCell>
                          {entry.vehicle_types?.type_name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.category}</Badge>
                        </TableCell>
                        <TableCell>{entry.driver_name || "-"}</TableCell>
                        <TableCell>{entry.customer_farmer_name || "-"}</TableCell>
                        <TableCell>{entry.item_name || "-"}</TableCell>
                        <TableCell>{entry.source_destination || "-"}</TableCell>
                        <TableCell className="text-right">
                          {firstWeighData.weight !== null ? (
                            <span title={firstWeighData.type || ""}>
                              {firstWeighData.weight.toLocaleString()}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({firstWeighData.type})
                              </span>
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {secondWeighData.weight !== null ? (
                            <span title={secondWeighData.type || ""}>
                              {secondWeighData.weight.toLocaleString()}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({secondWeighData.type})
                              </span>
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {netWeight !== null ? (
                            <span className="text-primary">
                              {netWeight.toLocaleString()}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.completed ? (
                            <Badge className="bg-green-500">Completed</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(
                            new Date(entry.entry_time),
                            "MMM dd, yyyy HH:mm"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{shift}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No MV-category vehicles found for the selected filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print Footer */}
      <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
        <p>
          Report generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}
        </p>
        <p>
          Period: {format(new Date(startDate), "MMM dd, yyyy")} -{" "}
          {format(new Date(endDate), "MMM dd, yyyy")} | Shift: {shiftFilter} |
          Category: {categoryFilter}
        </p>
      </div>
      </div>
    </div>
  );
}
