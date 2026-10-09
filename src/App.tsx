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
import { lazy, Suspense } from 'react';

// Route-level code-splitting (Lazy loading) for lightning-fast initial load times
const OperatorDashboard = lazy(() => import("./pages/OperatorDashboard"));
const VehicleEntry = lazy(() => import("./pages/VehicleEntry"));
const WeighEntry = lazy(() => import("./pages/WeighEntry"));
const PendingWeighs = lazy(() => import("./pages/PendingWeighs"));
const CashierDashboard = lazy(() => import("./pages/CashierDashboard"));
const VehicleTypes = lazy(() => import("./pages/VehicleTypes"));
const AllEntries = lazy(() => import("./pages/AllEntries"));
const VehicleHistory = lazy(() => import("./pages/VehicleHistory"));
const CompletedVehicles = lazy(() => import("./pages/CompletedVehicles"));
const ActivityLogs = lazy(() => import("./pages/ActivityLogs"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AuditTrail = lazy(() => import("./pages/AuditTrail"));
const AdminPenalties = lazy(() => import("./pages/AdminPenalties"));
const AdminCompanyWeights = lazy(() => import("./pages/AdminCompanyWeights"));
const AdminReceiptSettings = lazy(() => import("./pages/AdminReceiptSettings"));
const AdminWeightSettings = lazy(() => import("./pages/AdminWeightSettings"));
const ShiftAnalytics = lazy(() => import("./pages/ShiftAnalytics"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ShiftSummaryReport = lazy(() => import("./pages/ShiftSummaryReport"));
const OverdueHistory = lazy(() => import("./pages/OverdueHistory"));
const ReceiptHistory = lazy(() => import("./pages/ReceiptHistory"));
const LogisticsDashboard = lazy(() => import("./pages/logistics/LogisticsDashboard"));
const FleetCommand = lazy(() => import("./pages/logistics/FleetCommand"));
const DriverRegistry = lazy(() => import("./pages/logistics/DriverRegistry"));
const TripManagement = lazy(() => import("./pages/logistics/TripManagement"));
const ComplianceCenter = lazy(() => import("./pages/logistics/ComplianceCenter"));
const VehiclePerformance = lazy(() => import("./pages/logistics/VehiclePerformance"));
const TransitTripSheetPage = lazy(() => import("./pages/logistics/TransitTripSheetPage"));
const Reconciliation = lazy(() => import("./pages/logistics/Reconciliation"));
const TripInvoices = lazy(() => import("./pages/logistics/TripInvoices"));
const GarageDashboard = lazy(() => import("./pages/garage/GarageDashboard"));
const ProcurementDashboard = lazy(() => import("./pages/procurement/ProcurementDashboard"));
const InventoryReports = lazy(() => import("./pages/garage/InventoryReports"));
const GarageAttendance = lazy(() => import("./pages/garage/Attendance"));
const SuperadminDashboard = lazy(() => import("./pages/SuperadminDashboard"));
const WeighbridgeRequisitions = lazy(() => import("./pages/WeighbridgeRequisitions"));
const ObserverDashboard = lazy(() => import("./pages/ObserverDashboard"));
const FinanceDashboard = lazy(() => import("./pages/FinanceDashboard"));
const FinanceOverview = lazy(() => import("./pages/finance/FinanceOverview"));
const ManagementApprovals = lazy(() => import("./pages/procurement/ManagementApprovals"));
const CashierPaymentPortal = lazy(() => import("./pages/procurement/CashierPaymentPortal"));
const ProcurementReports = lazy(() => import("./pages/procurement/ProcurementReports"));
const ReplacedVehicleParts = lazy(() => import("./pages/procurement/ReplacedVehicleParts"));
const GuardianEye = lazy(() => import("./pages/GuardianEye"));
const TripOrders = lazy(() => import("./pages/logistics/TripOrders"));
const TripSheets = lazy(() => import("./pages/logistics/TripSheets"));
const TripFundApprovals = lazy(() => import("./pages/logistics/TripFundApprovals"));
const MasterCollection = lazy(() => import("./pages/logistics/MasterCollection"));
const KoridorAccount = lazy(() => import("./pages/finance/KoridorAccount"));
const AccountsReceivable = lazy(() => import("./pages/finance/AccountsReceivable"));
const ReconciliationsReview = lazy(() => import("./pages/finance/ReconciliationsReview"));
const Payroll = lazy(() => import("./pages/finance/Payroll"));
const CompanyExpenses = lazy(() => import("./pages/finance/CompanyExpenses"));
const AssetDepreciation = lazy(() => import("./pages/finance/AssetDepreciation"));
const GeneralLedger = lazy(() => import("./pages/finance/GeneralLedger"));

const PageFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-400">Loading module...</span>
    </div>
  </div>
);

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
        return <Navigate to="/finance" replace />;
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
      case 'cashier':
        return <Navigate to="/cashier" replace />;
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
              <Suspense fallback={<PageFallback />}>
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
              path="/finance"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance', 'super_admin']}>
                  <Layout>
                    <FinanceOverview />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance-dashboard"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <FinanceDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/koridor"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <KoridorAccount />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/receivables"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <AccountsReceivable />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/reconciliations"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <ReconciliationsReview />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/payroll"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <Payroll />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/expenses"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <CompanyExpenses />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/assets"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance']}>
                  <Layout>
                    <AssetDepreciation />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/ledger"
              element={
                <ProtectedRoute allowedRoles={['admin', 'finance']}>
                  <Layout>
                    <GeneralLedger />
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
                <ProtectedRoute allowedRoles={['admin', 'cashier', 'procurement_cashier', 'finance']}>
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
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
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
              path="/logistics/orders"
              element={
                <ProtectedRoute>
                  <Layout>
                    <TripOrders />
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
              path="/logistics/fund-approvals"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <Layout>
                    <TripFundApprovals />
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
              path="/logistics/masters"
              element={
                <ProtectedRoute allowedRoles={['logistics_admin', 'logistics_manager', 'admin', 'super_admin']}>
                  <Layout>
                    <MasterCollection />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/invoices"
              element={
                <ProtectedRoute allowedRoles={['logistics_admin', 'logistics_manager', 'admin', 'super_admin']}>
                  <Layout>
                    <TripInvoices />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logistics/reconciliation"
              element={
                <ProtectedRoute requireSuperAdmin>
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
              path="/procurement/replaced-parts"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <Layout>
                    <ReplacedVehicleParts />
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
              </Suspense>
            </LanguageProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
