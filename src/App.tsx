import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { AuthProvider } from "@/hooks/useAuth";
import { ActiveRoleProvider } from "@/contexts/ActiveRoleContext";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/admin/AdminLayout";
import Index from "./pages/Index";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import CreateTask from "./pages/CreateTask";
import HowItWorks from "./pages/HowItWorks";
import ForTaskers from "./pages/ForTaskers";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import EsekPatur from "./pages/EsekPatur";
import AdminEsekPatur from "./pages/AdminEsekPatur";
import ContractorAgreement from "./pages/ContractorAgreement";
import ResetPassword from "./pages/ResetPassword";
import EmploymentAgreement from "./pages/EmploymentAgreement";
import AdminEmployment from "./pages/AdminEmployment";
import Chat from "./pages/Chat";
import Unsubscribe from "./pages/Unsubscribe";
import AuthCallback from "./pages/AuthCallback";
import AdminBroadcast from "./pages/AdminBroadcast";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import OrderChat from "./pages/OrderChat";
import Settings from "./pages/Settings";
import Messages from "./pages/Messages";
import OrderHistory from "./pages/OrderHistory";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminTaskers from "./pages/admin/AdminTaskers";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminComplaints from "./pages/admin/AdminComplaints";
import AdminCategoriesPage from "./pages/admin/AdminCategoriesPage";
import AdminChat from "./pages/admin/AdminChat";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminDisputes from "./pages/admin/AdminDisputes";
import AdminAuditLog from "./pages/admin/AdminAuditLog";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <ActiveRoleProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/tasks/:id" element={<TaskDetail />} />
                  <Route path="/create-task" element={<CreateTask />} />
                  <Route path="/how-it-works" element={<HowItWorks />} />
                  <Route path="/for-taskers" element={<ForTaskers />} />
                  <Route
                    path="/esek-patur"
                    element={
                      <ProtectedRoute>
                        <EsekPatur />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/contractor-agreement"
                    element={
                      <ProtectedRoute>
                        <ContractorAgreement />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/employment-agreement"
                    element={
                      <ProtectedRoute>
                        <EmploymentAgreement />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard/history"
                    element={
                      <ProtectedRoute>
                        <OrderHistory />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/chat/:taskId"
                    element={
                      <ProtectedRoute>
                        <Chat />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/order-chat/:orderId"
                    element={
                      <ProtectedRoute>
                        <OrderChat />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/messages"
                    element={
                      <ProtectedRoute>
                        <Messages />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/payment-success" element={<PaymentSuccess />} />
                  <Route path="/payment-cancel" element={<PaymentCancel />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/settings" element={<Settings />} />

                  {/* Admin panel with sidebar */}
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="orders" element={<AdminOrders />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="taskers" element={<AdminTaskers />} />
                    <Route path="reviews" element={<AdminReviews />} />
                    <Route path="complaints" element={<AdminComplaints />} />
                    <Route path="categories" element={<AdminCategoriesPage />} />
                    <Route path="chat" element={<AdminChat />} />
                    <Route path="disputes" element={<AdminDisputes />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="audit-log" element={<AdminAuditLog />} />
                    <Route path="esek-patur" element={<AdminEsekPatur />} />
                    <Route path="broadcast" element={<AdminBroadcast />} />
                    <Route path="employment" element={<AdminEmployment />} />
                  </Route>
                </Route>
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </ActiveRoleProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
