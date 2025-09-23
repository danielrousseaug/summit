"use client";

import { useState } from "react";
import type { NoteCreate } from "@/types/note";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

export function NewNoteForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: NoteCreate = { title: title.trim(), content: content.trim() };
      if (!payload.title) throw new Error("Title is required");
      await api.createNote(payload);
      setTitle("");
      setContent("");
      onCreated();
      toast.success("Note added");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create note");
      toast.error(err instanceof Error ? err.message : "Failed to create note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring"
          placeholder="Note title"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring"
          placeholder="Write something..."
          rows={4}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Adding..." : "Add Note"}
      </button>
    </form>
  );
}
