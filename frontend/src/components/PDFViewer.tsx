"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  MessageCircle,
  MessageCircleOff
} from "lucide-react";
import { getDocument } from "pdfjs-dist";
import "@/lib/pdf-worker";
import AITutorChat from "./AITutorChat";

interface PDFViewerProps {
  courseId: string;
  startPage: number;
  endPage: number;
  readingId?: string;
  onClose: () => void;
}

export default function PDFViewer({ courseId, startPage, endPage, readingId, onClose }: PDFViewerProps) {
  const [page, setPage] = useState(startPage);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(true);
  const pdfDocRef = useRef<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      try {
        setLoadingPdf(true);
        // Worker is already configured globally
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = localStorage.getItem("token") || "";
        const url = `${base}/courses/${courseId}/pdf?token=${encodeURIComponent(token)}`;
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) throw new Error(`Failed to load PDF (${resp.status})`);
        const buf = await resp.arrayBuffer();
        const loadingTask = getDocument({ data: buf });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
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
  }, [courseId]);

  // Render current page
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!doc || !canvas || !container || totalPages === 0 || isCancelled) return;

      const current = Math.min(Math.max(page, 1), totalPages);
      try {
        if (!isCancelled) {
          setRendering(true);
        }

        const pdfPage = await doc.getPage(current);
        if (isCancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const targetWidth = container.clientWidth - 32;
        const scale = Math.min(targetWidth / initialViewport.width, 1.2);
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context || isCancelled) return;

        // Set canvas dimensions before clearing
        const newWidth = Math.floor(viewport.width * dpr);
        const newHeight = Math.floor(viewport.height * dpr);

        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (!isCancelled) {
          await pdfPage.render({ canvasContext: context, viewport } as any).promise;
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("PDF rendering error:", error);
        }
      } finally {
        if (!isCancelled) {
          setRendering(false);
        }
      }
    }

    // Only delay on initial load, not on page changes
    const isInitialLoad = pdfDocRef.current && totalPages === 0;
    const delay = isInitialLoad ? 100 : 0;

    const timeoutId = setTimeout(renderPage, delay);

    const onResize = () => {
      if (!isCancelled) {
        renderPage();
      }
    };

    window.addEventListener("resize", onResize);
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("resize", onResize);
    };
  }, [page, totalPages, pdfDocRef.current]);

  async function saveProgress(lastPage: number) {
    if (!readingId) return;
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` };
      await fetch(`${base}/courses/readings/${readingId}/progress`, {
        method: "POST",
        headers,
        body: JSON.stringify({ last_page: lastPage })
      });
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }

  return (
    <div className="flex gap-6 w-full">
      {/* PDF Viewer */}
      <Card className="flex-1 shadow-sm border border-gray-100">
        <CardContent className="p-0">
          {/* PDF Display Area */}
          <div ref={containerRef} className="h-[80vh] overflow-auto bg-white flex items-center justify-center p-4">
          {error ? (
            <div className="text-center p-8">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={onClose}>Close</Button>
            </div>
          ) : loadingPdf ? (
            <div className="flex items-center justify-center text-gray-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading PDF...
            </div>
          ) : (
            <div className="p-4">
              <canvas ref={canvasRef} className="shadow-sm border border-gray-100 rounded max-w-full" />
              {rendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation and Chat Toggle Controls */}
        {!error && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100">
            {/* Chat Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                setShowChat(!showChat);
              }}
              className="cursor-pointer flex items-center gap-2"
            >
              {showChat ? (
                <>
                  <MessageCircleOff className="w-4 h-4" />
                  Hide Chat
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4" />
                  AI Tutor
                </>
              )}
            </Button>

            {/* Page Navigation */}
            <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={(e) => {
                e.preventDefault();
                const next = Math.max(1, page - 1);
                setPage(next);
                saveProgress(next);
              }}
              className="cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Page</span>
              <Input
                type="number"
                value={page}
                onChange={(e) => {
                  e.preventDefault();
                  const v = parseInt(e.target.value || '1');
                  const clamped = Math.min(Math.max(v, 1), totalPages || 1);
                  setPage(clamped);
                }}
                onBlur={(e) => {
                  e.preventDefault();
                  saveProgress(page);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveProgress(page);
                  }
                }}
                className="w-20 text-center"
                min={1}
                max={totalPages || 1}
              />
              <span className="text-sm text-gray-600">of {totalPages || '...'}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={(e) => {
                e.preventDefault();
                const next = Math.min(totalPages || 1, page + 1);
                setPage(next);
                saveProgress(next);
              }}
              className="cursor-pointer"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
            </div>
          </div>
        )}
        </CardContent>
      </Card>

      {/* AI Tutor Chat */}
      <AITutorChat
        courseId={courseId}
        currentPage={page}
        totalPages={totalPages}
        isVisible={showChat}
      />
    </div>
  );
}