import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Dashboard from "../pages/dashboard/page";
import Deploy from "../pages/deploy/page";
import FunctionDetail from "../pages/function-detail/page";
import Logs from "../pages/logs/page";
import Settings from "../pages/settings/page";
import Metrics from "../pages/metrics/page";
import Login from "../pages/auth/login";
import Register from "../pages/auth/register";
import ProtectedRoute from "../components/common/ProtectedRoute";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/register",
    element: <Register />,
  },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/deploy",
    element: (
      <ProtectedRoute>
        <Deploy />
      </ProtectedRoute>
    ),
  },
  {
    path: "/function/:id",
    element: (
      <ProtectedRoute>
        <FunctionDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/logs",
    element: (
      <ProtectedRoute>
        <Logs />
      </ProtectedRoute>
    ),
  },
  {
    path: "/settings",
    element: (
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    ),
  },
  {
    path: "/metrics",
    element: (
      <ProtectedRoute>
        <Metrics />
      </ProtectedRoute>
    ),
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
