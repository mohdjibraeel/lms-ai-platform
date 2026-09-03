import { createBrowserRouter, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ProtectedRoute from "./ProtectedRoute";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import Dashboard from "../pages/dashboard/Dashboard";
import NotFound from "../pages/NotFound";
import CourseCatalog from "../pages/course-catalog/CourseCatalog";
import CoursePlayer from "../pages/course-player/CoursePlayer";
import CourseDetail from "../pages/course-catalog/CourseDetail";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      { path: "courses", element: <CourseCatalog /> },
      { path: "courses/:courseId", element: <CourseDetail /> },
      {
        element: <ProtectedRoute />,

        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "lectures/:lectureId/player", element: <CoursePlayer /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
