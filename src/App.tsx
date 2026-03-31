import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Grades from "./pages/Grades";
import Advisor from "./pages/Advisor";
import Study from "./pages/Study";
import Timetable from "./pages/Timetable";
import Exam from "./pages/Exam";
import Progress from "./pages/Progress";
import Goals from "./pages/Goals";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Full-screen spinner shown while we wait for the initial auth check
function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  // Still resolving the session — show spinner, NEVER redirect yet
  if (loading) return <LoadingScreen />;

  // No session at all → go to auth
  if (!user) return <Navigate to="/auth" replace />;

  // Session exists but profile hasn't loaded yet — wait a tick
  // (profile fetch is async; it's null for ~200ms after login)
  if (profile === null) return <LoadingScreen />;

  // Profile loaded and onboarding not done → send to onboarding
  if (!profile.onboarding_completed) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

function OnboardingRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;

  // Wait for profile to load before deciding
  if (profile === null) return <LoadingScreen />;

  // Already completed onboarding → go to dashboard
  if (profile.onboarding_completed) return <Navigate to="/dashboard" replace />;

  return <Onboarding />;
}

function AuthRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // Already signed in
  if (user) {
    if (profile === null) return <LoadingScreen />;
    if (!profile.onboarding_completed) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/grades" element={<Grades />} />
              <Route path="/advisor" element={<Advisor />} />
              <Route path="/study" element={<Study />} />
              <Route path="/timetable" element={<Timetable />} />
              <Route path="/exam" element={<Exam />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;