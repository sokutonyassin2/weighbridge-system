import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import TransitTripSheetPage from "./pages/logistics/TransitTripSheetPage";
import Reconciliation from "./pages/logistics/Reconciliation";
import GarageDashboard from "./pages/garage/GarageDashboard";
import ProcurementDashboard from "./pages/procurement/ProcurementDashboard";
import InventoryReports from "./pages/garage/InventoryReports";
import GarageAttendance from "./pages/garage/Attendance";
import SuperadminDashboard from "./pages/SuperadminDashboard";
import WeighbridgeRequisitions from "./pages/WeighbridgeRequisitions";
import ObserverDashboard from "./pages/ObserverDashboard";
import FinanceDashboard from "./pages/FinanceDashboard";
import ManagementApprovals from "./pages/procurement/ManagementApprovals";
import CashierPaymentPortal from "./pages/procurement/CashierPaymentPortal";
import ProcurementReports from "./pages/procurement/ProcurementReports";
import GuardianEye from "./pages/GuardianEye";
import TripSheets from "./pages/logistics/TripSheets";

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

  // Helper component to redirect users to their specific landing pages
  const SafeHome = () => {
    const { userRole } = useAuth();

    switch (userRole) {
      case 'super_admin':
      case 'admin':
        return <Navigate to="/admin/dashboard" replace />;
      case 'finance':
        return <Navigate to="/finance-dashboard" replace />;
      case 'logistics_admin':
      case 'logistics_manager':
        return <Navigate to="/logistics" replace />;
      case 'garage_manager':
      case 'mechanic':
        return <Navigate to="/garage" replace />;
      case 'storekeeper':
        return <Navigate to="/garage/store" replace />;
      case 'procurement_officer':
        return <Navigate to="/procurement" replace />;
      case 'procurement_cashier':
        return <Navigate to="/procurement/cashier-portal" replace />;
      case 'audit_clerk':
        return <Navigate to="/logistics/reconciliation" replace />;
      case 'observer':
        return <Navigate to="/guardian-eye" replace />;
      case 'operator':
        return <Navigate to="/weighbridge-dashboard" replace />;
      default:
        return <Navigate to="/weighbridge-dashboard" replace />;
    }
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <LanguageProvider>
              <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SafeHome />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/weighbridge-dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin', 'operator', 'finance']}>
                  <Layout>
                    <OperatorDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/weighbridge-requisitions"
              element={
                <ProtectedRoute>
                  <Layout>
                    <WeighbridgeRequisitions />
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
              path="/finance-dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Layout>
                    <FinanceDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cashier"
              element={
                <ProtectedRoute allowedRoles={['admin', 'cashier', 'operator']}>
                  <Layout>
                    <CashierDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/procurement/cashier-portal"
              element={
                <ProtectedRoute allowedRoles={['admin', 'cashier', 'procurement_cashier']}>
                  <Layout>
                    <CashierPaymentPortal />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/procurement/reports"
              element={
                <ProtectedRoute allowedRoles={['admin', 'procurement_officer', 'garage_manager', 'cashier']}>
                  <Layout>
                    <ProcurementReports />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicle-types"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Layout>
                    <VehicleTypes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/all-entries"
              element={
                <ProtectedRoute requireSuperAdmin>
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
                <ProtectedRoute requireSuperAdmin>
                  <Layout>
                    <ActivityLogs />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/user-management"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Layout>
                    <UserManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-trail"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'observer']}>
                  <Layout>
                    <AuditTrail />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/guardian-eye"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin', 'observer']}>
                  <Layout>
                    <GuardianEye />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/shift-reports"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Layout>
                    <ShiftSummaryReport />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Layout>
                    <SuperadminDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/penalties"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Layout>
                    <AdminPenalties />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/company-weights"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Layout>
                    <AdminCompanyWeights />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Layout>
                    <ShiftAnalytics />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/receipt-settings"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <Layout>
                    <AdminReceiptSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/weight-settings"
              element={
                <ProtectedRoute requireSuperAdmin>
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
              path="/logistics/tripsheets"
              element={
                <ProtectedRoute>
                  <Layout>
                    <TripSheets />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/reconciliation"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin', 'audit_clerk']}>
                  <Layout>
                    <Reconciliation />
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
            <Route
              path="/logistics/transit-sheet/:id"
              element={
                <ProtectedRoute>
                  <TransitTripSheetPage />
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
                <ProtectedRoute allowedRoles={['admin', 'garage_manager', 'finance', 'storekeeper']}>
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
              path="/garage/deleted"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GarageDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/garage/equipment"
              element={
                <ProtectedRoute>
                  <Layout>
                    <GarageDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/garage/lifecycle"
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
              path="/procurement/approvals"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ManagementApprovals />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/procurement/compliance"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ComplianceCenter />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/observer"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ObserverDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
            </LanguageProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
