import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { homeFor } from "./roles.js";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import TranslatorDashboard from "./pages/TranslatorDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminTranslatorProfile from "./pages/AdminTranslatorProfile.jsx";
import HospitalDashboard from "./pages/HospitalDashboard.jsx";
import HospitalPlans from "./pages/HospitalPlans.jsx";
import AdminBilling from "./pages/AdminBilling.jsx";
import CallScreen from "./pages/CallScreen.jsx";
import Profile from "./pages/Profile.jsx";
import ForcePasswordModal from "./components/ForcePasswordModal.jsx";
import ForcePayoutModal from "./components/ForcePayoutModal.jsx";

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-3 w-3 animate-ping rounded-full bg-brand-400" />
          Loading clinic desk…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user)} replace />;
  }
  return children;
}

export default function App() {
  const { user } = useAuth();
  const home = homeFor(user);

  return (
    <>
    <ForcePasswordModal />
    <ForcePayoutModal />
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/forgot-password" element={user ? <Navigate to={home} replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/profile"
        element={
          <Guard>
            <Profile />
          </Guard>
        }
      />
      <Route
        path="/translator"
        element={
          <Guard roles={["translator"]}>
            <TranslatorDashboard />
          </Guard>
        }
      />
      <Route
        path="/hospital/plans"
        element={
          <Guard roles={["hospital_admin"]}>
            <HospitalPlans />
          </Guard>
        }
      />
      <Route
        path="/hospital"
        element={
          <Guard roles={["hospital_admin"]}>
            <HospitalDashboard />
          </Guard>
        }
      />
      <Route
        path="/admin/billing"
        element={
          <Guard roles={["admin", "subadmin"]}>
            <AdminBilling />
          </Guard>
        }
      />
      <Route
        path="/admin/translators/:id"
        element={
          <Guard roles={["admin", "subadmin"]}>
            <AdminTranslatorProfile />
          </Guard>
        }
      />
      <Route
        path="/admin"
        element={
          <Guard roles={["admin", "subadmin"]}>
            <AdminDashboard />
          </Guard>
        }
      />
      <Route
        path="/call/:id"
        element={
          <Guard roles={["hospital_admin", "doctor", "translator", "admin", "subadmin"]}>
            <CallScreen />
          </Guard>
        }
      />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/doctor" element={<Navigate to="/hospital" replace />} />
      <Route path="*" element={<Navigate to={user ? home : "/login"} replace />} />
    </Routes>
    </>
  );
}
