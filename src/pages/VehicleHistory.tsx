import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Clock, AlertCircle, Scale, Printer } from "lucide-react";
import { format } from "date-fns";

export default function VehicleHistory() {
  const [vehicleNo, setVehicleNo] = useState("");
  const [searchVehicle, setSearchVehicle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedShift, setSelectedShift] = useState("all");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const { data: shifts } = useQuery({
    queryKey: ["shifts-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .order("shift_date", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data;
    },
  });

  const { data: vehicleData, isLoading } = useQuery({
    queryKey: ["vehicle-history", searchVehicle, startDate, endDate, selectedShift, startTime, endTime, statusFilter, paymentFilter],
    queryFn: async () => {
      if (!searchVehicle) return null;

      // Fetch all vehicle entries for this vehicle
      let entriesQuery = supabase
        .from("vehicle_entries")
        .select(`
          *,
          vehicle_types (*),
          weigh_records (*),
          shifts (*)
        `)
        .ilike("vehicle_no", `%${searchVehicle}%`);

      // Apply date filters
      if (startDate) {
        entriesQuery = entriesQuery.gte("entry_time", new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        entriesQuery = entriesQuery.lte("entry_time", endDateTime.toISOString());
      }

      // Apply shift filter
      if (selectedShift !== "all") {
        entriesQuery = entriesQuery.eq("shift_id", selectedShift);
      }

      // Apply status filter
      if (statusFilter !== "all") {
        entriesQuery = entriesQuery.eq("status", statusFilter);
      }

      entriesQuery = entriesQuery.order("entry_time", { ascending: false });

      const { data: entries, error: entriesError } = await entriesQuery;
      if (entriesError) throw entriesError;

      // Apply time filter client-side
      let filteredEntries = entries;
      if (startTime || endTime) {
        filteredEntries = entries?.filter(entry => {
          const entryDate = new Date(entry.entry_time);
          const entryHour = entryDate.getHours();
          const entryMinute = entryDate.getMinutes();
          const entryTimeValue = entryHour * 60 + entryMinute;

          if (startTime) {
            const [startHour, startMinute] = startTime.split(":").map(Number);
            const startTimeValue = startHour * 60 + startMinute;
            if (entryTimeValue < startTimeValue) return false;
          }

          if (endTime) {
            const [endHour, endMinute] = endTime.split(":").map(Number);
            const endTimeValue = endHour * 60 + endMinute;
            if (entryTimeValue > endTimeValue) return false;
          }

          return true;
        });
      }

      // Fetch payments for this vehicle
      let paymentsQuery = supabase
        .from("payments")
        .select("*")
        .ilike("vehicle_no", `%${searchVehicle}%`);

      if (paymentFilter !== "all") {
        paymentsQuery = paymentsQuery.eq("payment_status", paymentFilter as "Pending" | "Paid" | "Overdue" | "Waived");
      }

      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Fetch penalties for this vehicle
      const { data: penalties, error: penaltiesError } = await supabase
        .from("penalties")
        .select("*")
        .ilike("vehicle_no", `%${searchVehicle}%`);
      if (penaltiesError) throw penaltiesError;

      return {
        entries: filteredEntries || [],
        payments: payments || [],
        penalties: penalties || [],
      };
    },
    enabled: !!searchVehicle,
  });

  const handleSearch = () => {
    setSearchVehicle(vehicleNo.trim().toUpperCase());
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setSelectedShift("all");
    setStartTime("");
    setEndTime("");
    setStatusFilter("all");
    setPaymentFilter("all");
  };

  // Calculate summary statistics
  const stats = vehicleData ? {
    totalWeighs: vehicleData.entries.reduce((sum, e) => sum + (e.weigh_records?.length || 0), 0),
    totalPayments: vehicleData.payments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0),
    totalPenalties: vehicleData.penalties.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0),
    avgWeight: (() => {
      const completedEntries = vehicleData.entries.filter(e => e.status === "Completed");
      if (completedEntries.length === 0) return 0;

      const totalNetWeight = completedEntries.reduce((sum, e) => {
        // Use the net weight from the latest record of the entry
        const net = e.weigh_records?.[e.weigh_records.length - 1]?.net_weight || 0;
        return sum + parseFloat(net.toString());
      }, 0);

      return totalNetWeight / completedEntries.length;
    })(),
    totalEntries: vehicleData.entries.length,
  } : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vehicle History</h1>
        <p className="text-muted-foreground">View complete history for any vehicle</p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle>Search Vehicle</CardTitle>
          <CardDescription>Enter vehicle number to view complete history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Enter vehicle number (e.g., T123ABC)"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters Section */}
      {searchVehicle && (
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shifts</SelectItem>
                    {shifts?.map((shift) => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.shift_name} - {format(new Date(shift.shift_date), "dd/MM/yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Entry Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="AwaitingSecondWeigh">Awaiting Second Weigh</SelectItem>
                    <SelectItem value="AwaitingFirstWeigh">Awaiting First Weigh</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Scale className="mx-auto h-8 w-8 text-primary mb-2" />
                <p className="text-2xl font-bold">{stats.totalWeighs}</p>
                <p className="text-sm text-muted-foreground">Total Weighs</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Clock className="mx-auto h-8 w-8 text-blue-500 mb-2" />
                <p className="text-2xl font-bold">{stats.totalEntries}</p>
                <p className="text-sm text-muted-foreground">Total Entries</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="flex items-center justify-center h-8 w-8 mx-auto mb-2 bg-green-100 rounded-full">
                  <span className="text-[10px] font-bold text-green-600">TShs</span>
                </div>
                <p className="text-2xl font-bold">{stats.totalPayments.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Payments</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="flex items-center justify-center h-8 w-8 mx-auto mb-2 bg-red-100 rounded-full">
                  <span className="text-[10px] font-bold text-red-600">TShs</span>
                </div>
                <p className="text-2xl font-bold">{stats.totalPenalties.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Penalties</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Scale className="mx-auto h-8 w-8 text-purple-500 mb-2" />
                <p className="text-2xl font-bold">{stats.avgWeight.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Avg Net Weight (kg)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline of Events */}
      {isLoading && searchVehicle && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading history...
          </CardContent>
        </Card>
      )}

      {!isLoading && searchVehicle && vehicleData && vehicleData.entries.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No entries found for vehicle {searchVehicle}
          </CardContent>
        </Card>
      )}

      {vehicleData && vehicleData.entries.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center print:hidden">
            <h2 className="text-2xl font-bold">Complete History for {searchVehicle}</h2>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print History
            </Button>
          </div>

          {/* Printable Report Header */}
          <div id="print-receipt" className="print:block hidden print:p-4">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">ENERGY FEEDS LIMITED</h1>
              <p className="text-sm">Under SudSud Group</p>
              <h2 className="text-xl font-semibold mt-4">Vehicle History Report</h2>
              <p className="mt-2"><strong>Vehicle No:</strong> {searchVehicle}</p>
              <p><strong>Report Date:</strong> {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
              {startDate && <p><strong>From:</strong> {format(new Date(startDate), "MMM dd, yyyy")}</p>}
              {endDate && <p><strong>To:</strong> {format(new Date(endDate), "MMM dd, yyyy")}</p>}
            </div>

            {/* Summary Statistics for Print */}
            <div className="mb-6 border-2 border-black p-4">
              <h3 className="font-bold mb-2 text-lg">Summary Statistics</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><strong>Total Entries:</strong> {stats?.totalEntries || 0}</p>
                <p><strong>Total Weighs:</strong> {stats?.totalWeighs || 0}</p>
                <p><strong>Total Payments:</strong> TShs {stats?.totalPayments?.toLocaleString() || 0}</p>
                <p><strong>Total Penalties:</strong> TShs {stats?.totalPenalties?.toLocaleString() || 0}</p>
                <p><strong>Average Net Weight:</strong> {stats?.avgWeight?.toFixed(2) || 0} kg</p>
              </div>
            </div>

            {/* Entries Table for Print */}
            <table className="w-full border-collapse border-2 border-black text-sm">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black p-2 font-bold">Entry ID</th>
                  <th className="border border-black p-2 font-bold">Date/Time</th>
                  <th className="border border-black p-2 font-bold">Type</th>
                  <th className="border border-black p-2 font-bold">Category</th>
                  <th className="border border-black p-2 font-bold">Driver</th>
                  <th className="border border-black p-2 font-bold">Shift</th>
                  <th className="border border-black p-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicleData.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="border border-black p-2 font-mono">WB-{entry.wb_number}</td>
                    <td className="border border-black p-2">{format(new Date(entry.entry_time), "MMM dd, HH:mm")}</td>
                    <td className="border border-black p-2">{entry.vehicle_types?.type_name || 'N/A'}</td>
                    <td className="border border-black p-2">{entry.category}</td>
                    <td className="border border-black p-2">{entry.driver_name || 'N/A'}</td>
                    <td className="border border-black p-2">{entry.shifts?.shift_name || 'N/A'}</td>
                    <td className="border border-black p-2">{entry.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Weigh Records for Print */}
            <div className="mt-6">
              <h3 className="font-bold mb-2 text-lg">Weigh Records</h3>
              <table className="w-full border-collapse border-2 border-black text-sm">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-black p-2">Entry ID</th>
                    <th className="border border-black p-2">Weigh #</th>
                    <th className="border border-black p-2">Time</th>
                    <th className="border border-black p-2">Gross (kg)</th>
                    <th className="border border-black p-2">Tare (kg)</th>
                    <th className="border border-black p-2">Net (kg)</th>
                    <th className="border border-black p-2">Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleData.entries.flatMap((entry) =>
                    (entry.weigh_records || []).map((weigh: any, idx: number) => (
                      <tr key={weigh.id}>
                        <td className="border border-black p-2 font-mono">WB-{entry.wb_number}</td>
                        <td className="border border-black p-2">{idx + 1}</td>
                        <td className="border border-black p-2">{format(new Date(weigh.weigh_time), "HH:mm")}</td>
                        <td className="border border-black p-2">{weigh.gross_weight || '-'}</td>
                        <td className="border border-black p-2">{weigh.tare_weight || '-'}</td>
                        <td className="border border-black p-2 font-bold">{weigh.net_weight || '-'}</td>
                        <td className="border border-black p-2">{weigh.weighed_by || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Payments for Print */}
            {vehicleData.payments.length > 0 && (
              <div className="mt-6">
                <h3 className="font-bold mb-2 text-lg">Payments</h3>
                <table className="w-full border-collapse border-2 border-black text-sm">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border border-black p-2">Entry ID</th>
                      <th className="border border-black p-2">Type</th>
                      <th className="border border-black p-2">Amount (TShs)</th>
                      <th className="border border-black p-2">Status</th>
                      <th className="border border-black p-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleData.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="border border-black p-2 font-mono">
                          {payment.entry_id ? `WB-${vehicleData.entries.find(e => e.id === payment.entry_id)?.wb_number || '?'}` : 'N/A'}
                        </td>
                        <td className="border border-black p-2">{payment.payment_type}</td>
                        <td className="border border-black p-2 font-bold">{parseFloat(payment.amount.toString()).toLocaleString()}</td>
                        <td className="border border-black p-2">{payment.payment_status}</td>
                        <td className="border border-black p-2">{format(new Date(payment.created_at || ''), "MMM dd, HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Penalties for Print */}
            {vehicleData.penalties.length > 0 && (
              <div className="mt-6">
                <h3 className="font-bold mb-2 text-lg">Penalties</h3>
                <table className="w-full border-collapse border-2 border-black text-sm">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border border-black p-2">Entry ID</th>
                      <th className="border border-black p-2">Type</th>
                      <th className="border border-black p-2">Reason</th>
                      <th className="border border-black p-2">Amount (TShs)</th>
                      <th className="border border-black p-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleData.penalties.map((penalty) => (
                      <tr key={penalty.id}>
                        <td className="border border-black p-2 font-mono">
                          {penalty.entry_id ? `WB-${vehicleData.entries.find(e => e.id === penalty.entry_id)?.wb_number || '?'}` : 'N/A'}
                        </td>
                        <td className="border border-black p-2">{penalty.penalty_type}</td>
                        <td className="border border-black p-2">{penalty.reason}</td>
                        <td className="border border-black p-2 font-bold">{parseFloat(penalty.amount.toString()).toLocaleString()}</td>
                        <td className="border border-black p-2">{format(new Date(penalty.created_at), "MMM dd, HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 text-center text-sm">
              <p>Report generated by Energy Feeds Weighbridge System</p>
              <p>{format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
            </div>
          </div>

          {vehicleData.entries.map((entry) => {
            const isMVCategory = entry.category && ["MV-Company", "MV-PublicSeller", "MV-Supplier"].includes(entry.category);

            return (
              <Card
                key={entry.id}
                className={
                  isMVCategory
                    ? "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20"
                    : "border-l-4 border-l-primary"
                }
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground">WB-{entry.wb_number}</span>
                        <span>Entry: {format(new Date(entry.entry_time), "MMM dd, yyyy HH:mm")}</span>
                      </CardTitle>
                      <CardDescription className="flex flex-col gap-0.5">
                        <span className="font-bold text-primary">
                          {entry.vehicle_no} • {entry.vehicle_types?.type_name}
                        </span>
                        <span className="text-xs">
                          Category: {entry.category}
                          {isMVCategory && <span className="ml-2 text-blue-600 font-semibold">(Cargo Tracking)</span>}
                        </span>
                      </CardDescription>
                    </div>
                    <Badge variant={entry.status === "Completed" ? "default" : "secondary"}>
                      {entry.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Entry Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Driver</p>
                      <p className="font-medium">{entry.driver_name || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Contact</p>
                      <p className="font-medium">{entry.driver_contact || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Shift</p>
                      <p className="font-medium">{entry.shifts?.shift_name || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entered By</p>
                      <p className="font-medium">{entry.entered_by || "N/A"}</p>
                    </div>
                  </div>

                  {/* Weigh Records */}
                  {entry.weigh_records && entry.weigh_records.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center text-blue-600">
                        <Scale className="mr-2 h-4 w-4" />
                        Weigh Records
                      </h4>
                      <div className="space-y-2">
                        {entry.weigh_records.map((weigh: any, idx: number) => (
                          <div key={weigh.id} className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                              <div>
                                <p className="text-muted-foreground">Weigh #{idx + 1}</p>
                                <p className="font-medium">{format(new Date(weigh.weigh_time), "HH:mm")}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Gross</p>
                                <p className="font-medium">{weigh.gross_weight || "-"} kg</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Tare</p>
                                <p className="font-medium">{weigh.tare_weight || "-"} kg</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Net</p>
                                <p className="font-bold text-blue-600">
                                  {weigh.net_weight !== undefined && weigh.net_weight !== null
                                    ? `${weigh.net_weight} kg`
                                    : (weigh.gross_weight && weigh.tare_weight
                                      ? `${(parseFloat(weigh.gross_weight) - parseFloat(weigh.tare_weight)).toFixed(2)} kg`
                                      : "Pending")}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">By</p>
                                <p className="font-medium">{weigh.weighed_by || "N/A"}</p>
                              </div>
                            </div>
                            {weigh.warning_flag && (
                              <Badge variant="destructive" className="mt-2">Warning: Weight Exceeds</Badge>
                            )}
                            {weigh.exceedence_notes && (
                              <p className="mt-2 text-sm text-muted-foreground">{weigh.exceedence_notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payments for this entry */}
                  {vehicleData.payments.filter(p => p.entry_id === entry.id).length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center text-green-600">
                        <span className="mr-2 text-xs font-bold border border-green-600 rounded px-1">TShs</span>
                        Payments
                      </h4>
                      <div className="space-y-2">
                        {vehicleData.payments
                          .filter(p => p.entry_id === entry.id)
                          .map((payment) => (
                            <div key={payment.id} className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-medium">{payment.payment_type}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(payment.created_at || ""), "MMM dd, yyyy HH:mm")}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-green-600">
                                    TShs {parseFloat(payment.amount.toString()).toLocaleString()}
                                  </p>
                                  <Badge variant={payment.payment_status === "Paid" ? "default" : "secondary"}>
                                    {payment.payment_status}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Penalties for this entry */}
                  {vehicleData.penalties.filter(p => p.entry_id === entry.id).length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center text-red-600">
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Penalties
                      </h4>
                      <div className="space-y-2">
                        {vehicleData.penalties
                          .filter(p => p.entry_id === entry.id)
                          .map((penalty) => (
                            <div key={penalty.id} className="bg-red-50 dark:bg-red-950 p-3 rounded-md">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-medium">{penalty.penalty_type}</p>
                                  <p className="text-sm text-muted-foreground">{penalty.reason}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(penalty.created_at), "MMM dd, yyyy HH:mm")}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-red-600">
                                    TShs {parseFloat(penalty.amount.toString()).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
