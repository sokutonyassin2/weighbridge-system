import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Users, Map, Activity } from "lucide-react";

const LogisticsDashboard = () => {
    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Logistics Overview</h1>
                    <p className="text-muted-foreground mt-2">Manage fleet, drivers, and active journeys.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Metric Cards - Glassmorphic Style */}
                <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Fleet</CardTitle>
                        <Truck className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground mt-1">Vehicles registered</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Drivers</CardTitle>
                        <Users className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground mt-1">Available for assignment</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Trips</CardTitle>
                        <Map className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground mt-1">Trucks in transit</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Fleet Health</CardTitle>
                        <Activity className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">100%</div>
                        <p className="text-xs text-muted-foreground mt-1">Operational status</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-none shadow-xl bg-white dark:bg-gray-900">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-48 text-muted-foreground">
                            No recent activity to display
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-xl bg-white dark:bg-gray-900">
                    <CardHeader>
                        <CardTitle>Fleet Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-48 text-muted-foreground">
                            Fleet map visualization coming soon
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default LogisticsDashboard;
