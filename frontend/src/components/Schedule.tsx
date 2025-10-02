"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";

export function Schedule({ courseId }: { courseId: string }) {
  const [items, setItems] = useState<Array<{ syllabus_item_id: number; title: string; week_index: number; due_date: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const r = await fetch(`${base}/profile/courses/${courseId}/schedule`, { headers, cache: "no-store" });
        if (!r.ok) throw new Error("Failed to load schedule");
        setItems(await r.json());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load schedule");
      }
    })();
  }, [courseId]);

  async function regenerate() {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    const r = await fetch(`${base}/profile/courses/${courseId}/schedule`, { method: "POST", headers });
    if (!r.ok) { toast.error("Failed to regenerate"); return; }
    setItems(await r.json()); toast.success("Schedule updated");
  }

  return (
    <section className="rounded border p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Schedule</h2>
        <button onClick={regenerate} className="text-sm underline cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">Regenerate</button>
      </div>
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <ol className="list-decimal list-inside space-y-2">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">Week {it.week_index + 1}: {it.title}</div>
              <div className="text-xs">
                {/* Optionally link to the course page; quick link to course */}
                <Link className="underline" href={`/courses/${courseId}`}>Open course</Link>
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Due {new Date(it.due_date).toLocaleDateString()}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
