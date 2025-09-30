"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MessageCircleOff,
  Loader2
} from "lucide-react";
import dynamic from "next/dynamic";
import AITutorChat from "./AITutorChat";

// Dynamic import to avoid SSR issues
const Document = dynamic(
  () => import("react-pdf").then((mod) => mod.Document),
  { ssr: false }
);
const Page = dynamic(
  () => import("react-pdf").then((mod) => mod.Page),
  { ssr: false }
);

interface ReactPDFViewerProps {
  courseId: string;
  startPage: number;
  endPage: number;
  readingId?: string;
  onClose: () => void;
}

export default function ReactPDFViewer({
  courseId,
  startPage,
  endPage,
  readingId,
  onClose
}: ReactPDFViewerProps) {
  const [page, setPage] = useState(startPage);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [showChat, setShowChat] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pdfInitialized, setPdfInitialized] = useState(false);

  // Setup PDF.js worker on client side
  useEffect(() => {
    const setupPdfWorker = async () => {
      if (typeof window !== "undefined") {
        const { pdfjs } = await import("react-pdf");
        pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.js`;
        setPdfInitialized(true);
      }
    };
    setupPdfWorker();
  }, []);

  // Construct PDF URL
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  const pdfUrl = `${base}/courses/${courseId}/pdf?token=${encodeURIComponent(token)}`;

  const saveProgress = useCallback(async (lastPage: number) => {
    if (!readingId) return;
    try {
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

  const handlePageChange = useCallback((newPage: number) => {
    const clampedPage = Math.min(Math.max(newPage, 1), totalPages || 1);
    setPage(clampedPage);
    saveProgress(clampedPage);
  }, [saveProgress, totalPages]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
    setLoading(false);
    console.log("React-PDF loaded successfully:", numPages, "pages");
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("Failed to load PDF:", error);
    setLoading(false);
  };

  return (
    <div className="flex gap-6 w-full">
      {/* PDF Viewer */}
      <Card className="flex-1 shadow-sm border border-gray-100">
        <CardContent className="p-0">
          {/* PDF Display Area */}
          <div className="h-[80vh] overflow-auto bg-white flex items-center justify-center p-4">
            {!pdfInitialized ? (
              <div className="flex items-center justify-center text-gray-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Initializing PDF viewer...
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center text-gray-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Loading PDF...
              </div>
            ) : Document && Page ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading=""
              >
                <Page
                  pageNumber={page}
                  width={800}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                />
              </Document>
            ) : (
              <div className="flex items-center justify-center text-gray-500">
                PDF viewer not available
              </div>
            )}
          </div>

          {/* Navigation and Chat Toggle Controls */}
          <div className="flex items-center justify-between p-4 border-t border-gray-100">
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
                onClick={() => handlePageChange(page - 1)}
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
                <span className="text-sm text-gray-600">of {totalPages || '...'}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => handlePageChange(page + 1)}
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