"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Flashcard } from "@/types/flashcard";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Layers,
  Play
} from "lucide-react";

export default function CourseFlashcardsPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string }>();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token || !params?.id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params.id}/flashcards`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("Failed to load flashcards");
        const list = (await resp.json()) as Flashcard[];
        setFlashcards(list);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load flashcards");
      } finally {
        setLoading(false);
      }
    })();
  }, [auth.token, params?.id]);

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Flashcard Sets</h1>
          <p className="text-gray-600 dark:text-gray-300">Study with AI-generated flashcards</p>
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
            {flashcards.length === 0 ? (
              <Card className="shadow-sm border border-gray-200 dark:border-gray-700 text-center py-12">
                <CardContent>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mx-auto mb-6">
                    <Layers className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No flashcard sets yet</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">Return to the course page to generate flashcards from your readings</p>
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
                {flashcards.map((fc) => (
                  <Card key={fc.id} className="shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-200">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                <Layers className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                {fc.syllabus_item_title ? `Flashcards - ${fc.syllabus_item_title}` : `Flashcard Set #${fc.id}`}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mb-3">
                                <div className="flex items-center gap-1">
                                  <BookOpen className="w-4 h-4" />
                                  <span>{fc.num_cards} cards</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>Created {new Date(fc.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                Ready to study
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="ml-6 flex-shrink-0">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/courses/${params?.id}/flashcards/${fc.id}`} className="flex items-center gap-2">
                              <Play className="w-4 h-4" />
                              Study Cards
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
          <CardDescription>Please login to view flashcards</CardDescription>
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
