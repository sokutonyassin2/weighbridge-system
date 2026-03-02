import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    Camera,
    RefreshCw,
    History as HistoryIcon,
    Truck,
    Monitor,
    ShieldCheck,
    User,
    XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

const SERVER_URL = "http://192.168.1.216:5000";

interface AuditLog {
    id: string;
    timestamp: string;
    detected_weight: number;
    photo_filename: string;
    type: 'ghost' | 'manual' | 'auto';
    shift: 'Day_Shift' | 'Night_Shift';
    status: 'unmatched' | 'matched' | 'dismissed';
    session_start?: string;
    session_end?: string;
    dismissed?: boolean;
    dismiss_reason?: string;
}

interface VehicleEntry {
    id: string;
    vehicle_no: string;
    gross_weight: number;
    tare_weight: number;
    entry_time: string;
    status: string;
    operator_photo_url?: string;
    wb_number?: string;
    vehicle_type?: string;
    entered_by?: string;
}

export default function GuardianEye() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedShift, setSelectedShift] = useState<string>("all");
    const [selectedZoomImage, setSelectedZoomImage] = useState<string | null>(null);
    const [dismissTarget, setDismissTarget] = useState<AuditLog | null>(null);
    const [dismissReason, setDismissReason] = useState("");

    // --- Fetch Ghost Photos ---
    const { data: ghostLogs = [], isLoading: isLoadingGhost, refetch: refetchGhost } = useQuery({
        queryKey: ["guardian-ghost", selectedDate, selectedShift],
        queryFn: async () => {
            let query = (supabase as any)
                .from("camera_audit_logs")
                .select("*")
                .eq("type", "ghost")
                .gte("timestamp", startOfDay(selectedDate).toISOString())
                .lte("timestamp", endOfDay(selectedDate).toISOString());

            if (selectedShift !== "all") {
                query = query.eq("shift", selectedShift === "day" ? "Day_Shift" : "Night_Shift");
            }

            const { data, error } = await query.order("timestamp", { ascending: false });
            if (error) throw error;
            return data as AuditLog[];
        },
        refetchInterval: 10000,
    });

    // --- Fetch Verified Entries ---
    const { data: verifiedEntries = [], isLoading: isLoadingVerified, refetch: refetchVerified } = useQuery({
        queryKey: ["guardian-verified", selectedDate, selectedShift],
        queryFn: async () => {
            const dayStart = startOfDay(selectedDate).toISOString();
            const dayEnd = endOfDay(selectedDate).toISOString();

            let query = (supabase as any)
                .from("vehicle_entries")
                .select(`
                  id, vehicle_no, entry_time, wb_number, gross_weight, vehicle_type, entered_by,
                  weigh_records (photo_url)
                `)
                .gte("entry_time", dayStart)
                .lte("entry_time", dayEnd);

            const { data, error } = await query.order("entry_time", { ascending: false });

            if (error) throw error;

            // Apply shift filter locally since we don't have a shift column
            let filteredData = data;
            if (selectedShift !== "all") {
                filteredData = data.filter(entry => {
                    const hour = new Date(entry.entry_time).getHours();
                    const isDay = hour >= 7 && hour < 18;
                    return selectedShift === 'day' ? isDay : !isDay;
                });
            }

            return (filteredData as any[]).map(entry => ({
                ...entry,
                operator_photo_url: entry.weigh_records?.[0]?.photo_url || null,
                entered_by: entry.entered_by || "Unknown"
            })) as VehicleEntry[];
        },
        refetchInterval: 10000,
    });

    const refetchAll = () => {
        refetchGhost();
        refetchVerified();
    };

    // --- Match ghost logs to verified entries ---
    const auditRows = useMemo(() => {
        return ghostLogs.map((ghost): { ghost: AuditLog, match: VehicleEntry | null, status: 'matched' | 'missing' | 'dismissed' } => {
            if (ghost.dismissed) return { ghost, match: null, status: "dismissed" };

            const sessionStart = ghost.session_start ? new Date(ghost.session_start) : null;
            const sessionEnd = ghost.session_end ? new Date(ghost.session_end) : null;

            const match = verifiedEntries.find(entry => {
                const entryTime = new Date(entry.entry_time);
                if (sessionStart && sessionEnd) {
                    return entryTime >= sessionStart && entryTime <= sessionEnd;
                }
                const ghostTime = new Date(ghost.timestamp);
                const diffMs = Math.abs(entryTime.getTime() - ghostTime.getTime());
                return diffMs <= 10 * 60 * 1000;
            });

            return { ghost, match: match || null, status: match ? "matched" : "missing" };
        });
    }, [ghostLogs, verifiedEntries]);

    // --- Dismiss mutation ---
    const dismissMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
            const { error } = await (supabase as any)
                .from("camera_audit_logs")
                .update({
                    dismissed: true,
                    dismissed_by: user?.email || "Admin",
                    dismiss_reason: reason,
                    dismissed_at: new Date().toISOString(),
                    status: "dismissed",
                })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Dismissed", description: "Ghost entry has been dismissed and logged." });
            setDismissTarget(null);
            setDismissReason("");
            refetchGhost();
        },
        onError: () => {
            toast({ title: "Error", description: "Could not dismiss entry.", variant: "destructive" });
        },
    });

    const handleDismiss = () => {
        if (!dismissReason.trim()) return;
        if (!dismissTarget) return;
        dismissMutation.mutate({ id: dismissTarget.id, reason: dismissReason });
    };

    const getGhostPhotoUrl = (log: AuditLog) => {
        if (!log.photo_filename) return "/placeholder-image.jpg";
        const dateStr = new Date(log.timestamp).toLocaleString('default', { month: 'long' }) + "-" + new Date(log.timestamp).getFullYear();
        const weekNo = Math.ceil(new Date(log.timestamp).getDate() / 7);
        const day = new Date(log.timestamp).getDate().toString().padStart(2, '0');
        return `${SERVER_URL}/photos/${dateStr}/Week_${weekNo}/Day_${day}/${log.shift}/Ghost/${log.photo_filename}`;
    };

    const getManualPhotoUrl = (entry: VehicleEntry) => {
        if (!entry.operator_photo_url) return "/placeholder-image.jpg";
        // If it's already a full URL, return it
        if (entry.operator_photo_url.startsWith('http')) return entry.operator_photo_url;

        // If it starts with file://, it's a local MacBook path - we need to convert to Central Server path
        // MacBook paths look like: /Users/Shared/WeighbridgePhotos/Month-Year/Week_N/Day_DD/Shift/filename.jpg
        // We want: http://192.168.1.216:5000/photos/Month-Year/Week_N/Day_DD/Shift/filename.jpg

        if (entry.operator_photo_url.includes('WeighbridgePhotos')) {
            const parts = entry.operator_photo_url.split('WeighbridgePhotos');
            if (parts.length > 1) {
                return `${SERVER_URL}/photos${parts[1].replace(/\\/g, '/')}`;
            }
        }

        // Fallback
        return entry.operator_photo_url;
    };

    const getShiftColor = (shiftStr: string | undefined | null) => {
        if (!shiftStr) return "bg-gray-100 text-gray-700 border-gray-200";
        const lower = shiftStr.toLowerCase();
        return lower.includes("day")
            ? "bg-amber-100 text-amber-700 border-amber-200"
            : "bg-indigo-100 text-indigo-700 border-indigo-200";
    };

    const getShiftFromDate = (dateString: string) => {
        const hour = new Date(dateString).getHours();
        return hour >= 7 && hour < 18 ? "Day Shift" : "Night Shift";
    };

    const ghostDetections = auditRows.filter(r => r.status === 'missing').length;

    return (
        <div className="flex flex-col gap-6 p-6 bg-slate-50/50 min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Monitor className="text-slate-800 w-8 h-8" />
                        Guardian Eye <span className="text-slate-300">|</span> <span className="font-medium text-slate-500 text-xl">Camera Observer Dashboard</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Auditing scale activity & ghost vehicle detection in real-time.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-white items-center p-1 rounded-lg border shadow-sm px-2">
                        <span className="text-sm font-medium text-slate-600 mr-2">{format(selectedDate, 'MM/dd/yyyy')}</span>
                        <Input
                            type="date"
                            value={format(selectedDate, 'yyyy-MM-dd')}
                            onChange={(e) => setSelectedDate(new Date(e.target.value))}
                            className="w-8 h-8 p-1 opacity-0 absolute"
                            style={{ position: 'relative' }} // hack for date picker icon
                        />
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <Button
                            variant={selectedShift === "all" ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 px-4 text-xs font-bold ${selectedShift === "all" ? "bg-white shadow-sm" : "text-slate-500"}`}
                            onClick={() => setSelectedShift("all")}
                        >
                            All
                        </Button>
                        <Button
                            variant={selectedShift === "day" ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 px-4 text-xs font-bold ${selectedShift === "day" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                            onClick={() => setSelectedShift("day")}
                        >
                            Day
                        </Button>
                        <Button
                            variant={selectedShift === "night" ? "secondary" : "ghost"}
                            size="sm"
                            className={`h-8 px-4 text-xs font-bold ${selectedShift === "night" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                            onClick={() => setSelectedShift("night")}
                        >
                            Night
                        </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={refetchAll} className="h-10 text-slate-600 font-medium">
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="border-green-100 bg-green-50/20 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-100 p-3 rounded-full text-green-600">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Logged Vehicles</p>
                                <p className="text-2xl font-bold">{verifiedEntries.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-red-100 bg-red-50/20 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-red-100 p-3 rounded-full text-red-600">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Ghost Detections</p>
                                <p className="text-2xl font-bold text-red-600">{ghostDetections}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-center h-full">
                            <div className="space-y-1">
                                <p className="text-sm text-slate-500 font-medium">System Health</p>
                                <div className={`flex items-center gap-2 font-bold text-green-600`}>
                                    <div className={`w-2 h-2 rounded-full bg-green-600 animate-pulse`} />
                                    Central Server Online (Remote Audit Active)
                                </div>
                            </div>
                            <Activity className={"text-red-100 w-12 h-12"} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Split Feed Area */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-320px)] min-h-[600px]">

                {/* LEFT: Official Manual Feed (Verified) */}
                <Card className="flex flex-col overflow-hidden border-blue-100 shadow-sm">
                    <CardHeader className="bg-blue-50/50 border-b">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-blue-900 flex items-center gap-2">
                                    <Truck className="w-5 h-5" /> Official Weighing Records
                                </CardTitle>
                                <CardDescription>Verified vehicle entries with operator input.</CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-white text-blue-700">LIVE FEED</Badge>
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <CardContent className="p-4 space-y-4">
                            {isLoadingVerified ? (
                                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
                            ) : verifiedEntries.length === 0 ? (
                                <div className="text-center py-20 text-slate-400">
                                    <HistoryIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>No verified entries today.</p>
                                </div>
                            ) : (
                                verifiedEntries.map((entry) => (
                                    <div key={entry.id} className="group flex gap-4 p-4 rounded-xl border bg-white hover:border-blue-300 transition-all hover:shadow-md">
                                        <div className="relative w-32 h-24 rounded-lg overflow-hidden bg-slate-100 border">
                                            <img
                                                src={getManualPhotoUrl(entry)}
                                                alt="Vehicle"
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform cursor-pointer"
                                                onError={(e) => (e.currentTarget.src = "/placeholder-image.jpg")}
                                                onClick={() => setSelectedZoomImage(getManualPhotoUrl(entry))}
                                            />
                                            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded">
                                                <Camera className="w-2 h-2 inline mr-0.5" /> Manual
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{entry.vehicle_no || "N/A"}</p>
                                                    <p className="text-[11px] text-slate-500 font-medium">{entry.vehicle_type || "Unknown Type"}</p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">{format(new Date(entry.entry_time), 'HH:mm:ss aa')}</p>
                                                </div>
                                                <Badge variant="outline" className={getShiftColor(getShiftFromDate(entry.entry_time))}>
                                                    {getShiftFromDate(entry.entry_time)}
                                                </Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div className="bg-slate-50 p-2 rounded border">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Gross weight</p>
                                                    <p className="text-sm font-bold text-slate-700">{entry.gross_weight?.toLocaleString() || "—"} kg</p>
                                                </div>
                                                <div className="flex flex-col items-center justify-center p-2">
                                                    <Badge className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100 mb-1">
                                                        <CheckCircle className="w-3 h-3 mr-1" /> Verified
                                                    </Badge>
                                                    <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                                                        <User className="w-2.5 h-2.5" />
                                                        <span>By {entry.entered_by || "System"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </ScrollArea>
                </Card>

                {/* RIGHT: Automated Scale Audit (Ghost Hunter) */}
                <Card className="flex flex-col overflow-hidden border-red-100 shadow-lg shadow-red-50/50">
                    <CardHeader className="bg-red-50/50 border-b relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-full opacity-10 flex items-center justify-end">
                            <Activity className="w-24 h-24 text-red-900" />
                        </div>
                        <div className="flex justify-between items-center relative z-10">
                            <div>
                                <CardTitle className="text-red-900 flex items-center gap-2">
                                    <Activity className="w-5 h-5" /> Independent Scale Audit
                                </CardTitle>
                                <CardDescription>Automated detections of unrecorded vehicle movements.</CardDescription>
                            </div>
                            <Badge variant="destructive" className="animate-pulse shadow-sm shadow-red-500/50 bg-red-600 hover:bg-red-600 items-center justify-center translate-y-[-8px]">HAWKEYE ACTIVE</Badge>
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <CardContent className="p-4 space-y-4 bg-slate-50/30">
                            {isLoadingGhost ? (
                                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
                            ) : ghostLogs.length === 0 ? (
                                <div className="text-center py-20 text-slate-400">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20 text-green-500" />
                                    <p>No ghost weighings detected today.</p>
                                </div>
                            ) : (
                                auditRows.map((row) => (
                                    <div key={row.ghost.id} className={`group relative flex flex-col gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-xl hover:-translate-y-1 bg-white
                                        ${row.status === 'missing' ? 'border-red-100 hover:border-red-400' :
                                            row.status === 'matched' ? 'border-green-100 opacity-60' : 'border-slate-200 opacity-50'}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-4">
                                                <div className="relative w-40 h-28 rounded-lg overflow-hidden bg-slate-100 border-2 border-slate-200 shrink-0">
                                                    <img
                                                        src={getGhostPhotoUrl(row.ghost)}
                                                        alt="Ghost Vehicle"
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform cursor-zoom-in"
                                                        onError={(e) => (e.currentTarget.src = "/placeholder-image.jpg")}
                                                        onClick={() => setSelectedZoomImage(getGhostPhotoUrl(row.ghost))}
                                                    />
                                                    <div className="absolute top-1 left-1 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow-lg">
                                                        GHOST DETECTED
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        <p className="text-sm font-bold text-slate-700">{format(new Date(row.ghost.timestamp), 'HH:mm:ss aa')}</p>
                                                    </div>
                                                    <Badge variant="outline" className={getShiftColor(row.ghost.shift)}>{row.ghost.shift.replace('_', ' ')}</Badge>
                                                    <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-100 w-fit">
                                                        <p className="text-[10px] text-red-400 uppercase font-black">Detected scale weight</p>
                                                        <p className="text-2xl font-black text-red-600 tracking-tighter">{row.ghost.detected_weight?.toLocaleString() || "—"} kg</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end gap-2 max-w-[140px]">
                                                {row.status === 'missing' && (
                                                    <>
                                                        <div className="bg-red-600 text-white p-2 rounded-lg mb-2 shadow-sm shadow-red-200">
                                                            <AlertTriangle className="w-6 h-6" />
                                                        </div>
                                                        <p className="text-[10px] italic text-slate-400 max-w-[120px]">This weight was stabilized twice without a digital entry being saved.</p>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs mt-1 border-red-200 text-red-600 hover:bg-red-50"
                                                            onClick={() => setDismissTarget(row.ghost)}
                                                        >
                                                            Dismiss
                                                        </Button>
                                                    </>
                                                )}
                                                {row.status === 'matched' && (
                                                    <>
                                                        <div className="bg-green-100 text-green-700 p-2 rounded-lg mb-2">
                                                            <CheckCircle className="w-6 h-6" />
                                                        </div>
                                                        <p className="text-[10px] font-medium text-green-700 leading-tight">Entry Matched: <br />{row.match?.vehicle_no}</p>
                                                    </>
                                                )}
                                                {row.status === 'dismissed' && (
                                                    <>
                                                        <div className="bg-slate-100 text-slate-500 p-2 rounded-lg mb-2">
                                                            <XCircle className="w-6 h-6" />
                                                        </div>
                                                        <p className="text-[10px] italic text-slate-500 leading-tight">Dismissed: <br />{row.ghost.dismiss_reason}</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </ScrollArea>
                </Card>
            </div>

            {/* Zoom Dialog */}
            <Dialog open={!!selectedZoomImage} onOpenChange={(open) => !open && setSelectedZoomImage(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90 border-none">
                    <DialogHeader className="p-4 absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Camera className="w-5 h-5" /> High-Resolution Inspection View
                        </DialogTitle>
                    </DialogHeader>
                    {selectedZoomImage && (
                        <div className="flex items-center justify-center min-h-[40vh] bg-slate-900">
                            <img
                                src={selectedZoomImage}
                                alt="Zoomed view"
                                className="max-w-full max-h-[85vh] object-contain shadow-2xl"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = "/placeholder-image.jpg";
                                }}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dismiss Dialog */}
            <Dialog open={!!dismissTarget} onOpenChange={(o) => (!o && setDismissTarget(null))}>
                <DialogContent className="rounded-2xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Dismiss Detaction</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-slate-500">Provide a reason for why this ghost detection is valid and not a system entry.</p>
                        <Input
                            placeholder="e.g. Vehicle backed off scale..."
                            value={dismissReason}
                            onChange={(e) => setDismissReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDismissTarget(null)}>Cancel</Button>
                        <Button onClick={handleDismiss} disabled={dismissMutation.isPending} className="bg-red-600 hover:bg-red-700">
                            Dismiss Detection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
