import { Outlet, Link } from "react-router-dom";

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-sage p-6">
      <nav className="bg-white rounded-full px-6 py-3 flex gap-2 items-center shadow-sm w-fit mb-6">
        <span className="font-semibold text-gray-900 mr-4">LMS-AI</span>
        <Link to="/login" className="text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-full px-4 py-2">
          Login
        </Link>
        <Link to="/register" className="text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-full px-4 py-2">
          Register
        </Link>
        <Link to="/dashboard" className="text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-full px-4 py-2">
          Dashboard
        </Link>
      </nav>

      <main className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <Outlet />
      </main>
    </div>
  );
}