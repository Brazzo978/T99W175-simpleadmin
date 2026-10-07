'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface BreadcrumbItem {
  label: string;
  href: string;
  isCurrentPage: boolean;
}

// Every page, by full path, as the sidebar shows it: its group, then itself
// (and its parent page for nested ones). Keys live in the "sidebar"
// namespace, so breadcrumbs read like the sidebar and follow the language.
// A group crumb links to the group's first page: groups have no page.
interface Trail {
  group: string;
  groupHref: string;
  items: { key: string; href: string }[];
}

const CELLULAR = { group: 'groups.cellular', groupHref: '/cellular/signal' };
const SYSTEM = { group: 'groups.system', groupHref: '/system/monitoring' };

const TRAILS: Record<string, Trail> = {
  '/dashboard': { group: 'groups.dashboard', groupHref: '/dashboard', items: [{ key: 'items.home', href: '/dashboard' }] },
  '/cellular/signal': { ...CELLULAR, items: [{ key: 'items.signal_details', href: '/cellular/signal' }] },
  '/cellular/settings': { ...CELLULAR, items: [{ key: 'items.settings', href: '/cellular/settings' }] },
  '/cellular/band-locking': { ...CELLULAR, items: [{ key: 'items.band_locking', href: '/cellular/band-locking' }] },
  '/cellular/cell-locking': {
    ...CELLULAR,
    items: [
      { key: 'items.band_locking', href: '/cellular/band-locking' },
      { key: 'items.cell_locking', href: '/cellular/cell-locking' },
    ],
  },
  '/cellular/sms': { ...CELLULAR, items: [{ key: 'items.sms_center', href: '/cellular/sms' }] },
  '/cellular/esim': { ...CELLULAR, items: [{ key: 'items.esim', href: '/cellular/esim' }] },
  '/network/settings': {
    group: 'groups.local_network',
    groupHref: '/network/settings',
    items: [{ key: 'items.local_network_settings', href: '/network/settings' }],
  },
  '/system/monitoring': { ...SYSTEM, items: [{ key: 'items.connection_monitoring', href: '/system/monitoring' }] },
  '/system/tailscale': { ...SYSTEM, items: [{ key: 'items.tailscale', href: '/system/tailscale' }] },
  '/system/terminal': { ...SYSTEM, items: [{ key: 'items.at_terminal', href: '/system/terminal' }] },
  '/system/credentials': { ...SYSTEM, items: [{ key: 'items.credentials', href: '/system/credentials' }] },
  '/system/settings': { ...SYSTEM, items: [{ key: 'items.system_settings', href: '/system/settings' }] },
  '/about-device': {
    group: 'items.about_device',
    groupHref: '/about-device',
    items: [],
  },
};

export function useBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();
  const { t, i18n } = useTranslation('sidebar');

  return useMemo(() => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const trail = TRAILS[path];
    if (!trail) return [];
    const crumbs = [
      { label: t(trail.group), href: trail.groupHref },
      ...trail.items.map((item) => ({ label: t(item.key), href: item.href })),
    ].filter((crumb, i, all) => i === 0 || crumb.label !== all[i - 1].label);
    return crumbs.map((crumb, i) => ({ ...crumb, isCurrentPage: i === crumbs.length - 1 }));
    // i18n.language is in deps so labels re-render on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, t, i18n.language]);
}
