"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User,
  Clock,
  Calendar,
  BookOpen,
  Settings,
  Save
} from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function ProfilePage() {
  const { auth } = useAuth();
  const [weeklyHours, setWeeklyHours] = useState(5);
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [depth, setDepth] = useState("overview");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token) return;
    (async () => {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/profile/me`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        cache: "no-store",
      });
      if (!resp.ok) return;
      const p = await resp.json();
      setWeeklyHours(p.weekly_hours);
      setDurationWeeks(p.duration_weeks);
      setDepth(p.depth);
    })();
  }, [auth.token]);

  async function save() {
    setMsg(null);
    try {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/profile/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ weekly_hours: weeklyHours, duration_weeks: durationWeeks, depth }),
      });
      if (!resp.ok) throw new Error("Failed to save profile");
      setMsg("Settings saved successfully!");
      toast.success("Profile updated successfully!");
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Failed to save profile";
      setMsg(errorMsg);
      toast.error(errorMsg);
    }
  }

  if (!auth.token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-sm border border-gray-100">
          <CardHeader className="text-center">
            <CardTitle>Access Required</CardTitle>
            <CardDescription>Please login to edit your profile</CardDescription>
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
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Header Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Learning Profile</h1>
            <p className="text-gray-600 dark:text-gray-300">Customize your learning preferences and schedule</p>
          </div>

        {/* Profile Card */}
        <Card className="shadow-sm border border-gray-100 mb-8">
          <CardHeader>
            <div className="flex items-start space-x-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-100">
                <User className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <CardTitle className="text-lg">Account Information</CardTitle>
                <CardDescription>
                  Signed in as {auth.email}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Settings Card */}
        <Card className="shadow-sm border border-gray-100">
          <CardHeader>
            <div className="flex items-start space-x-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-100">
                <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <CardTitle className="text-lg">Learning Preferences</CardTitle>
                <CardDescription>
                  Set your study schedule and learning depth
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Weekly Hours */}
            <div className="space-y-2">
              <Label htmlFor="weekly-hours" className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Weekly Study Hours
              </Label>
              <Input
                id="weekly-hours"
                type="number"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(parseInt(e.target.value || "0"))}
                className="transition-all focus:ring-2 focus:ring-gray-400"
                min="1"
                max="40"
              />
              <p className="text-xs text-gray-600 dark:text-gray-300">
                How many hours per week you plan to study
              </p>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label htmlFor="duration" className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Course Duration (weeks)
              </Label>
              <Input
                id="duration"
                type="number"
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(parseInt(e.target.value || "0"))}
                className="transition-all focus:ring-2 focus:ring-gray-400"
                min="1"
                max="52"
              />
              <p className="text-xs text-gray-600 dark:text-gray-300">
                How long you want each course to take
              </p>
            </div>

            {/* Learning Depth */}
            <div className="space-y-2">
              <Label htmlFor="depth" className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Learning Depth
              </Label>
              <Select value={depth} onValueChange={setDepth}>
                <SelectTrigger className="w-full transition-all focus:ring-2 focus:ring-gray-400">
                  <SelectValue placeholder="Select learning depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Overview</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">Broad understanding of key concepts</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="in-depth">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">In-depth</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300">Detailed exploration with deeper analysis</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Choose how deeply you want to explore topics
              </p>
            </div>

            {/* Save Button */}
            <div className="pt-4">
              <Button
                onClick={save}
                className="w-full bg-gray-900 hover:bg-gray-800"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>

            {/* Status Message */}
            {msg && (
              <div className={`p-3 rounded-lg text-sm ${
                msg.includes('success') || msg === 'Saved'
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {msg}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
}
