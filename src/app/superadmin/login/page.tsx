"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SuperadminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/superadmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/superadmin/dashboard");
    } else {
      setError("Incorrect password");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">JambaHR Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Internal use only.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
