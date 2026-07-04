import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Bell,
  Mail,
  Search,
  User,
  Settings,
  Hash,
  Radio,
  ChevronDown,
  ChevronRight,
  Plus,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications } from '@/hooks/useNotifications';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/useIsMobile';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  to: string;
  badge?: number;
  exact?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { icon: <Home size={22} />, label: 'Home', to: '/', exact: true },
  { icon: <Search size={22} />, label: 'Explore', to: '/explore' },
  { icon: <Bell size={22} />, label: 'Notifications', to: '/notifications' },
  { icon: <Mail size={22} />, label: 'Messages', to: '/messages' },
];

const EXAMPLE_HASHTAGS = [
  { tag: 'bitcoin', label: '#bitcoin' },
  { tag: 'nostr', label: '#nostr' },
  { tag: 'zaps', label: '#zaps' },
  { tag: 'art', label: '#art' },
];

const EXAMPLE_DVMS = [
  { id: 'trending', label: 'Trending Feed', icon: <Zap size={16} /> },
  { id: 'news', label: 'Nostr News', icon: <Radio size={16} /> },
];

export function LeftSidebar() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const { data: notifications } = useNotifications();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [hashtagsOpen, setHashtagsOpen] = useState(true);
  const [dvmsOpen, setDvmsOpen] = useState(true);

  const notifCount = notifications?.length ?? 0;

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  // Mobile: show hamburger button + slide-in drawer
  if (isMobile) {
    return (
      <>
        <button
          className="fixed top-4 left-4 z-50 p-2 rounded-full bg-card border border-border text-foreground"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <aside className="relative w-72 bg-background border-r border-border h-full overflow-y-auto">
              <button
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
              <SidebarContent
                user={user}
                metadata={metadata}
                notifCount={notifCount}
                isActive={isActive}
                hashtagsOpen={hashtagsOpen}
                setHashtagsOpen={setHashtagsOpen}
                dvmsOpen={dvmsOpen}
                setDvmsOpen={setDvmsOpen}
                onNavigate={() => setOpen(false)}
              />
            </aside>
          </div>
        )}
      </>
    );
  }

  return (
    <aside className="sticky top-0 h-screen w-64 xl:w-72 flex-shrink-0 border-r border-border bg-background overflow-y-auto flex flex-col">
      <SidebarContent
        user={user}
        metadata={metadata}
        notifCount={notifCount}
        isActive={isActive}
        hashtagsOpen={hashtagsOpen}
        setHashtagsOpen={setHashtagsOpen}
        dvmsOpen={dvmsOpen}
        setDvmsOpen={setDvmsOpen}
      />
    </aside>
  );
}

interface SidebarContentProps {
  user: ReturnType<typeof useCurrentUser>['user'];
  metadata: ReturnType<typeof useCurrentUser>['metadata'];
  notifCount: number;
  isActive: (to: string, exact?: boolean) => boolean;
  hashtagsOpen: boolean;
  setHashtagsOpen: (v: boolean) => void;
  dvmsOpen: boolean;
  setDvmsOpen: (v: boolean) => void;
  onNavigate?: () => void;
}

function SidebarContent({
  user,
  metadata,
  notifCount,
  isActive,
  hashtagsOpen,
  setHashtagsOpen,
  dvmsOpen,
  setDvmsOpen,
  onNavigate,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full p-4 gap-1">
      {/* Logo */}
      <Link
        to="/"
        className="flex items-center gap-2 px-3 py-4 mb-2"
        onClick={onNavigate}
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground font-black text-sm">M</span>
        </div>
        <span className="font-black text-xl tracking-tight text-foreground">
          Mix<span className="text-primary">str</span>
        </span>
      </Link>

      {/* Main nav items */}
      {MAIN_NAV.map((item) => (
        <NavLink
          key={item.to}
          item={item}
          active={isActive(item.to, item.exact)}
          badge={item.label === 'Notifications' ? notifCount : undefined}
          onClick={onNavigate}
        />
      ))}

      {/* Profile link if logged in */}
      {user && (
        <NavLink
          item={{
            icon: <User size={22} />,
            label: 'Profile',
            to: `/${user.pubkey}`,
          }}
          active={isActive(`/${user.pubkey}`)}
          onClick={onNavigate}
        />
      )}

      <div className="border-t border-border my-3" />

      {/* DVM Feeds */}
      <Collapsible open={dvmsOpen} onOpenChange={setDvmsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            DVM Feeds
          </span>
          {dvmsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-3 mt-1 space-y-0.5">
            {EXAMPLE_DVMS.map((dvm) => (
              <Link
                key={dvm.id}
                to={`/dvm/${dvm.id}`}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive(`/dvm/${dvm.id}`)
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <span className="text-primary">{dvm.icon}</span>
                {dvm.label}
              </Link>
            ))}
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-accent transition-colors w-full">
              <Plus size={14} />
              Add DVM Feed
            </button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Hashtag Lists */}
      <Collapsible open={hashtagsOpen} onOpenChange={setHashtagsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Hash size={16} className="text-primary" />
            Hashtags
          </span>
          {hashtagsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-3 mt-1 space-y-0.5">
            {EXAMPLE_HASHTAGS.map((ht) => (
              <Link
                key={ht.tag}
                to={`/t/${ht.tag}`}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive(`/t/${ht.tag}`)
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Hash size={13} className="text-primary/70" />
                {ht.tag}
              </Link>
            ))}
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-accent transition-colors w-full">
              <Plus size={14} />
              Add Hashtag
            </button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <Link
        to="/settings"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors',
          isActive('/settings')
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        )}
      >
        <Settings size={20} />
        <span className="text-sm font-medium">Settings</span>
      </Link>

      {/* User profile / login */}
      <div className="mt-2">
        {user ? (
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent transition-colors cursor-pointer">
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarImage src={metadata?.picture} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                {(metadata?.name ?? 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate text-foreground">
                {metadata?.display_name ?? metadata?.name ?? 'Anon'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {metadata?.nip05 ?? user.pubkey.slice(0, 12) + '…'}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-1">
            <LoginArea className="w-full" />
          </div>
        )}
      </div>

      {/* Shakespeare credit */}
      <div className="text-center pb-2 pt-1">
        <a
          href="https://shakespeare.diy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Vibed with Shakespeare
        </a>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={item.to}
          onClick={onClick}
          className={cn(
            'flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-all duration-150',
            active
              ? 'text-primary bg-primary/10'
              : 'text-foreground hover:bg-accent hover:text-primary',
          )}
        >
          <span className="relative flex-shrink-0">
            {item.icon}
            {badge != null && badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-0.5">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          <span className="text-sm">{item.label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="hidden" />
    </Tooltip>
  );
}
