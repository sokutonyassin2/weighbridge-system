import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer } from "lucide-react";
import { format } from "date-fns";
import { getShortEntryId } from "@/lib/utils";

export default function ShiftSummaryReport() {
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedShift, setSelectedShift] = useState<string>("all");

  const { data: shifts } = useQuery({
    queryKey: ["shifts-for-report"],
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

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["shift-summary-report", startDate, endDate, selectedShift],
    queryFn: async () => {
      let entriesQuery = supabase
        .from("vehicle_entries")
        .select(`
          *,
          vehicle_types (type_name, category)
        `)
        .eq("completed", true);

      if (startDate) {
        entriesQuery = entriesQuery.gte("entry_time", new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        entriesQuery = entriesQuery.lte("entry_time", endDateTime.toISOString());
      }
      if (selectedShift !== "all") {
        entriesQuery = entriesQuery.eq("shift_id", selectedShift);
      }

      entriesQuery = entriesQuery.order("entry_time", { ascending: false });

      const { data: entries, error: entriesError } = await entriesQuery;
      if (entriesError) throw entriesError;

      // Fetch all payments for these entries
      const entryIds = entries?.map((e) => e.id) || [];
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .in("entry_id", entryIds);

      if (paymentsError) throw paymentsError;

      // Also fetch penalties from penalties table
      const { data: penaltyRecords, error: penaltyError } = await supabase
        .from("penalties")
        .select("*")
        .in("entry_id", entryIds);

      if (penaltyError) throw penaltyError;

      // Fetch shift details including signature if a specific shift is selected
      let shiftDetails = null;
      if (selectedShift !== "all") {
        const { data: shift } = await supabase
          .from("shifts")
          .select("*")
          .eq("id", selectedShift)
          .maybeSingle();
        shiftDetails = shift;
      }

      // Categorize payments
      const firstWeighPayments = payments?.filter((p) => p.payment_type === "First Weigh") || [];
      const secondWeighPayments = payments?.filter((p) => p.payment_type === "Second Weigh") || [];
      const penaltyPayments = payments?.filter((p) => p.payment_type === "Penalty Payment") || [];

      // Calculate totals
      const firstWeighTotal = firstWeighPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const secondWeighTotal = secondWeighPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const penaltyPaymentTotal = penaltyPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const penaltyRecordsTotal = penaltyRecords?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      
      // Use the higher of penalty payments or penalty records to ensure all penalties are included
      const penaltyTotal = Math.max(penaltyPaymentTotal, penaltyRecordsTotal);
      const grandTotal = firstWeighTotal + secondWeighTotal + penaltyTotal;

      return {
        entries: entries || [],
        payments: payments || [],
        shiftDetails,
        summary: {
          totalVehicles: entries?.length || 0,
          firstWeighCount: firstWeighPayments.length,
          firstWeighTotal,
          secondWeighCount: secondWeighPayments.length,
          secondWeighTotal,
          penaltyCount: penaltyPayments.length,
          penaltyTotal,
          grandTotal,
        },
      };
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const getCurrentShiftName = () => {
    if (selectedShift === "all") return "All Shifts";
    const shift = shifts?.find((s) => s.id === selectedShift);
    return shift ? `${shift.shift_name} - ${format(new Date(shift.shift_date), "MMM dd, yyyy")}` : "All Shifts";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Print Controls - Hidden when printing */}
      <div className="print:hidden p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Shift Summary Report</h1>
            <p className="text-muted-foreground">Detailed breakdown of shift collections</p>
          </div>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Report Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Printable Content */}
      {reportData && (
        <div className="p-8 max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 border-b pb-4">
            <h1 className="text-3xl font-bold mb-2">Shift Summary Report</h1>
            <p className="text-lg text-muted-foreground">{getCurrentShiftName()}</p>
            <p className="text-sm text-muted-foreground">
              Period: {format(new Date(startDate), "MMM dd, yyyy")} - {format(new Date(endDate), "MMM dd, yyyy")}
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.summary.totalVehicles}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-600">First Weigh</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  TShs {reportData.summary.firstWeighTotal.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">{reportData.summary.firstWeighCount} payments</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Second Weigh</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  TShs {reportData.summary.secondWeighTotal.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">{reportData.summary.secondWeighCount} payments</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-destructive">Penalties</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  TShs {reportData.summary.penaltyTotal.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">{reportData.summary.penaltyCount} penalties</p>
              </CardContent>
            </Card>
          </div>

          {/* Grand Total */}
          <Card className="mb-8 bg-primary/10">
            <CardContent className="py-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Grand Total Collections</h2>
                <p className="text-4xl font-bold text-primary">
                  TShs {reportData.summary.grandTotal.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Breakdown by Type</CardTitle>
              <CardDescription>Detailed view of all collections</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Type</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-green-600">First Weigh Payments</TableCell>
                    <TableCell className="text-right">{reportData.summary.firstWeighCount}</TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      TShs {reportData.summary.firstWeighTotal.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      TShs {reportData.summary.firstWeighCount > 0
                        ? Math.round(reportData.summary.firstWeighTotal / reportData.summary.firstWeighCount).toLocaleString()
                        : 0}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-blue-600">Second Weigh Payments</TableCell>
                    <TableCell className="text-right">{reportData.summary.secondWeighCount}</TableCell>
                    <TableCell className="text-right font-bold text-blue-600">
                      TShs {reportData.summary.secondWeighTotal.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      TShs {reportData.summary.secondWeighCount > 0
                        ? Math.round(reportData.summary.secondWeighTotal / reportData.summary.secondWeighCount).toLocaleString()
                        : 0}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-destructive">Penalty Payments</TableCell>
                    <TableCell className="text-right">{reportData.summary.penaltyCount}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">
                      TShs {reportData.summary.penaltyTotal.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      TShs {reportData.summary.penaltyCount > 0
                        ? Math.round(reportData.summary.penaltyTotal / reportData.summary.penaltyCount).toLocaleString()
                        : 0}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted font-bold">
                    <TableCell>GRAND TOTAL</TableCell>
                    <TableCell className="text-right">
                      {reportData.summary.firstWeighCount + reportData.summary.secondWeighCount + reportData.summary.penaltyCount}
                    </TableCell>
                    <TableCell className="text-right text-primary">
                      TShs {reportData.summary.grandTotal.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">-</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Vehicle Entries Table */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Vehicle Entries ({reportData.entries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry ID</TableHead>
                    <TableHead>Vehicle No</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Entry Time</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No entries found for selected period
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.entries.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm">
                          {getShortEntryId(entry.id, entry.wb_number)}
                        </TableCell>
                        <TableCell className="font-medium">{entry.vehicle_no}</TableCell>
                        <TableCell>{entry.vehicle_types?.type_name || "N/A"}</TableCell>
                        <TableCell>{entry.driver_name || "N/A"}</TableCell>
                        <TableCell>{format(new Date(entry.entry_time), "MMM dd, HH:mm")}</TableCell>
                        <TableCell>{entry.vehicle_types?.category || "N/A"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Operator Signature Section */}
          {reportData.shiftDetails?.signature_url && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Shift Verified By</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <img 
                  src={reportData.shiftDetails.signature_url} 
                  alt="Operator Signature" 
                  className="max-h-24 border rounded p-2 bg-white"
                />
                <p className="mt-2 font-medium">{reportData.shiftDetails.operator_name || "Operator"}</p>
                <p className="text-sm text-muted-foreground">
                  {reportData.shiftDetails.shift_name} Shift - {format(new Date(reportData.shiftDetails.shift_date), "MMMM dd, yyyy")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
            <p>Report generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
            <p>This is an official shift summary report for accounting purposes</p>
          </div>
        </div>
      )}
    </div>
  );
}
