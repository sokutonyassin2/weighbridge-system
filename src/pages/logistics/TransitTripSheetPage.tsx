import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Globe } from "lucide-react";
import { format } from "date-fns";

const fmt = (d: any) => d ? format(new Date(d), "dd MMM yyyy") : "—";
const daysBetween = (a: any, b: any): number | null => {
    if (!a || !b) return null;
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
};

const TransitTripSheetPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data: trip, isLoading } = useQuery({
        queryKey: ["transit_trip_sheet", id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_transit_trips" as any)
                .select("*")
                .eq("id", id)
                .single();
            if (error) throw error;
            return data as any;
        },
        enabled: !!id
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1a3a5c] border-t-transparent" />
                    <p className="text-sm text-slate-500 font-medium">Loading Trip Sheet…</p>
                </div>
            </div>
        );
    }

    if (!trip) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <Globe className="w-16 h-16 text-slate-300" />
                <p className="text-slate-500 font-bold text-lg">Trip not found.</p>
                <Button onClick={() => navigate(-1)} variant="outline">Go Back</Button>
            </div>
        );
    }

    const goDays = daysBetween(trip.dispatch_date, trip.offloading_date || new Date().toISOString().slice(0, 10));
    const returnDays = trip.leg_type === "R" ? goDays : null;

    return (
        <>
            {/* ─── Screen Controls (hidden when printing) ─── */}
            <div className="print:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
                <Button
                    variant="ghost"
                    className="text-white hover:bg-slate-700 gap-2"
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Transit
                </Button>
                <span className="font-bold text-sm tracking-wider">{trip.trip_id}</span>
                <Button
                    className="bg-white text-slate-900 hover:bg-slate-100 font-bold gap-2"
                    onClick={() => window.print()}
                >
                    <Printer className="w-4 h-4" /> Print Trip Sheet
                </Button>
            </div>

            {/* ─── Full-Page Trip Sheet (A4 optimized) ─── */}
            <div className="print:pt-0 pt-16 min-h-screen bg-slate-100 print:bg-white text-slate-900">
                <div className="max-w-[210mm] mx-auto bg-white shadow-xl print:shadow-none print:max-w-none p-10 print:p-8 space-y-8 font-sans">

                    {/* Clean Header */}
                    <div className="border-t-2 border-slate-900 pt-6 flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight uppercase">Transit Trip Sheet</h1>
                            <p className="text-sm font-medium text-slate-500 mt-1">Polytra International Logistics</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold font-mono tracking-tight">{trip.trip_id}</div>
                            <p className={`inline-block mt-2 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${trip.is_tanker ? "bg-blue-50 text-blue-700 border border-blue-100" : trip.leg_type === "G" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
                                {trip.is_tanker ? "TANKER — OUTBOUND" : trip.leg_type === "G" ? "FLATBED — OUTBOUND" : "FLATBED — RETURN"}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400 mt-3 italic">Generated: {format(new Date(), "dd MMM yyyy, HH:mm")}</p>
                        </div>
                    </div>

                    {/* Section 1: Vehicle & Driver */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                            VEHICLE & DRIVER INFORMATION
                        </h2>
                        <div className="grid grid-cols-3 gap-x-12 gap-y-6 text-sm">
                            <InfoRow label="Truck No." value={trip.truck_no} />
                            <InfoRow label="Trailer No." value={trip.trailer_no} />
                            <InfoRow label="Status" value={trip.status} bold />
                            <InfoRow label="Driver Name" value={trip.driver_name} />
                            <InfoRow label="Licence No." value={trip.license_no} />
                            <InfoRow label="Passport No." value={trip.passport_no} />
                            <InfoRow label="Contact" value={trip.contact_no} />
                            <InfoRow label="Location" value={trip.location} />
                            <InfoRow label="Destination" value={trip.destination} bold />
                        </div>
                    </section>

                    {/* Section 2: Cargo & Documentation */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                            CARGO & DOCUMENTATION
                        </h2>
                        <div className="grid grid-cols-3 gap-x-12 gap-y-6 text-sm">
                            <InfoRow label="Cargo" value={trip.cargo} bold />
                            <InfoRow label="BL Number" value={trip.bl_number} mono />
                            <InfoRow label="Container No." value={trip.container_no} mono />
                        </div>
                    </section>

                    {/* Section 3: Milestone Dates */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                            TRIP TIMELINE
                        </h2>
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-200">
                                        <th className="px-6 py-3 text-left font-bold">Milestone Event</th>
                                        <th className="px-6 py-3 text-left font-bold">Scheduled Date</th>
                                        <th className="px-6 py-3 text-left font-bold">Operational Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <TimelineRow milestone="Arrival at Loading Site" date={trip.arrival_loading_date} />
                                    <TimelineRow milestone="Loading Date" date={trip.loading_date} />
                                    <TimelineRow milestone="Dispatch Date" date={trip.dispatch_date} />
                                    <TimelineRow
                                        milestone="Tunduma Border — Arrival"
                                        date={trip.tunduma_arrival_date}
                                        note={trip.days_at_tunduma != null ? `${trip.days_at_tunduma} day(s) at border` : undefined}
                                    />
                                    <TimelineRow milestone="Tunduma Border — Departure" date={trip.tunduma_departure_date} />
                                    <TimelineRow milestone="Border Crossing Date" date={trip.crossing_date} />
                                    <TimelineRow
                                        milestone="Nakonde Border — Arrival"
                                        date={trip.nakonde_arrival_date}
                                        note={trip.days_at_nakonde != null ? `${trip.days_at_nakonde} day(s) at border` : undefined}
                                    />
                                    <TimelineRow milestone="Nakonde Border — Departure" date={trip.nakonde_departure_date} />
                                    <TimelineRow milestone="Arrive at Offloading Site" date={trip.arrive_offloading_site_date} />
                                    <TimelineRow
                                        milestone="Offloading Date"
                                        date={trip.offloading_date}
                                        highlight={trip.status === "Completed"}
                                    />
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Section 4: Trip Summary Metrics */}
                    <section className="space-y-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 pb-2">
                            TRIP SUMMARY METRICS
                        </h2>
                        <div className="grid grid-cols-4 gap-4">
                            <SummaryCard
                                label="Days Tunduma"
                                value={trip.days_at_tunduma != null ? `${trip.days_at_tunduma}` : "—"}
                                warn={trip.days_at_tunduma > 3}
                            />
                            <SummaryCard
                                label="Days Nakonde"
                                value={trip.days_at_nakonde != null ? `${trip.days_at_nakonde}` : "—"}
                                warn={trip.days_at_nakonde > 3}
                            />
                            <SummaryCard
                                label="Standing Chg"
                                value={trip.standing_charges > 0 ? `$${Number(trip.standing_charges).toLocaleString()}` : "—"}
                                warn={trip.standing_charges > 0}
                            />
                            <SummaryCard
                                label="Total Trip Days"
                                value={trip.total_trip_days != null ? `${trip.total_trip_days}` : "—"}
                                highlight
                            />
                        </div>
                    </section>

                    {/* Section 5: Signature Blocks */}
                    <section className="pt-12">
                        <div className="grid grid-cols-3 gap-12">
                            {["Prepared By", "Verified By", "Authorized By"].map(role => (
                                <div key={role} className="space-y-8">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{role}</p>
                                    <div className="border-b border-slate-900 pb-1 italic text-slate-300 text-xs text-center">Digital Seal Required</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Professional Footer */}
                    <div className="text-center pt-12 border-t border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            POLYTRA INTERNATIONAL LOGISTICS — OPERATIONAL TRANSIT DOCUMENT
                        </p>
                        <p className="text-[8px] text-slate-300 mt-1 uppercase tracking-widest">
                            Generated by SUDSUD System • Official Version {new Date().getFullYear()}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const InfoRow = ({ label, value, bold, mono }: { label: string; value?: any; bold?: boolean; mono?: boolean }) => (
    <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`text-slate-800 mt-0.5 ${bold ? "font-bold" : ""} ${mono ? "font-mono" : ""}`}>
            {value || <span className="text-slate-300">—</span>}
        </p>
    </div>
);

const TimelineRow = ({ milestone, date, note, highlight }: { milestone: string; date?: any; note?: string; highlight?: boolean }) => (
    <tr className={`text-sm ${highlight ? "bg-emerald-50" : ""}`}>
        <td className="px-4 py-2.5 font-medium text-slate-700">{milestone}</td>
        <td className="px-4 py-2.5 font-mono text-slate-800 font-bold">{fmt(date)}</td>
        <td className="px-4 py-2.5 text-slate-400 text-xs">{note || ""}</td>
    </tr>
);

const SummaryCard = ({ label, value, warn, highlight }: { label: string; value: string; warn?: boolean; highlight?: boolean }) => (
    <div className={`rounded-xl p-4 text-center border-2 ${highlight ? "border-[#1a3a5c] bg-blue-50" : warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
        <p className={`text-xl font-black ${highlight ? "text-[#1a3a5c]" : warn ? "text-amber-700" : "text-slate-700"}`}>{value}</p>
    </div>
);

export default TransitTripSheetPage;
