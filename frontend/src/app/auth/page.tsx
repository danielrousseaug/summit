"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Image from "next/image";
import { Eye, EyeOff, BookOpen, Brain, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = loginSchema.extend({
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

const features = [
  {
    icon: BookOpen,
    title: "AI Course Generation",
    description: "Upload any textbook and get instant personalized courses"
  },
  {
    icon: Brain,
    title: "Smart Quizzes",
    description: "Automatically generated questions with explanations"
  },
  {
    icon: TrendingUp,
    title: "Progress Tracking",
    description: "Visual analytics of your learning journey"
  },
  {
    icon: Users,
    title: "Personalized Learning",
    description: "Adaptive content based on your pace and goals"
  }
];

export default function AuthPage() {
  const { setAuth } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const isLogin = mode === "login";
  const formErrors = isLogin ? loginForm.formState.errors : registerForm.formState.errors;

  async function handleSubmit(data: LoginForm | RegisterForm) {
    setLoading(true);
    try {
      if (mode === "register") {
        await api.register(data.email, data.password);
        toast.success("Account created successfully!");
      }
      const { access_token } = await api.login(data.email, data.password);
      setAuth({ token: access_token, email: data.email });
      toast.success("Welcome to Summit!");
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    loginForm.reset();
    registerForm.reset();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="container mx-auto flex min-h-screen">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-8">
              <Image
                src="/images/logos/logo-full-black.svg"
                alt="Summit"
                width={160}
                height={64}
                className="mb-8"
              />
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Transform Any Textbook Into Your Personal AI Tutor
              </h1>
              <p className="text-lg text-gray-600">
                Summit uses advanced AI to create personalized learning experiences from your study materials.
              </p>
            </div>

            <div className="space-y-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="flex items-start space-x-4"
                >
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 ring-1 ring-gray-200">
                      <feature.icon className="w-5 h-5 text-gray-700" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-12 pt-8 border-t border-gray-200"
            >
              <p className="text-sm text-gray-500">
                Join thousands of learners who've transformed their study experience
              </p>
            </motion.div>
          </motion.div>
        </div>

        {/* Right Side - Authentication Form */}
        <div className="flex-1 flex items-center justify-center px-4 py-12 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-2xl border-0">
              <CardHeader className="space-y-1 text-center">
                <CardTitle className="text-2xl font-bold">
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "login"
                    ? "Enter your credentials to access your courses"
                    : "Start your AI-powered learning journey today"}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={(isLogin ? loginForm.handleSubmit : registerForm.handleSubmit)(handleSubmit)} className="space-y-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter your email"
                          {...(isLogin ? loginForm.register("email") : registerForm.register("email"))}
                          className="transition-all focus:ring-2 focus:ring-gray-400"
                        />
                        {formErrors.email && (
                          <p className="text-sm text-red-500">
                            {formErrors.email.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            {...(isLogin ? loginForm.register("password") : registerForm.register("password"))}
                            className="pr-10 transition-all focus:ring-2 focus:ring-gray-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        {formErrors.password && (
                          <p className="text-sm text-red-500">
                            {formErrors.password.message}
                          </p>
                        )}
                      </div>

                      {mode === "register" && (
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <div className="relative">
                            <Input
                              id="confirmPassword"
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="Confirm your password"
                              {...registerForm.register("confirmPassword")}
                              className="pr-10 transition-all focus:ring-2 focus:ring-gray-400"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          {registerForm.formState.errors.confirmPassword && (
                            <p className="text-sm text-red-500">
                              {registerForm.formState.errors.confirmPassword.message}
                            </p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-medium bg-gray-900 hover:bg-gray-800 transition-all duration-300"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Please wait...</span>
                      </div>
                    ) : (
                      mode === "login" ? "Sign In" : "Create Account"
                    )}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-500">Or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 text-base"
                    onClick={toggleMode}
                  >
                    {mode === "login" ? "Create new account" : "Sign in instead"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Mobile Features */}
            <div className="mt-8 lg:hidden">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Why choose Summit?
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {features.map((feature) => (
                  <div key={feature.title} className="flex items-center space-x-3 p-3 rounded-lg bg-white shadow-sm">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 ring-1 ring-gray-200">
                        <feature.icon className="w-4 h-4 text-gray-700" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        {feature.title}
                      </h4>
                      <p className="text-xs text-gray-600">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}