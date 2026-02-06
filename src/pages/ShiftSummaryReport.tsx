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
import { getShiftTimeWindow, getCurrentShiftName, getShiftTimeDescription } from "@/lib/shiftUtils";

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
      // 1. Determine strict timestamp range using centralized utility
      let startTime, endTime;
      let timeRange = "00:00 - 23:59";
      let shiftDetails = null;

      if (selectedShift !== "all") {
        const { data: shift } = await supabase
          .from("shifts")
          .select("*")
          .eq("id", selectedShift)
          .maybeSingle();

        if (shift) {
          shiftDetails = shift;
          const window = getShiftTimeWindow(shift.shift_date, shift.shift_name as "Day" | "Night");
          startTime = window.startTime;
          endTime = window.endTime;
          timeRange = shift.shift_name === "Day" ? "07:00 - 18:00" : "18:00 - 07:00 (+1)";
        } else {
          // Fallback if shift not found
          startTime = `${startDate}T00:00:00+03:00`;
          endTime = `${endDate}T23:59:59+03:00`;
        }
      } else {
        // All shifts for the date range
        startTime = `${startDate}T00:00:00+03:00`;
        endTime = `${endDate}T23:59:59+03:00`;
      }

      // 2. Fetch DATA in PARALLEL for speed
      const [paymentsResult, penaltiesResult, rangeShiftsResult] = await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, payment_type, entry_id, created_at")
          .gte("created_at", startTime)
          .lte("created_at", endTime),
        supabase
          .from("penalties")
          .select("id, amount, created_at, entry_id")
          .gte("created_at", startTime)
          .lte("created_at", endTime),
        supabase
          .from("shifts")
          .select("operator_name")
          .gte("shift_date", startDate)
          .lte("shift_date", endDate)
      ]);

      const payments = paymentsResult.data || [];
      const penaltyRecords = penaltiesResult.data || [];
      const rangeShifts = rangeShiftsResult.data || [];

      // 3. Get Entry IDs associated with these transactions
      const pEntryIds = payments.map(p => p.entry_id).filter(Boolean);
      const penEntryIds = penaltyRecords.map(p => p.entry_id).filter(Boolean);
      const allEntryIds = Array.from(new Set([...pEntryIds, ...penEntryIds]));

      // 4. Fetch details for these entries (for the table context)
      let entries = [];
      if (allEntryIds.length > 0) {
        const { data } = await supabase
          .from("vehicle_entries")
          .select(`
            id, wb_number, vehicle_no, driver_name, entry_time,
            vehicle_types (type_name, category)
          `)
          .in("id", allEntryIds)
          .order("entry_time", { ascending: false });
        entries = data || [];
      }

      // 5. Categorize payments (Calculations)
      const firstWeighPayments = payments.filter((p) => p.payment_type === "First Weigh");
      const penaltyPayments = payments.filter((p) =>
        p.payment_type?.toLowerCase().includes("penalty")
      );

      const firstWeighTotal = firstWeighPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const penaltyPaymentTotal = penaltyPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const penaltyRecordsFromTableTotal = penaltyRecords.reduce((sum, p) => sum + Number(p.amount), 0);

      const penaltyTotal = penaltyPaymentTotal + penaltyRecordsFromTableTotal;
      const grandTotal = firstWeighTotal + penaltyTotal;

      const uniqueOperators = Array.from(new Set(rangeShifts.map(s => s.operator_name).filter(Boolean)));

      return {
        entries: entries || [],
        payments: payments || [],
        shiftDetails,
        involvedOperators: uniqueOperators,
        timeRange,
        summary: {
          totalVehicles: entries?.length || 0,
          firstWeighCount: firstWeighPayments.length,
          firstWeighTotal,
          penaltyCount: Math.max(penaltyPayments.length, penaltyRecords?.length || 0),
          penaltyTotal,
          grandTotal,
        },
      };
    },
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000,    // Keep in garbage collection for 1 minute
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
      <style>
        {`
          @media print {
            @page {
              size: A5;
              margin: 0.5cm;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            /* Hide everything in the body by default */
            body * {
              visibility: hidden;
            }
            
            /* Show ONLY the report container and its contents */
            .print-container, 
            .print-container * {
              visibility: visible;
            }

            /* Position the printable content */
            .print-container {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              visibility: visible !important;
            }

            /* Fix layout properties */
            body, html {
              height: auto !important;
              overflow: visible !important;
              display: block !important;
            }

            #root, [data-sidebar-provider], main {
              height: auto !important;
              overflow: visible !important;
              display: block !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            /* Hide UI elements */
            button, .print\\:hidden, .print-receipt-close {
              display: none !important;
            }
            
            /* Tighten Summary Cards */
            .print-container .grid {
              display: flex !important;
              flex-direction: row !important;
              gap: 4px !important;
              margin-bottom: 4px !important;
              margin-top: 4px !important;
            }
            
            .print-container .grid > div {
              flex: 1 !important;
              padding: 2px 5px !important;
              border: 0.5pt solid #eee !important;
            }

            .print-container .grid h3 {
              font-size: 10px !important;
              margin: 0 !important;
            }

            .print-container .grid .text-2xl {
              font-size: 11px !important;
              font-weight: bold !important;
              margin: 0 !important;
            }

            /* Shrink Grand Total */
            .print-container .bg-primary\\/10 {
              padding: 4px 8px !important;
              margin-bottom: 4px !important;
              margin-top: 4px !important;
              border: 0.5pt solid #ddd !important;
            }

            .print-container .bg-primary\\/10 h2 {
              font-size: 12px !important;
            }

            .print-container .bg-primary\\/10 p {
              font-size: 14px !important;
            }

            /* Compress tables */
            .print-container table {
              font-size: 10px !important;
              margin-top: 0 !important;
              width: 100% !important;
              border-collapse: collapse !important;
            }

            .print-container th, 
            .print-container td {
              padding: 1px 4px !important;
              border: 0.5pt solid #e2e8f0 !important;
              line-height: 1.1 !important;
            }

            /* Header compression */
            .print-container .text-center {
              margin-bottom: 4px !important;
              padding-bottom: 4px !important;
            }
            
            .print-container .text-3xl {
              font-size: 16px !important;
              margin-bottom: 1px !important;
            }
            
            .print-container .text-lg,
            .print-container .text-sm,
            .print-container p,
            .print-container span {
              font-size: 10px !important;
              margin: 0 !important;
              line-height: 1.1 !important;
            }

            /* Margin removal */
            .print-container .mt-8,
            .print-container .mb-8,
            .print-container .mt-4,
            .print-container .mb-4 {
              margin-top: 3px !important;
              margin-bottom: 3px !important;
            }
            
            /* Card border removal */
            .print-container .rounded-lg, .print-container .border {
              border-radius: 0 !important;
              box-shadow: none !important;
            }
          }
        `}
      </style>
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
        <div className="p-8 max-w-7xl mx-auto print-container">
          {/* Header */}
          {/* Header */}
          <div className="text-center mb-8 border-b pb-4">
            <h1 className="text-3xl font-bold mb-2">Shift Summary Report</h1>
            <p className="text-lg text-muted-foreground">{getCurrentShiftName()}</p>
            <div className="flex flex-col gap-1 mt-2 text-sm text-muted-foreground">
              <p>
                Period: {format(new Date(startDate), "MMM dd, yyyy")} - {format(new Date(endDate), "MMM dd, yyyy")}
              </p>
              <p>
                Time: {reportData.timeRange}
              </p>
              <p>
                Operator(s): {reportData.involvedOperators?.length > 0
                  ? reportData.involvedOperators.join(", ")
                  : "All Operators"}
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
                <CardTitle className="text-sm font-medium text-green-600">First Weigh Collections</CardTitle>
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
                <CardTitle className="text-sm font-medium text-destructive">Penalty Collections</CardTitle>
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
                      {reportData.summary.firstWeighCount + reportData.summary.penaltyCount}
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
          {
            reportData.shiftDetails?.signature_url && (
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
            )
          }

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
            <p>Report generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
            <p>This is an official shift summary report for accounting purposes</p>
          </div>
        </div >
      )
      }
    </div >
  );
}
