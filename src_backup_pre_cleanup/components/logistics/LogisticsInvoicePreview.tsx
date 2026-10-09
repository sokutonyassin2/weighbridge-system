import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Printer, Download, X } from "lucide-react";
import { format } from "date-fns";

interface InvoiceTrip {
  id: string;
  vehicle?: { vehicle_no?: string; fleet_category?: string } | null;
  trailer?: { vehicle_no?: string; trailer_number?: string; fleet_category?: string } | null;
  trailer_id?: string;
  trailer_reg?: string;
  reference_number?: string;
  origin?: string;
  destination?: string;
  cargo_outbound?: string;
  return_cargo?: string;
  revenue_amount?: number | string;
  revenue_currency?: string;
  return_revenue_amount?: number | string;
  return_revenue_currency?: string;
  _leg?: string;
  // Weighbridge / tonnage fields (if available)
  tonnage?: number | string;
  rate_per_ton?: number | string;
}

interface LogisticsInvoicePreviewProps {
  open: boolean;
  onClose: () => void;
  invoiceNo: string;
  invoiceDate?: string;
  clientName: string;
  currency: string;
  trips: InvoiceTrip[];
  totalRevenue: number;
}

// Convert number to words
function numberToWords(num: number): string {
  if (num === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertGroup(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convertGroup(n % 100) : "");
  }

  const units = ["", "Thousand", "Million", "Billion"];
  let result = "";
  let unitIndex = 0;
  let wholeNum = Math.floor(Math.abs(num));
  const cents = Math.round((Math.abs(num) - wholeNum) * 100);

  if (wholeNum === 0) {
    result = "Zero";
  } else {
    while (wholeNum > 0) {
      const group = wholeNum % 1000;
      if (group !== 0) {
        const groupStr = convertGroup(group);
        result = groupStr + (units[unitIndex] ? " " + units[unitIndex] : "") + (result ? " " + result : "");
      }
      wholeNum = Math.floor(wholeNum / 1000);
      unitIndex++;
    }
  }

  if (cents > 0) {
    result += " and " + convertGroup(cents) + " Cents";
  }

  return result.trim() + " Only";
}

export default function LogisticsInvoicePreview({
  open,
  onClose,
  invoiceNo,
  invoiceDate,
  clientName,
  currency,
  trips,
  totalRevenue,
}: LogisticsInvoicePreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoiceNo}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; }
          ${getInvoiceStyles()}
        </style>
      </head>
      <body>
        ${content.innerHTML}
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const formattedDate = invoiceDate
    ? format(new Date(invoiceDate), "EEEE, MMMM d, yyyy")
    : format(new Date(), "EEEE, MMMM d, yyyy");

  const currencySymbol = currency === "USD" ? "$" : "TShs";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[1100px] p-0 overflow-hidden bg-slate-100 max-h-[95vh]">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 bg-white border-b border-slate-200 sticky top-0 z-10">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Printer className="w-4 h-4 text-indigo-500" />
            Invoice Preview — {invoiceNo}
          </h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs font-bold gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs font-bold gap-1.5">
              <Download className="w-3.5 h-3.5" /> Save PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Invoice */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(95vh - 60px)" }}>
          <div ref={printRef}>
            <div className="invoice-page">
              {/* Top Bar with Invoice No and Date */}
              <div className="invoice-topbar">
                <div className="invoice-topbar-left">
                  <span className="invoice-label">Invoice No:</span>
                  <span className="invoice-no-value">{invoiceNo}</span>
                </div>
                <div className="invoice-topbar-right">
                  {formattedDate}
                </div>
              </div>

              {/* Header: Logo + Company Info */}
              <div className="invoice-header">
                <div className="invoice-logo-area">
                  <img
                    src="/images/logistics-logo.png"
                    alt="Sudenergy Logistics"
                    className="invoice-logo"
                    crossOrigin="anonymous"
                  />
                </div>
                <div className="invoice-company-info">
                  <div className="company-name">SUDENERGY LOGISTICS COMPANY TANZANIA LIMITED</div>
                  <div className="company-address">KONGOWE - KIBAHA, MOROGORO ROAD</div>
                  <div className="company-address">P.O.BOX 106254, Dar es salaam Tanzania</div>
                  <div className="invoice-title">INVOICE</div>
                  <div className="client-name">{clientName}</div>
                  <div className="tax-info">TIN 136-506-250</div>
                  <div className="tax-info">VRN 40-029951-U</div>
                </div>
              </div>

              {/* Invoice Table */}
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th className="col-sn">S/N</th>
                    <th className="col-truck">TRUCK/TRAILER</th>
                    <th className="col-route">ROUTE</th>
                    <th className="col-trip">TRIP</th>
                    <th className="col-cargo">CARGO TYPE</th>
                    <th className="col-rate">RATE PER TONE</th>
                    <th className="col-tonnage">TONAGE</th>
                    <th className="col-total">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, idx) => {
                    const isReturn = trip._leg === "RETURN";
                    const rev = isReturn
                      ? parseFloat(String(trip.return_revenue_amount || 0))
                      : parseFloat(String(trip.revenue_amount || 0));
                    const revCurrency = isReturn
                      ? trip.return_revenue_currency || currency
                      : trip.revenue_currency || currency;
                    const tonnage = parseFloat(String(trip.tonnage || 0));
                    const ratePerTon = parseFloat(String(trip.rate_per_ton || 0));
                    const routeStr = `${trip.origin || ""} - ${trip.destination || ""}`.toUpperCase();
                    const truckPlate = trip.vehicle?.vehicle_no || "";
                    const trailerPlate = trip.trailer?.vehicle_no || trip.trailer?.trailer_number || trip.trailer_reg || "";
                    const truckTrailerDisplay = [truckPlate, trailerPlate].filter(Boolean).join(" / ") || "—";
                    const cargoType = isReturn
                      ? (trip.return_cargo || trip.cargo_outbound || "—")
                      : (trip.cargo_outbound || "—");

                    return (
                      <tr key={trip.id + (isReturn ? "-ret" : "")}>
                        <td className="col-sn">{idx + 1}</td>
                        <td className="col-truck">{truckTrailerDisplay}</td>
                        <td className="col-route">{routeStr}</td>
                        <td className="col-trip">{trip.reference_number || "—"}</td>
                        <td className="col-cargo">{cargoType.toUpperCase()}</td>
                        <td className="col-rate">
                          {ratePerTon > 0 ? (
                            <><span className="currency-sym">{revCurrency === "USD" ? "$" : "TShs"}</span> {ratePerTon.toLocaleString(undefined, { minimumFractionDigits: 2 })}</>
                          ) : "—"}
                        </td>
                        <td className="col-tonnage">{tonnage > 0 ? tonnage.toLocaleString(undefined, { minimumFractionDigits: 3 }) : "—"}</td>
                        <td className="col-total">
                          <span className="currency-sym">{revCurrency === "USD" ? "$" : "TShs"}</span>{" "}
                          {rev.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Empty rows for spacing if less than 4 trips */}
                  {trips.length < 4 &&
                    Array.from({ length: 4 - trips.length }).map((_, i) => (
                      <tr key={`empty-${i}`} className="empty-row">
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {/* Total Row */}
              <div className="invoice-total-row">
                <div className="total-label">TOTAL INVOICE VALUE</div>
                <div className="total-value">
                  {currencySymbol} {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* Amount in Words + Company Signature */}
              <div className="invoice-words-section">
                <div className="words-left">
                  <div className="words-label">Amount Chargeable (in words)</div>
                  <div className="words-value">
                    {numberToWords(totalRevenue)}
                  </div>
                </div>
                <div className="words-right">
                  <div className="for-company">for Sudenergy Logistics Company (T) LTD</div>
                </div>
              </div>

              {/* Declaration + Signature */}
              <div className="invoice-declaration">
                <div className="declaration-left">
                  <div className="declaration-label">Declaration</div>
                  <div className="declaration-text">
                    We declare that this Invoice shows the<br />
                    actual price and all particulars are true and correct
                  </div>
                </div>
                <div className="declaration-right">
                  <div className="signature-line"></div>
                  <div className="signature-label">Authorised Signature and Stamp</div>
                </div>
              </div>

              {/* Bank Details Footer */}
              <div className="invoice-bank-footer">
                <div className="bank-name">SUDENERGY LOGISTICS COMPANY TANZANIA LIMITED</div>
                <div className="bank-details">NMB BANK - KIBAHA BRANCH</div>
                <div className="bank-details">USD A/C NO. 21210076615 SWIFT CODE: NMIBTZTZ - BRANCH CODE 212</div>
              </div>
            </div>
          </div>
        </div>

        {/* Inline styles for the invoice (visible on screen + print) */}
        <style>{getInvoiceStyles()}</style>
      </DialogContent>
    </Dialog>
  );
}

function getInvoiceStyles(): string {
  return `
    .invoice-page {
      background: #fff;
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px 32px;
      border: 1px solid #d1d5db;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      font-family: 'Segoe UI', 'Arial', sans-serif;
      color: #1a1a2e;
      font-size: 12px;
      line-height: 1.4;
    }

    /* Top Bar */
    .invoice-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border: 1.5px solid #92400e;
      background: #fffbeb;
      margin-bottom: 12px;
      font-size: 11px;
    }
    .invoice-topbar-left {
      font-weight: 700;
      color: #1a1a2e;
    }
    .invoice-label {
      color: #78350f;
      margin-right: 4px;
    }
    .invoice-no-value {
      font-weight: 800;
      color: #1a1a2e;
      font-size: 12px;
    }
    .invoice-topbar-right {
      color: #1a1a2e;
      font-weight: 600;
      font-size: 11px;
    }

    /* Header */
    .invoice-header {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      padding: 16px 0;
      border-bottom: 2px solid #1e3a5f;
      margin-bottom: 12px;
    }
    .invoice-logo-area {
      flex-shrink: 0;
      width: 100px;
    }
    .invoice-logo {
      width: 100px;
      height: auto;
      object-fit: contain;
    }
    .invoice-company-info {
      flex: 1;
      text-align: center;
    }
    .company-name {
      font-size: 15px;
      font-weight: 800;
      color: #1e3a5f;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .company-address {
      font-size: 11px;
      color: #475569;
      font-weight: 500;
    }
    .invoice-title {
      font-size: 20px;
      font-weight: 900;
      color: #1a1a2e;
      margin: 10px 0 4px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .client-name {
      font-size: 13px;
      font-weight: 700;
      color: #1e3a5f;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .tax-info {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }

    /* Table */
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
      font-size: 11px;
    }
    .invoice-table thead tr {
      background: #1e3a5f;
      color: #fff;
    }
    .invoice-table th {
      padding: 8px 10px;
      font-weight: 700;
      text-align: center;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #1e3a5f;
      white-space: nowrap;
    }
    .invoice-table td {
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      text-align: center;
      font-weight: 500;
      vertical-align: middle;
    }
    .invoice-table tbody tr:hover {
      background: #f8fafc;
    }
    .invoice-table .empty-row td {
      height: 28px;
    }

    .col-sn { width: 40px; }
    .col-truck { width: 150px; text-align: left !important; font-weight: 600 !important; }
    .col-route { width: 140px; font-weight: 600 !important; }
    .col-trip { width: 130px; font-size: 10px !important; }
    .col-cargo { width: 100px; font-weight: 600 !important; }
    .col-rate { width: 110px; text-align: right !important; }
    .col-tonnage { width: 80px; text-align: right !important; }
    .col-total { width: 110px; text-align: right !important; font-weight: 700 !important; }
    .currency-sym { font-size: 10px; color: #64748b; margin-right: 2px; }

    /* Total Row */
    .invoice-total-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 20px;
      padding: 10px 16px;
      border: 2px solid #1e3a5f;
      background: #f0f4f8;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .total-label {
      font-size: 12px;
      font-weight: 800;
      color: #1e3a5f;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .total-value {
      font-size: 16px;
      font-weight: 900;
      color: #1a1a2e;
      letter-spacing: 0.5px;
    }

    /* Amount in Words */
    .invoice-words-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 16px;
    }
    .words-left { flex: 1; }
    .words-label {
      font-size: 10px;
      font-weight: 700;
      color: #dc2626;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .words-value {
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      font-style: italic;
    }
    .words-right { text-align: right; }
    .for-company {
      font-size: 11px;
      font-weight: 700;
      color: #1e3a5f;
      font-style: italic;
    }

    /* Declaration */
    .invoice-declaration {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 16px 0;
      margin-bottom: 20px;
    }
    .declaration-left { flex: 1; }
    .declaration-label {
      font-size: 10px;
      font-weight: 800;
      color: #dc2626;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .declaration-text {
      font-size: 10px;
      color: #475569;
      line-height: 1.5;
      font-weight: 500;
    }
    .declaration-right {
      text-align: right;
      min-width: 250px;
    }
    .signature-line {
      border-bottom: 1px solid #94a3b8;
      height: 40px;
      margin-bottom: 6px;
    }
    .signature-label {
      font-size: 10px;
      font-weight: 700;
      color: #1a1a2e;
    }

    /* Bank Footer */
    .invoice-bank-footer {
      text-align: center;
      padding: 14px 16px;
      border-top: 2px solid #1e3a5f;
      background: #f8fafc;
      margin-top: 10px;
    }
    .bank-name {
      font-size: 11px;
      font-weight: 800;
      color: #1e3a5f;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .bank-details {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
    }

    /* Print styles */
    @media print {
      body { margin: 0; padding: 0; }
      .invoice-page {
        border: none;
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
    }
  `;
}
