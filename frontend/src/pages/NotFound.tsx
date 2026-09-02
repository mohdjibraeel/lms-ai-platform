export default function NotFound() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">404 — Page Not Found</h1>
      <p className="mt-2">
        <a href="/login" className="text-blue-500 underline">
          Go to Login
        </a>
      </p>
    </div>
  );
}