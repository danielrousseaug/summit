"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
  X,
  Plus,
  BookOpen,
  User,
  LogOut,
  Settings,
  Search,
  Users,
  Moon,
  Sun,
  PanelLeft,
  Sidebar,
  MoreHorizontal,
  Edit3,
  Trash2
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
  const [showExpandedButton, setShowExpandedButton] = useState(!isCollapsed);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredCourseId, setHoveredCourseId] = useState<number | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null);

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

  const handleToggleCollapse = () => {
    if (isCollapsed) {
      // Expanding: hide expanded button first, then show after delay
      setShowExpandedButton(false);
      setTimeout(() => {
        setShowExpandedButton(true);
      }, 100);
    } else {
      // Collapsing: show expanded button immediately
      setShowExpandedButton(true);
    }
    setIsCollapsed(!isCollapsed);
    setIsHovering(false);
  };

  const sidebarWidth = isCollapsed ? "w-16" : "w-64";

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <div className={`${sidebarWidth} ${
        isCollapsed
          ? 'bg-white dark:bg-gray-900'
          : 'bg-[#f9f9f9] dark:bg-gray-900'
      } border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 overflow-x-hidden`}>
        {/* Header */}
        <div className="px-4 py-4">
          <div className="flex items-center px-3 py-2 h-10 relative">
            <Link href="/" className="flex items-center h-full">
              <Image
                src={isDark ? "/images/logos/logo-icon-white.svg" : "/images/logos/logo-icon-black.svg"}
                alt="Summit"
                width={26}
                height={26}
                className="flex-shrink-0"
                style={{ marginLeft: '-6px' }}
              />
              <div className={`ml-3 flex items-center h-full transition-all duration-300 overflow-hidden ${
                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              }`}>
                <span className="text-lg font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                  Summit
                </span>
              </div>
            </Link>
            {!isCollapsed && showExpandedButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleCollapse}
                className="absolute p-1 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center transition-all duration-300"
                style={{ right: '-4px' }}
              >
                <PanelLeft className="w-4 h-4" />
              </Button>
            )}
            {isCollapsed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleCollapse}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                className="absolute p-1 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center transition-all duration-300"
                style={{ left: '3px', top: '50%', transform: 'translateY(-50%)' }}
              >
                <PanelLeft className={`w-4 h-4 transition-opacity duration-300 ${
                  isHovering ? 'opacity-100' : 'opacity-0'
                }`} />
              </Button>
            )}
          </div>
        </div>

{/* Navigation Buttons */}
<div className="px-4 pb-4 space-y-0">
  {/* New Course */}
  <button
    onClick={handleCreateCourse}
    className="w-full flex items-center px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-left cursor-pointer"
  >
    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      <Plus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
    </div>
    <span
      className={`ml-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-all duration-300 overflow-hidden ${
        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      }`}
    >
      New Course
    </span>
  </button>
  {/* Search Courses */}
  <button
    onClick={() => setSearchModalOpen(true)}
    className="w-full flex items-center px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-left cursor-pointer"
  >
    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      <Search className="w-4 h-4 text-gray-600 dark:text-gray-300" />
    </div>
    <span
      className={`ml-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-all duration-300 overflow-hidden ${
        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      }`}
    >
      Search Courses
    </span>
  </button>

  {/* Community Courses */}
  <Link
    href="/community"
    className="w-full flex items-center px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
  >
    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      <Users className="w-4 h-4 text-gray-600 dark:text-gray-300" />
    </div>
    <span
      className={`ml-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-all duration-300 overflow-hidden ${
        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      }`}
    >
      Community Courses
    </span>
  </Link>
</div>

        {/* Courses List */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden transition-all duration-300 ${
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
                  <div
                    key={course.id}
                    className="relative"
                    onMouseEnter={() => setHoveredCourseId(course.id)}
                    onMouseLeave={() => {
                      if (dropdownOpen !== course.id) {
                        setHoveredCourseId(null);
                      }
                    }}
                  >
                    <Link
                      href={`/courses/${course.id}`}
                      prefetch={true}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer ${
                        pathname === `/courses/${course.id}` ? "bg-gray-100 dark:bg-gray-800" : ""
                      }`}
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate whitespace-nowrap">
                        {course.title}
                      </span>
                    </Link>
                    {(hoveredCourseId === course.id || dropdownOpen === course.id) && (
                      <DropdownMenu
                        onOpenChange={(open) => {
                          if (open) {
                            setDropdownOpen(course.id);
                          } else {
                            setDropdownOpen(null);
                            setHoveredCourseId(null);
                          }
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-6 w-6 hover:bg-gray-200 dark:hover:bg-gray-700 opacity-100 transition-opacity cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <MoreHorizontal className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourse(course);
                              setRenameTitle(course.title);
                              setRenameModalOpen(true);
                            }}
                          >
                            <Edit3 className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourse(course);
                              setDeleteModalOpen(true);
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full p-2 h-12 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 rounded-lg transition-all duration-300 flex items-center relative cursor-pointer"
              >
                <Avatar className="w-8 h-8 absolute" style={{ left: '0px' }}>
                  <AvatarFallback className="bg-gray-900 text-white text-sm font-medium">
                    {getUserInitial()}
                  </AvatarFallback>
                </Avatar>
                <div className={`ml-12 flex-1 min-w-0 text-left transition-all duration-300 overflow-hidden ${
                  isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                }`}>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {auth.email?.split("@")[0]}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {auth.email}
                  </p>
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
          className="fixed inset-0 bg-black/20 dark:bg-black/70 backdrop-blur-sm flex items-start justify-center pt-16 z-50"
          onClick={() => setSearchModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 ring-1 ring-gray-200 dark:ring-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Search Courses</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchModalOpen(false)}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
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
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent text-sm"
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
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-b-0"
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
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                          <Search className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">No courses found for "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                )}

                {courses.length === 0 && (
                  <div className="px-4 py-8 text-center border border-gray-100 rounded-lg">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-3">
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

      {/* Rename Course Modal */}
      {renameModalOpen && selectedCourse && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setRenameModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 ring-1 ring-gray-200 dark:ring-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                    <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Rename Course</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenameModalOpen(false)}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Course Title
                  </label>
                  <input
                    type="text"
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent text-sm"
                    placeholder="Enter course title"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => setRenameModalOpen(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!selectedCourse || !renameTitle.trim()) return;
                      try {
                        await api.renameCourse(selectedCourse.id, renameTitle.trim());
                        // Update local state
                        setCourses(prev => prev.map(c =>
                          c.id === selectedCourse.id ? { ...c, title: renameTitle.trim() } : c
                        ));
                        // Update cache
                        const updatedCourses = courses.map(c =>
                          c.id === selectedCourse.id ? { ...c, title: renameTitle.trim() } : c
                        );
                        sessionStorage.setItem('summit_courses', JSON.stringify(updatedCourses));
                        setRenameModalOpen(false);
                      } catch (error) {
                        console.error('Failed to rename course:', error);
                      }
                    }}
                    className="flex-1 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900"
                    disabled={!renameTitle.trim()}
                  >
                    Rename
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Course Modal */}
      {deleteModalOpen && selectedCourse && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setDeleteModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 ring-1 ring-gray-200 dark:ring-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Course</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteModalOpen(false)}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Are you sure you want to delete this course? This action cannot be undone.
                  </p>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedCourse.title}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => setDeleteModalOpen(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!selectedCourse) return;
                      try {
                        await api.deleteCourse(selectedCourse.id);
                        // Update local state
                        setCourses(prev => prev.filter(c => c.id !== selectedCourse.id));
                        // Update cache
                        const updatedCourses = courses.filter(c => c.id !== selectedCourse.id);
                        sessionStorage.setItem('summit_courses', JSON.stringify(updatedCourses));
                        setDeleteModalOpen(false);
                        // Navigate away if we're currently viewing the deleted course
                        if (pathname === `/courses/${selectedCourse.id}`) {
                          router.push('/');
                        }
                      } catch (error) {
                        console.error('Failed to delete course:', error);
                      }
                    }}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete Course
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
