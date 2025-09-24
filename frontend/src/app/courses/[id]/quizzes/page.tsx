"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Quiz } from "@/types/quiz";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Brain,
  Clock,
  FileQuestion,
  Play,
  Plus
} from "lucide-react";

export default function CourseQuizzesPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string }>();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token || !params?.id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params.id}/quizzes`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("Failed to load quizzes");
        const list = (await resp.json()) as Quiz[];
        setQuizzes(list);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load quizzes");
      } finally {
        setLoading(false);
      }
    })();
  }, [auth.token, params?.id]);

  async function handleGenerate() {
    if (!params?.id) return;
    try {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params.id}/quizzes/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!resp.ok) throw new Error("Failed to generate quiz");
      const created = (await resp.json()) as Quiz;
      setQuizzes((prev) => [created, ...prev]);
      toast.success("Quiz generated successfully!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate quiz");
    }
  }

  if (!auth.token) return <RequireAuth />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/courses/${params?.id}`} className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Course
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Course Quizzes</h1>
          <p className="text-gray-600 dark:text-gray-300">Test your knowledge with AI-generated quizzes</p>
        </div>

        {loading && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white dark:bg-gray-800 h-20 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700" />
            ))}
          </div>
        )}

        {error && (
          <Card className="shadow-sm border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700">
            <CardContent className="p-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <>
            {quizzes.length === 0 ? (
              <Card className="shadow-sm border border-gray-200 dark:border-gray-700 text-center py-12">
                <CardContent>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mx-auto mb-6">
                    <FileQuestion className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No quizzes yet</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">Return to the course page to generate quizzes from your readings</p>
                  <Button variant="outline" asChild>
                    <Link href={`/courses/${params?.id}`} className="flex items-center gap-2">
                      <ArrowLeft className="w-4 h-4" />
                      Back to Course
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {quizzes.map((q) => (
                  <Card key={q.id} className="shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-200">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                <FileQuestion className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                {q.syllabus_item_title ? `Quiz - ${q.syllabus_item_title}` : `Quiz #${q.id}`}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mb-3">
                                <div className="flex items-center gap-1">
                                  <FileQuestion className="w-4 h-4" />
                                  <span>{q.num_questions} questions</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>Created {new Date(q.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                Ready to take
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="ml-6 flex-shrink-0">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/courses/${params?.id}/quizzes/${q.id}`} className="flex items-center gap-2">
                              <Play className="w-4 h-4" />
                              Take Quiz
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RequireAuth() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-sm border border-gray-200 dark:border-gray-700">
        <CardHeader className="text-center">
          <CardTitle>Access Required</CardTitle>
          <CardDescription>Please login to view quizzes</CardDescription>
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
