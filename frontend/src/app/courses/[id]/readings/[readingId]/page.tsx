"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  Brain,
  Download,
  Loader2,
  FileText
} from "lucide-react";
import { getDocument } from "pdfjs-dist";
import "@/lib/pdf-worker";

export default function ReadingPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string; readingId: string }>();
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);
  const pdfDocRef = useRef<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!auth.token || !params?.id || !params?.readingId) return;
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const pr = await fetch(`${base}/courses/readings/${params.readingId}/progress`, { headers, cache: "no-store" });
        if (!pr.ok) throw new Error("Failed to load reading");
        const data = await pr.json();
        setStart(data.start_page); setEnd(data.end_page); setPage(data.last_page);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load reading");
      }
    })();
  }, [auth.token, params?.id, params?.readingId]);

  // Load PDF document via pdf.js
  useEffect(() => {
    if (!auth.token || !params?.id) return;
    if (!start || !end) return;
    let cancelled = false;
    async function loadPdf() {
      try {
        setLoadingPdf(true);
        // Worker is already configured globally
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = localStorage.getItem("token") || "";
        const url = `${base}/courses/${params.id}/pdf?token=${encodeURIComponent(token)}`;
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) throw new Error(`Failed to load PDF (${resp.status})`);
        const buf = await resp.arrayBuffer();
        const loadingTask = getDocument({ data: buf });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        // Ensure current page is within range
        setPage((prev) => {
          if (start == null || end == null) return prev;
          const p = prev ?? start;
          const clamped = Math.min(Math.max(p || start, start), end);
          return clamped;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load PDF");
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [auth.token, params?.id, start, end]);

  // Render current page into canvas
  useEffect(() => {
    async function renderPage() {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!doc || !canvas || !container) return;
      if (!page || !start || !end) return;
      const current = Math.min(Math.max(page, start), end);
      try {
        setRendering(true);
        const pdfPage = await doc.getPage(current);
        const dpr = window.devicePixelRatio || 1;
        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const targetWidth = container.clientWidth || initialViewport.width;
        const scale = targetWidth / initialViewport.width;
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        await pdfPage.render({ canvasContext: context, viewport } as any).promise;
      } finally {
        setRendering(false);
      }
    }
    renderPage();
    const onResize = () => renderPage();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [page, start, end]);

  async function saveProgress(lastPage: number) {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` };
    const r = await fetch(`${base}/courses/readings/${params.readingId}/progress`, { method: "POST", headers, body: JSON.stringify({ last_page: lastPage }) });
    if (!r.ok) {
      toast.error("Failed to save page");
    }
  }

  if (!auth.token) return <RequireAuth />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/courses/${params?.id}`} className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Course
              </Link>
            </Button>
            {start && end && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText className="w-4 h-4" />
                Pages {start}–{end}
              </div>
            )}
          </div>

          {error && (
            <Card className="shadow-sm ring-1 ring-red-200 bg-red-50 mb-6">
              <CardContent className="p-4">
                <p className="text-red-600">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* PDF Viewer Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
              <CardContent className="p-0">
                <div ref={containerRef} className="h-[80vh] rounded-lg overflow-auto bg-white flex items-start justify-center">
                  <div className="p-4">
                    {loadingPdf ? (
                      <div className="h-[60vh] flex items-center justify-center text-gray-500">
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading PDF...
                      </div>
                    ) : (
                      <canvas ref={canvasRef} className="shadow-sm border border-gray-100 rounded" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Navigation Controls */}
            <Card className="shadow-sm border border-gray-100 dark:border-gray-700 mt-6">
              <CardContent className="p-6">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === (start ?? 1)}
                    onClick={() => {
                      const next = (start ?? 1);
                      setPage(next);
                      saveProgress(next);
                    }}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                    First
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === (start ?? 1)}
                    onClick={() => {
                      const next = Math.max((start ?? 1), (page ?? 1) - 1);
                      setPage(next);
                      saveProgress(next);
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </Button>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Page</span>
                    <Input
                      type="number"
                      value={page ?? ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || '0');
                      const s = start ?? 1; const ee = end ?? s;
                      const clamped = Math.min(Math.max(v, s), ee);
                      setPage(clamped);
                    }}
                      onBlur={() => {
                      if (page != null) saveProgress(page);
                      }}
                      className="w-20 text-center"
                      min={start ?? 1}
                      max={end ?? 1}
                    />
                    <span className="text-sm text-gray-600">of {end ?? "?"}</span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === (end ?? 1)}
                    onClick={() => {
                      const next = Math.min((end ?? 1), (page ?? 1) + 1);
                      setPage(next);
                      saveProgress(next);
                    }}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === (end ?? 1)}
                    onClick={() => {
                      const next = (end ?? 1);
                      setPage(next);
                      saveProgress(next);
                    }}
                  >
                    Last
                    <ChevronsRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
              <CardHeader>
                <div className="flex items-start space-x-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 ring-1 ring-gray-200">
                    <Brain className="w-4 h-4 text-gray-700" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Study Tools</CardTitle>
                    <CardDescription className="text-sm">
                      Generate content from this reading
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start bg-gray-900 hover:bg-gray-800 cursor-pointer"
                  disabled={generating}
                  onClick={async () => {
                    try {
                      setGenerating(true);
                      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
                      const r = await fetch(`${base}/courses/readings/${params?.readingId}/quizzes/generate`, { method: "POST", headers });
                      if (!r.ok) throw new Error("Failed to generate reading quiz");
                      const q = await r.json();
                      toast.success("Quiz generated");
                      window.location.href = `/courses/${params?.id}/quizzes/${q.id}`;
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : "Failed to generate quiz");
                    } finally {
                      setGenerating(false);
                    }
                  }}
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Generate Quiz
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-sm ring-1 ring-gray-200">
        <CardHeader className="text-center">
          <CardTitle>Access Required</CardTitle>
          <CardDescription>Please login to view this reading</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full bg-gray-900 hover:bg-gray-800">
            <Link href="/auth">Login / Register</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
