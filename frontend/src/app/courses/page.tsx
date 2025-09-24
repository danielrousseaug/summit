"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Course } from "@/types/course";
import { useAuth } from "@/lib/auth";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { CourseCreationProgress } from "@/components/CourseCreationProgress";

export default function CoursesPage() {
  const { auth } = useAuth();
  const router = useRouter();

  if (!auth.token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-sm border border-gray-100">
          <CardHeader className="text-center">
            <CardTitle>Access Required</CardTitle>
            <CardDescription>Please login to view your courses</CardDescription>
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

  const handleCourseUploaded = (course: Course) => {
    // Clear the course cache to force refresh in AppLayout sidebar
    sessionStorage.removeItem('summit_courses');

    // Navigate to the new course page
    router.push(`/courses/${course.id}`);
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Header Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Course Management
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Upload textbooks and create AI-powered learning experiences
            </p>
          </div>

          {/* Upload Section */}
          <div className="mb-8">
            <Card className="shadow-sm border border-gray-100">
              <CardHeader>
                <div className="flex items-start space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 ring-1 ring-gray-200">
                    <Upload className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Create New Course</CardTitle>
                    <CardDescription>
                      Upload a textbook (.txt or .pdf) to generate personalized learning content
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <UploadForm onUploaded={handleCourseUploaded} />
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}

function UploadForm({ onUploaded }: { onUploaded: (c: Course) => void }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [topics, setTopics] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Progress modal state
  const [showProgress, setShowProgress] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState<{ id: number; title: string } | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!file) { setLoading(false); return; }
      const created = await api.uploadCourse(file, title || file.name, topics || undefined);

      // Show progress modal
      setCreatingCourse({ id: created.id, title: created.title });
      setShowProgress(true);
      setLoading(false);

      // Clear form
      setTitle("");
      setFile(null);
      setTopics("");
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload";
      setError(errorMessage);
      toast.error(errorMessage);
      setLoading(false);
    }
  }

  const handleComplete = () => {
    setShowProgress(false);
    setCreatingCourse(null);
    setIsMinimized(false);
    if (creatingCourse) {
      toast.success("Course created successfully! Redirecting...");
      setTimeout(() => {
        // Clear the course cache to force refresh
        sessionStorage.removeItem('summit_courses');
        onUploaded({ id: creatingCourse.id, title: creatingCourse.title } as Course);
      }, 500);
    }
  };

  const handleMinimize = () => {
    setShowProgress(false);
    setIsMinimized(true);
    toast.success("Course creation continues in background", { duration: 2000 });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-sm font-semibold text-gray-900 dark:text-white">
            Course Title
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter course title"
            className="transition-all focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="file" className="text-sm font-semibold text-gray-900 dark:text-white">
            Upload File
          </Label>
          <div className="relative">
            <input
              id="file"
              type="file"
              accept=".txt,text/plain,.pdf,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              ref={fileInputRef}
            />
            <div className="flex items-center justify-center w-full h-10 px-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Upload className="w-4 h-4" />
                {file ? file.name : "Choose file (.txt or .pdf)"}
              </div>
            </div>
          </div>
          {file && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Selected: {file.name}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="topics" className="text-sm font-semibold text-gray-900 dark:text-white">
          Focus Topics/Goals <span className="text-gray-500 font-normal">(optional)</span>
        </Label>
        <textarea
          id="topics"
          rows={3}
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
          placeholder="e.g., Rings and fields; problem-solving focus"
          className="flex min-h-[80px] w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!file || loading}
          className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Uploading...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Create Course
            </div>
          )}
        </Button>
      </div>

      {/* Minimized indicator */}
      {isMinimized && creatingCourse && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-medium">Creating: {creatingCourse.title}</p>
            <p className="text-xs opacity-90">Processing in background...</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowProgress(true);
              setIsMinimized(false);
            }}
            className="text-white hover:bg-blue-700"
          >
            Show
          </Button>
        </div>
      )}

      {/* Progress modal */}
      {showProgress && creatingCourse && (
        <CourseCreationProgress
          courseId={creatingCourse.id}
          courseName={creatingCourse.title}
          onComplete={handleComplete}
          onMinimize={handleMinimize}
        />
      )}
    </form>
  );
}
