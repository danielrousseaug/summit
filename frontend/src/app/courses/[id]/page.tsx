"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CourseWithSyllabus } from "@/types/course";
import { useAuth } from "@/lib/auth";
import { Schedule } from "@/components/Schedule";
import PDFViewer from "@/components/PDFViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
  BookMarked
} from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function CourseDetailPage() {
  const { auth } = useAuth();
  const params = useParams<{ id: string }>();
  const [course, setCourse] = useState<CourseWithSyllabus | null>(null);
  const [readings, setReadings] = useState<Array<{ id: number; order_index: number; title: string; start_page: number; end_page: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [activeView, setActiveView] = useState<'course' | 'pdf'>('course');
  const [pdfStartPage, setPdfStartPage] = useState<number>(1);

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
              <div className="bg-gray-200 h-9 w-80 rounded-lg" />
              <div className="bg-gray-200 h-5 w-48 rounded" />
              <div className="bg-gray-200 h-24 w-full rounded-lg mt-6" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-gray-200 h-64 rounded-lg" />
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-200 h-32 rounded-lg" />
                  <div className="bg-gray-200 h-48 rounded-lg" />
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

              {/* Progress Overview */}
              <Card className="shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Course Progress</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{completedCount} of {totalCount} topics completed</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(progressPercentage)}%</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">Complete</div>
                    </div>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* View Toggle Controls */}
        {course && (
          <div className="mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant={activeView === 'course' ? 'default' : 'outline'}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveView('course');
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <BookMarked className="w-4 h-4" />
                Course Overview
              </Button>
              <Button
                variant={activeView === 'pdf' ? 'default' : 'outline'}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveView('pdf');
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                PDF Reading
              </Button>
            </div>
          </div>
        )}

        {/* Inline PDF Viewer */}
        {activeView === 'pdf' && course && params?.id && (
          <div className="mb-8">
            <PDFViewer
              courseId={params.id}
              startPage={pdfStartPage}
              endPage={1000} // Show entire PDF
              onClose={() => setActiveView('course')}
            />
          </div>
        )}

        {/* Course Content */}
        {activeView === 'course' && course && (
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
                      const relatedReadings = readings.filter(r => r.order_index === item.order_index);

                      return (
                        <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                          <div className="flex items-start gap-4">
                            <button
                              onClick={() => toggle(item.id)}
                              className="flex-shrink-0 mt-1"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : (
                                <Circle className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:text-gray-300" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{index + 1}</span>
                                <h4 className={`font-semibold ${isCompleted ? 'text-green-900' : 'text-gray-900 dark:text-white'}`}>
                                  {item.title}
                                </h4>
                                {isCompleted && (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">
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
                                          setActiveView('pdf');
                                        }}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <FileText className="w-4 h-4" />
                                        Read pages {reading.start_page}–{reading.end_page}
                                      </Button>

                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-gray-600 dark:text-gray-300 hover:text-gray-700 dark:text-gray-300 hover:bg-gray-50 cursor-pointer"
                                        onClick={async () => {
                                          try {
                                            const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                                            const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
                                            const rr = await fetch(`${base}/courses/readings/${reading.id}/quizzes/generate`, { method: "POST", headers });
                                            if (!rr.ok) throw new Error("Failed to generate quiz");
                                            const q = await rr.json();
                                            window.location.href = `/courses/${params?.id}/quizzes/${q.id}`;
                                          } catch (e) {
                                            console.error(e);
                                          }
                                        }}
                                      >
                                        <Brain className="w-4 h-4 mr-1" />
                                        Generate Quiz
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/courses/${params?.id}/quizzes`} className="flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      View All Quizzes
                    </Link>
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
        )}
        </div>
      </div>
    </AppLayout>
  );
}
