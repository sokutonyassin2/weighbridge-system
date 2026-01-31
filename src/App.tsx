import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useEffect } from 'react';
import OperatorDashboard from "./pages/OperatorDashboard";
import VehicleEntry from "./pages/VehicleEntry";
import WeighEntry from "./pages/WeighEntry";
import PendingWeighs from "./pages/PendingWeighs";
import CashierDashboard from "./pages/CashierDashboard";
import VehicleTypes from "./pages/VehicleTypes";
import AllEntries from "./pages/AllEntries";
import VehicleHistory from "./pages/VehicleHistory";
import CompletedVehicles from "./pages/CompletedVehicles";
import ActivityLogs from "./pages/ActivityLogs";
import UserManagement from "./pages/UserManagement";
import AuditTrail from "./pages/AuditTrail";
import AdminPenalties from "./pages/AdminPenalties";
import AdminCompanyWeights from "./pages/AdminCompanyWeights";
import AdminReceiptSettings from "./pages/AdminReceiptSettings";
import AdminWeightSettings from "./pages/AdminWeightSettings";
import ShiftAnalytics from "./pages/ShiftAnalytics";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ShiftSummaryReport from "./pages/ShiftSummaryReport";
import OverdueHistory from "./pages/OverdueHistory";
import ReceiptHistory from "./pages/ReceiptHistory";
import LogisticsDashboard from "./pages/logistics/LogisticsDashboard";
import FleetCommand from "./pages/logistics/FleetCommand";
import DriverRegistry from "./pages/logistics/DriverRegistry";
import TripManagement from "./pages/logistics/TripManagement";
import ComplianceCenter from "./pages/logistics/ComplianceCenter";
import VehiclePerformance from "./pages/logistics/VehiclePerformance";
import GarageDashboard from "./pages/garage/GarageDashboard";
import ProcurementDashboard from "./pages/procurement/ProcurementDashboard";
import InventoryReports from "./pages/garage/InventoryReports";
import GarageAttendance from "./pages/garage/Attendance";
import SuperadminDashboard from "./pages/SuperadminDashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // Cache data for 5 minutes
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes
      retry: 1, // Only retry failed requests once
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
    },
  },
});

const App = () => {
  // Service Worker registration removed to fix Auth issues
  // It is now handled (disabled) in main.tsx

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OperatorDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/entry"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VehicleEntry />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/weigh/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <WeighEntry />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pending"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PendingWeighs />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cashier"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CashierDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicle-types"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <VehicleTypes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/all-entries"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AllEntries />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicle-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VehicleHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/completed"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CompletedVehicles />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/overdue-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OverdueHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity-logs"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ActivityLogs />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/user-management"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <UserManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-trail"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AuditTrail />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/shift-reports"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ShiftSummaryReport />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/penalties"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminPenalties />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/company-weights"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminCompanyWeights />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ShiftAnalytics />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/receipt-settings"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminReceiptSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/weight-settings"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminWeightSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/receipt-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ReceiptHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* LOGISTICS ROUTES */}
            <Route
              path="/logistics"
              element={
                <ProtectedRoute>
                  <Layout>
                    <LogisticsDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/fleet"
              element={
                <ProtectedRoute>
                  <Layout>
                    <FleetCommand />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/compliance"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ComplianceCenter />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/drivers"
              element={
                <ProtectedRoute>
                  <Layout>
                    <DriverRegistry />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/trips"
              element={
                <ProtectedRoute>
                  <Layout>
                    <TripManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/reports/vehicle"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VehiclePerformance />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route
              path="/garage"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GarageDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/garage/store"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GarageDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/garage/inventory-reports"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <InventoryReports />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/garage/logs"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GarageDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/garage/attendance"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GarageAttendance />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/procurement"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProcurementDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <SuperadminDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
