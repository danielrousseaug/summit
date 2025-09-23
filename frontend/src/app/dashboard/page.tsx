"use client";

import Link from "next/link";
import { Plus, BookOpen, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { auth } = useAuth();

  if (!auth.token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-gray-900">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Access Required</CardTitle>
            <CardDescription>Please login to view your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/auth">Login / Register</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Main Content */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto mb-6">
              <Sparkles className="w-8 h-8 text-gray-700 dark:text-gray-300" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Create Your Next Course
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
              Upload any textbook or document and transform it into an interactive AI-powered learning experience
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer shadow-sm border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600">
              <Link href="/courses">
                <CardContent className="p-8 text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-900 group-hover:text-white mx-auto mb-4 transition-colors">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Upload New Textbook
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Start with a PDF or text file and let AI create personalized lessons, quizzes, and study schedules
                  </p>
                </CardContent>
              </Link>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer shadow-sm border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600">
              <Link href="/courses">
                <CardContent className="p-8 text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-900 group-hover:text-white mx-auto mb-4 transition-colors">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Browse Templates
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Explore pre-built course structures and examples to get started quickly
                  </p>
                </CardContent>
              </Link>
            </Card>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}