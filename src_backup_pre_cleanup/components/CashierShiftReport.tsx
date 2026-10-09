import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { getShortEntryId } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getShiftTimeDescription } from "@/lib/shiftUtils";

interface CashierShiftReportProps {
  shiftName: string;
  shiftDate: string;
  operatorName: string;
  payments: any[];
  penalties: any[];
  completedWeighs?: any[];
  signatureUrl?: string | null;
  reportType?: "shift" | "operator";
  onClose: () => void;
}

// Group payments by entry_id to consolidate duplicate vehicle entries
const consolidatePayments = (payments: any[]) => {
  const grouped: Record<string, any> = {};

  payments.forEach(payment => {
    const entryId = payment.entry_id || payment.id;
    if (!grouped[entryId]) {
      grouped[entryId] = {
        ...payment,
        payments: [payment],
        totalAmount: parseFloat(payment.amount.toString()),
        paymentTypes: [payment.payment_type],
      };
    } else {
      grouped[entryId].payments.push(payment);
      grouped[entryId].totalAmount += parseFloat(payment.amount.toString());
      if (!grouped[entryId].paymentTypes.includes(payment.payment_type)) {
        grouped[entryId].paymentTypes.push(payment.payment_type);
      }
    }
  });

  return Object.values(grouped);
};

export const CashierShiftReport = ({
  shiftName,
  shiftDate,
  operatorName,
  payments,
  penalties,
  completedWeighs = [],
  signatureUrl,
  reportType = "shift",
  onClose,
}: CashierShiftReportProps) => {
  const { user, userProfile, userRole } = useAuth();

  const handlePrint = async () => {
    // Log the print action
    if (user?.id) {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        user_name: userProfile?.full_name || userProfile?.username || "Unknown",
        user_role: userRole,
        action: "Shift Report Printed",
        details: `${reportType === "shift" ? shiftName + " Shift" : "Operator"} report for ${format(new Date(shiftDate), "MMM dd, yyyy")} printed at ${format(new Date(), "HH:mm:ss")}`,
      });
    }

    window.print();
  };

  // Ensure operator name is properly displayed
  const displayOperatorName = operatorName && operatorName !== "Unknown" && operatorName !== "User"
    ? operatorName
    : "Operator";

  // Get shift time description for helper text
  const shiftTimeDescription = getShiftTimeDescription(shiftDate, shiftName as "Day" | "Night");

  // Filter penalty payment types (stored in payments table, not penalties table)
  const penaltyPaymentTypes = ["Penalty Payment", "Exhausted Attempts Penalty", "Overdue Return Penalty"];

  // Weigh payments (non-penalty)
  const weighPayments = payments.filter(p => !penaltyPaymentTypes.includes(p.payment_type));

  // Penalty payments from payments table
  const penaltyPayments = payments.filter(p => penaltyPaymentTypes.includes(p.payment_type));

  // Consolidate weigh payments by entry_id to avoid duplicates
  const consolidatedPayments = consolidatePayments(weighPayments);

  const totalWeighPayments = weighPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
  const totalPenaltyPayments = penaltyPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
  const totalPenaltyRecords = penalties.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  // Use penalty payments from payments table if available, otherwise from penalties table
  const grandTotal = totalWeighPayments + (totalPenaltyPayments > 0 ? totalPenaltyPayments : totalPenaltyRecords);

  return (
    <>
      <style>{`
      @media print {
        @page {
          size: A5;
          margin: 0.5cm;
        }
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        #print-receipt {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .print-receipt-container {
          width: 100% !important;
          max-width: 100% !important;
        }
        /* Tighten text sizes */
        h1.print\:text-4xl {
          font-size: 1.25rem !important; /* From 3xl/4xl to approx xl */
          margin-bottom: 0.25rem !important;
        }
        h2.text-xl {
          font-size: 1rem !important;
          margin-top: 0.1rem !important;
          margin-bottom: 0.25rem !important;
        }
        .print\:text-lg {
          font-size: 0.875rem !important;
        }
        .print\:text-base {
          font-size: 0.8rem !important;
        }
        .print\:text-sm {
          font-size: 0.75rem !important;
        }
        .print\:text-xs {
          font-size: 0.65rem !important;
        }
        p, span, div {
          font-size: 0.75rem !important;
          line-height: 1.1 !important;
        }
        /* Table compression */
        table {
          font-size: 0.7rem !important;
          table-layout: fixed !important;
          width: 100% !important;
          border-collapse: collapse !important;
        }
        th, td {
          padding: 1px 3px !important;
          border: 0.5pt solid #e2e8f0 !important;
          line-height: 1.1 !important;
        }
        .table-cell {
          padding: 1px 3px !important;
        }
        /* Layout compression */
        .mb-8, .mb-6, .mb-4 {
          margin-bottom: 0.3rem !important;
        }
        .mt-8, .mt-6, .mt-4, .mt-2 {
          margin-top: 0.2rem !important;
        }
        .p-6, .p-8, .p-4, .p-3, .p-2 {
          padding: 0.15rem 0.25rem !important;
        }
        .space-y-6, .space-y-4, .space-y-3, .space-y-2 {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
        .space-y-6 > * + *, .space-y-4 > * + *, .space-y-3 > * + *, .space-y-2 > * + * {
          margin-top: 0.15rem !important;
        }
        .flex {
          gap: 0.25rem !important;
        }
        /* Card adjustments */
        .rounded-lg, .rounded-md, .shadow-sm {
          border-radius: 0 !important;
          box-shadow: none !important;
          border: none !important;
        }
        .border {
          border: 0.5pt solid #e2e8f0 !important;
        }
        .bg-primary\\/10 {
          background-color: rgba(79, 70, 229, 0.05) !important;
          padding: 0.5rem !important;
        }
        .break-inside-avoid {
          page-break-inside: avoid !important;
        }
      }
    `}</style>
      <div className="p-6 space-y-6 bg-background min-h-screen print:p-0 print:m-0">
        {/* Print Controls - Hidden when printing */}
        <div className="flex justify-between items-center print:hidden">
          <div>
            <h1 className="text-2xl font-bold">Shift Collection Report</h1>
            <p className="text-sm text-muted-foreground mt-1">{shiftTimeDescription}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePrint} variant="default">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button onClick={onClose} variant="outline">
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        </div>

        {/* Printable Report */}
        <div id="print-receipt" className="print:p-0">
          {/* Header */}
          <div className="text-center mb-6 print:mb-2">
            <h1 className="text-3xl font-bold print:text-4xl">SUDSUD EAFEEDS {new Date().getFullYear()}</h1>
            <h2 className="text-xl font-semibold mt-2 print:mt-1">
              {reportType === "shift" ? "Shift Collection Report" : "Operator Collection Report"}
            </h2>
            <div className="mt-4 print:mt-1 space-y-1 print:space-y-0 text-center flex flex-col items-center">
              {reportType === "shift" ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-left w-fit mx-auto print:text-[8pt]">
                  <p><strong>Report Type:</strong> Shift-Based</p>
                  <p><strong>Shift:</strong> {shiftName} Shift</p>
                  <p><strong>Date:</strong> {format(new Date(shiftDate), "MMMM dd, yyyy")}</p>
                  <p><strong>Time Window:</strong> {shiftTimeDescription}</p>
                  <div className="col-span-2">
                    <p><strong>Operator In Charge:</strong> {displayOperatorName}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5 print:text-[8pt]">
                  <p><strong>Report Type:</strong> Operator-Based</p>
                  <p><strong>Operator:</strong> {displayOperatorName}</p>
                  <p><strong>Date:</strong> {format(new Date(shiftDate), "MMMM dd, yyyy")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Consolidated Payments Table */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Weigh Payments (Consolidated)</CardTitle>
            </CardHeader>
            <CardContent>
              {consolidatedPayments.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No weigh payments recorded</p>
              ) : (
                <Table>
                  <TableHeader className="hidden print:table-header-group">
                    <TableRow>
                      <TableHead className="font-bold print:text-sm">Entry ID</TableHead>
                      <TableHead className="font-bold print:text-sm">Vehicle No</TableHead>
                      <TableHead className="font-bold print:text-sm">Type</TableHead>
                      <TableHead className="font-bold print:text-sm text-right">Total (TShs)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedPayments.map((item) => (
                      <TableRow key={item.id} className="print:break-inside-avoid">
                        <TableCell className="font-bold print:text-sm text-xs">
                          {item.entry_id ? getShortEntryId(item.entry_id, item.vehicle_entries?.wb_number) : "N/A"}
                        </TableCell>
                        <TableCell className="font-bold print:text-sm text-xs">{item.vehicle_no}</TableCell>
                        <TableCell className="font-bold print:text-sm text-xs">
                          {item.vehicle_entries?.vehicle_types?.type_name || '-'}
                        </TableCell>
                        <TableCell className="font-bold print:text-sm text-xs text-right">
                          {item.totalAmount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Completed Weighs (No Additional Charge) - MV Second Weighs */}
          {completedWeighs.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Completed Weighs (No Additional Charge)
                  <span className="text-sm font-normal text-muted-foreground">
                    - MV vehicles that completed cargo tracking
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold print:text-sm">Entry ID</TableHead>
                      <TableHead className="font-bold print:text-sm">Vehicle No</TableHead>
                      <TableHead className="font-bold print:text-sm">Vehicle Type</TableHead>
                      <TableHead className="font-bold print:text-sm">Customer/Farmer</TableHead>
                      <TableHead className="font-bold print:text-sm">Completion Time</TableHead>
                      <TableHead className="font-bold print:text-sm">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedWeighs.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-bold print:text-sm">
                          {record.vehicle_entries?.wb_number
                            ? getShortEntryId(record.entry_id, record.vehicle_entries.wb_number)
                            : "N/A"}
                        </TableCell>
                        <TableCell className="font-bold print:text-sm">
                          {record.vehicle_entries?.vehicle_no}
                        </TableCell>
                        <TableCell className="font-bold print:text-sm">
                          {record.vehicle_entries?.vehicle_types?.type_name || '-'}
                        </TableCell>
                        <TableCell className="print:text-sm">
                          {record.vehicle_entries?.customer_farmer_name || '-'}
                        </TableCell>
                        <TableCell className="print:text-sm">
                          {format(new Date(record.weigh_time), "HH:mm")}
                        </TableCell>
                        <TableCell className="print:text-sm">
                          <span className="text-success font-medium">Complete</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Penalties Table - Show penalty payments from payments table */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Penalties Collected</CardTitle>
            </CardHeader>
            <CardContent>
              {penaltyPayments.length === 0 && penalties.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No penalties recorded</p>
              ) : (
                <Table>
                  <TableHeader className="hidden print:table-header-group">
                    <TableRow>
                      <TableHead>Entry ID</TableHead>
                      <TableHead>Vehicle No</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount (TShs)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* First show penalty payments from payments table */}
                    {penaltyPayments.map((payment) => (
                      <TableRow key={`payment-${payment.id}`} className="print:break-inside-avoid">
                        <TableCell className="font-mono text-xs">
                          {payment.entry_id ? getShortEntryId(payment.entry_id, payment.vehicle_entries?.wb_number) : "N/A"}
                        </TableCell>
                        <TableCell className="font-medium text-xs">{payment.vehicle_no}</TableCell>
                        <TableCell className="text-xs">{payment.payment_type}</TableCell>
                        <TableCell className="font-bold text-right text-xs">
                          {parseFloat(payment.amount.toString()).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Then show from penalties table if no payments exist */}
                    {penaltyPayments.length === 0 && penalties.map((penalty) => (
                      <TableRow key={`penalty-${penalty.id}`} className="print:break-inside-avoid">
                        <TableCell className="font-mono text-xs">
                          {penalty.entry_id ? getShortEntryId(penalty.entry_id, penalty.vehicle_entries?.wb_number) : "N/A"}
                        </TableCell>
                        <TableCell className="font-medium text-xs">{penalty.vehicle_no}</TableCell>
                        <TableCell className="text-xs">{penalty.penalty_type}</TableCell>
                        <TableCell className="font-bold text-right text-xs">
                          {parseFloat(penalty.amount.toString()).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-medium">Total Weigh Payments ({consolidatedPayments.length} vehicles):</span>
                  <span className="text-lg font-bold">TShs {totalWeighPayments.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-medium">Total Penalty Payments:</span>
                  <span className="text-lg font-bold text-destructive">
                    TShs {(totalPenaltyPayments > 0 ? totalPenaltyPayments : totalPenaltyRecords).toLocaleString()}
                  </span>
                </div>
                {completedWeighs.length > 0 && (
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="font-medium">Completed Weighs (No Charge):</span>
                    <span className="text-lg font-bold text-muted-foreground">
                      {completedWeighs.length} vehicle{completedWeighs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 bg-primary/10 p-3 rounded-md">
                  <span className="text-lg font-bold">Grand Total:</span>
                  <span className="text-2xl font-bold text-primary">TShs {grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Operator Signature Section */}
          {signatureUrl && (
            <Card className="mb-6 mt-6">
              <CardHeader>
                <CardTitle>Shift Verified By</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <img
                  src={signatureUrl}
                  alt="Operator Signature"
                  className="max-h-24 border rounded p-2 bg-white"
                />
                <p className="mt-2 font-medium">{displayOperatorName}</p>
                <p className="text-sm text-muted-foreground">
                  {shiftName} Shift - {format(new Date(shiftDate), "MMMM dd, yyyy")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Report generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
            <p className="mt-2">SUDSUD EAFEEDS {new Date().getFullYear()} - Weighbridge Management System</p>
          </div>
        </div>
      </div>
    </>
  );
};
