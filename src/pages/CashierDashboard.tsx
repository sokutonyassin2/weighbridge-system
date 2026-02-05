import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Banknote, CheckCircle, AlertCircle, Printer, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ExhaustedVehiclePaymentDialog } from "@/components/ExhaustedVehiclePaymentDialog";
import { getShortEntryId } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CashierShiftReport } from "@/components/CashierShiftReport";
import { getShiftTimeWindow, getCurrentShiftDate, getCurrentShiftName, getShiftTimeDescription } from "@/lib/shiftUtils";

// Shift Collections Component (extracted for clarity)
// Shift Collections Component (updated to respect filters)
const ShiftCollectionsCard = ({ isAdmin, user, startDate, endDate, shiftName }: {
  isAdmin: boolean;
  user: any;
  startDate: string;
  endDate: string;
  shiftName: "Day" | "Night";
}) => {
  const { data: collections } = useQuery({
    queryKey: ["shift-collections", user?.id, isAdmin, startDate, endDate, shiftName],
    queryFn: async () => {
      // Use consistent shift window logic
      const { startTime, endTime } = getShiftTimeWindow(startDate, shiftName);

      // Fetch both regular payments and penalty records
      const { data: payments } = await supabase
        .from("payments")
        .select("amount")
        .eq("payment_status", "Paid")
        .gte("paid_at", startTime)
        .lte("paid_at", endTime);

      const { data: penalties } = await supabase
        .from("penalties")
        .select("amount")
        .gte("created_at", startTime)
        .lte("created_at", endTime);

      const paymentsTotal = payments?.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0;
      const penaltiesTotal = penalties?.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0;

      return paymentsTotal + penaltiesTotal;
    },
    refetchInterval: 5000, // Syncs with dashboard updates (5s for faster feedback)
  });

  return (
    <div className="text-2xl font-bold text-success">
      {collections?.toLocaleString() || 0} TShs
    </div>
  );
};

export default function CashierDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, userProfile, userRole } = useAuth();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [selectedShift, setSelectedShift] = useState<"Day" | "Night">(getCurrentShiftName());
  const [showShiftReport, setShowShiftReport] = useState(false);
  const [reportDate, setReportDate] = useState<string>(getCurrentShiftDate());
  const [startDate, setStartDate] = useState<string>(getCurrentShiftDate());
  const [endDate, setEndDate] = useState<string>(getCurrentShiftDate());

  // Sync admin filters when report date changes for a better UX
  const handleReportDateChange = (date: string) => {
    setReportDate(date);
    setStartDate(date);
    setEndDate(date);
  };
  const isAdmin = userRole === "admin";

  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ["payments", reportDate, isAdmin, selectedShift],
    queryFn: async () => {
      const { startTime, endTime } = getShiftTimeWindow(reportDate, selectedShift);

      let query = supabase
        .from("payments")
        .select(`
          *,
          vehicle_entries (
            wb_number,
            vehicle_types (type_name)
          )
        `)
        .gte("created_at", startTime)
        .lte("created_at", endTime)
        .order("created_at", { ascending: false })
        .limit(100);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });

  // Fetch penalties with date filtering for admin
  const { data: penalties } = useQuery({
    queryKey: ["penalties", startDate, endDate, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from("penalties")
        .select("*, vehicle_entries(wb_number)")
        .order("created_at", { ascending: false })
        .limit(50);

      // Apply date filters for admin only
      const { startTime, endTime } = getShiftTimeWindow(reportDate, selectedShift);

      // Apply date filters
      query = query.gte("created_at", startTime).lte("created_at", endTime);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 10000,
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  });

  // Fetch current active shift
  const { data: currentShift } = useQuery({
    queryKey: ["current-shift", selectedShift, reportDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("shift_date", reportDate)
        .eq("shift_name", selectedShift)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: showShiftReport,
  });

  // Fetch shift-specific payments for the report
  // Using time-based filtering to properly handle night shifts spanning two days
  const { data: shiftPayments } = useQuery({
    queryKey: ["shift-payments", selectedShift, user?.id, reportDate],
    queryFn: async () => {
      // Shift-based filtering using actual time windows
      const { startTime, endTime } = getShiftTimeWindow(reportDate, selectedShift);

      // Check if shift is in the future (hasn't started yet)
      const now = new Date();
      const shiftStart = new Date(startTime);
      if (shiftStart > now) {
        // Return empty - shift hasn't started
        return [];
      }

      // Query payments that were CREATED within the shift time window
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, payment_type, created_at, entry_id, vehicle_no, vehicle_entries(wb_number, shift_id, vehicle_types(type_name, category))")
        .gte("created_at", startTime)
        .lte("created_at", endTime)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: showShiftReport,
  });

  const { data: shiftPenalties } = useQuery({
    queryKey: ["shift-penalties", selectedShift, user?.id, reportDate],
    queryFn: async () => {
      // Shift-based filtering using actual time windows
      const { startTime, endTime } = getShiftTimeWindow(reportDate, selectedShift);

      // Check if shift is in the future (hasn't started yet)
      const now = new Date();
      const shiftStart = new Date(startTime);
      if (shiftStart > now) {
        // Return empty - shift hasn't started
        return [];
      }

      const { data, error } = await supabase
        .from("penalties")
        .select("*, vehicle_entries(wb_number, shift_id)")
        .gte("created_at", startTime)
        .lte("created_at", endTime)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: showShiftReport,
  });

  // Fetch completed MV vehicles (second weigh complete, no additional payment)
  const { data: completedWeighs } = useQuery({
    queryKey: ["completed-weighs", selectedShift, reportDate],
    queryFn: async () => {
      const { startTime, endTime } = getShiftTimeWindow(reportDate, selectedShift);

      // Check if shift is in the future
      const now = new Date();
      const shiftStart = new Date(startTime);
      if (shiftStart > now) {
        return [];
      }

      // Get MV vehicles that completed (second weigh) during this shift
      const { data, error } = await supabase
        .from("weigh_records")
        .select(`
          id,
          weigh_time,
          weigh_number,
          entry_id,
          vehicle_entries(id, vehicle_no, wb_number, category, customer_farmer_name, item_name, source_destination, vehicle_types(type_name, category))
        `)
        .eq("weigh_number", 2)
        .gte("weigh_time", startTime)
        .lte("weigh_time", endTime)
        .order("weigh_time", { ascending: false });

      if (error) {
        console.error("Error fetching completed weighs:", error);
        throw error;
      }

      // Filter to only MV categories (these don't create second weigh payment)
      return (data || []).filter(record =>
        record.vehicle_entries?.category?.startsWith('MV-')
      );
    },
    enabled: showShiftReport,
  });

  // Fetch pending weighs with exhausted attempts (3/3) only
  const { data: exhaustedPendingWeighs, refetch: refetchExhausted } = useQuery({
    queryKey: ["exhausted-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_weighs")
        .select(`
          *,
          vehicle_entries (
            *,
            vehicle_types (
              type_name,
              category,
              first_weigh_fee
            )
          )
        `)
        .eq("payment_required", true)
        .gte("weigh_attempts", 3)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const pendingPayments = payments?.filter((p) => p.payment_status === "Pending") || [];
  const totalPending = pendingPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  const handleMarkAsPaid = async (paymentId: string, amount: number) => {
    if (!user || !userProfile) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "You must be logged in to process payments",
      });
      return;
    }

    setProcessingId(paymentId);
    try {
      const receiptNumber = `RCP-${Date.now()}`;

      const { error } = await supabase
        .from("payments")
        .update({
          payment_status: "Paid",
          paid_at: new Date().toISOString(),
          cashier_name: userProfile.full_name,
          cashier_id: user.id,
          receipt_number: receiptNumber,
        })
        .eq("id", paymentId);

      if (error) throw error;

      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        user_name: userProfile.full_name,
        user_role: "operator",
        action: "Payment Processed",
        details: `Payment of TShs ${amount.toLocaleString()} marked as paid. Receipt: ${receiptNumber}`,
      });

      toast({
        title: "Payment Processed",
        description: `Payment of ${amount.toLocaleString()} TShs marked as paid`,
      });

      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-collections"] });
      queryClient.invalidateQueries({ queryKey: ["shift-payments"] });
      refetchPayments();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (showShiftReport) {
    // Check if shift is in the future
    const { startTime } = getShiftTimeWindow(reportDate, selectedShift);
    const now = new Date();
    const shiftStart = new Date(startTime);

    if (shiftStart > now) {
      return (
        <div className="p-6 space-y-4">
          <Button variant="outline" onClick={() => setShowShiftReport(false)}>
            ← Back to Dashboard
          </Button>
          <Card className="border-warning">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Shift Not Started Yet</h3>
              <p className="text-muted-foreground">
                The {selectedShift} shift for {format(new Date(reportDate), "MMM dd, yyyy")} hasn't started yet.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Please select a shift that has already completed or is currently in progress.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Unified check for report data loading
    const isLoadingReport = !shiftPayments || !shiftPenalties || !completedWeighs;

    if (isLoadingReport) {
      return (
        <div className="p-6 text-center min-h-[400px] flex flex-col items-center justify-center animate-fade-in">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <h3 className="text-lg font-semibold">Generating Report...</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            We are fetching and processing the transaction data for the {selectedShift} shift.
            This usually takes a few seconds.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowShiftReport(false)}
            className="mt-8 text-muted-foreground hover:text-foreground"
          >
            Cancel & Back to Dashboard
          </Button>
        </div>
      );
    }

    return (
      <CashierShiftReport
        shiftName={selectedShift}
        shiftDate={reportDate}
        operatorName={
          currentShift?.operator_name ||
          (userProfile?.full_name && userProfile?.full_name !== "User"
            ? userProfile?.full_name
            : userProfile?.username) ||
          "Operator"
        }
        payments={shiftPayments}
        penalties={shiftPenalties}
        completedWeighs={completedWeighs || []}
        signatureUrl={currentShift?.signature_url}
        reportType="shift"
        onClose={() => setShowShiftReport(false)}
      />
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header - Responsive */}
      <div className="flex items-center gap-3 animate-fade-in">
        <img
          src="/images/energy-feeds-logo.jpg"
          alt="Energy Feeds"
          className="h-8 md:h-10 object-contain"
        />
        <div>
          <h1 className="text-xl md:text-3xl font-bold">Cashier Dashboard</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Manage payments and transactions</p>
        </div>
      </div>

      {/* Admin-only Date Filters */}
      {isAdmin && (
        <Card className="border-primary">
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Calendar className="h-4 w-4 md:h-5 md:w-5" />
              Historical Data Filters
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Filter payments and penalties by date range (Admin only)</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-xs md:text-sm">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date" className="text-xs md:text-sm">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-2">
              Filters apply to both payment transactions and penalties sections
            </p>
          </CardContent>
        </Card>
      )}

      {/* Shift Report Section */}
      <Card className="border-primary">
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Printer className="h-4 w-4 md:h-5 md:w-5" />
            Shift Collection Report
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">Generate and print shift collection reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-4 p-3 pt-0 md:p-6 md:pt-0">
          <div className="space-y-2">
            <Label htmlFor="report-date" className="text-xs md:text-sm">Select Date</Label>
            <Input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => handleReportDateChange(e.target.value)}
              max={format(new Date(), "yyyy-MM-dd")}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs md:text-sm">Select Shift</Label>
            <RadioGroup value={selectedShift} onValueChange={(value) => setSelectedShift(value as "Day" | "Night")}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Day" id="day" />
                  <Label htmlFor="day" className="cursor-pointer text-xs md:text-sm">Day Shift (07:00 - 18:00)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Night" id="night" />
                  <Label htmlFor="night" className="cursor-pointer text-xs md:text-sm">Night Shift (18:00 - 07:00)</Label>
                </div>
              </div>
            </RadioGroup>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowShiftReport(true)}
              className="flex-1 text-xs md:text-sm"
              size="sm"
            >
              <Printer className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Generate & Print Report</span>
              <span className="sm:hidden">Print Report</span>
            </Button>
          </div>
          <div className="p-2 md:p-3 bg-muted/50 rounded-md border">
            <p className="text-xs md:text-sm font-medium text-foreground">
              📅 {getShiftTimeDescription(reportDate, selectedShift)}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
              Report will include all vehicles weighed during this time window
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="card-hover animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isAdmin ? "Shift Collections" : "Current Shift Collections"}
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ShiftCollectionsCard
              isAdmin={isAdmin}
              user={user}
              startDate={reportDate}
              endDate={reportDate}
              shiftName={selectedShift}
            />
            <p className="text-xs text-muted-foreground">Total paid in window</p>
          </CardContent>
        </Card>

        <Card className="card-hover animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <AlertCircle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{pendingPayments.length}</div>
            <p className="text-xs text-muted-foreground">
              TShs {totalPending.toLocaleString()} total
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exhausted Vehicles</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {exhaustedPendingWeighs?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Requiring penalty payment</p>
          </CardContent>
        </Card>
      </div>

      {/* Exhausted Vehicles Requiring Payment */}
      {exhaustedPendingWeighs && exhaustedPendingWeighs.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Vehicles Requiring Penalty Payment</CardTitle>
            <CardDescription>
              These vehicles have exhausted all weigh attempts and require penalty payment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry ID</TableHead>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Vehicle Type</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Penalty Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exhaustedPendingWeighs.map((pw) => (
                  <TableRow key={pw.id}>
                    <TableCell className="font-mono">
                      {getShortEntryId(pw.entry_id, pw.vehicle_entries?.wb_number)}
                    </TableCell>
                    <TableCell className="font-medium">{pw.vehicle_no}</TableCell>
                    <TableCell>{pw.vehicle_entries?.vehicle_types?.type_name || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{pw.weigh_attempts}/3 EXHAUSTED</Badge>
                    </TableCell>
                    <TableCell className="font-bold text-destructive">
                      TShs {(pw.vehicle_entries?.vehicle_types?.first_weigh_fee || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-warning">
                        Pending Payment
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payment Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Payment Transactions
          </CardTitle>
          <CardDescription>All payment records</CardDescription>
        </CardHeader>
        <CardContent>
          {payments?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No payments found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry ID</TableHead>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Payment Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments?.slice(0, 50).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono">
                      {payment.entry_id ? getShortEntryId(payment.entry_id, payment.vehicle_entries?.wb_number) : "N/A"}
                    </TableCell>
                    <TableCell className="font-medium">{payment.vehicle_no}</TableCell>
                    <TableCell>{payment.payment_type}</TableCell>
                    <TableCell className="font-bold">
                      TShs {parseFloat(payment.amount.toString()).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.payment_status === "Paid" ? "default" : "secondary"}>
                        {payment.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(payment.created_at), "MMM dd, HH:mm")}</TableCell>
                    <TableCell>
                      {payment.payment_status === "Pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkAsPaid(payment.id, parseFloat(payment.amount.toString()))}
                          disabled={processingId === payment.id}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Exhausted Vehicle Payment Dialog */}
      {selectedVehicle && (
        <ExhaustedVehiclePaymentDialog
          isOpen={paymentDialogOpen}
          onClose={() => {
            setPaymentDialogOpen(false);
            setSelectedVehicle(null);
          }}
          vehicleNo={selectedVehicle.vehicle_no}
          entryId={selectedVehicle.entry_id}
          vehicleData={selectedVehicle.vehicle_entries}
          originalAmount={selectedVehicle.vehicle_entries?.vehicle_types?.first_weigh_fee || 0}
          paymentReason={selectedVehicle.payment_required_reason || "Exhausted all 3 weigh attempts"}
          onPaymentComplete={() => {
            refetchExhausted();
            refetchPayments();
          }}
        />
      )}
    </div>
  );
}
