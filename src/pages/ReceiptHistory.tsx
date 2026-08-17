
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Search, Printer, Calendar, Filter, X, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import QRCode from "react-qr-code";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getShortEntryId } from "@/lib/utils";

export default function ReceiptHistory() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedShift, setSelectedShift] = useState<string>("all");

    // Print State
    const [showPrint, setShowPrint] = useState(false);
    const [printData, setPrintData] = useState<any>(null);

    const { data: receipts, isLoading } = useQuery({
        queryKey: ["receipt-history", searchTerm, selectedDate, selectedShift],
        queryFn: async () => {
            let query = supabase
                .from("vehicle_entries")
                .select(`
          *,
          vehicle_types (*),
          weigh_records (*),
          shifts (*)
        `)
                .order('created_at', { ascending: false });

            if (searchTerm) {
                // Search by Vehicle No OR Entry ID (using text search logic or exact match)
                // Since ID is UUID, text search might fail if not cast, but vehicle_no is text.
                // We'll filter client side for complex OR logic if Supabase simple filter fails, 
                // but let's try an OR filter.
                // "vehicle_no.ilike.%term%,id.eq.term" - ID needs to be valid UUID for eq to work usually.
                // Let's stick to vehicle_no ilike for now, and maybe client side filter for ID if it looks like one?
                // Actually, simple text search:
                query = query.ilike('vehicle_no', `%${searchTerm}%`);
            }

            if (selectedDate) {
                // Filter by created_at date part. 
                // Supabase doesn't have a simple "date part" filter easily without RPC, 
                // so we start of day / end of day range.
                const start = new Date(selectedDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(selectedDate);
                end.setHours(23, 59, 59, 999);
                query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
            }

            // Shift filter would require joining shifts and filtering by shift name or generic "Day/Night" logic
            // For now, we fetch and filter in memory if "Day/Night" is selected, or better yet, store "shift_name" in entries?
            // Entries have shift_id. Shifts have shift_name.

            const { data, error } = await query;
            if (error) throw error;

            // Additional client-side filtering for robust search (e.g. partial ID match)
            let filteredData = data;

            if (searchTerm) {
                const lowerTerm = searchTerm.toLowerCase();
                filteredData = filteredData.filter(item =>
                    item.vehicle_no.toLowerCase().includes(lowerTerm) ||
                    getShortEntryId(item.id, item.wb_number).toLowerCase().includes(lowerTerm)
                );
            }

            if (selectedShift !== "all") {
                filteredData = filteredData.filter(item => item.shifts?.shift_name === selectedShift);
            }

            return filteredData;
        },
    });

    const handlePrint = async (entry: any) => {
        // Construct the print data object similar to WeighEntry
        // We might need to fetch custom receipt settings here
        const savedSettings = localStorage.getItem('receiptSettings');
        const settings = savedSettings ? JSON.parse(savedSettings) : null;

        // Find final weight (usually the last record, or calculated)
        // If it's a completed entry, net weight is gross - tare.
        // If we have weigh records, use them.
        const lastRecord = entry.weigh_records?.[entry.weigh_records.length - 1];
        const firstRecord = entry.weigh_records?.[0];
        const isPulling = entry.vehicle_types?.type_name?.toLowerCase().includes("pull") ||
            entry.weigh_records?.some((r: any) => (r.gtm || 0) > 0);

        const gross = lastRecord?.gross_weight || 0;
        const tare = firstRecord?.tare_weight || lastRecord?.tare_weight || 0;

        let net = gross - tare;
        let pulling_net = null;

        if (isPulling && firstRecord && lastRecord) {
            const combo1 = (firstRecord.gross_weight || 0) + (firstRecord.gtm || 0);
            const combo2 = (lastRecord.gross_weight || 0) + (lastRecord.gtm || 0);
            pulling_net = Math.abs(combo1 - combo2).toFixed(2);
            net = parseFloat(pulling_net);
        }

        // Determine Operator Name
        // Try shift operator first, then profile check if needed (but we don't have joined profiles yet)
        const operatorName = entry.shifts?.operator_name || "System Admin";

        const printInfo = {
            ...entry,
            // Ensure we have the basic fields needed for the receipt template
            gross_weight: gross,
            tare_weight: tare,
            net_weight: net.toFixed(2),
            gvm: lastRecord?.gvm || null,
            gtm: lastRecord?.gtm || null,
            trailer_weight: lastRecord?.trailer_weight || null,
            payload: (lastRecord?.gtm && lastRecord?.trailer_weight)
                ? (lastRecord.gtm - lastRecord.trailer_weight).toFixed(2)
                : null,
            pulling_gvm: isPulling ? pulling_net : ((gross && lastRecord?.gtm) ? (gross + lastRecord.gtm).toFixed(2) : null),
            isPulling,
            firstRecord,
            lastRecord,
            vehicle_type_name: entry.vehicle_types?.type_name,
            price: (entry.status === "Completed" || (entry.weigh_records && entry.weigh_records.length > 1))
                ? (entry.vehicle_types?.first_weigh_fee || 0) + (entry.vehicle_types?.second_weigh_fee || 0)
                : (entry.vehicle_types?.first_weigh_fee || 0),
            weighed_by: operatorName,
            weigh_time: entry.updated_at || entry.created_at,
            settings: settings
        };

        setPrintData(printInfo);
        setShowPrint(true);
    };

    if (showPrint && printData) {
        return (
            <div className="container mx-auto p-6 md:p-8">
                <Button
                    variant="ghost"
                    onClick={() => setShowPrint(false)}
                    className="mb-4 print:hidden"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to History
                </Button>
                <div className="bg-white rounded-lg shadow-sm border p-0 overflow-hidden">
                    <ReceiptPreview data={printData} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 container mx-auto p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Receipt History</h1>
                    <p className="text-muted-foreground">View and reprint historical weighbridge tickets.</p>
                </div>
            </div>

            <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Filters & Search</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search Vehicle No or Ticket ID..."
                                className="pl-9 bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-4">
                            <div className="relative">
                                <Input
                                    type="date"
                                    className="w-[180px] bg-white"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>
                            <Select value={selectedShift} onValueChange={setSelectedShift}>
                                <SelectTrigger className="w-[140px] bg-white">
                                    <SelectValue placeholder="Shift" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Shifts</SelectItem>
                                    <SelectItem value="Day">Day Shift</SelectItem>
                                    <SelectItem value="Night">Night Shift</SelectItem>
                                </SelectContent>
                            </Select>
                            {(searchTerm || selectedDate || selectedShift !== "all") && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => { setSearchTerm(""); setSelectedDate(""); setSelectedShift("all"); }}
                                    title="Clear Filters"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Ticket ID</TableHead>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Vehicle Details</TableHead>
                                <TableHead>Weights (kg)</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading records...</TableCell>
                                </TableRow>
                            ) : receipts?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No receipts found matching your filters.</TableCell>
                                </TableRow>
                            ) : (
                                receipts?.map((receipt: any) => (
                                    <TableRow key={receipt.id} className="hover:bg-muted/5">
                                        <TableCell className="font-mono font-medium">
                                            {getShortEntryId(receipt.id, receipt.wb_number)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{format(new Date(receipt.created_at), "MMM dd, yyyy")}</span>
                                                <span className="text-xs text-muted-foreground">{format(new Date(receipt.created_at), "HH:mm")} • {receipt.shifts?.shift_name || "Unknown"}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold">{receipt.vehicle_no}</span>
                                                <span className="text-xs text-muted-foreground">{receipt.vehicle_types?.type_name || receipt.category}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {/* Calculate net from weigh records if possible, basically logic duplication but safe */}
                                            {(() => {
                                                const records = receipt.weigh_records || [];
                                                if (records.length === 0) return "0";

                                                const sorted = [...records].sort((a: any, b: any) =>
                                                    new Date(a.weigh_time || 0).getTime() - new Date(b.weigh_time || 0).getTime()
                                                );
                                                const first = sorted[0];
                                                const last = sorted[sorted.length - 1];
                                                const isPulling = receipt.vehicle_types?.type_name?.toLowerCase().includes("pull") ||
                                                    records.some((r: any) => Number(r.gtm) > 0);

                                                if (records.length === 1) {
                                                    // For single records, show whatever weight we have
                                                    const single = records[0];
                                                    const g = Number(single.gross_weight) || 0;
                                                    const t = Number(single.tare_weight) || 0;
                                                    const n = Number(single.net_weight) || Math.abs(g - t);
                                                    return n > 0 ? n.toLocaleString() : g.toLocaleString();
                                                }

                                                if (isPulling) {
                                                    const combo1 = (Number(first.gross_weight) || 0) + (Number(first.gtm) || 0);
                                                    const combo2 = (Number(last.gross_weight) || 0) + (Number(last.gtm) || 0);
                                                    return Math.abs(combo1 - combo2).toLocaleString();
                                                }
                                                return Number((last.gross_weight || 0) - (first.tare_weight || last.tare_weight || 0)).toLocaleString();
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={receipt.status === "Completed" ? "default" : "secondary"}>
                                                {receipt.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handlePrint(receipt)}>
                                                <Printer className="h-4 w-4 mr-2" /> Print
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}

// Internal component for the receipt preview to keep file self-contained
const ReceiptPreview = ({ data }: { data: any }) => {
    if (!data) return null;

    // Load Settings
    const savedSettings = localStorage.getItem('receiptSettings');
    const settings = savedSettings ? JSON.parse(savedSettings) : {
        template: 'classic',
        header: {
            companyName: 'ENERGY FEEDS LIMITED',
            subtitle: 'Under SudSud Group',
            address: 'P.O BOX 106254 - DAR ES SALAAM, TANZANIA',
            showLogo: true,
            logoPosition: 'center',
            useCustomLogo: false,
        },
        qrCode: { enabled: true, size: 'medium', position: 'bottom-right' },
        footer: { text: 'Thank you for your business!', showGeneratedTime: true },
    };

    const qrSizeMap: any = { small: 60, medium: 75, large: 90 };
    const qrSize = qrSizeMap[settings.qrCode.size] || 75;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <Card className="border-none shadow-sm print:shadow-none">
                <CardContent className="p-8 print:p-2">
                    <div id="print-receipt" className="print:m-0 print:p-0">
                        <div className={`mb-6 print:mb-4 text-${settings.header.logoPosition} relative text-slate-900 border-b-2 border-slate-900 pb-6 print:pb-4`}>
                            {settings.header.showLogo && (
                                <img
                                    src={settings.header.useCustomLogo && settings.header.customLogo
                                        ? settings.header.customLogo
                                        : "/images/energy-feeds-logo.jpg"
                                    }
                                    alt="Logo"
                                    className={`h-20 mb-4 object-contain ${settings.header.logoPosition === 'center' ? 'mx-auto' : settings.header.logoPosition === 'right' ? 'ml-auto' : ''}`}
                                />
                            )}
                            <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">
                                {settings.header.companyName}
                            </h1>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{settings.header.subtitle}</p>
                            <p className="text-xs text-slate-400 font-medium">{settings.header.address}</p>

                            <h2 className="mt-6 text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                                <span className="h-px bg-slate-200 flex-1"></span>
                                OFFICIAL WEIGH RECEIPT
                                <span className="h-px bg-slate-200 flex-1"></span>
                            </h2>

                            {/* QR Code - Top Right Position */}
                            {settings.qrCode.enabled && settings.qrCode.position === 'top-right' && (
                                <div className="absolute top-0 right-0 p-2 bg-white">
                                    <QRCode
                                        value={JSON.stringify({
                                            id: data.id,
                                            vehicle: data.vehicle_no,
                                            date: data.weigh_time
                                        })}
                                        size={qrSize}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 mb-8 print:mb-4 text-slate-900 px-4">
                            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entry ID</p>
                                    <p className="font-bold font-mono text-lg text-slate-900">{getShortEntryId(data.id, data.wb_number)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Date & Time</p>
                                    <p className="font-bold text-slate-900 text-sm">
                                        {format(new Date(data.weigh_time), "dd/MM/yyyy HH:mm:ss")}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vehicle Plate</p>
                                    <p className="font-black text-2xl text-slate-950 tracking-tighter leading-none">{data.vehicle_no}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vehicle Type</p>
                                    <p className="font-bold text-slate-900 text-sm">{data.vehicle_types?.type_name || data.category}</p>
                                </div>
                                
                                <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Driver Name</p>
                                        <p className="font-bold text-slate-800 text-sm">{data.driver_name || "N/A"}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Customer / Farmer</p>
                                        <p className="font-bold text-slate-800 text-sm">{data.customer_farmer_name || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Item / Product</p>
                                        <p className="font-bold text-slate-800 text-sm">{data.item_name || "N/A"}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Source / Destination</p>
                                        <p className="font-bold text-slate-800 text-sm">{data.source_destination || "N/A"}</p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Shift Operator</p>
                                    <p className="font-bold text-slate-700 text-xs">{data.weighed_by}</p>
                                </div>
                            </div>

                            <div className="mt-8 border-y border-slate-200 py-8 bg-slate-50/50 rounded-xl print:mt-4 print:py-4">
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross Weight</p>
                                        <p className="text-xl font-bold text-slate-700">{Number(data.gross_weight).toLocaleString()} <span className="text-xs text-slate-400">KG</span></p>
                                    </div>
                                    <div className="space-y-1 border-x border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tare Weight</p>
                                        <p className="text-xl font-bold text-slate-700">{Number(data.tare_weight).toLocaleString()} <span className="text-xs text-slate-400">KG</span></p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Net Payload</p>
                                        <p className="text-3xl font-black text-slate-950 underline decoration-slate-200">{Number(data.net_weight).toLocaleString()} <span className="text-sm">KG</span></p>
                                    </div>
                                </div>
                            </div>

                            {/* GVM/GTM/Trailer/Payload - Only show if values entered */}
                            {(data.gvm || data.gtm || data.trailer_weight) && (
                                <div className="mt-4 pt-4 border-t border-dashed border-gray-200 space-y-2">
                                    <p className="text-sm font-semibold text-gray-500">Vehicle Mass Details:</p>
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                        {data.gvm && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">GVM (Gross Vehicle Mass):</span>
                                                <span className="font-bold">{Number(data.gvm).toLocaleString()} kg</span>
                                            </div>
                                        )}
                                        {data.gtm && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">GTM (Gross Trailer Mass):</span>
                                                <span className="font-bold">{Number(data.gtm).toLocaleString()} kg</span>
                                            </div>
                                        )}
                                        {data.trailer_weight && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Trailer Weight:</span>
                                                <span className="font-bold">{Number(data.trailer_weight).toLocaleString()} kg</span>
                                            </div>
                                        )}
                                        {data.isPulling && data.firstRecord && (
                                            <div className="flex justify-between items-center text-sm py-2 bg-blue-50/50 dark:bg-blue-900/10 px-2 rounded">
                                                <span className="text-gray-600 font-medium">Loaded Combination (Gross + GTM):</span>
                                                <span className="font-bold">{(data.firstRecord.gross_weight + data.firstRecord.gtm).toLocaleString()} kg</span>
                                            </div>
                                        )}
                                        {data.isPulling && data.lastRecord && (
                                            <div className="flex justify-between items-center text-sm py-2 bg-blue-50/50 dark:bg-blue-900/10 px-2 rounded">
                                                <span className="text-gray-600 font-medium">Empty Combination (Gross + GTM):</span>
                                                <span className="font-bold">{(data.lastRecord.gross_weight + data.lastRecord.gtm).toLocaleString()} kg</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {data.isPulling && (
                                <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-bold text-primary italic">FINAL PRODUCT:</span>
                                        <span className="text-2xl font-black text-primary underline decoration-double">
                                            {Number(data.net_weight).toLocaleString()} kg
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-center text-slate-400 mt-2 uppercase tracking-widest font-bold">
                                        Calculated: (Loaded Combination) - (Empty Combination)
                                    </p>
                                </div>
                            )}
                            {data.pulling_gvm && !data.isPulling && (
                                <div className="flex justify-between items-center text-sm bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
                                    <span className="text-slate-400 font-bold uppercase tracking-widest">Pulling GVM (Gross + GTM):</span>
                                    <span className="font-black text-slate-900 text-xl">{Number(data.pulling_gvm).toLocaleString()} <span className="text-xs">KG</span></span>
                                </div>
                            )}
                            {data.payload && (
                                <div className="flex justify-between items-center text-lg font-bold text-black pt-2 col-span-2">
                                    <span>Payload (GTM - Trailer):</span>
                                    <span>{Number(data.payload).toLocaleString()} kg</span>
                                </div>
                            )}

                            {/* Payment Display Section */}
                            {(data.payment_amount > 0 || data.price > 0) && (
                                <div className="mt-4 pt-4 border-t border-slate-200">
                                    <div className="flex justify-between items-center bg-green-50/50 p-3 rounded-xl border border-green-100">
                                        <span className="text-xs font-black text-green-700 uppercase tracking-widest">Amount Paid:</span>
                                        <span className="font-black text-green-800 text-xl">
                                            TZS {Number(data.payment_amount || data.price).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-center text-[10px] text-slate-400 mt-12 print:mt-8 uppercase tracking-[0.3em] font-bold">
                        <p className="text-slate-600 mb-2">{settings.footer.text}</p>
                        <p>Document Validated & Signed Digitally</p>
                        <p className="mt-1">Reprinted: {new Date().toLocaleString()}</p>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-8 flex justify-end print:hidden">
                <Button onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" /> Print Now
                </Button>
            </div>
        </div>
    );
};
