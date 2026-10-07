"use client";

import * as React from "react";
import {
  ActivityIcon,
  CogIcon,
  CreditCardIcon,
  GlobeIcon,
  HomeIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  NetworkIcon,
  RadioTowerIcon,
  RouterIcon,
  Settings2Icon,
  SignalIcon,
  TerminalIcon,
} from "lucide-react";

import SimpleT99Icon from "@/public/simple-t99-icon.png";

import { NavGroup, type NavItem } from "@/components/nav-group";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Image from "next/image";
import Link from "next/link";

// t_key values are keys inside the "sidebar" namespace's "items" object; the
// nav components resolve them via t(`items.${t_key}`) under
// useTranslation("sidebar"). Labels never live in this file.
const navigation: { groupKey: string; items: NavItem[] }[] = [
  {
    groupKey: "dashboard",
    items: [{ t_key: "home", url: "/dashboard", icon: HomeIcon }],
  },
  {
    groupKey: "cellular",
    items: [
      { t_key: "signal_details", url: "/cellular/signal", icon: RadioTowerIcon },
      { t_key: "settings", url: "/cellular/settings", icon: Settings2Icon },
      {
        t_key: "band_locking",
        url: "/cellular/band-locking",
        icon: SignalIcon,
        items: [{ t_key: "cell_locking", url: "/cellular/cell-locking" }],
      },
      { t_key: "sms_center", url: "/cellular/sms", icon: MessageCircleIcon },
      { t_key: "esim", url: "/cellular/esim", icon: CreditCardIcon },
    ],
  },
  {
    groupKey: "local_network",
    items: [{ t_key: "local_network_settings", url: "/network/settings", icon: NetworkIcon }],
  },
  {
    groupKey: "system",
    items: [
      { t_key: "connection_monitoring", url: "/system/monitoring", icon: ActivityIcon },
      { t_key: "tailscale", url: "/system/tailscale", icon: GlobeIcon },
      { t_key: "at_terminal", url: "/system/terminal", icon: TerminalIcon },
      { t_key: "credentials", url: "/system/credentials", icon: KeyRoundIcon },
      { t_key: "system_settings", url: "/system/settings", icon: CogIcon },
    ],
  },
];

const navSecondary = [
  { t_key: "about_device", url: "/about-device", icon: RouterIcon },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Image
                    src={SimpleT99Icon}
                    alt="Simple T99 Logo"
                    className="size-full"
                    priority
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Simple T99</span>
                  <span className="truncate text-xs">Admin</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group) => (
          <NavGroup
            key={group.groupKey}
            groupKey={group.groupKey}
            items={group.items}
          />
        ))}
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: "Admin", avatar: SimpleT99Icon.src }} />
      </SidebarFooter>
    </Sidebar>
  );
}
