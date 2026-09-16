import React, { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Truck,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  BarChart3,
  PieChart as PieIcon,
  HelpCircle
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

interface WorkshopDirectorsReportProps {
  language: "en" | "sw";
  vehicles: any[] | undefined;
}

const STATUS_COLORS: Record<string, string> = {
  "Awaiting Diagnosis": "#f59e0b", // Amber
  "Awaiting Parts": "#ef4444",     // Red
  "In Repair": "#3b82f6",          // Blue
  "Awaiting Release": "#8b5cf6",   // Purple
  "Ready / Released": "#10b981",   // Green
  "Open": "#f59e0b",
  "In Progress": "#3b82f6",
  "Closed": "#10b981",
};

export default function WorkshopDirectorsReport({ language, vehicles = [] }: WorkshopDirectorsReportProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // 1. Fetch All Active Job Cards with Faults and Vehicle Details
  const { data: jobCards = [], isLoading: isLoadingJobs } = useQuery({
    queryKey: ["directors-report-jobs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("garage_job_cards")
        .select(`
          id, job_number, status, priority, opened_at, closed_at, vehicle_id, odometer_at_fault, notes,
          vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type, make_model),
          fault_list:garage_job_faults(
            id, status, mechanic_notes, created_at,
            fault_type:garage_fault_types(fault_name, category)
          )
        `)
        .eq("is_deleted", false)
        .order("opened_at", { ascending: false });

      if (error) {
        console.warn("Error loading jobs for director report:", error);
        return [];
      }
      return data || [];
    }
  });

  // 2. Fetch Requisitions for estimated cost exposure
  const { data: requisitions = [], isLoading: isLoadingReqs } = useQuery({
    queryKey: ["directors-report-requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("garage_requisitions")
        .select("id, vehicle_id, item_name, quantity_requested, unit_price, status, created_at, is_deleted")
        .eq("is_deleted", false);

      if (error) {
        console.warn("Error loading reqs for director report:", error);
        return [];
      }
      return data || [];
    }
  });

  // 3. Compute Map of Requisition Costs per Vehicle
  const vehicleCostExposureMap = useMemo(() => {
    const map: Record<string, { total: number; pendingParts: number }> = {};
    (requisitions || []).forEach((r: any) => {
      if (!r.vehicle_id) return;
      if (!map[r.vehicle_id]) {
        map[r.vehicle_id] = { total: 0, pendingParts: 0 };
      }
      const cost = (parseFloat(r.quantity_requested) || 1) * (parseFloat(r.unit_price) || 0);
      map[r.vehicle_id].total += cost;
      if (r.status !== "Closed" && r.status !== "Received") {
        map[r.vehicle_id].pendingParts += cost;
      }
    });
    return map;
  }, [requisitions]);

  // 4. Process Active Vehicles in Workshop
  const activeWorkshopVehicles = useMemo(() => {
    const activeJobs = jobCards.filter((j: any) => j.status !== "Closed");
    const now = new Date().getTime();

    // Map each active job to a clear status stage for the Board
    return activeJobs.map((j: any) => {
      const openedTime = new Date(j.opened_at).getTime();
      const diffDays = Math.max(1, Math.round((now - openedTime) / (1000 * 60 * 60 * 24)));

      const v = j.vehicle;
      const plate = v?.vehicle_no || v?.horse_number || v?.trailer_number || "NO PLATE";
      const isTrailer =
        v?.asset_type?.toLowerCase().includes("trailer") ||
        (v?.trailer_number && !v?.horse_number && !v?.vehicle_no);

      // Fault details
      const primaryFault =
        j.fault_list?.[0]?.mechanic_notes ||
        j.fault_list?.[0]?.fault_type?.fault_name ||
        j.notes ||
        "Routine Maintenance & Inspection";

      const faultCategory =
        j.fault_list?.[0]?.fault_type?.category || "Mechanical";

      // Classify stage in the repair pipeline
      let pipelineStage = "In Repair";
      const hasPendingFaults = (j.fault_list || []).some((f: any) => f.status === "Pending");
      const hasWaitingParts = (requisitions || []).some(
        (r: any) => r.vehicle_id === j.vehicle_id && r.status === "Waiting Review"
      );

      if (hasWaitingParts) {
        pipelineStage = "Awaiting Parts";
      } else if (j.status === "Open" || hasPendingFaults) {
        pipelineStage = "Awaiting Diagnosis";
      } else if (j.status === "Quality Check" || j.status === "Ready") {
        pipelineStage = "Awaiting Release";
      } else {
        pipelineStage = "In Repair";
      }

      const costExposure = vehicleCostExposureMap[j.vehicle_id]?.total || 0;

      return {
        id: j.id,
        vehicle_id: j.vehicle_id,
        jobNumber: j.job_number || `#${j.id.slice(0, 6)}`,
        plate,
        type: isTrailer ? "Trailer" : "Truck",
        makeModel: v?.make_model || (isTrailer ? "Trailer Unit" : "Truck Horse"),
        reason: primaryFault,
        category: faultCategory,
        status: j.status,
        pipelineStage,
        priority: j.priority || "Routine",
        daysInWorkshop: diffDays,
        costExposure,
        openedAt: j.opened_at,
        faultCount: j.fault_list?.length || 1,
      };
    });
  }, [jobCards, requisitions, vehicleCostExposureMap]);

  // 5. Executive KPI Summary Cards
  const kpis = useMemo(() => {
    const totalVehicles = activeWorkshopVehicles.length;
    const trucksCount = activeWorkshopVehicles.filter((v) => v.type === "Truck").length;
    const trailersCount = activeWorkshopVehicles.filter((v) => v.type === "Trailer").length;
    const highPriorityCount = activeWorkshopVehicles.filter(
      (v) => v.priority === "Critical" || v.priority === "Urgent" || v.priority === "High"
    ).length;

    const totalDays = activeWorkshopVehicles.reduce((acc, v) => acc + v.daysInWorkshop, 0);
    const avgDays = totalVehicles > 0 ? (totalDays / totalVehicles).toFixed(1) : "0.0";

    const criticalOverdueVehicles = activeWorkshopVehicles.filter((v) => v.daysInWorkshop > 7);
    const totalCostExposure = activeWorkshopVehicles.reduce((acc, v) => acc + v.costExposure, 0);

    return {
      totalVehicles,
      trucksCount,
      trailersCount,
      highPriorityCount,
      avgDays,
      criticalOverdueVehicles,
      criticalOverdueCount: criticalOverdueVehicles.length,
      totalCostExposure,
    };
  }, [activeWorkshopVehicles]);

  // 6. Pipeline Distribution Chart Data
  const pipelineChartData = useMemo(() => {
    const counts: Record<string, number> = {
      "Awaiting Diagnosis": 0,
      "Awaiting Parts": 0,
      "In Repair": 0,
      "Awaiting Release": 0,
    };

    activeWorkshopVehicles.forEach((v) => {
      if (counts[v.pipelineStage] !== undefined) {
        counts[v.pipelineStage] += 1;
      } else {
        counts["In Repair"] += 1;
      }
    });

    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || "#3b82f6",
    }));
  }, [activeWorkshopVehicles]);

  // 7. Breakdown by Category (Engine, Brakes, Transmission, Suspension, Electrical)
  const categoryChartData = useMemo(() => {
    const catMap: Record<string, number> = {};
    activeWorkshopVehicles.forEach((v) => {
      const cat = v.category || "General";
      catMap[cat] = (catMap[cat] || 0) + 1;
    });

    return Object.entries(catMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeWorkshopVehicles]);

  // 8. Print Executive Presentation
  const handlePrintReport = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return;

    const todayDate = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Workshop & Fleet Maintenance Executive Report — Board of Directors</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; line-height: 1.4; }
            .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 14px; }
            .brand-title { font-size: 20px; font-weight: 800; color: #dc2626; }
            .brand-subtitle { font-size: 11px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
            .report-title { font-size: 14px; font-weight: 800; color: #0f172a; text-align: right; text-transform: uppercase; }
            .report-date { font-size: 11px; color: #64748b; text-align: right; }
            
            .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
            .kpi-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; background: #f8fafc; }
            .kpi-title { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; }
            .kpi-value { font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 2px; }
            .kpi-sub { font-size: 10px; color: #64748b; font-weight: 600; }
            
            .headline-box { border-left: 4px solid #3b82f6; background: #eff6ff; padding: 10px 14px; border-radius: 4px; margin-bottom: 14px; font-size: 11px; }
            .headline-box strong { color: #1e40af; font-size: 12px; display: block; margin-bottom: 2px; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
            th { background: #1e3a8a; color: #fff; text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
            tr:nth-child(even) td { background: #f8fafc; }
            
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
            .badge-high { background: #fee2e2; color: #991b1b; }
            .badge-med { background: #fef3c7; color: #92400e; }
            .badge-low { background: #ecfdf5; color: #065f46; }
            
            .rec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 14px; }
            .rec-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; background: #fff; }
            .rec-num { font-size: 10px; font-weight: 800; color: #3b82f6; text-transform: uppercase; margin-bottom: 2px; }
            .rec-text { font-size: 10px; color: #334155; }
            
            .footer { margin-top: 16px; border-top: 1px dashed #cbd5e1; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div>
              <div class="brand-title">SUDENERGY <span style="color: #1e3a8a;">LOGISTICS</span></div>
              <div class="brand-subtitle">Workshop & Fleet Maintenance Command Center</div>
            </div>
            <div>
              <div class="report-title">Board of Directors Fleet Status Report</div>
              <div class="report-date">Generated: ${todayDate} | Confidential — Board Use Only</div>
            </div>
          </div>

          <div class="headline-box">
            <strong>EXECUTIVE HEADLINE FOR DIRECTORS:</strong>
            ${activeWorkshopVehicles.length} vehicles are currently in workshop bays. ${kpis.highPriorityCount} high-priority repairs account for the majority of downtime; ${kpis.criticalOverdueCount} unit(s) exceed 7 days of downtime and require management priority.
          </div>

          <div class="kpi-row">
            <div class="kpi-card">
              <div class="kpi-title">Fleet In Workshop</div>
              <div class="kpi-value">${kpis.totalVehicles}</div>
              <div class="kpi-sub">${kpis.trucksCount} Trucks · ${kpis.trailersCount} Trailers</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">High Priority Jobs</div>
              <div class="kpi-value" style="color: #dc2626;">${kpis.highPriorityCount}</div>
              <div class="kpi-sub">Critical / Urgent Outages</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Avg. Downtime Days</div>
              <div class="kpi-value" style="color: #d97706;">${kpis.avgDays} <span style="font-size: 13px;">Days</span></div>
              <div class="kpi-sub">${kpis.criticalOverdueCount} units over 7 days</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Outstanding Cost Exposure</div>
              <div class="kpi-value" style="color: #059669; font-size: 17px;">TZS ${kpis.totalCostExposure.toLocaleString()}</div>
              <div class="kpi-sub">Committed Requisitions</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 80px;">Job No</th>
                <th style="width: 140px;">Vehicle Plate</th>
                <th style="width: 80px;">Type</th>
                <th>Reason / Primary Fault</th>
                <th style="width: 110px;">Pipeline Stage</th>
                <th style="width: 80px;">Priority</th>
                <th style="width: 70px; text-align: center;">Days</th>
                <th style="width: 110px; text-align: right;">Est. Cost (TZS)</th>
              </tr>
            </thead>
            <tbody>
              ${activeWorkshopVehicles.map((v) => `
                <tr>
                  <td><strong>${v.jobNumber}</strong></td>
                  <td><strong>${v.plate}</strong> <span style="font-size: 9px; color: #64748b;">(${v.makeModel})</span></td>
                  <td>${v.type}</td>
                  <td>${v.reason}</td>
                  <td><strong>${v.pipelineStage}</strong></td>
                  <td><span class="badge ${v.priority === 'Critical' || v.priority === 'High' ? 'badge-high' : v.priority === 'Urgent' ? 'badge-med' : 'badge-low'}">${v.priority}</span></td>
                  <td style="text-align: center; font-weight: bold; ${v.daysInWorkshop > 7 ? 'color: #dc2626;' : ''}">${v.daysInWorkshop}d</td>
                  <td style="text-align: right; font-weight: bold;">${v.costExposure > 0 ? v.costExposure.toLocaleString() : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="rec-grid">
            <div class="rec-card">
              <div class="rec-num">1. Expedite Backordered Spares</div>
              <div class="rec-text">Engage alternate suppliers for units awaiting parts beyond 5 days to reduce revenue-generating downtime.</div>
            </div>
            <div class="rec-card">
              <div class="rec-num">2. Fast-Track Units Awaiting Release</div>
              <div class="rec-text">Complete final inspection and sign off ready vehicles to return them directly to Logistics dispatch.</div>
            </div>
            <div class="rec-card">
              <div class="rec-num">3. Monitor Requisition Cost Exposure</div>
              <div class="rec-text">Audit outstanding parts requisitions against monthly fleet maintenance budget limits.</div>
            </div>
            <div class="rec-card">
              <div class="rec-num">4. Weekly Board Cadence</div>
              <div class="rec-text">Continue circulating this live report weekly directly from the SudEnergy Workshop Command Center.</div>
            </div>
          </div>

          <div class="footer">
            <span>SudEnergy Logistics Platform · Garage & Fleet Maintenance Division</span>
            <span>Page 1 of 1</span>
          </div>

          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isLoading = isLoadingJobs || isLoadingReqs;

  return (
    <div className="space-y-6" ref={printRef}>
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            {language === "en" ? "Workshop Directors Presentation & Status" : "Ripoti ya Karakana kwa Wakurugenzi"}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {language === "en"
              ? "Live executive snapshot of all trucks and trailers currently in workshop bays with cost exposure and downtime analysis"
              : "Picha ya wakati halisi ya magari yote yaliyo gerezani pamoja na uchambuzi wa gharama"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={handlePrintReport}
            className="h-9 px-4 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Printer className="w-4 h-4" />
            {language === "en" ? "Print Board Report" : "Chapisha Ripoti ya Bodi"}
          </Button>
        </div>
      </div>

      {/* Executive Headline Alert Banner (as in PPT Slide 2) */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-indigo-100 rounded-xl p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-lg shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
              {language === "en" ? "Headline for the Board of Directors" : "Muhtasari wa Bodi ya Wakurugenzi"}
            </h4>
            <p className="text-xs text-indigo-900 leading-relaxed font-medium">
              Currently, <strong className="font-black text-indigo-950">{kpis.totalVehicles} fleet units</strong> are off
              the road in the workshop.{" "}
              <strong className="text-rose-700 font-bold">{kpis.highPriorityCount} critical/urgent jobs</strong> account
              for the primary operational risk.{" "}
              {kpis.criticalOverdueCount > 0 ? (
                <>
                  <strong className="text-rose-700 underline font-bold">
                    {kpis.criticalOverdueCount} unit(s) have been grounded for more than 7 days
                  </strong>{" "}
                  and require immediate parts dispatch or management priority.
                </>
              ) : (
                "No units currently exceed the 7-day critical downtime limit."
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Executive KPI Cards (Slide 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total In Workshop */}
        <Card className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {language === "en" ? "Vehicles In Workshop" : "Magari Yaliyopo Karakana"}
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black text-slate-900 tracking-tight">{kpis.totalVehicles}</div>
              <div className="flex items-center gap-2 mt-1.5 text-xs">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px] font-bold border-slate-200">
                  {kpis.trucksCount} Trucks
                </Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px] font-bold border-slate-200">
                  {kpis.trailersCount} Trailers
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* High Priority Jobs */}
        <Card className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white border-l-4 border-l-rose-500">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                {language === "en" ? "High Priority / Critical" : "Kazi Zenye Kipaumbele Kikubwa"}
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black text-rose-600 tracking-tight">{kpis.highPriorityCount}</div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                {language === "en" ? "Requires expedited repairs" : "Inahitaji matengenezo ya haraka"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Avg Downtime Days */}
        <Card className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {language === "en" ? "Avg. Days In Workshop" : "Wastani wa Siku Karakana"}
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-black text-amber-700 tracking-tight">
                {kpis.avgDays} <span className="text-base font-bold text-slate-400">days</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium flex items-center gap-1">
                {kpis.criticalOverdueCount > 0 ? (
                  <span className="text-rose-600 font-bold">{kpis.criticalOverdueCount} unit(s) over 7 days</span>
                ) : (
                  <span className="text-emerald-600 font-bold">All units under 7 days</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cost Exposure */}
        <Card className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {language === "en" ? "Total Cost Exposure" : "Makadirio ya Gharama"}
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-700 tracking-tight">
                TZS {kpis.totalCostExposure.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                {language === "en" ? "Committed spares & parts" : "Vipuri vilivyoomwa"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section: Pipeline Stages (Donut) & Category Breakdown (Bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Stage Donut Chart (Slide 3) */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="pb-2 border-b bg-slate-50/50">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-indigo-600" />
              {language === "en" ? "Job Status Breakdown (Repair Pipeline)" : "Mgao wa Hatua za Matengenezo"}
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-500 font-medium">
              {language === "en"
                ? "Where each vehicle currently sits in the garage repair process"
                : "Sehemu ambapo kila gari lipo katika hatua za matengenezo"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {pipelineChartData.some((p) => p.value > 0) ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pipelineChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {pipelineChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        `${val} vehicles (${(((val as number) / (kpis.totalVehicles || 1)) * 100).toFixed(0)}%)`,
                        name,
                      ]}
                      contentStyle={{ backgroundColor: "#1e293b", borderRadius: 8, color: "#fff", fontSize: 12 }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-xs font-semibold text-slate-700">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-slate-400 font-medium">
                No active jobs currently in workshop bays.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maintenance Categories Bar Chart */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="pb-2 border-b bg-slate-50/50">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              {language === "en" ? "Fault Types by System Category" : "Aina za Hitilafu kwa Mifumo"}
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-500 font-medium">
              {language === "en"
                ? "Distribution of defects across vehicle mechanical systems"
                : "Mgawanyo wa hitilafu kwenye mifumo ya mitambo"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {categoryChartData.length > 0 ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      formatter={(val: any) => [`${val} jobs`, "Count"]}
                      contentStyle={{ backgroundColor: "#1e293b", borderRadius: 8, color: "#fff", fontSize: 12 }}
                    />
                    <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-slate-400 font-medium">
                No categorical fault data recorded.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Critical Watch Items Alert (Slide 3) */}
      {kpis.criticalOverdueCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                    {language === "en" ? "Executive Watch Items — Delayed Units (> 7 Days)" : "Magari Yaliyochelewa Zaidi ya Siku 7"}
                  </h4>
                  <Badge className="bg-amber-600 text-white text-[10px] font-bold">Action Required</Badge>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  The following vehicles have exceeded standard turnaround times. Immediate intervention with suppliers or
                  re-allocation of mechanics is recommended:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {kpis.criticalOverdueVehicles.map((v) => (
                    <div
                      key={v.id}
                      className="bg-white p-2.5 rounded-lg border border-amber-200 shadow-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-xs text-slate-900">{v.plate}</span>
                        <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{v.reason}</p>
                      </div>
                      <Badge className="bg-rose-600 text-white font-bold text-[10px]">{v.daysInWorkshop} Days</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicles Currently in Workshop Register Table (Slide 4) */}
      <Card className="border-slate-200 shadow-xs bg-white">
        <CardHeader className="pb-3 border-b bg-slate-50/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Wrench className="w-4 h-4 text-indigo-600" />
              {language === "en" ? "Vehicles Currently in Workshop (Live Register)" : "Orodha ya Magari Yaliyopo Karakana"}
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-500 font-medium">
              {language === "en"
                ? "Full register matching the Board presentation format with live system records"
                : "Orodha kamili inayolingana na muundo wa ripoti ya Bodi"}
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-white text-slate-700 border-slate-300 font-bold text-xs">
            {activeWorkshopVehicles.length} Units Active
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Job No</th>
                  <th className="py-3 px-4">Fleet / Plate No</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Reason / Primary Fault</th>
                  <th className="py-3 px-4">Pipeline Stage</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4 text-center">Days In</th>
                  <th className="py-3 px-4 text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeWorkshopVehicles.length > 0 ? (
                  activeWorkshopVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{v.jobNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{v.plate}</div>
                        <div className="text-[10px] text-slate-400 font-medium">{v.makeModel}</div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={
                            v.type === "Truck"
                              ? "bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold"
                              : "bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-bold"
                          }
                        >
                          {v.type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <span className="font-semibold text-slate-800 line-clamp-1" title={v.reason}>
                          {v.reason}
                        </span>
                        {v.faultCount > 1 && (
                          <span className="text-[10px] text-indigo-600 font-medium">
                            +{v.faultCount - 1} more tasks
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: `${STATUS_COLORS[v.pipelineStage]}15`,
                            color: STATUS_COLORS[v.pipelineStage] || "#3b82f6",
                            border: `1px solid ${STATUS_COLORS[v.pipelineStage]}30`,
                          }}
                        >
                          {v.pipelineStage}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            v.priority === "Critical"
                              ? "bg-rose-600 text-white font-bold text-[10px]"
                              : v.priority === "Urgent"
                              ? "bg-amber-500 text-white font-bold text-[10px]"
                              : "bg-slate-200 text-slate-700 font-semibold text-[10px]"
                          }
                        >
                          {v.priority}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-black text-xs ${
                            v.daysInWorkshop > 7 ? "text-rose-600" : "text-slate-700"
                          }`}
                        >
                          {v.daysInWorkshop}d
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {v.costExposure > 0 ? `TZS ${v.costExposure.toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                      No active vehicles in the workshop at this time. All fleet units are operating.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Strategic Recommendations & Next Steps for Directors (Slide 5) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {language === "en" ? "Actionable Recommendations & Next Steps for Directors" : "Mapendekezo na Hatua Zinazofuata"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block mb-1">
              1. Expedite Backordered Spares
            </span>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Engage alternate suppliers or local stockists for grounded units waiting for parts to prevent extended downtime.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block mb-1">
              2. Fast-Track Units Awaiting Release
            </span>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Complete final QC sign-off for completed repairs so units return to active revenue-earning logistics routes immediately.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block mb-1">
              3. Monitor Cost Exposure
            </span>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Audit committed spare part requisitions against the monthly fleet maintenance budget limits to maintain cost efficiency.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block mb-1">
              4. Weekly Board Cadence
            </span>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Circulate this executive snapshot weekly directly from the system to ensure real-time oversight for the Board.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
