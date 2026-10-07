"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import { BridgeStatus } from "@/components/bridge-status";
import { useBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useSession } from "@/hooks/use-auth";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { SessionContext } from "@/components/auth/session-context";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const breadcrumbs = useBreadcrumbs();
  const pathname = usePathname();
  const { state, session } = useSession();
  useAutoLogout(state === "authenticated");

  // Render nothing until the session is confirmed: no flash of the app for
  // a visitor who is about to be sent to the login page.
  if (state !== "authenticated") {
    return <div className="bg-background min-h-svh" />;
  }

  return (
    <SessionContext.Provider value={session}>
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((breadcrumb, index) => (
                  <React.Fragment key={breadcrumb.href}>
                    {index > 0 && (
                      <BreadcrumbSeparator className="hidden desktop:block" />
                    )}
                    <BreadcrumbItem
                      className={
                        breadcrumb.isCurrentPage ? "" : "hidden desktop:block"
                      }
                    >
                      {breadcrumb.isCurrentPage ? (
                        <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={breadcrumb.href}>
                          {breadcrumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto px-4">
            <BridgeStatus />
          </div>
        </header>
        <motion.div
          id="main-content"
          key={pathname}
          className="px-2 lg:px-6 py-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </SidebarInset>
    </SidebarProvider>
    </SessionContext.Provider>
  );
}
