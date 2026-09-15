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
import QuizAttempt from "../pages/quizzes/QuizAttempt";
import AssignmentSubmission from "../pages/assignments/AssignmentSubmission";
import Achievements from "../pages/dashboard/Achievements";
import CourseAnalytics from "../pages/instructor/CourseAnalytics";
import MyCourses from "../pages/instructor/MyCourses";
import GradeSubmissions from "../pages/instructor/GradeSubmissions";
import CreateQuiz from "../pages/instructor/CreateQuiz";
import CreateCourse from "../pages/instructor/CreateCourse";
import ManageCourse from "../pages/instructor/ManageCourse";
import CourseApprovals from "../pages/admin-panel/CourseApprovals";

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
          { path: "quizzes/:quizId/attempt", element: <QuizAttempt /> },
          {
            path: "assignments/:assignmentId",
            element: <AssignmentSubmission />,
          },
          { path: "achievements", element: <Achievements /> },
          { path: "instructor/courses", element: <MyCourses /> },
          {
            path: "instructor/courses/:courseId/analytics",
            element: <CourseAnalytics />,
          },
          {
            path: "instructor/assignments/:assignmentId/submissions",
            element: <GradeSubmissions />,
          },
          {
            path: "instructor/modules/:moduleId/quizzes/new",
            element: <CreateQuiz />,
          },
          { path: "instructor/courses/new", element: <CreateCourse /> },
          {
            path: "instructor/courses/:courseId/manage",
            element: <ManageCourse />,
          },
          { path: "admin/course-approvals", element: <CourseApprovals /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
