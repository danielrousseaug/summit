"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function CourseAssignmentsPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string }>();
  const [assignments, setAssignments] = useState<Array<{ id: number; num_questions: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token || !params?.id) return;
    (async () => {
      try {
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params.id}/assignments`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("Failed to load assignments");
        setAssignments(await resp.json());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load assignments");
      }
    })();
  }, [auth.token, params?.id]);

  async function handleGenerate() {
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params?.id}/assignments/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!resp.ok) return alert("Failed to generate assignment");
    const created = await resp.json();
    setAssignments((prev) => [created, ...prev]);
  }

  if (!auth.token) return <RequireAuth />;

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Assignments</h1>
          <div className="flex gap-3">
            <Link className="underline" href={`/courses/${params?.id}`}>Back to Course</Link>
            <button className="rounded bg-black px-3 py-1 text-white" onClick={handleGenerate}>Generate</button>
          </div>
        </header>

        {error && <p className="text-red-600">{error}</p>}
        <ul className="space-y-3">
          {assignments.length === 0 && <li className="text-gray-500">No assignments yet.</li>}
          {assignments.map((a) => (
            <li key={a.id} className="rounded border p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">Assignment #{a.id}</div>
                <div className="text-xs text-gray-500">{a.num_questions} questions</div>
              </div>
              <Link className="underline" href={`/courses/${params?.id}/assignments/${a.id}`}>Open</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="rounded border p-6 text-center space-y-3">
        <p className="text-lg">Please login to view assignments.</p>
        <a href="/auth" className="rounded bg-black px-4 py-2 text-white inline-block">Login / Register</a>
      </div>
    </div>
  );
}
