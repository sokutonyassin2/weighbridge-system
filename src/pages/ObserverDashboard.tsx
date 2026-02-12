import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    Camera,
    History,
    RefreshCw,
    Search,
    ArrowRightLeft,
    Truck,
    Monitor
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditLog {
    id: string;
    timestamp: string;
    detected_weight: number;
    photo_filename: string;
    type: 'manual' | 'auto';
    shift: 'Day_Shift' | 'Night_Shift';
    status: 'pending' | 'verified' | 'suspicious';
    vehicle_entry_id?: string;
}

interface VehicleEntry {
    id: string;
    vehicle_no: string;
    gross_weight: number;
    tare_weight: number;
    created_at: string;
    status: string;
    operator_id?: string;
}

const MACBOOK_HELPER_IP = "192.168.1.105";

export default function ObserverDashboard() {
    const { toast } = useToast();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const [isMacBookOnline, setIsMacBookOnline] = useState<boolean | null>(null);

    // Check MacBook Connectivity
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                // We use no-cors to ping since we don't need a full JSON response, just reachability
                await fetch(`http://${MACBOOK_HELPER_IP}:5000/`, {
                    signal: controller.signal,
                    mode: 'no-cors'
                });

                setIsMacBookOnline(true);
                clearTimeout(timeoutId);
            } catch (err) {
                setIsMacBookOnline(false);
            }
        };

        checkConnection();
        const interval = setInterval(checkConnection, 10000); // Check every 10 seconds
        return () => clearInterval(interval);
    }, []);

    // Fetch Audit Logs (The Scale Audit Feed)
    const { data: auditLogs, isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
        queryKey: ["camera-audit-logs", selectedDate],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("camera_audit_logs")
                .select(`
          *,
          vehicle_entries (
            vehicle_no,
            gross_weight,
            tare_weight,
            status
          )
        `)
                .gte("timestamp", startOfDay(selectedDate).toISOString())
                .lte("timestamp", endOfDay(selectedDate).toISOString())
                .order("timestamp", { ascending: false });

            if (error) throw error;
            return data as any[];
        },
    });

    // Real-time updates for audit logs
    useEffect(() => {
        const channel = supabase
            .channel("camera-audit-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "camera_audit_logs" },
                () => {
                    refetchLogs();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [refetchLogs]);

    const getShiftColor = (shift: string) => {
        return shift === "Day_Shift" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-indigo-100 text-indigo-700 border-indigo-200";
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verified':
                return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Verified</Badge>;
            case 'suspicious':
                return <Badge variant="destructive" className="animate-pulse"><AlertTriangle className="w-3 h-3 mr-1" /> Ghost Detected</Badge>;
            default:
                return <Badge variant="outline" className="text-slate-500"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
        }
    };

    // Helper to construct photo URL (Directly from MacBook)
    const getPhotoUrl = (log: AuditLog) => {
        const timestamp = new Date(log.timestamp);
        const monthName = timestamp.toLocaleString('default', { month: 'long' });
        const year = timestamp.getFullYear();
        const day = timestamp.getDate().toString().padStart(2, '0');
        const weekNo = Math.ceil(timestamp.getDate() / 7);

        const monthlyFolder = `${monthName}-${year}`;
        const weekFolder = `Week_${weekNo}`;
        const dayFolder = `Day_${day}`;

        return `http://${MACBOOK_HELPER_IP}:5000/photo-stream/${monthlyFolder}/${weekFolder}/${dayFolder}/${log.shift}/${log.photo_filename}`;
    };

    return (
        <div className="flex flex-col gap-6 p-6 bg-slate-50/50 min-h-screen">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Monitor className="text-primary w-8 h-8" />
                        Guardian Eye <span className="text-slate-400">|</span> <span className="font-medium text-slate-500">Camera Observer Dashboard</span>
                    </h1>
                    <p className="text-slate-500 text-sm">Auditing scale activity & ghost vehicle detection in real-time.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Input
                        type="date"
                        value={format(selectedDate, 'yyyy-MM-dd')}
                        onChange={(e) => setSelectedDate(new Date(e.target.value))}
                        className="w-40 border-slate-200"
                    />
                    <Button variant="outline" onClick={() => refetchLogs()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Statistics Bar */}
                <Card className="border-green-100 bg-green-50/20">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-100 p-3 rounded-full text-green-600">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Logged Vehicles</p>
                                <p className="text-2xl font-bold">{auditLogs?.filter(l => l.type === 'manual').length || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-red-100 bg-red-50/20">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-red-100 p-3 rounded-full text-red-600">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Ghost Detections</p>
                                <p className="text-2xl font-bold text-red-600">{auditLogs?.filter(l => l.status === 'suspicious').length || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-center h-full">
                            <div className="space-y-1">
                                <p className="text-sm text-slate-500 font-medium">System Health</p>
                                <div className={`flex items-center gap-2 font-bold ${isMacBookOnline ? 'text-green-600' : isMacBookOnline === false ? 'text-red-600' : 'text-slate-500'}`}>
                                    <div className={`w-2 h-2 rounded-full ${isMacBookOnline ? 'bg-green-600 animate-pulse' : isMacBookOnline === false ? 'bg-red-600' : 'bg-slate-400'}`} />
                                    {isMacBookOnline === null ? "Checking connection..." :
                                        isMacBookOnline ? "Weighbridge MacBook Online (Remote Audit Active)" :
                                            "MacBook Offline or Network Issue"}
                                </div>
                            </div>
                            <Activity className={isMacBookOnline ? "text-green-100 w-12 h-12" : isMacBookOnline === false ? "text-red-100 w-12 h-12" : "text-slate-100 w-12 h-12"} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-320px)]">
                {/* LEFT: Official Manual Feed */}
                <Card className="flex flex-col overflow-hidden border-blue-100">
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
                            {isLoadingLogs ? (
                                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
                            ) : auditLogs?.filter(l => l.type === 'manual').length === 0 ? (
                                <div className="text-center py-20 text-slate-400">
                                    <History className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>No manual entries recorded today.</p>
                                </div>
                            ) : (
                                auditLogs?.filter(l => l.type === 'manual').map((log) => (
                                    <div key={log.id} className="group flex gap-4 p-4 rounded-xl border bg-white hover:border-blue-300 transition-all hover:shadow-md">
                                        <div className="relative w-32 h-24 rounded-lg overflow-hidden bg-slate-100 border">
                                            <img
                                                src={getPhotoUrl(log)}
                                                alt="Vehicle"
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform cursor-pointer"
                                                onError={(e) => (e.currentTarget.src = "/placeholder-image.jpg")}
                                            />
                                            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded">
                                                <Camera className="w-2 h-2 inline mr-0.5" /> Manual
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{log.vehicle_entries?.vehicle_no || "N/A"}</p>
                                                    <p className="text-[11px] text-slate-500">{format(new Date(log.timestamp), 'HH:mm:ss aa')}</p>
                                                </div>
                                                <Badge variant="outline" className={getShiftColor(log.shift)}>{log.shift.replace('_', ' ')}</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div className="bg-slate-50 p-2 rounded border">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Gross weight</p>
                                                    <p className="text-sm font-bold text-slate-700">{log.detected_weight.toLocaleString()} kg</p>
                                                </div>
                                                <div className="bg-slate-50 p-2 rounded border text-center">
                                                    {getStatusBadge('verified')}
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
                        <div className="absolute top-0 right-0 w-32 h-full opacity-10">
                            <Activity className="w-full h-full text-red-900" />
                        </div>
                        <div className="flex justify-between items-center relative z-10">
                            <div>
                                <CardTitle className="text-red-900 flex items-center gap-2">
                                    <Activity className="w-5 h-5" /> Independent Scale Audit
                                </CardTitle>
                                <CardDescription>Automated detections of unrecorded vehicle movements.</CardDescription>
                            </div>
                            <Badge variant="destructive" className="animate-pulse shadow-sm shadow-red-500/50">HAWKEYE ACTIVE</Badge>
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <CardContent className="p-4 space-y-4 bg-slate-50/30">
                            {isLoadingLogs ? (
                                Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
                            ) : auditLogs?.filter(l => l.type === 'auto').length === 0 ? (
                                <div className="text-center py-20 text-slate-400">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20 text-green-500" />
                                    <p>No potential ghost weighings detected today.</p>
                                </div>
                            ) : (
                                auditLogs?.filter(l => l.type === 'auto').map((log) => (
                                    <div key={log.id} className="group relative flex flex-col gap-4 p-4 rounded-xl border-2 border-red-100 bg-white hover:border-red-400 transition-all hover:shadow-xl hover:-translate-y-1">
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-4">
                                                <div className="relative w-40 h-28 rounded-lg overflow-hidden bg-slate-100 border-2 border-slate-200">
                                                    <img
                                                        src={getPhotoUrl(log)}
                                                        alt="Ghost Vehicle"
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform cursor-zoom-in"
                                                        onError={(e) => (e.currentTarget.src = "/placeholder-image.jpg")}
                                                    />
                                                    <div className="absolute top-1 left-1 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow-lg">
                                                        GHOST DETECTED
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        <p className="text-sm font-bold text-slate-700">{format(new Date(log.timestamp), 'HH:mm:ss aa')}</p>
                                                    </div>
                                                    <Badge variant="outline" className={getShiftColor(log.shift)}>{log.shift.replace('_', ' ')}</Badge>
                                                    <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-100 w-fit">
                                                        <p className="text-[10px] text-red-400 uppercase font-black">Detected scale weight</p>
                                                        <p className="text-2xl font-black text-red-600 tracking-tighter">{log.detected_weight.toLocaleString()} kg</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end gap-2">
                                                <div className="bg-red-600 text-white p-2 rounded-lg mb-2">
                                                    <AlertTriangle className="w-6 h-6" />
                                                </div>
                                                <p className="text-[10px] italic text-slate-400 max-w-[120px]">This weight was stabilized twice without a digital entry being saved.</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </ScrollArea>
                </Card>
            </div>
        </div>
    );
}
