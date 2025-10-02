"use client";

import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Users, Clock } from "lucide-react";

export default function CommunityPage() {
  const { auth } = useAuth();

  if (!auth.token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-sm ring-1 ring-gray-200">
          <CardHeader className="text-center">
            <CardTitle>Access Required</CardTitle>
            <CardDescription>Please login to view community courses</CardDescription>
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

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto mb-6">
              <Users className="w-8 h-8 text-gray-700 dark:text-gray-300" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Community Courses
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
              Discover and share learning resources with the Summit community
            </p>

            <Card className="shadow-sm border border-gray-100 max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Feature Coming Soon
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  We're working hard to bring you community-shared courses and collaborative learning experiences.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}