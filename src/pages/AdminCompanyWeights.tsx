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

  // Helper to sort records by time
  const getSortedRecords = (records: WeighRecord[]) => {
    return [...(records || [])].sort((a, b) => {
      const timeA = new Date(a.weigh_time || 0).getTime();
      const timeB = new Date(b.weigh_time || 0).getTime();
      return timeA - timeB;
    });
  };

  // Get first weigh data - show the actual weight captured
  const getFirstWeighData = (records: WeighRecord[]) => {
    const sorted = getSortedRecords(records);
    const first = sorted[0]; // First chronological record

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
    const sorted = getSortedRecords(records);
    if (sorted.length < 2) return { weight: null, type: null };

    const second = sorted[sorted.length - 1]; // Last chronological record

    // Second weigh captures the opposite
    if (second.gross_weight !== null && second.gross_weight > 0) {
      return { weight: second.gross_weight, type: "Gross" };
    }
    if (second.tare_weight !== null && second.tare_weight > 0) {
      return { weight: second.tare_weight, type: "Tare" };
    }
    return { weight: null, type: null };
  };

  const calculateNetWeight = (records: WeighRecord[]) => {
    const sorted = getSortedRecords(records);
    if (sorted.length < 2) return null;

    // Use first and last records
    const first = sorted[0];
    const second = sorted[sorted.length - 1];

    // Helper to get the actual weight value from a record
    const getWeightVal = (r: WeighRecord) => {
      if (r.gross_weight && r.gross_weight > 0) return r.gross_weight;
      if (r.tare_weight && r.tare_weight > 0) return r.tare_weight;
      return 0;
    };

    const w1 = getWeightVal(first);
    const w2 = getWeightVal(second);

    // Calculate difference if both have values
    if (w1 > 0 && w2 > 0) {
      return Math.abs(w1 - w2);
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

      <div id="print-receipt">
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
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2 print:mb-4">
          <Card className="print:shadow-none print:border">
            <CardContent className="pt-6 print:p-2">
              <div className="flex items-center gap-4 print:gap-2">
                <div className="p-3 bg-primary/10 rounded-full print:hidden">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground print:text-[10px] print:whitespace-nowrap">Total Vehicles</p>
                  <p className="text-2xl font-bold print:text-lg">{totalVehicles}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="print:shadow-none print:border">
            <CardContent className="pt-6 print:p-2">
              <div className="flex items-center gap-4 print:gap-2">
                <div className="p-3 bg-green-500/10 rounded-full print:hidden">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground print:text-[10px] print:whitespace-nowrap">Completed</p>
                  <p className="text-2xl font-bold print:text-lg">{completedVehicles}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="print:shadow-none print:border">
            <CardContent className="pt-6 print:p-2">
              <div className="flex items-center gap-4 print:gap-2">
                <div className="p-3 bg-yellow-500/10 rounded-full print:hidden">
                  <Clock className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground print:text-[10px] print:whitespace-nowrap">Pending</p>
                  <p className="text-2xl font-bold print:text-lg">{pendingVehicles}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="print:shadow-none print:border">
            <CardContent className="pt-6 print:p-2">
              <div className="flex items-center gap-4 print:gap-2">
                <div className="p-3 bg-blue-500/10 rounded-full print:hidden">
                  <Scale className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground print:text-[10px] print:whitespace-nowrap">Total Net Weight</p>
                  <p className="text-2xl font-bold print:text-lg whitespace-nowrap">
                    {totalNetWeight.toLocaleString()} kg
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <Card className="print:shadow-none print:border-none">
          <CardHeader className="print:hidden">
            <CardTitle>Vehicle Weight Records</CardTitle>
          </CardHeader>
          <CardContent className="print:p-0">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading...
              </div>
            ) : filteredEntries && filteredEntries.length > 0 ? (
              <div className="overflow-x-auto print:overflow-visible">
                <Table className="print:text-[9px] print:w-full print:table-fixed">
                  <TableHeader>
                    <TableRow className="print:h-8">
                      <TableHead className="print:w-[5%]">ID</TableHead>
                      <TableHead className="print:w-[10%]">Vehicle</TableHead>
                      <TableHead className="print:hidden">Type</TableHead>
                      {/* Category Removed */}
                      <TableHead className="print:w-[9%]">Driver</TableHead>
                      <TableHead className="print:w-[9%]">Customer</TableHead>
                      <TableHead className="print:w-[7%]">Item</TableHead>
                      <TableHead className="print:w-[8%]">Route</TableHead>
                      <TableHead className="text-right print:w-[12%]">1st (kg)</TableHead>
                      <TableHead className="text-right print:w-[12%]">2nd (kg)</TableHead>
                      <TableHead className="text-right print:w-[12%]">Net (kg)</TableHead>
                      <TableHead className="print:hidden">Status</TableHead>
                      <TableHead className="print:w-[10%]">Time</TableHead>
                      <TableHead className="print:hidden">Shift</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => {
                      const firstWeighData = getFirstWeighData(entry.weigh_records);
                      const secondWeighData = getSecondWeighData(entry.weigh_records);
                      const netWeight = calculateNetWeight(entry.weigh_records);
                      const shift = getShiftFromTime(entry.entry_time);

                      return (
                        <TableRow key={entry.id} className="print:h-8">
                          <TableCell className="font-medium p-2 print:p-1">
                            {entry.wb_number}
                          </TableCell>
                          <TableCell className="font-medium p-2 print:p-1 truncate">
                            {entry.vehicle_no}
                          </TableCell>
                          <TableCell className="p-2 print:p-1 print:hidden">
                            {entry.vehicle_types?.type_name || "-"}
                          </TableCell>
                          {/* Category Removed */}
                          <TableCell className="p-2 print:p-1 truncate max-w-[80px]">{entry.driver_name || "-"}</TableCell>
                          <TableCell className="p-2 print:p-1 truncate max-w-[80px]">{entry.customer_farmer_name || "-"}</TableCell>
                          <TableCell className="p-2 print:p-1 truncate max-w-[60px]">{entry.item_name || "-"}</TableCell>
                          <TableCell className="p-2 print:p-1 truncate max-w-[80px]">{entry.source_destination || "-"}</TableCell>
                          <TableCell className="text-right p-2 print:p-1 font-mono whitespace-nowrap print:text-[8px] tracking-tight">
                            {firstWeighData.weight !== null ? firstWeighData.weight.toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-right p-2 print:p-1 font-mono whitespace-nowrap print:text-[8px] tracking-tight">
                            {secondWeighData.weight !== null ? secondWeighData.weight.toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-right font-bold p-2 print:p-1 font-mono whitespace-nowrap print:text-[8px] tracking-tight">
                            {netWeight !== null ? (
                              <span className="text-primary print:text-black">
                                {netWeight.toLocaleString()}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="p-2 print:p-1 print:hidden">
                            {entry.completed ? (
                              <Badge className="bg-green-500">Completed</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="p-2 print:p-1 text-[8px] whitespace-nowrap">
                            {format(new Date(entry.entry_time), "MM/dd HH:mm")}
                          </TableCell>
                          <TableCell className="p-2 print:p-1 print:hidden">
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
