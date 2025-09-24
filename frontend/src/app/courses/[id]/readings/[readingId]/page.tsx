"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  Sparkles,
  X
} from "lucide-react";
import { getDocument } from "pdfjs-dist";
import "@/lib/pdf-worker";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  pageContext?: number;
};

export default function ReadingPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string; readingId: string }>();
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);
  const pdfDocRef = useRef<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // AI Tutor state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAITutor, setShowAITutor] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  // Load PDF document
  useEffect(() => {
    if (!auth.token || !params?.id) return;
    if (!start || !end) return;
    let cancelled = false;
    async function loadPdf() {
      try {
        setLoadingPdf(true);
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

  // Render current page
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
        const targetWidth = container.clientWidth - 40; // Account for padding
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

  async function handleSendMessage() {
    if (!inputMessage.trim() || isStreaming || !page) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputMessage.trim(),
      pageContext: page
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsStreaming(true);

    try {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("token");

      const response = await fetch(`${base}/courses/${params.id}/ai-tutor/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          page_number: page,
          conversation_history: messages
        })
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, { role: "assistant", content: "", pageContext: page }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.substring(6);
              if (data === "[DONE]") {
                break;
              }
              accumulatedContent += data;
              // Update the last message (assistant's message)
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: accumulatedContent,
                  pageContext: page
                };
                return newMessages;
              });
            }
          }
        }
      }
    } catch (error) {
      toast.error("Failed to send message");
      console.error(error);
      // Remove the empty assistant message if error occurred
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
    }
  }

  if (!auth.token) return <RequireAuth />;

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Compact Header */}
      <div className="flex-none border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/courses/${params?.id}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>

          {start && end && (
            <div className="flex items-center gap-4">
              {/* Page Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === start}
                  onClick={() => {
                    const next = Math.max(start, (page ?? start) - 1);
                    setPage(next);
                    saveProgress(next);
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={page ?? ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || '0');
                      const clamped = Math.min(Math.max(v, start), end);
                      setPage(clamped);
                    }}
                    onBlur={() => {
                      if (page != null) saveProgress(page);
                    }}
                    className="w-16 h-8 text-center text-sm"
                    min={start}
                    max={end}
                  />
                  <span className="text-sm text-gray-500">/ {end}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === end}
                  onClick={() => {
                    const next = Math.min(end, (page ?? start) + 1);
                    setPage(next);
                    saveProgress(next);
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Toggle AI Tutor */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAITutor(!showAITutor)}
                className="flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {showAITutor ? "Hide" : "Show"} AI Tutor
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex-none bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Main Content Area - 50/50 Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer - Left Side */}
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800">
          <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center p-6">
            {loadingPdf ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <Loader2 className="w-6 h-6 mr-2 animate-spin" /> Loading PDF...
              </div>
            ) : (
              <canvas ref={canvasRef} className="shadow-lg" />
            )}
          </div>
        </div>

        {/* AI Tutor - Right Side */}
        {showAITutor && (
          <div className="flex-none w-1/2 flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            {/* AI Tutor Header */}
            <div className="flex-none border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Tutor</h2>
                    <p className="text-sm text-gray-500">Ask questions about page {page}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-gray-500 max-w-sm">
                    <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-sm">
                      Ask me anything about the content on this page! I have access to the text and can help explain concepts, answer questions, and provide study tips.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.pageContext && (
                        <p className="text-xs mt-1 opacity-60">Page {msg.pageContext}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isStreaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-none border-t border-gray-200 dark:border-gray-700 p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2"
              >
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask a question about this page..."
                  disabled={isStreaming || !page}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={!inputMessage.trim() || isStreaming || !page}
                  className="bg-gray-900 hover:bg-gray-800"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Required</h2>
        <p className="text-gray-600 mb-6">Please login to view this reading</p>
        <Button asChild className="w-full bg-gray-900 hover:bg-gray-800">
          <Link href="/auth">Login / Register</Link>
        </Button>
      </div>
    </div>
  );
}