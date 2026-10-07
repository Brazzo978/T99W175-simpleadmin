"use client";

import { useEffect } from "react";

// The app lives under /dashboard/; its layout checks the session and sends
// a visitor without one to /login/.
export default function Home() {
  useEffect(() => {
    window.location.replace("/dashboard/");
  }, []);
  return <div className="bg-background min-h-svh" />;
}
