"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { auth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.token) {
      // User is logged in, redirect to dashboard
      router.replace("/dashboard");
    } else {
      // User is not logged in, redirect to auth
      router.replace("/auth");
    }
  }, [auth.token, router]);

  // Show nothing while redirecting
  return null;
}