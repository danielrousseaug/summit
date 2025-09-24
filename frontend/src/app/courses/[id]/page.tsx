"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { CourseWithSyllabus } from "@/types/course";
import type { Quiz } from "@/types/quiz";
import { useAuth } from "@/lib/auth";
import { Schedule } from "@/components/Schedule";
import PDFViewer from "@/components/PDFViewer";
import MinimalPDFViewer from "@/components/MinimalPDFViewer";
import ReactPDFViewer from "@/components/ReactPDFViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  Brain,
  Calendar,
  Play,
  Clock,
  Target,
  BookMarked,
  FileQuestion,
  Plus,
  Loader2
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import toast from "react-hot-toast";

// Quiz Section Component
function QuizzesSection({
  courseId,
  quizzes,
  loading,
  onGenerateQuiz,
  generatingQuiz
}: {
  courseId: string;
  quizzes: Quiz[];
  loading: boolean;
  onGenerateQuiz: () => Promise<void>;
  generatingQuiz: boolean;
}) {
  if (loading && quizzes.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm border border-gray-100 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="bg-gray-200 dark:bg-gray-700 h-5 w-32 rounded mb-2" />
                <div className="bg-gray-200 dark:bg-gray-700 h-4 w-48 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (quizzes.length === 0) {
    return (
      <Card className="shadow-sm border border-gray-100 dark:border-gray-700 text-center py-12">
        <CardContent>
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
            <FileQuestion className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No quizzes yet</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-6">Generate your first quiz to test your knowledge</p>
          <Button
            onClick={onGenerateQuiz}
            disabled={generatingQuiz}
            className="bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 cursor-pointer"
          >
            {generatingQuiz ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Quiz...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Generate Quiz
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quiz List */}
      {quizzes.map((quiz) => (
        <Card key={quiz.id} className="shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    {quiz.syllabus_item_title ? `Quiz - ${quiz.syllabus_item_title}` : `Quiz #${quiz.id}`}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mb-3">
                    <div className="flex items-center gap-1">
                      <span>{quiz.num_questions} questions</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>Created {new Date(quiz.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Ready to take
                  </Badge>
                </div>
              </div>
              <div className="ml-6 flex-shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/courses/${courseId}/quizzes/${quiz.id}`} className="flex items-center gap-2">
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
  );
}

export default function CourseDetailPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [course, setCourse] = useState<CourseWithSyllabus | null>(null);
  const [readings, setReadings] = useState<Array<{ id: number; order_index: number; title: string; start_page: number; end_page: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'pdf' | 'quizzes' | 'minimal'>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'quizzes' || tab === 'pdf' || tab === 'minimal') {
      return tab;
    }
    return 'overview';
  });
  const [pdfStartPage, setPdfStartPage] = useState<number>(1);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatingQuizForItem, setGeneratingQuizForItem] = useState<number | null>(null);

  // Debug scroll monitoring
  useEffect(() => {
    let debugCounter = 0;
    const logScroll = (event: string, target?: any) => {
      console.log(`[COURSE DEBUG ${++debugCounter}] ${event}`, {
        windowScrollY: window.scrollY,
        documentScrollY: document.documentElement.scrollTop,
        activeTab,
        target: target?.tagName || 'unknown',
        timestamp: Date.now()
      });
    };

    const scrollHandler = () => logScroll("Scroll event");
    const focusHandler = (e: FocusEvent) => logScroll("Focus event", e.target);

    window.addEventListener('scroll', scrollHandler);
    document.addEventListener('focus', focusHandler, true);

    return () => {
      window.removeEventListener('scroll', scrollHandler);
      document.removeEventListener('focus', focusHandler, true);
    };
  }, [activeTab]);

  useEffect(() => {
    if (!auth.token || !params?.id) return;
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const [cRes, pRes, rRes] = await Promise.all([
          fetch(`${base}/courses/${params.id}`, { headers, cache: "no-store" }),
          fetch(`${base}/courses/${params.id}/progress`, { headers, cache: "no-store" }),
          fetch(`${base}/courses/${params.id}/readings`, { headers, cache: "no-store" }),
        ]);
        if (!cRes.ok) throw new Error(`Failed ${cRes.status}`);
        if (!pRes.ok) throw new Error(`Failed ${pRes.status}`);
        if (!rRes.ok) throw new Error(`Failed ${rRes.status}`);
        setCourse((await cRes.json()) as CourseWithSyllabus);
        const prog = await pRes.json();
        setCompletedIds(prog.completed_item_ids as number[]);
        setReadings(await rRes.json());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [auth.token, params?.id]);

  async function toggle(itemId: number) {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    const r = await fetch(`${base}/courses/${params?.id}/progress/${itemId}/toggle`, { method: "POST", headers });
    if (!r.ok) return;
    const prog = await r.json();
    setCompletedIds(prog.completed_item_ids as number[]);
  }

  const fetchQuizzes = useCallback(async () => {
    if (!params?.id || !auth.token) return;
    try {
      setLoadingQuizzes(true);
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params.id}/quizzes`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        cache: "no-store",
      });
      if (!resp.ok) throw new Error("Failed to load quizzes");
      const list = (await resp.json()) as Quiz[];
      setQuizzes(list);
    } catch (e: unknown) {
      console.error("Failed to load quizzes", e);
    } finally {
      setLoadingQuizzes(false);
    }
  }, [params?.id, auth.token]);

  useEffect(() => {
    // Always fetch quizzes when the component mounts to show correct button states
    fetchQuizzes();
  }, [fetchQuizzes]);

  useEffect(() => {
    if (activeTab === 'quizzes') {
      fetchQuizzes();
    }
  }, [activeTab, fetchQuizzes]);

  const handleGenerateQuiz = useCallback(async () => {
    if (!params?.id) return;
    try {
      setGeneratingQuiz(true);
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${params.id}/quizzes/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!resp.ok) throw new Error("Failed to generate quiz");
      const created = (await resp.json()) as Quiz;
      toast.success("Quiz generated successfully!");
      // Redirect to the newly created quiz instead of staying on the quiz list
      router.push(`/courses/${params.id}/quizzes/${created.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate quiz");
      setGeneratingQuiz(false);
    }
  }, [params?.id, router]);

  if (!auth.token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-sm border border-gray-100 dark:border-gray-700">
          <CardHeader className="text-center">
            <CardTitle>Access Required</CardTitle>
            <CardDescription>Please login to view this course</CardDescription>
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

  const completedCount = course?.syllabus?.filter(item => completedIds.includes(item.id)).length || 0;
  const totalCount = course?.syllabus?.length || 0;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="mb-8">

          {!course && !error && (
            <div className="space-y-4 animate-pulse">
              <div className="bg-gray-200 dark:bg-gray-700 h-9 w-80 rounded-lg" />
              <div className="bg-gray-200 dark:bg-gray-700 h-5 w-48 rounded" />
              <div className="bg-gray-200 dark:bg-gray-700 h-24 w-full rounded-lg mt-6" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-gray-200 dark:bg-gray-700 h-64 rounded-lg" />
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
                  <div className="bg-gray-200 dark:bg-gray-700 h-48 rounded-lg" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <Card className="shadow-sm ring-1 ring-red-200 bg-red-50">
              <CardContent className="p-6">
                <p className="text-red-600">{error}</p>
              </CardContent>
            </Card>
          )}

          {course && (
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{course.title}</h1>
              <p className="text-gray-600 dark:text-gray-300 mb-6">{course.source_filename}</p>
            </div>
          )}
        </div>

        {/* Tabbed Navigation */}
        {course && (
          <Tabs value={activeTab} onValueChange={(v) => {
            console.log(`[COURSE DEBUG] Tab changing from ${activeTab} to ${v}`, {
              scrollYBefore: window.scrollY,
              timestamp: Date.now()
            });

            // Preserve scroll position when switching tabs
            const currentScrollY = window.scrollY;
            setActiveTab(v as 'overview' | 'pdf' | 'quizzes');

            // Prevent automatic scrolling after state update
            requestAnimationFrame(() => {
              if (window.scrollY !== currentScrollY) {
                window.scrollTo({ top: currentScrollY, behavior: 'instant' });
              }
            });

            setTimeout(() => {
              console.log(`[COURSE DEBUG] Tab changed - scroll position after`, {
                scrollYAfter: window.scrollY,
                newTab: v,
                timestamp: Date.now()
              });
            }, 100);
          }} className="mb-6">
            <TabsList className="grid w-fit grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2 cursor-pointer">
                <BookMarked className="w-4 h-4" />
                Course Overview
              </TabsTrigger>
              <TabsTrigger value="pdf" className="flex items-center gap-2 cursor-pointer">
                <FileText className="w-4 h-4" />
                PDF Reading
              </TabsTrigger>
              <TabsTrigger value="quizzes" className="flex items-center gap-2 cursor-pointer">
                <Brain className="w-4 h-4" />
                Quizzes
              </TabsTrigger>
            </TabsList>

            {/* Course Overview Tab */}
            <TabsContent value="overview" className="mt-6">
              {/* Progress Overview - Compact */}
              <Card className="shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Course Progress</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{completedCount} of {totalCount} topics completed</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">{Math.round(progressPercentage)}%</div>
                      <div className="text-xs text-gray-600 dark:text-gray-300">Complete</div>
                    </div>
                  </div>
                  <Progress value={progressPercentage} className="h-1.5" />
                </CardContent>
              </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {/* Syllabus Section */}
              <Card className="shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
                <CardHeader>
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 border border-gray-100 dark:border-gray-700">
                      <BookMarked className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Course Syllabus</CardTitle>
                      <CardDescription>
                        Track your progress through the course topics
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {course.syllabus.map((item, index) => {
                      const isCompleted = completedIds.includes(item.id);
                      // Use syllabus_item_id to avoid duplicates from multiple uploads
                      const relatedReadings = readings.filter(r => r.syllabus_item_id === item.id);

                      return (
                        <div key={item.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-500 transition-colors">
                          <div className="flex items-start gap-4">
                            <button
                              onClick={() => toggle(item.id)}
                              className="flex-shrink-0 mt-1"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                              ) : (
                                <Circle className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className={`font-semibold ${isCompleted ? 'text-green-900 dark:text-green-100' : 'text-gray-900 dark:text-white'}`}>
                                  {item.title}
                                </h4>
                                {isCompleted && (
                                  <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
                                    Completed
                                  </Badge>
                                )}
                              </div>

                              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                {item.summary}
                              </p>

                              {relatedReadings.length > 0 && (
                                <div className="space-y-2">
                                  {relatedReadings.map((reading) => (
                                    <div key={reading.id} className="flex items-center gap-2 text-sm">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setPdfStartPage(reading.start_page);
                                          setActiveTab('pdf');
                                        }}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <FileText className="w-4 h-4" />
                                        Read pages {reading.start_page}–{reading.end_page}
                                      </Button>

                                      {/* Quiz Button inline with Read Pages - only show for the last reading of this section */}
                                      {reading === relatedReadings[relatedReadings.length - 1] && (() => {
                                        const existingQuiz = quizzes.find(q => q.syllabus_item_id === item.id);
                                        return existingQuiz ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              router.push(`/courses/${params?.id}/quizzes/${existingQuiz.id}`);
                                            }}
                                            className="flex items-center gap-2 cursor-pointer"
                                          >
                                            <Play className="w-4 h-4" />
                                            Open Quiz
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={async () => {
                                              try {
                                                setGeneratingQuizForItem(item.id);
                                                const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                                                const token = localStorage.getItem("token");
                                                const headers = { Authorization: `Bearer ${token}` };
                                                const url = `${base}/courses/${params?.id}/quizzes/generate`;

                                                console.log("Generate Quiz Debug:", {
                                                  base,
                                                  courseId: params?.id,
                                                  url,
                                                  hasToken: !!token,
                                                  tokenLength: token?.length,
                                                  headers: { Authorization: `Bearer ${token?.substring(0, 10)}...` }
                                                });

                                                const resp = await fetch(url, {
                                                  method: "POST",
                                                  headers: { ...headers, "Content-Type": "application/json" },
                                                  body: JSON.stringify({ syllabus_item_id: item.id }),
                                                  cache: "no-store"
                                                });
                                                console.log("Generate Quiz Response:", { status: resp.status, ok: resp.ok, statusText: resp.statusText });

                                                if (!resp.ok) throw new Error(`Failed to generate quiz: ${resp.status} ${resp.statusText}`);
                                                const created = await resp.json();
                                                console.log("Quiz Created:", created);

                                                await fetchQuizzes(); // Refresh quiz list
                                                router.push(`/courses/${params?.id}/quizzes/${created.id}`);
                                                toast.success('Quiz generated successfully!');
                                              } catch (e) {
                                                console.error("Generate Quiz Error:", e);
                                                toast.error(`Failed to generate quiz: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                              } finally {
                                                setGeneratingQuizForItem(null);
                                              }
                                            }}
                                            disabled={generatingQuizForItem === item.id}
                                            className="flex items-center gap-2 cursor-pointer"
                                          >
                                            {generatingQuizForItem === item.id ? (
                                              <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Generating...
                                              </>
                                            ) : (
                                              <>
                                                <Brain className="w-4 h-4" />
                                                Generate Quiz
                                              </>
                                            )}
                                          </Button>
                                        );
                                      })()}

                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Show quiz button if no related readings exist */}
                              {relatedReadings.length === 0 && (() => {
                                const existingQuiz = quizzes.find(q => q.syllabus_item_id === item.id);
                                return (
                                  <div className="mt-2">
                                    {existingQuiz ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          router.push(`/courses/${params?.id}/quizzes/${existingQuiz.id}`);
                                        }}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <Play className="w-4 h-4" />
                                        Open Quiz
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                          try {
                                            setGeneratingQuizForItem(item.id);
                                            const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                                            const token = localStorage.getItem("token");
                                            const headers = { Authorization: `Bearer ${token}` };
                                            const url = `${base}/courses/${params?.id}/quizzes/generate`;

                                            console.log("Generate Quiz Debug:", {
                                              base,
                                              courseId: params?.id,
                                              url,
                                              hasToken: !!token,
                                              tokenLength: token?.length,
                                              headers: { Authorization: `Bearer ${token?.substring(0, 10)}...` }
                                            });

                                            const resp = await fetch(url, {
                                              method: "POST",
                                              headers: { ...headers, "Content-Type": "application/json" },
                                              body: JSON.stringify({ syllabus_item_id: item.id }),
                                              cache: "no-store"
                                            });
                                            console.log("Generate Quiz Response:", { status: resp.status, ok: resp.ok, statusText: resp.statusText });

                                            if (!resp.ok) throw new Error(`Failed to generate quiz: ${resp.status} ${resp.statusText}`);
                                            const created = await resp.json();
                                            console.log("Quiz Created:", created);

                                            await fetchQuizzes(); // Refresh quiz list
                                            router.push(`/courses/${params?.id}/quizzes/${created.id}`);
                                            toast.success('Quiz generated successfully!');
                                          } catch (e) {
                                            console.error("Generate Quiz Error:", e);
                                            toast.error(`Failed to generate quiz: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                          } finally {
                                            setGeneratingQuizForItem(null);
                                          }
                                        }}
                                        disabled={generatingQuizForItem === item.id}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        {generatingQuizForItem === item.id ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Generating...
                                          </>
                                        ) : (
                                          <>
                                            <Brain className="w-4 h-4" />
                                            Generate Quiz
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()}

                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Quick Actions */}
              <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start cursor-pointer"
                    onClick={() => setActiveTab('quizzes')}
                  >
                    <Brain className="w-4 h-4 mr-2" />
                    View All Quizzes
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/courses/${params?.id}/assignments`} className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      View Assignments
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Schedule Component */}
              <Card className="shadow-sm border border-gray-100 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Schedule courseId={params.id} />
                </CardContent>
              </Card>
            </div>
          </div>
            </TabsContent>

            {/* PDF Reading Tab */}
            <TabsContent value="pdf" className="mt-6">
              <div
                className="w-full"
                style={{
                  scrollMarginTop: '0px',
                  display: activeTab === 'pdf' ? 'block' : 'none'
                }}
              >
                {params?.id && (
                  <div style={{ scrollBehavior: 'auto' }}>
                    <MinimalPDFViewer
                      courseId={params.id}
                      startPage={pdfStartPage}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Quizzes Tab */}
            <TabsContent value="quizzes" className="mt-6">
              <QuizzesSection
                courseId={params?.id || ''}
                quizzes={quizzes}
                loading={loadingQuizzes}
                onGenerateQuiz={handleGenerateQuiz}
                generatingQuiz={generatingQuiz}
              />
            </TabsContent>

          </Tabs>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
