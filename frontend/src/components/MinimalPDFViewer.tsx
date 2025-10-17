"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MessageCircleOff
} from "lucide-react";
import { getDocument } from "pdfjs-dist";
import "@/lib/pdf-worker";
import AITutorChat from "./AITutorChat";

interface MinimalPDFViewerProps {
  courseId: string;
  startPage?: number;
  readingId?: string;
}

export default function MinimalPDFViewer({
  courseId,
  startPage = 1,
  readingId
}: MinimalPDFViewerProps) {
  const [page, setPage] = useState(startPage);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const pdfDocRef = useRef<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  let debugCounter = 0;

  const debugLog = (message: string, data?: any) => {
    console.log(`[MINIMAL PDF DEBUG ${++debugCounter}] ${message}`, {
      windowScrollY: window.scrollY,
      documentScrollY: document.documentElement.scrollTop,
      page,
      totalPages,
      ...data
    });
  };

  const saveProgress = useCallback(async (lastPage: number) => {
    if (!readingId) return;
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      };
      await fetch(`${base}/courses/readings/${readingId}/progress`, {
        method: "POST",
        headers,
        body: JSON.stringify({ last_page: lastPage })
      });
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }, [readingId]);

  // Load PDF
  useEffect(() => {
    debugLog("Starting PDF load");
    let cancelled = false;
    async function loadPdf() {
      try {
        setLoading(true);
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
        console.error("PDF load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [courseId]);

  // Watch for container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set initial width
    const initialWidth = container.clientWidth;
    setContainerWidth(initialWidth);
    console.log('[PDF Resize] Initial container width:', initialWidth);

    // Use a ref to track previous width to avoid stale closures
    let prevWidth = initialWidth;

    // Create ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const widthDiff = Math.abs(newWidth - prevWidth);

        // Update if width changed by at least 5px
        if (widthDiff > 5) {
          console.log('[PDF Resize] Width changed:', {
            from: prevWidth,
            to: newWidth,
            diff: widthDiff
          });
          prevWidth = newWidth;
          setContainerWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []); // Empty deps - only set up once

  // Render page
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || totalPages === 0) return;

    const renderPage = async () => {
      try {
        const doc = pdfDocRef.current;
        const canvas = canvasRef.current;
        if (!doc || !canvas) return;
        const container = containerRef.current;
        if (!container) return;

        const pdfPage = await doc.getPage(page);

        // Calculate optimal scale to fit container width exactly
        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const currentWidth = containerWidth > 0 ? containerWidth : container.clientWidth;
        const availableWidth = currentWidth - 20; // Account for padding and border
        const scale = Math.min(availableWidth / initialViewport.width, 2.5);

        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) return;

        // Use device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        const scaledWidth = viewport.width * dpr;
        const scaledHeight = viewport.height * dpr;

        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        await pdfPage.render({ canvasContext: context, viewport }).promise;
      } catch (error) {
        console.error("PDF rendering error:", error);
      }
    };

    renderPage();
  }, [page, totalPages, containerWidth]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    saveProgress(newPage);
  };

  if (loading) return <div className="flex items-center justify-center p-8">Loading PDF...</div>;

  return (
    <div className="flex gap-6 w-full">
      {/* PDF Viewer */}
      <Card className="flex-1 shadow-sm border border-gray-100 dark:border-gray-700">
        <CardContent className="p-0">
          {/* PDF Display Area */}
          <div
            ref={containerRef}
            className="h-[80vh] overflow-auto bg-white dark:bg-gray-900 p-2"
          >
            <div className="flex justify-center w-full max-w-full">
              <canvas
                ref={canvasRef}
                className="shadow-sm border border-gray-100 dark:border-gray-700 rounded max-w-full"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
          </div>

          {/* Navigation and Chat Toggle Controls */}
          <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700">
            {/* Chat Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChat(!showChat)}
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
                onClick={() => handlePageChange(Math.max(1, page - 1))}
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
                    const v = parseInt(e.target.value || '1');
                    const clamped = Math.min(Math.max(v, 1), totalPages || 1);
                    setPage(clamped);
                  }}
                  onBlur={() => saveProgress(page)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
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
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                className="cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
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