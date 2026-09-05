import { Outlet, Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut } from "lucide-react";
import { useAuthStore } from "../store/authStore";

export default function MainLayout() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
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
            <Link
              to="/dashboard"
              className="text-xs sm:text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors rounded-full px-3 sm:px-4 py-1.5 sm:py-2"
            >
              Dashboard
            </Link>
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

      <main className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}