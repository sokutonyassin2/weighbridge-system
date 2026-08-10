import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Banknote, ShoppingCart, ArrowUpRight, ArrowDownRight, CreditCard, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function FinanceDashboard() {

    // Fetch ALL approved trip sheets with real fields
    const { data: financeData, isLoading } = useQuery({
        queryKey: ["logistics-finance-overview"],
        queryFn: async () => {
            const { data: sheets } = await supabase
                .from("logistics_trip_sheets")
                .select("revenue_amount, revenue_currency, return_revenue_amount, return_revenue_currency, payment_status, return_payment_status, total_expenses_usd, total_expenses_tzs, exchange_rate, client_name, status")
                .eq("status", "Approved");

            let totalCollectedUSD = 0;
            let totalPendingUSD = 0;
            let totalExpensesUSD = 0;
            let totalCollectedTZS = 0;
            let totalPendingTZS = 0;
            let totalExpensesTZS = 0;
            let tripCount = 0;

            const clientRevenueMap = new Map();

            sheets?.forEach(sheet => {
                const rate = parseFloat(sheet.exchange_rate as any) || 2700;

                // Outbound revenue
                const outRevAmt = parseFloat(sheet.revenue_amount || "0");
                const outRevUSD = sheet.revenue_currency === 'USD' ? outRevAmt : outRevAmt / rate;
                const outRevTZS = sheet.revenue_currency === 'TZS' ? outRevAmt : outRevAmt * rate;

                // Return revenue
                const retRevAmt = parseFloat(sheet.return_revenue_amount || "0");
                const retRevUSD = sheet.return_revenue_currency === 'USD' ? retRevAmt : retRevAmt / rate;
                const retRevTZS = sheet.return_revenue_currency === 'TZS' ? retRevAmt : retRevAmt * rate;

                // Collected vs Pending (Outbound)
                if (sheet.payment_status === "Paid") {
                    totalCollectedUSD += outRevUSD;
                    totalCollectedTZS += outRevTZS;
                } else {
                    totalPendingUSD += outRevUSD;
                    totalPendingTZS += outRevTZS;
                }

                // Collected vs Pending (Return)
                if (sheet.return_payment_status === "Paid") {
                    totalCollectedUSD += retRevUSD;
                    totalCollectedTZS += retRevTZS;
                } else if (retRevAmt > 0) {
                    totalPendingUSD += retRevUSD;
                    totalPendingTZS += retRevTZS;
                }

                // Expenses from real fields
                const expUSD = parseFloat(sheet.total_expenses_usd as any) || 0;
                const expTZS = parseFloat(sheet.total_expenses_tzs as any) || 0;
                totalExpensesUSD += expUSD;
                totalExpensesTZS += expTZS;
                if (expUSD > 0 || expTZS > 0) tripCount++;

                // Group by client
                const client = sheet.client_name || "Unspecified";
                const currentClientTotal = clientRevenueMap.get(client) || 0;
                clientRevenueMap.set(client, currentClientTotal + outRevUSD + retRevUSD);
            });

            const clientData = Array.from(clientRevenueMap.entries())
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 5);

            const totalRevenueUSD = totalCollectedUSD + totalPendingUSD;
            const totalRevenueTZS = totalCollectedTZS + totalPendingTZS;
            const profitUSD = totalRevenueUSD - totalExpensesUSD;
            const profitTZS = totalRevenueTZS - totalExpensesTZS;

            return {
                totalCollectedUSD, totalCollectedTZS,
                totalPendingUSD, totalPendingTZS,
                totalExpensesUSD, totalExpensesTZS,
                profitUSD, profitTZS,
                tripCount,
                clientData
            };
        },
        refetchInterval: 5000
    });

    const chartData = [
        { name: "Revenue (Collected)", value: financeData?.totalCollectedUSD || 0, color: "#10b981" },
        { name: "Trip Expenses", value: financeData?.totalExpensesUSD || 0, color: "#ef4444" },
        { name: "Profit", value: financeData?.profitUSD || 0, color: "#3b82f6" },
    ];

    const fmtUSD = (v: number) => `$ ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtTZS = (v: number) => `TShs ${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    return (
        <div className="p-6 space-y-6 bg-slate-50/30 min-h-screen">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Logistics P&L Overview</h1>
                <p className="text-slate-500">Overall financial performance across all approved trips</p>
            </div>

            {/* KPI CARDS - 5 cards */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Card className="border-indigo-100 shadow-sm bg-indigo-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-indigo-900">Total Revenue</CardTitle>
                        <Banknote className="h-4 w-4 text-indigo-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-24" /> : (
                            <>
                                <div className="text-2xl font-bold text-indigo-700">
                                    {fmtUSD((financeData?.totalCollectedUSD || 0) + (financeData?.totalPendingUSD || 0))}
                                </div>
                                <p className="text-[10px] text-indigo-600/50 mt-0.5">
                                    {fmtTZS((financeData?.totalCollectedTZS || 0) + (financeData?.totalPendingTZS || 0))}
                                </p>
                            </>
                        )}
                        <p className="text-[10px] text-indigo-600/70 mt-1 flex items-center gap-1">
                            Gross expected income
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-emerald-100 shadow-sm bg-emerald-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-900">Collected Revenue</CardTitle>
                        <Banknote className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-24" /> : (
                            <>
                                <div className="text-2xl font-bold text-emerald-700">
                                    {fmtUSD(financeData?.totalCollectedUSD || 0)}
                                </div>
                                <p className="text-[10px] text-emerald-600/50 mt-0.5">
                                    {fmtTZS(financeData?.totalCollectedTZS || 0)}
                                </p>
                            </>
                        )}
                        <p className="text-[10px] text-emerald-600/70 mt-1 flex items-center gap-1">
                            <ArrowUpRight className="h-2.5 w-2.5" /> From paid invoices
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-amber-100 shadow-sm bg-amber-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-amber-900">Pending Receivables</CardTitle>
                        <CreditCard className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-24" /> : (
                            <>
                                <div className="text-2xl font-bold text-amber-700">
                                    {fmtUSD(financeData?.totalPendingUSD || 0)}
                                </div>
                                <p className="text-[10px] text-amber-600/50 mt-0.5">
                                    {fmtTZS(financeData?.totalPendingTZS || 0)}
                                </p>
                            </>
                        )}
                        <p className="text-[10px] text-amber-600/70 mt-1 flex items-center gap-1">
                            Unpaid trip invoices
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-rose-100 shadow-sm bg-rose-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-rose-900">Trip Expenses Disbursed</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-rose-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-24" /> : (
                            <>
                                <div className="text-2xl font-bold text-rose-700">
                                    {fmtUSD(financeData?.totalExpensesUSD || 0)}
                                </div>
                                <p className="text-[10px] text-rose-600/50 mt-0.5">
                                    {fmtTZS(financeData?.totalExpensesTZS || 0)}
                                </p>
                            </>
                        )}
                        <p className="text-[10px] text-rose-600/70 mt-1 flex items-center gap-1">
                            <ArrowDownRight className="h-2.5 w-2.5" /> Across {financeData?.tripCount || 0} trips
                        </p>
                    </CardContent>
                </Card>

                <Card className={`shadow-sm ${(financeData?.profitUSD || 0) >= 0 ? 'border-blue-100 bg-blue-50/10' : 'border-orange-100 bg-orange-50/10'}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className={`text-sm font-medium ${(financeData?.profitUSD || 0) >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>Net Profit</CardTitle>
                        <DollarSign className={`h-4 w-4 ${(financeData?.profitUSD || 0) >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-24" /> : (
                            <>
                                <div className={`text-2xl font-bold ${(financeData?.profitUSD || 0) >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                                    {fmtUSD(financeData?.profitUSD || 0)}
                                </div>
                                <p className={`text-[10px] mt-0.5 ${(financeData?.profitUSD || 0) >= 0 ? 'text-blue-600/50' : 'text-orange-600/50'}`}>
                                    {fmtTZS(financeData?.profitTZS || 0)}
                                </p>
                            </>
                        )}
                        <p className={`text-[10px] mt-1 flex items-center gap-1 ${(financeData?.profitUSD || 0) >= 0 ? 'text-blue-600/70' : 'text-orange-600/70'}`}>
                            Revenue minus expenses
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* P&L OVERVIEW */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            Profit & Loss Summary
                        </CardTitle>
                        <CardDescription>Overall logistics profitability (Approved trips only)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    formatter={(value: number) => fmtUSD(value)}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar
                                    dataKey="value"
                                    radius={[4, 4, 0, 0]}
                                    barSize={60}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* TOP CLIENTS */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-primary" />
                            Top Clients by Revenue
                        </CardTitle>
                        <CardDescription>Highest generating clients across approved trips</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {financeData?.clientData && financeData.clientData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={financeData.clientData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {financeData.clientData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => fmtUSD(value)} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400">
                                No revenue data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
