import { Outlet, Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import api from "../services/api";

export default function MainLayout() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const role = useAuthStore((state) => state.role);
  const logout = useAuthStore((state) => state.logout);

  const isInstructorOrAdmin = role === "instructor" || role === "admin";
  const isAdmin = role === "admin";

  const handleLogout = async () => {
    // Grab the refresh token BEFORE logout() wipes it from the browser.
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      }
    } catch {
      // If the server is down or the token is already gone, we still log
      // the user out locally. Logging out must never get stuck.
    }
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-sage p-3 sm:p-6">
      <nav className="bg-white rounded-full px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap gap-1 sm:gap-2 items-center shadow-sm w-fit max-w-full mb-4 sm:mb-6">
        <span className="flex items-center gap-1.5 font-semibold text-gray-900 mr-2 sm:mr-4 text-sm sm:text-base">
          <GraduationCap size={18} className="text-gray-900" />
          LMS-AI
        </span>
        <Link
          to="/courses"
          className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
        >
          Courses
        </Link>
        {!token && (
          <>
            <Link
              to="/login"
              className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
            >
              Register
            </Link>
          </>
        )}

        {token && (
          <>
            {!isInstructorOrAdmin && (
              <Link
                to="/dashboard"
                className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
              >
                Dashboard
              </Link>
            )}
            <Link
              to="/achievements"
              className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
            >
              Achievements
            </Link>
            {isInstructorOrAdmin && (
              <Link
                to="/instructor/courses"
                className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
              >
                My Courses
              </Link>
            )}
            {isAdmin && (
              <>
                <Link
                  to="/admin/course-approvals"
                  className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
                >
                  Approvals
                </Link>
                <Link
                  to="/admin/users"
                  className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
                >
                  Users
                </Link>
                <Link
                  to="/admin/overview"
                  className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
                >
                  Overview
                </Link>
              </>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2 sm:ml-auto"
            >
              <LogOut size={14} />
              Logout
            </button>
          </>
        )}
      </nav>

      <main className="bg-gray-50 rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
