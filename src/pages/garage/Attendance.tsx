import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, CalendarCheck2, FileCheck, Plus, Trash2, Clock, UserCheck, UserX, Loader2, Pencil, AlertTriangle, Printer, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const GarageAttendance = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const sb = supabase as any;
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [newPersonnel, setNewPersonnel] = useState({ name: "", position: "" });
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isEditPersonnelOpen, setIsEditPersonnelOpen] = useState(false);
    const [editingPersonnel, setEditingPersonnel] = useState({ id: "", name: "", position: "" });
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [personnelToDelete, setPersonnelToDelete] = useState<string | null>(null);

    // Fetch Personnel
    const { data: personnel, isLoading: isLoadingPersonnel } = useQuery({
        queryKey: ["garage-personnel"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_personnel")
                .select("*")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Attendance for selected date
    const { data: attendance, isLoading: isLoadingAttendance } = useQuery({
        queryKey: ["garage-attendance", selectedDate],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_attendance")
                .select("*")
                .eq("date", selectedDate);
            if (error) throw error;
            return data;
        }
    });

    // Report Filter States
    const [reportViewMode, setReportViewMode] = useState<"daily" | "monthly">("monthly");
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportMonth, setReportMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

    // Fetch Attendance for Reports based on reportViewMode
    const { data: reportAttendance, isLoading: isLoadingReportAttendance } = useQuery({
        queryKey: ["garage-attendance-report", reportViewMode, reportDate, reportMonth],
        queryFn: async () => {
            if (reportViewMode === "daily") {
                const { data, error } = await sb
                    .from("garage_attendance")
                    .select("*")
                    .eq("date", reportDate);
                if (error) throw error;
                return data || [];
            } else {
                const [year, month] = reportMonth.split("-");
                const startDate = `${year}-${month}-01`;
                const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
                
                const { data, error } = await sb
                    .from("garage_attendance")
                    .select("*")
                    .gte("date", startDate)
                    .lte("date", endDate);
                if (error) throw error;
                return data || [];
            }
        }
    });

    const getMonthlyStats = (personnelId: string) => {
        if (!reportAttendance) return { present: 0, absent: 0, late: 0, leave: 0 };
        const records = reportAttendance.filter((a: any) => a.personnel_id === personnelId);
        return {
            present: records.filter((r: any) => r.status === 'Present').length,
            absent: records.filter((r: any) => r.status === 'Absent').length,
            late: records.filter((r: any) => r.status === 'Late').length,
            leave: records.filter((r: any) => r.status === 'On Leave').length,
        };
    };

    // Print Attendance Report
    const handlePrintReport = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const titleText = reportViewMode === "daily" 
            ? `Daily Attendance Report - ${new Date(reportDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
            : `Monthly Attendance Summary - ${new Date(reportMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;

        let tableRowsHtml = "";

        if (reportViewMode === "daily") {
            tableRowsHtml = (personnel || []).map((p: any, idx: number) => {
                const rec = reportAttendance?.find((a: any) => a.personnel_id === p.id);
                const status = rec?.status || "Pending";
                const timeIn = rec?.time_in || "—";
                const timeOut = rec?.time_out || "—";
                const color = status === 'Present' ? '#10b981' : status === 'Absent' ? '#ef4444' : status === 'Late' ? '#f59e0b' : status === 'On Leave' ? '#3b82f6' : '#64748b';
                
                return `
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center;">${idx + 1}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: bold;">${p.name}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">${p.position}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: bold; color: ${color}; text-transform: uppercase;">${status}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center;">${timeIn}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center;">${timeOut}</td>
                    </tr>
                `;
            }).join('');
        } else {
            tableRowsHtml = (personnel || []).map((p: any, idx: number) => {
                const stats = getMonthlyStats(p.id);
                return `
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center;">${idx + 1}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: bold;">${p.name}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">${p.position}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center; font-weight: bold; color: #10b981;">${stats.present}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center; font-weight: bold; color: #ef4444;">${stats.absent}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center; font-weight: bold; color: #f59e0b;">${stats.late}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-align: center; font-weight: bold; color: #3b82f6;">${stats.leave}</td>
                    </tr>
                `;
            }).join('');
        }

        printWindow.document.write(`
            <html>
                <head>
                    <title>${titleText}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #1e293b; }
                        .header { border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                        .brand { font-size: 20px; font-weight: 800; color: #dc2626; }
                        .brand span { color: #1e3a8a; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        th { background: #f8fafc; padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
                        .footer { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 10px; color: #94a3b8; text-align: center; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="brand">SUDENERGY <span>LOGISTICS</span></div>
                            <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px;">Garage & Maintenance Division - Personnel Attendance</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 14px; font-weight: 700; color: #1e293b;">${titleText}</div>
                            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Generated on: ${new Date().toLocaleString()}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;">#</th>
                                <th>Personnel Name</th>
                                <th>Position</th>
                                ${reportViewMode === "daily" ? `
                                    <th>Status</th>
                                    <th style="text-align: center;">Time In</th>
                                    <th style="text-align: center;">Time Out</th>
                                ` : `
                                    <th style="text-align: center; color: #10b981;">Present</th>
                                    <th style="text-align: center; color: #ef4444;">Absent</th>
                                    <th style="text-align: center; color: #f59e0b;">Late</th>
                                    <th style="text-align: center; color: #3b82f6;">Leave</th>
                                `}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">No records found</td></tr>'}
                        </tbody>
                    </table>
                    <div class="footer">
                        Generated by SudEnergy Logistics Platform - Garage Staff Attendance Records
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); };</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Mutations
    const addPersonnelMutation = useMutation({
        mutationFn: async (person: typeof newPersonnel) => {
            const { data, error } = await sb.from("garage_personnel").insert([person]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-personnel"] });
            toast({ title: "Success", description: "Personnel added successfully." });
            setIsAddPersonnelOpen(false);
            setNewPersonnel({ name: "", position: "" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    const editPersonnelMutation = useMutation({
        mutationFn: async (person: typeof editingPersonnel) => {
            const { data, error } = await sb.from("garage_personnel").update({ name: person.name, position: person.position }).eq("id", person.id).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-personnel"] });
            toast({ title: "Success", description: "Personnel updated successfully." });
            setIsEditPersonnelOpen(false);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    const deletePersonnelMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await sb.from("garage_personnel").update({ is_active: false }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-personnel"] });
            toast({ title: "Success", description: "Personnel removed successfully." });
            setIsDeleteDialogOpen(false);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    const markAttendanceMutation = useMutation({
        mutationFn: async ({ personnel_id, status, time_in, time_out }: any) => {
            const { error } = await sb.from("garage_attendance").upsert({
                personnel_id,
                date: selectedDate,
                status,
                time_in: time_in || null,
                time_out: time_out || null
            }, { onConflict: "personnel_id,date" });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-attendance", selectedDate] });
            toast({ title: "Updated", description: "Attendance status recorded." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    return (
        <div className="space-y-6 p-6 animate-fade-in bg-slate-50/30 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-600" />
                        Personnel Attendance Management
                    </h1>
                    <p className="text-[11px] text-slate-500 mt-1">Daily tracking and reporting for garage staff.</p>
                </div>
            </div>

            <Tabs defaultValue="daily" className="w-full">
                <TabsList className="bg-white border-slate-200 p-1 rounded-xl shadow-sm mb-6">
                    <TabsTrigger value="daily" className="rounded-lg px-6 py-2 gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <CalendarCheck2 className="w-4 h-4" /> Daily Log
                    </TabsTrigger>
                    <TabsTrigger value="personnel" className="rounded-lg px-6 py-2 gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <UserCheck className="w-4 h-4" /> Personnel List
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="rounded-lg px-6 py-2 gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <FileCheck className="w-4 h-4" /> Attendance Reports
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="daily">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-500" />
                                Daily Attendance Log
                            </CardTitle>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-40 h-9 text-[11px] bg-white border-slate-200"
                            />
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Status</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Personnel Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Position</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Time In</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Time Out</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingPersonnel ? (
                                        <TableRow><TableCell colSpan={5} className="h-40 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" /></TableCell></TableRow>
                                    ) : personnel?.map((p) => {
                                        const record = attendance?.find(a => a.personnel_id === p.id);
                                        return (
                                            <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                <TableCell className="py-4 px-6 text-center">
                                                    <Select
                                                        value={record?.status || "PENDING"}
                                                        onValueChange={(status) => markAttendanceMutation.mutate({ 
                                                            personnel_id: p.id, 
                                                            status,
                                                            time_in: record?.time_in || (status === 'Present' || status === 'Late' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : null),
                                                            time_out: record?.time_out
                                                        })}
                                                    >
                                                        <SelectTrigger className={`w-36 h-8 text-[11px] font-bold uppercase mx-auto ${record?.status === 'Present' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            record?.status === 'Absent' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                record?.status === 'Late' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                    record?.status === 'On Leave' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                        'bg-white border-slate-200'
                                                            }`}>
                                                            <SelectValue placeholder="MARK STATUS" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Present" className="text-[11px]">PRESENT</SelectItem>
                                                            <SelectItem value="Absent" className="text-[11px]">ABSENT</SelectItem>
                                                            <SelectItem value="Late" className="text-[11px]">LATE</SelectItem>
                                                            <SelectItem value="On Leave" className="text-[11px]">ON LEAVE</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                                <TableCell className="py-4 px-6">
                                                    <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 bg-slate-50 text-slate-500 border-slate-200">
                                                        {p.position}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-4 px-6 text-center">
                                                    <Input
                                                        type="time"
                                                        value={record?.time_in || ""}
                                                        onChange={(e) => markAttendanceMutation.mutate({
                                                            personnel_id: p.id,
                                                            status: record?.status || "Present",
                                                            time_in: e.target.value,
                                                            time_out: record?.time_out
                                                        })}
                                                        className="w-28 h-8 text-xs font-semibold mx-auto bg-white border-slate-200 text-center"
                                                    />
                                                </TableCell>
                                                <TableCell className="py-4 px-6 text-center">
                                                    <Input
                                                        type="time"
                                                        value={record?.time_out || ""}
                                                        onChange={(e) => markAttendanceMutation.mutate({
                                                            personnel_id: p.id,
                                                            status: record?.status || "Present",
                                                            time_in: record?.time_in,
                                                            time_out: e.target.value
                                                        })}
                                                        className="w-28 h-8 text-xs font-semibold mx-auto bg-white border-slate-200 text-center"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="personnel">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Personnel Roster
                            </CardTitle>
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold h-9 gap-2" onClick={() => setIsAddPersonnelOpen(true)}>
                                <Plus className="w-4 h-4" /> Add Personnel
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Position</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Status</TableHead>
                                        <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {personnel?.map((p) => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                            <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                            <TableCell className="py-4 px-6">
                                                <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 bg-slate-50 text-slate-500 border-slate-200 uppercase tracking-wider">
                                                    {p.position}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <Badge className="bg-green-500 text-white text-[10px] font-bold uppercase px-2 shadow-sm border-none">Active</Badge>
                                            </TableCell>
                                            <TableCell className="text-right py-4 px-6 flex justify-end gap-2">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                    onClick={() => {
                                                        setEditingPersonnel({ id: p.id, name: p.name, position: p.position });
                                                        setIsEditPersonnelOpen(true);
                                                    }}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => {
                                                        setPersonnelToDelete(p.id);
                                                        setIsDeleteDialogOpen(true);
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reports">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-col md:flex-row md:items-center justify-between py-4 gap-3">
                            <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <FileCheck className="w-5 h-5 text-indigo-500" />
                                {reportViewMode === "daily" 
                                    ? `Daily Attendance Report (${new Date(reportDate).toLocaleDateString('default', { day: 'numeric', month: 'long', year: 'numeric' })})`
                                    : `Monthly Attendance Summary (${new Date(reportMonth + '-01').toLocaleDateString('default', { month: 'long', year: 'numeric' })})`
                                }
                            </CardTitle>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Toggle Daily vs Monthly */}
                                <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-300/60">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={reportViewMode === "daily" ? "default" : "ghost"}
                                        onClick={() => setReportViewMode("daily")}
                                        className={cn(
                                            "h-7 px-3 text-[10px] font-bold uppercase rounded-md",
                                            reportViewMode === "daily" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                                        )}
                                    >
                                        Daily View
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={reportViewMode === "monthly" ? "default" : "ghost"}
                                        onClick={() => setReportViewMode("monthly")}
                                        className={cn(
                                            "h-7 px-3 text-[10px] font-bold uppercase rounded-md",
                                            reportViewMode === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                                        )}
                                    >
                                        Monthly View
                                    </Button>
                                </div>

                                {/* Date / Month Selector */}
                                {reportViewMode === "daily" ? (
                                    <Input
                                        type="date"
                                        value={reportDate}
                                        onChange={(e) => setReportDate(e.target.value)}
                                        className="w-36 h-8 text-xs bg-white border-slate-200 font-semibold"
                                    />
                                ) : (
                                    <Input
                                        type="month"
                                        value={reportMonth}
                                        onChange={(e) => setReportMonth(e.target.value)}
                                        className="w-36 h-8 text-xs bg-white border-slate-200 font-semibold"
                                    />
                                )}

                                {/* Print Report Button */}
                                <Button
                                    size="sm"
                                    onClick={handlePrintReport}
                                    className="h-8 px-3 text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold gap-1.5 shadow-sm"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                    Print Report
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Position</TableHead>
                                        {reportViewMode === "daily" ? (
                                            <>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Status</TableHead>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Time In</TableHead>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Time Out</TableHead>
                                            </>
                                        ) : (
                                            <>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-green-600 py-4 px-6 text-center">Present</TableHead>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-red-600 py-4 px-6 text-center">Absent</TableHead>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-amber-600 py-4 px-6 text-center">Late</TableHead>
                                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-blue-600 py-4 px-6 text-center">Leave</TableHead>
                                            </>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingPersonnel || isLoadingReportAttendance ? (
                                        <TableRow><TableCell colSpan={6} className="h-40 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" /></TableCell></TableRow>
                                    ) : personnel?.map((p) => {
                                        if (reportViewMode === "daily") {
                                            const rec = reportAttendance?.find((a: any) => a.personnel_id === p.id);
                                            const status = rec?.status || "PENDING";
                                            return (
                                                <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                    <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                                    <TableCell className="py-4 px-6 text-[11px] text-slate-500 uppercase">{p.position}</TableCell>
                                                    <TableCell className="text-center py-4 px-6">
                                                        <Badge className={cn(
                                                            "text-[10px] font-bold uppercase px-2 py-0.5 shadow-none border",
                                                            status === 'Present' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            status === 'Absent' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            status === 'Late' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            status === 'On Leave' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                            'bg-slate-50 text-slate-500 border-slate-200'
                                                        )}>
                                                            {status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center text-xs font-semibold text-slate-700 py-4 px-6">
                                                        {rec?.time_in || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-center text-xs font-semibold text-slate-700 py-4 px-6">
                                                        {rec?.time_out || "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }

                                        const stats = getMonthlyStats(p.id);
                                        return (
                                            <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                                <TableCell className="py-4 px-6 text-[11px] text-slate-500 uppercase">{p.position}</TableCell>
                                                <TableCell className="text-center font-bold text-green-600 py-4 px-6 bg-green-50/10">{stats.present}</TableCell>
                                                <TableCell className="text-center font-bold text-red-600 py-4 px-6 bg-red-50/10">{stats.absent}</TableCell>
                                                <TableCell className="text-center font-bold text-amber-600 py-4 px-6 bg-amber-50/10">{stats.late}</TableCell>
                                                <TableCell className="text-center font-bold text-blue-600 py-4 px-6 bg-blue-50/10">{stats.leave}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {!isLoadingReportAttendance && personnel?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-20 text-center text-slate-400 text-[11px] italic">
                                                No personnel records found to generate reports.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={isAddPersonnelOpen} onOpenChange={setIsAddPersonnelOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            Registered New Staff
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Personnel Name</Label>
                            <Input
                                placeholder="Full Name"
                                value={newPersonnel.name}
                                onChange={(e) => setNewPersonnel({ ...newPersonnel, name: e.target.value })}
                                className="h-10 text-sm border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Position / Role</Label>
                            <Input
                                placeholder="e.g. Mechanic, Electrician"
                                value={newPersonnel.position}
                                onChange={(e) => setNewPersonnel({ ...newPersonnel, position: e.target.value })}
                                className="h-10 text-sm border-slate-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddPersonnelOpen(false)} className="h-10 text-[11px] font-bold uppercase">Cancel</Button>
                        <Button
                            className="h-10 text-[11px] font-bold uppercase bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => addPersonnelMutation.mutate(newPersonnel)}
                            disabled={!newPersonnel.name || !newPersonnel.position || addPersonnelMutation.isPending}
                        >
                            {addPersonnelMutation.isPending ? "Adding..." : "Add Personnel"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Personnel Dialog */}
            <Dialog open={isEditPersonnelOpen} onOpenChange={setIsEditPersonnelOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Pencil className="w-5 h-5 text-indigo-600" />
                            Edit Personnel
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Personnel Name</Label>
                            <Input
                                placeholder="Full Name"
                                value={editingPersonnel.name}
                                onChange={(e) => setEditingPersonnel({ ...editingPersonnel, name: e.target.value })}
                                className="h-10 text-sm border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Position / Role</Label>
                            <Input
                                placeholder="e.g. Mechanic, Electrician"
                                value={editingPersonnel.position}
                                onChange={(e) => setEditingPersonnel({ ...editingPersonnel, position: e.target.value })}
                                className="h-10 text-sm border-slate-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditPersonnelOpen(false)} className="h-10 text-[11px] font-bold uppercase">Cancel</Button>
                        <Button
                            className="h-10 text-[11px] font-bold uppercase bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => editPersonnelMutation.mutate(editingPersonnel)}
                            disabled={!editingPersonnel.name || !editingPersonnel.position || editPersonnelMutation.isPending}
                        >
                            {editPersonnelMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-red-600 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Confirm Deletion
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-slate-600">
                            Are you sure you want to remove this personnel? This action cannot be undone.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="h-10 text-[11px] font-bold uppercase">Cancel</Button>
                        <Button
                            variant="destructive"
                            className="h-10 text-[11px] font-bold uppercase bg-red-600 hover:bg-red-700"
                            onClick={() => {
                                if (personnelToDelete) deletePersonnelMutation.mutate(personnelToDelete);
                            }}
                            disabled={deletePersonnelMutation.isPending}
                        >
                            {deletePersonnelMutation.isPending ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default GarageAttendance;
