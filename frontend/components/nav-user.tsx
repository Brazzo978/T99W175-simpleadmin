"use client";

import { useState } from "react";
import {
  ChevronsUpDown,
  Loader2,
  LogOut,
  Moon,
  Power,
  RefreshCw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { logout } from "@/hooks/use-auth";
import { useSessionInfo } from "@/components/auth/session-context";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { reconnectNetwork, rebootModem } from "@/lib/modem-actions";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    avatar: string;
  };
}) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation("common");
  const session = useSessionInfo();
  const displayName = session?.username || user.name;

  const [rebootDialogOpen, setRebootDialogOpen] = useState(false);
  const [reconnectDialogOpen, setReconnectDialogOpen] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // --- Reboot ---
  // rebootModem() resolves within a few seconds: an explicit refusal stays
  // here with the error, anything else opens the countdown page.
  const handleReboot = async (e: React.MouseEvent) => {
    e.preventDefault();
    setRebooting(true);
    const result = await rebootModem();
    if (!result.ok) {
      toast.error(result.message || "Reboot refused.");
      setRebooting(false);
      setRebootDialogOpen(false);
      return;
    }
    sessionStorage.setItem("qm_rebooting", "1");
    window.location.href = "/reboot/";
  };

  const handleReconnect = async (e: React.MouseEvent) => {
    e.preventDefault();
    setReconnecting(true);
    try {
      const result = await reconnectNetwork();
      if (result.ok) {
        toast.success("Network reconnect initiated. Connection may drop briefly.");
      } else {
        toast.error(result.message || "Reconnect failed.");
      }
    } catch {
      toast.error("Failed to send reconnect command.");
    } finally {
      setReconnecting(false);
      setReconnectDialogOpen(false);
    }
  };

  const initials =
    displayName
      .split(/[-_ ]+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ST";

  const identity = (
    <>
      <Avatar className="h-8 w-8 rounded-lg">
        <AvatarImage src={user.avatar} alt={displayName} />
        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{displayName}</span>
        {session?.role && (
          <span className="truncate text-xs text-muted-foreground">
            {session.role}
          </span>
        )}
      </div>
    </>
  );

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                {identity}
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  {identity}
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {t("language.label")}
              </DropdownMenuLabel>
              <div className="px-1 pb-1">
                <LanguageSwitcher />
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() =>
                    setTheme(theme === "dark" ? "light" : "dark")
                  }
                >
                  <Sun className="dark:hidden" />
                  <Moon className="hidden dark:block" />
                  Toggle Theme
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setReconnectDialogOpen(true)}
              >
                <RefreshCw />
                Reconnect Network
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setRebootDialogOpen(true)}
              >
                <Power />
                {t("actions.reboot_device")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const { success } = await logout();
                  if (!success) toast.error("Logout failed: the session is still active.");
                }}
              >
                <LogOut />
                {t("actions.log_out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <AlertDialog open={reconnectDialogOpen} onOpenChange={(open) => {
        if (!reconnecting) setReconnectDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconnect Network</AlertDialogTitle>
            <AlertDialogDescription>
              This will deregister from the network and reregister, forcing a fresh connection. Internet will drop briefly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reconnecting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reconnecting}
              onClick={handleReconnect}
            >
              {reconnecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Reconnecting...
                </>
              ) : (
                "Reconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rebootDialogOpen} onOpenChange={(open) => {
        if (!rebooting) setRebootDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reboot Device</AlertDialogTitle>
            <AlertDialogDescription aria-live="polite">
              {rebooting
                ? "Reboot command sent. You will be logged out shortly..."
                : "The device will restart and all network connections will drop until it comes back online."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rebooting}>
              Not Now
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={rebooting}
              onClick={handleReboot}
            >
              {rebooting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rebooting...
                </>
              ) : (
                "Reboot Now"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
