import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";

interface ShiftReportProps {
  vehicles: any[];
  summary: {
    totalVehicles: number;
    totalPayments: number;
    totalPenalties: number;
    grandTotal: number;
  };
  shiftName: string;
  operatorName: string;
  signatureUrl?: string | null;
  onClose: () => void;
}

interface PaymentDetail {
  amount: number;
  payment_type: string;
  notes: string | null;
  created_at: string;
}

interface PenaltyDetail {
  amount: number;
  penalty_type: string;
  reason: string;
  created_at: string;
}

export default function ShiftReport({ vehicles, summary, shiftName, operatorName, signatureUrl, onClose }: ShiftReportProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Print Controls - Hidden when printing */}
      <div className="print:hidden p-4 border-b flex justify-between items-center sticky top-0 bg-background z-10">
        <h2 className="text-xl font-bold">Shift Report Preview</h2>
        <div className="flex gap-2">
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      {/* Printable Content */}
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 border-b pb-4">
          <h1 className="text-3xl font-bold mb-2">Shift Report</h1>
          <p className="text-lg text-muted-foreground">{shiftName}</p>
          <p className="text-sm text-muted-foreground">
            Operator: {operatorName} | Date: {format(new Date(), "MMMM dd, yyyy")}
          </p>
        </div>

        {/* Summary Section */}
        <div className="mb-8 bg-muted/30 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Shift Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Vehicles</p>
              <p className="text-2xl font-bold">{summary.totalVehicles}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Payments</p>
              <p className="text-2xl font-bold text-green-600">
                TShs {summary.totalPayments.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Penalties Collected</p>
              <p className="text-2xl font-bold text-destructive">
                TShs {summary.totalPenalties.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Grand Total</p>
              <p className="text-2xl font-bold text-primary">
                TShs {summary.grandTotal.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Vehicles Table */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Completed Vehicles</h2>
          <table className="w-full border-collapse border text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="border p-2 text-left">Vehicle No</th>
                <th className="border p-2 text-left">Type</th>
                <th className="border p-2 text-left">Driver</th>
                <th className="border p-2 text-left">Entry Time</th>
                <th className="border p-2 text-left">Completion</th>
                <th className="border p-2 text-right">Original Payment</th>
                <th className="border p-2 text-right">Penalty</th>
                <th className="border p-2 text-left">Penalty Reason</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle, index) => {
                const penaltyReason = vehicle.penalties && vehicle.penalties.length > 0
                  ? vehicle.penalties.map((p: PenaltyDetail) => `${p.penalty_type}: ${p.reason}`).join(", ")
                  : vehicle.payments?.find((p: PaymentDetail) => p.payment_type === "Penalty Payment")?.notes || "-";

                return (
                  <tr key={vehicle.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="border p-2 font-medium">{vehicle.vehicle_no}</td>
                    <td className="border p-2">{vehicle.vehicle_types?.type_name || "N/A"}</td>
                    <td className="border p-2">{vehicle.driver_name || "N/A"}</td>
                    <td className="border p-2">{format(new Date(vehicle.entry_time), "HH:mm")}</td>
                    <td className="border p-2">{format(new Date(vehicle.created_at), "HH:mm")}</td>
                    <td className="border p-2 text-right text-green-600 font-medium">
                      TShs {vehicle.totalPayment.toLocaleString()}
                    </td>
                    <td className="border p-2 text-right text-destructive font-medium">
                      {vehicle.totalPenalty > 0 ? `TShs ${vehicle.totalPenalty.toLocaleString()}` : "-"}
                    </td>
                    <td className="border p-2 text-sm text-muted-foreground">
                      {penaltyReason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-bold">
                <td colSpan={5} className="border p-2 text-right">Shift Totals:</td>
                <td className="border p-2 text-right text-green-600">
                  TShs {summary.totalPayments.toLocaleString()}
                </td>
                <td className="border p-2 text-right text-destructive">
                  TShs {summary.totalPenalties.toLocaleString()}
                </td>
                <td className="border p-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="bg-green-50 dark:bg-green-950 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-2 text-green-800 dark:text-green-200">Original Payments</h3>
            <p className="text-sm text-muted-foreground mb-2">
              First-time weigh payments collected
            </p>
            <p className="text-3xl font-bold text-green-600">
              TShs {summary.totalPayments.toLocaleString()}
            </p>
          </div>
          
          {summary.totalPenalties > 0 && (
            <div className="bg-destructive/10 p-6 rounded-lg">
              <h3 className="text-lg font-bold mb-2 text-destructive">Penalty Payments</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Penalties collected during this shift
              </p>
              <p className="text-3xl font-bold text-destructive">
                TShs {summary.totalPenalties.toLocaleString()}
              </p>
            </div>
          )}
          
          <div className="bg-primary/10 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-2 text-primary">Grand Total</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Total collections for this shift
            </p>
            <p className="text-3xl font-bold text-primary">
              TShs {summary.grandTotal.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Operator Signature Section */}
        {signatureUrl && (
          <div className="mb-8 p-6 border rounded-lg">
            <h3 className="text-lg font-bold mb-4 text-center">Shift Verified By</h3>
            <div className="flex flex-col items-center">
              <img 
                src={signatureUrl} 
                alt="Operator Signature" 
                className="max-h-24 border rounded p-2 bg-white"
              />
              <p className="mt-2 font-medium">{operatorName}</p>
              <p className="text-sm text-muted-foreground">{shiftName}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
          <p>Report generated on {format(new Date(), "MMMM dd, yyyy 'at' HH:mm")}</p>
          <p>This is an official shift report for accounting purposes</p>
        </div>
      </div>
    </div>
  );
}
