const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getAuthHeader(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    ...init,
    // Ensure credentials and CORS are respected on same-origin dev
    credentials: "include",
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Request failed ${resp.status}: ${text || resp.statusText}`);
  }
  if (resp.status === 204) return undefined as unknown as T;
  return (await resp.json()) as T;
}

export const api = {
  listNotes: () => fetchJson<import("@/types/note").Note[]>("/notes"),
  createNote: (payload: import("@/types/note").NoteCreate) =>
    fetchJson<import("@/types/note").Note>("/notes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateNote: (id: number, payload: Partial<import("@/types/note").NoteCreate>) =>
    fetchJson<import("@/types/note").Note>(`/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteNote: (id: number) => fetchJson<void>(`/notes/${id}`, { method: "DELETE" }),
  register: (email: string, password: string) => fetchJson("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => fetchJson<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => fetchJson<{ id: number; email: string }>("/auth/me"),
  listCourses: () => fetchJson<import("@/types/course").Course[]>("/courses/"),
  uploadCourse: async (file: File, title: string, topics?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    if (topics) form.append("topics", topics);
    const headers = typeof window !== "undefined" ? (getAuthHeader() as Record<string, string>) : {};
    const resp = await fetch(`${BASE_URL}/courses/upload`, {
      method: "POST",
      headers, // don't set content-type so browser adds boundary
      body: form,
      credentials: "include",
    });
    if (!resp.ok) throw new Error(`Upload failed ${resp.status}`);
    return (await resp.json()) as import("@/types/course").CourseWithSyllabus;
  },
  renameCourse: (courseId: number, newTitle: string) =>
    fetchJson<import("@/types/course").Course>(`/courses/${courseId}`, {
      method: "PUT",
      body: JSON.stringify({ title: newTitle }),
    }),
  deleteCourse: (courseId: number) => fetchJson<void>(`/courses/${courseId}`, { method: "DELETE" }),
};
