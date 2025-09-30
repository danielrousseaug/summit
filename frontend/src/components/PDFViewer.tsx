"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
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

const PDFViewer = memo(function PDFViewer({ courseId, startPage, endPage, readingId, onClose }: PDFViewerProps) {
  const [page, setPage] = useState(startPage);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [initialRender, setInitialRender] = useState(true);
  const pdfDocRef = useRef<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debugCounterRef = useRef(0);

  // Debug logging function
  const debugLog = useCallback((message: string, data?: any) => {
    const counter = ++debugCounterRef.current;
    const scrollY = window.scrollY;
    const docScrollY = document.documentElement.scrollTop;
    console.log(`[PDF DEBUG ${counter}] ${message}`, {
      windowScrollY: scrollY,
      documentScrollY: docScrollY,
      page,
      totalPages,
      data
    });
  }, [page, totalPages]);

  // Load PDF document
  useEffect(() => {
    debugLog("PDFViewer mounting/courseId changed", { courseId });
    let cancelled = false;
    async function loadPdf() {
      try {
        debugLog("Starting PDF load");
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
        debugLog("PDF loaded successfully", { numPages: doc.numPages });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load PDF");
        debugLog("PDF load failed", { error: e });
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
      debugLog("PDF load effect cleanup");
    };
  }, [courseId, debugLog]);

  // Render current page - exact copy of working minimal approach
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || totalPages === 0) return;

    const renderPage = async () => {
      try {
        setRendering(true);
        const doc = pdfDocRef.current;
        const canvas = canvasRef.current;
        if (!doc || !canvas) return;

        const pdfPage = await doc.getPage(page);

        // Use better scale for quality but keep simple like minimal viewer
        const container = containerRef.current;
        const baseScale = container ? Math.min(container.clientWidth / pdfPage.getViewport({ scale: 1 }).width, 2) : 1.5;
        const scale = Math.max(baseScale, 1.2);

        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.clearRect(0, 0, canvas.width, canvas.height);

        await pdfPage.render({ canvasContext: context, viewport }).promise;
        setRendering(false);
      } catch (error) {
        console.error("PDF rendering error:", error);
        setRendering(false);
      }
    };

    renderPage();
  }, [page, totalPages]);

  // Handle resize
  useEffect(() => {
    const onResize = () => {
      // Force re-render on resize by updating a dummy state
      if (pdfDocRef.current && totalPages > 0) {
        setPage(current => current); // Trigger re-render
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [totalPages]);

  const saveProgress = useCallback(async (lastPage: number) => {
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
  }, [readingId]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    saveProgress(newPage);
  }, [saveProgress]);

  return (
    <div className="flex gap-6 w-full">
      {/* PDF Viewer */}
      <Card className="flex-1 shadow-sm border border-gray-100 dark:border-gray-700">
        <CardContent className="p-0">
          {/* PDF Display Area */}
          <div
            ref={containerRef}
            className="h-[80vh] overflow-auto bg-white dark:bg-gray-900 flex items-center justify-center p-4"
            style={{scrollBehavior: 'auto', scrollbarGutter: 'stable'}}
            onScroll={(e) => {
              // Prevent propagation of scroll events from PDF container
              e.stopPropagation();
            }}
          >
          {error ? (
            <div className="text-center p-8">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={onClose}>Close</Button>
            </div>
          ) : loadingPdf ? (
            <div className="flex items-center justify-center text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading PDF...
            </div>
          ) : (
            <div className="p-4">
              <canvas ref={canvasRef} className="shadow-sm border border-gray-100 dark:border-gray-700 rounded max-w-full" />
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
          <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700">
            {/* Chat Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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
                handlePageChange(Math.max(1, page - 1));
              }}
              className="cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">Page</span>
              <Input
                type="number"
                value={page}
                onChange={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const v = parseInt(e.target.value || '1');
                  const clamped = Math.min(Math.max(v, 1), totalPages || 1);
                  setPage(clamped);
                }}
                onBlur={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  saveProgress(page);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    saveProgress(page);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-20 text-center"
                min={1}
                max={totalPages || 1}
              />
              <span className="text-sm text-gray-600 dark:text-gray-300">of {totalPages || '...'}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={(e) => {
                e.preventDefault();
                handlePageChange(Math.min(totalPages || 1, page + 1));
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
});

export default PDFViewer;