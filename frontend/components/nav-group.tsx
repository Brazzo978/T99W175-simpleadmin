"use client"

import * as React from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export type NavSubItem = { t_key: string; url: string }

export type NavItem = {
  t_key: string
  url: string
  icon: LucideIcon
  items?: NavSubItem[]
}

// Forwards the props SidebarMenuButton/SubButton inject through asChild
// (className, data attributes) to the link.
function NavLink({
  item,
  ...props
}: { item: { url: string } } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return <Link href={item.url} {...props} />
}

export function NavGroup({
  groupKey,
  items,
}: {
  groupKey: string
  items: NavItem[]
}) {
  const { t } = useTranslation("sidebar")
  const rawPathname = usePathname()
  const pathname = rawPathname.endsWith('/') && rawPathname !== '/' ? rawPathname.slice(0, -1) : rawPathname
  const [openItems, setOpenItems] = React.useState<Record<string, boolean>>({})

  // Check if the current path matches the item or any of its declared sub-items.
  // Uses sub-item URLs instead of prefix matching to avoid false positives
  // (e.g., "/cellular" matching "/cellular/settings" which belongs to a different nav item).
  const isItemActive = React.useCallback((item: NavItem) => {
    if (pathname === item.url) return true
    if (item.items?.some((sub) => pathname === sub.url || pathname.startsWith(sub.url + "/"))) return true
    return false
  }, [pathname])

  React.useEffect(() => {
    const states: Record<string, boolean> = {}
    items.forEach((item) => {
      states[item.t_key] = isItemActive(item)
    })
    setOpenItems(states)
  }, [pathname, items, isItemActive])

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t(`groups.${groupKey}`)}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isParentOrChildActive = isItemActive(item)
          const label = t(`items.${item.t_key}`)

          return (
          <Collapsible
            key={item.t_key}
            asChild
            open={openItems[item.t_key] ?? false}
            onOpenChange={(isOpen) => setOpenItems((prev) => ({ ...prev, [item.t_key]: isOpen }))}
          >
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={label} isActive={isParentOrChildActive}>
                <NavLink item={item}>
                  <item.icon />
                  <span>{label}</span>
                </NavLink>
              </SidebarMenuButton>
              {item.items?.length ? (
                <>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRight />
                      <span className="sr-only">Toggle</span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => {
                        const isSubItemActive = pathname === subItem.url || pathname.startsWith(subItem.url + "/")
                        return (
                        <SidebarMenuSubItem key={subItem.t_key}>
                          <SidebarMenuSubButton asChild isActive={isSubItemActive}>
                            <NavLink item={subItem}>
                              <span>{t(`items.${subItem.t_key}`)}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )})}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        )})}
      </SidebarMenu>
    </SidebarGroup>
  )
}
