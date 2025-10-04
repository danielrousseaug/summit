"use client";

import { useState } from "react";
import type { Note } from "@/types/note";
import { api } from "@/lib/api";

export function NoteItem({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateNote(note.id, { title: title.trim(), content: content.trim() });
      setIsEditing(false);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update note");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this note?")) return;
    try {
      await api.deleteNote(note.id);
      onChanged();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <li className="rounded border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-2">
              <input
                className="w-full rounded border px-3 py-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="w-full rounded border px-3 py-2"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button className="rounded border px-3 py-1" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="font-medium">{note.title}</div>
              <div className="text-sm text-gray-600 whitespace-pre-wrap">{note.content}</div>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          {!isEditing && (
            <button className="text-sm text-gray-600 dark:text-gray-400 hover:underline" onClick={() => setIsEditing(true)}>
              Edit
            </button>
          )}
          <button className="text-sm text-red-600 hover:underline" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-400">
        Created {new Date(note.created_at).toLocaleString()} · Updated {new Date(note.updated_at).toLocaleString()}
      </div>
    </li>
  );
}
