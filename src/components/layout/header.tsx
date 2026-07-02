"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, User, Settings, LogOut, Search } from "lucide-react";
import { useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useGlobalSearch, type SearchResult } from "@/hooks/use-global-search";
import { GlobalSearchDropdown } from "@/components/layout/global-search-dropdown";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Route label mapping for breadcrumbs. */
const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inspections: "Inspections",
  maintenance: "Maintenance",
  assets: "Assets",
  vendors: "Vendors",
  fuel: "Fuel",
  people: "People",
  profile: "Profile",
  settings: "Settings",
  edit: "Edit",
  "service-tasks": "Service Tasks",
  "service-programs": "Service Programs",
  "work-orders": "Work Orders",
  defects: "Defects",
  "purchase-orders": "Purchase Orders",
  inventory: "Inventory",
};

/** Singular form mapping for "Create New …" breadcrumbs. */
const SINGULAR_LABELS: Record<string, string> = {
  assets: "Asset",
  drivers: "Driver",
  vendors: "Vendor",
  roles: "Role",
  users: "User",
  teams: "Team",
  "service-tasks": "Service Task",
  "service-programs": "Service Program",
  inspections: "Inspection",
  inventory: "Inventory",
};

interface Breadcrumb {
  label: string;
  href: string;
  isLast: boolean;
}

function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Breadcrumb[] = [];

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Skip ObjectId-looking segments (24 hex chars), show label from context
    const isObjectId = /^[0-9a-f]{24}$/i.test(segment);

    let label: string;
    if (segment === "new" && i > 0) {
      const parentSegment = segments[i - 1];
      const singular =
        SINGULAR_LABELS[parentSegment] ||
        parentSegment.replace(/s$/, "").charAt(0).toUpperCase() +
          parentSegment.replace(/s$/, "").slice(1);
      label = `Create New ${singular}`;
    } else if (isObjectId) {
      label = "Details";
    } else {
      label =
        ROUTE_LABELS[segment] ||
        segment.charAt(0).toUpperCase() + segment.slice(1);
    }

    crumbs.push({
      label,
      href: currentPath,
      isLast: i === segments.length - 1,
    });
  }

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess } = useRoleAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    loading,
    isOpen,
    setIsOpen,
    activeIndex,
    setActiveIndex,
  } = useGlobalSearch(300);

  const breadcrumbs = buildBreadcrumbs(pathname);

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() ||
      "U"
    : "U";

  // Ctrl+K / Cmd+K to focus the search bar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsOpen]);

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setIsOpen(false);
      setQuery("");
      router.push(result.href);
    },
    [setIsOpen, setQuery, router],
  );

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) {
      if (e.key === "Escape") {
        inputRef.current?.blur();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(activeIndex + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelectResult(results[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <header className="flex h-14 items-center border-b border-border bg-card px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm flex-1 min-w-0">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {crumb.isLast ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Global Search */}
      <div className="flex-1 flex justify-center px-4 max-w-xl mx-auto">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (query.trim()) setIsOpen(true);
            }}
            className="pl-9 h-9 w-full bg-muted/50 border-transparent focus-visible:border-input focus-visible:bg-transparent"
          />
          {isOpen && (
            <GlobalSearchDropdown
              ref={dropdownRef}
              results={results}
              loading={loading}
              activeIndex={activeIndex}
              query={query}
              onSelect={handleSelectResult}
              onHover={setActiveIndex}
            />
          )}
        </div>
      </div>

      {/* Notifications + Profile */}
      <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt="Profile"
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {initials}
                </div>
              )}
              <span className="text-sm font-medium text-foreground hidden sm:inline-block max-w-[120px] truncate">
                {user?.firstName || user?.email || "User"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            {hasFullAccess && (
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "/api/auth/logout";
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
