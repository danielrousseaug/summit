"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { QuizDetail } from "@/types/quiz";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Download,
  Upload,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  History
} from "lucide-react";

export default function TakeQuizPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string; quizId: string }>();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; total: number; correct_indices: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: number; created_at: string; score: number; total: number }>>([]);

  useEffect(() => {
    if (!auth.token || !params?.quizId) return;
    (async () => {
      try {
        setError(null);
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/quizzes/${params.quizId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("Failed to load quiz");
        const data = (await resp.json()) as QuizDetail;
        setQuiz(data);
        setAnswers(new Array(data.questions.length).fill(-1));
        const hr = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/quizzes/${params.quizId}/submissions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (hr.ok) setHistory(await hr.json());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load quiz");
      }
    })();
  }, [auth.token, params?.quizId]);

  async function handleSubmit() {
    if (!quiz) return;
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/quizzes/${quiz.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify(answers),
    });
    if (!resp.ok) {
      setError("Submit failed"); toast.error("Submit failed");
      return;
    }
    setResult(await resp.json()); toast.success("Submitted");
    // refresh history
    const hr = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/quizzes/${quiz.id}/submissions`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (hr.ok) setHistory(await hr.json());
  }

  async function downloadPdf() {
    if (!quiz) return;
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("token");
      const url = `${base}/courses/quizzes/${quiz.id}/pdf`;

      console.log("PDF Download Debug:", { base, quizId: quiz.id, url, hasToken: !!token });

      // Use fetch with proper headers (remove token from URL since we're using Authorization header)
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      // Get the PDF blob and create a download link
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `quiz-${quiz.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download PDF");
    }
  }

  async function uploadAnswers(e: React.ChangeEvent<HTMLInputElement>) {
    if (!quiz) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/quizzes/${quiz.id}/grade-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: form,
    });
    if (!resp.ok) { toast.error("Upload grading failed"); return; }
    const graded = await resp.json();
    setResult(graded); toast.success("Graded");
    const hr = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/quizzes/${quiz.id}/submissions`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (hr.ok) setHistory(await hr.json());
  }

  if (!auth.token) return <RequireAuth />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/courses/${params?.id}?tab=quizzes`} className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Course
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={downloadPdf}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
              <div className="relative">
                <Input
                  type="file"
                  accept=".pdf,text/plain"
                  onChange={uploadAnswers}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" size="sm" className="pointer-events-none">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Answers
                </Button>
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Take Quiz</h1>
          <p className="text-gray-600 dark:text-gray-300">Complete the quiz and submit your answers</p>
        </div>

        {error && (
          <Card className="shadow-sm border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 mb-6">
            <CardContent className="p-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {!quiz && !error && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white dark:bg-gray-800 h-32 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700" />
            ))}
          </div>
        )}

        {quiz && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 space-y-6">
              {/* Questions */}
              {quiz.questions.map((q, idx) => (
                <Card key={q.id} className="shadow-sm border border-gray-100 dark:border-gray-700">
                  <CardHeader>
                    <div className="flex items-start space-x-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                        <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2 dark:text-white">{q.prompt}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                      {q.options.map((opt, oi) => {
                        const isSelected = answers[idx] === oi;
                        const isCorrect = result?.correct_indices.includes(idx) && result.correct_indices[idx] === oi;
                        const isIncorrect = result && answers[idx] === oi && !result.correct_indices.includes(idx);

                        return (
                          <label
                            key={oi}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              isSelected
                                ? result
                                  ? isCorrect
                                    ? 'border-green-200 bg-green-50'
                                    : isIncorrect
                                      ? 'border-red-200 bg-red-50'
                                      : 'border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-800'
                                  : 'border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-800'
                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q${idx}`}
                              checked={answers[idx] === oi}
                              onChange={() => setAnswers((prev) => {
                                const next = [...prev];
                                next[idx] = oi;
                                return next;
                              })}
                              className="w-4 h-4"
                              disabled={!!result}
                            />
                            <span className="flex-1 dark:text-gray-200">{opt}</span>
                            {result && isSelected && (
                              <div className="flex-shrink-0">
                                {isCorrect ? (
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : isIncorrect ? (
                                  <XCircle className="w-5 h-5 text-red-600" />
                                ) : null}
                              </div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Submit Button */}
              {!result && (
                <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
                  <CardContent className="p-6">
                    <Button
                      onClick={handleSubmit}
                      className="w-full bg-gray-900 hover:bg-gray-800"
                      disabled={answers.some(a => a === -1)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Submit Quiz
                    </Button>
                    {answers.some(a => a === -1) && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 text-center mt-3">
                        Please answer all questions before submitting
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Results */}
              {result && (
                <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
                  <CardHeader>
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700">
                        <Trophy className="w-4 h-4 text-green-700 dark:text-green-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Quiz Results</CardTitle>
                        <CardDescription className="text-sm">
                          Your performance on this quiz
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {result.score}/{result.total}
                      </div>
                      <div className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                        {Math.round((result.score / result.total) * 100)}% Score
                      </div>
                      <Badge
                        variant="outline"
                        className={`${
                          (result.score / result.total) >= 0.8
                            ? 'border-green-200 text-green-800 bg-green-50'
                            : (result.score / result.total) >= 0.6
                              ? 'border-yellow-200 text-yellow-800 bg-yellow-50'
                              : 'border-red-200 text-red-800 bg-red-50'
                        }`}
                      >
                        {(result.score / result.total) >= 0.8 ? 'Excellent' :
                         (result.score / result.total) >= 0.6 ? 'Good' : 'Needs Improvement'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* History */}
              {history.length > 0 && (
                <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
                  <CardHeader>
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <History className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Previous Attempts</CardTitle>
                        <CardDescription className="text-sm">
                          Your quiz history
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {history.map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span className="text-gray-600 dark:text-gray-300">
                              {new Date(h.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {h.score}/{h.total}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-sm border border-gray-100 dark:border-gray-700">
        <CardHeader className="text-center">
          <CardTitle>Access Required</CardTitle>
          <CardDescription>Please login to take quizzes</CardDescription>
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
