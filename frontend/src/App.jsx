import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import AdminGuard from "./components/AdminGuard";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Payments from "./pages/Payments";
import Attendance from "./pages/Attendance";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import DataManagement from "./pages/DataManagement";
import Notifications from "./pages/Notifications";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* All protected routes — require login */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          {/* Available to all authenticated users */}
          <Route index element={<Dashboard />} />
          <Route path="members"    element={<Members />} />
          <Route path="payments"   element={<Payments />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="notifications" element={<Notifications />} />

          {/* Admin-only routes — AdminGuard shows 403 for staff */}
          <Route
            path="users"
            element={
              <AdminGuard>
                <Users />
              </AdminGuard>
            }
          />
          <Route
            path="audit-logs"
            element={
              <AdminGuard>
                <AuditLogs />
              </AdminGuard>
            }
          />
          <Route
            path="data-management"
            element={
              <AdminGuard>
                <DataManagement />
              </AdminGuard>
            }
          />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}
