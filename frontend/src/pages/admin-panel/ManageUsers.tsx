import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface User {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  role: string;
}

const ROLES = ["student", "instructor", "admin"];

export default function ManageUsers() {
  const queryClient = useQueryClient();
  const [savedUserId, setSavedUserId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ users: User[] }>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await api.get("/admin/users");
      return response.data;
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, activate }: { userId: string; activate: boolean }) => {
      const action = activate ? "reactivate" : "deactivate";
      await api.put(`/admin/users/${userId}/${action}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await api.put(`/admin/users/${userId}/role`, { role });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSavedUserId(variables.userId);
    },
  });

  if (isLoading) return <p className="text-muted text-sm">Loading users...</p>;
  if (error) return <p className="text-danger text-sm">Couldn't load users.</p>;

  const users = data?.users ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Manage Users</h1>

      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className="rounded-2xl shadow-md bg-white p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <p className="font-medium text-gray-900">{user.full_name}</p>
              <p className="text-sm text-muted">{user.email}</p>
              {!user.is_active && (
                <p className="text-sm text-danger font-medium">Deactivated</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={user.role}
                onChange={(e) =>
                  roleMutation.mutate({ userId: user.id, role: e.target.value })
                }
                className="rounded-lg border border-gray-200 p-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  toggleActiveMutation.mutate({
                    userId: user.id,
                    activate: !user.is_active,
                  })
                }
                disabled={toggleActiveMutation.isPending}
                className={`rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${
                  user.is_active
                    ? "bg-white shadow-md text-danger"
                    : "bg-accent-green text-white"
                }`}
              >
                {user.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>

            {savedUserId === user.id && roleMutation.isSuccess && (
              <p className="text-sm text-accent-green w-full">Role updated.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}