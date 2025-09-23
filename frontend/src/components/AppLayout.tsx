"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  Menu,
  X,
  Plus,
  BookOpen,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  Search,
  Users,
  Moon,
  Sun
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import type { Course } from "@/types/course";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { auth, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!auth.token) {
      setCourses([]);
      setLoading(false);
      // Clear cache when no token
      sessionStorage.removeItem('summit_courses');
      sessionStorage.removeItem('summit_user_id');
      return;
    }

    // Check if user has changed by comparing user email/token
    const currentUserId = auth.email || auth.token;
    const cachedUserId = sessionStorage.getItem('summit_user_id');

    // If user has changed, clear the old cache
    if (cachedUserId && cachedUserId !== currentUserId) {
      sessionStorage.removeItem('summit_courses');
      sessionStorage.removeItem('summit_user_id');
    }

    // Check if we already have courses cached for this user
    const cachedCourses = sessionStorage.getItem('summit_courses');
    if (cachedCourses && cachedUserId === currentUserId) {
      try {
        setCourses(JSON.parse(cachedCourses));
        setLoading(false);
        return;
      } catch (error) {
        // If cache is corrupted, continue with fresh fetch
      }
    }

    const fetchCourses = async () => {
      try {
        const courseList = await api.listCourses();
        setCourses(courseList);
        // Cache the courses and user ID for this session
        sessionStorage.setItem('summit_courses', JSON.stringify(courseList));
        sessionStorage.setItem('summit_user_id', currentUserId);
      } catch (error) {
        console.error("Failed to fetch courses:", error);
        setCourses([]); // Set empty array on error
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [auth.token, auth.email]);

  if (!auth.token) {
    return <>{children}</>;
  }

  const getUserInitial = () => {
    return auth.email?.charAt(0).toUpperCase() || "U";
  };

  const handleCreateCourse = () => {
    router.push("/courses");
  };

  const handleLogout = () => {
    // Clear course cache when logging out
    sessionStorage.removeItem('summit_courses');
    sessionStorage.removeItem('summit_user_id');
    logout();
  };

  const sidebarWidth = isCollapsed ? "w-16" : "w-64";

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className={`${sidebarWidth} bg-[#f9f9f9] dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          {!isCollapsed && (
            <Link href="/" className="flex items-center">
              <Image
                src={isDark ? "/images/logos/logo-icon-white.svg" : "/images/logos/logo-icon-black.svg"}
                alt="Summit"
                width={24}
                height={24}
                className="mr-2"
              />
              <span className="text-lg font-semibold text-gray-900 dark:text-white dark:text-white">Summit</span>
            </Link>
          )}
          <div
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            className="relative"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-gray-200 cursor-pointer"
            >
              {isCollapsed ? (
                isHovering ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <Image
                    src={isDark ? "/images/logos/logo-icon-white.svg" : "/images/logos/logo-icon-black.svg"}
                    alt="Summit"
                    width={22}
                    height={22}
                  />
                )
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* New Course Button */}
        <div className="p-4">
          <Button
            onClick={handleCreateCourse}
            variant="outline"
            className="w-full h-10 bg-white dark:bg-gray-800 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white dark:text-white flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer"
          >
<Plus
  className={`w-4 h-4 flex-shrink-0 ${
    isCollapsed ? "mr-[-0.5rem]" : ""
  }`}
/>
            <span className={`whitespace-nowrap transition-all duration-300 overflow-hidden ${
              isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            }`}>
              New Course
            </span>
          </Button>
        </div>

{/* Navigation Buttons */}
<div className="px-4 pb-4 space-y-0">
  {/* Search Courses */}
  <button
    onClick={() => setSearchModalOpen(true)}
    className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 dark:hover:bg-gray-700 text-left cursor-pointer ${
      isCollapsed ? "justify-center" : "justify-start gap-3"
    }`}
  >
    <Search
      className={`w-4 h-4 text-gray-600 dark:text-gray-300 flex-shrink-0 ${
        isCollapsed ? "ml-[0.12rem]" : ""
      }`}
    />
    <span
      className={`text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-all duration-300 overflow-hidden ${
        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      }`}
    >
      Search Courses
    </span>
  </button>

  {/* Community Courses */}
  <Link
    href="/community"
    className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 cursor-pointer ${
      isCollapsed ? "justify-center" : "justify-start gap-3"
    }`}
  >
    <Users
      className={`w-4 h-4 text-gray-600 dark:text-gray-300 flex-shrink-0 ${
        isCollapsed ? "ml-[0.12rem]" : ""
      }`}
    />
    <span
      className={`text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-all duration-300 overflow-hidden ${
        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      }`}
    >
      Community Courses
    </span>
  </Link>
</div>

        {/* Courses List */}
        <div className={`flex-1 overflow-y-auto transition-all duration-150 ${
          isCollapsed ? "opacity-0 max-h-0" : "opacity-100 max-h-full"
        }`}>
          <div className="px-4 pb-4">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 whitespace-nowrap">
              Your Courses
            </h3>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">No courses yet</p>
            ) : (
              <div className="space-y-0">
                {courses.map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    prefetch={true}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 cursor-pointer ${
                      pathname === `/courses/${course.id}` ? "bg-gray-100 dark:bg-gray-700" : ""
                    }`}
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate whitespace-nowrap">
                      {course.title}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`w-full p-2 h-12 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-300 ${
                  isCollapsed ? "justify-center" : "justify-start"
                }`}
              >
                <div className="flex items-center gap-3 w-full">

<Avatar
  className={`w-8 h-8 flex-shrink-0 ${
    isCollapsed ? "ml-[-0.5rem]" : ""
  }`}
>
  <AvatarFallback className="bg-gray-900 text-white text-sm font-medium">
    {getUserInitial()}
  </AvatarFallback>
</Avatar>

                  <div className={`flex-1 min-w-0 text-left transition-all duration-300 overflow-hidden ${
                    isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                  }`}>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {auth.email?.split("@")[0]}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {auth.email}
                    </p>
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme}>
                {isDark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                {isDark ? "Light Mode" : "Dark Mode"}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>

      {/* Search Modal */}
      {searchModalOpen && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm flex items-start justify-center pt-16 z-50"
          onClick={() => setSearchModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 ring-1 ring-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Search Courses</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchModalOpen(false)}
                  className="hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type to search your courses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent text-sm"
                    autoFocus
                  />
                </div>

                {courses.length > 0 && (
                  <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
                    {courses
                      .filter(course =>
                        searchQuery === "" || course.title.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .slice(0, 8) // Limit to 8 results
                      .map(course => (
                        <Link
                          key={course.id}
                          href={`/courses/${course.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-b-0"
                          onClick={() => {
                            setSearchModalOpen(false);
                            setSearchQuery("");
                          }}
                        >
                          <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                          <span className="text-sm text-gray-900 dark:text-white truncate">{course.title}</span>
                        </Link>
                      ))
                    }

                    {searchQuery && courses.filter(course =>
                      course.title.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-8 text-center">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                          <Search className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">No courses found for "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                )}

                {courses.length === 0 && (
                  <div className="px-4 py-8 text-center border border-gray-100 rounded-lg">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Search className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">No courses available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
