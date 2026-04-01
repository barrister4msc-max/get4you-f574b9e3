import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { AuthProvider } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
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
                <Route path="/esek-patur" element={<ProtectedRoute><EsekPatur /></ProtectedRoute>} />
                <Route path="/admin/esek-patur" element={<ProtectedRoute><AdminEsekPatur /></ProtectedRoute>} />
                <Route path="/admin/employment" element={<ProtectedRoute><AdminEmployment /></ProtectedRoute>} />
                <Route path="/contractor-agreement" element={<ProtectedRoute><ContractorAgreement /></ProtectedRoute>} />
                <Route path="/employment-agreement" element={<ProtectedRoute><EmploymentAgreement /></ProtectedRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/signup" element={<Login />} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
