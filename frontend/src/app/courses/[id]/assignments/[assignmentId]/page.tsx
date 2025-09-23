"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function AssignmentDetailPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string; assignmentId: string }>();
  const [detail, setDetail] = useState<{ id: number; questions: { id: number; order_index: number; prompt: string }[] } | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: number; created_at: string; score: number; total: number }>>([]);

  useEffect(() => {
    if (!auth.token || !params?.assignmentId) return;
    (async () => {
      try {
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/assignments/${params.assignmentId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!resp.ok) throw new Error("Failed to load assignment");
        const d = await resp.json();
        setDetail(d);
        setAnswers(new Array(d.questions.length).fill(""));
        const hr = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/assignments/${params.assignmentId}/submissions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (hr.ok) setHistory(await hr.json());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load assignment");
      }
    })();
  }, [auth.token, params?.assignmentId]);

  async function submit() {
    if (!detail) return;
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/assignments/${detail.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify(answers),
    });
    if (!resp.ok) return setError("Submit failed");
    setResult(await resp.json());
    const hr = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/assignments/${detail.id}/submissions`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (hr.ok) setHistory(await hr.json());
  }

  if (!auth.token) return <RequireAuth />;

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Assignment</h1>
          <Link className="underline" href={`/courses/${params?.id}/assignments`}>Back to Assignments</Link>
        </header>
        {error && <p className="text-red-600">{error}</p>}
        {!detail && !error && <p>Loading...</p>}
        {detail && (
          <div className="space-y-4">
            {detail.questions.map((q, idx) => (
              <div key={q.id} className="rounded border p-3">
                <div className="font-medium">{idx + 1}. {q.prompt}</div>
                <textarea
                  className="mt-2 w-full rounded border px-3 py-2"
                  rows={3}
                  value={answers[idx]}
                  onChange={(e) => setAnswers((prev) => { const next = [...prev]; next[idx] = e.target.value; return next; })}
                />
              </div>
            ))}
            <button onClick={submit} className="rounded bg-black px-4 py-2 text-white">Submit</button>
            {result && (
              <div className="rounded border p-3">
                <div className="font-medium">Score: {result.score} / {result.total}</div>
              </div>
            )}
            {history.length > 0 && (
              <div className="rounded border p-3">
                <div className="font-medium mb-2">Previous submissions</div>
                <ul className="text-sm space-y-1">
                  {history.map((h) => (
                    <li key={h.id}>On {new Date(h.created_at).toLocaleString()}: {h.score}/{h.total}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="rounded border p-6 text-center space-y-3">
        <p className="text-lg">Please login to work on assignments.</p>
        <a href="/auth" className="rounded bg-black px-4 py-2 text-white inline-block">Login / Register</a>
      </div>
    </div>
  );
}
