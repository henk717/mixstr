import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Bell,
  Mail,
  Search,
  User,
  Settings,
  Plus,
  Menu,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  LogOut,
  UserPlus,
  ChevronDown,
  Wifi,
} from 'lucide-react';
import { useRelayMonitor } from '@/hooks/useRelayMonitor';
import { RelayMonitorDialog } from '@/components/RelayMonitorDialog';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useMixstr } from '@/hooks/useMixstr';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { ListIcon } from './ListIcon';
import { EditListDialog } from './EditListDialog';
import AuthDialog from '@/components/auth/AuthDialog';
import type { SidebarList } from '@/lib/sidebarLists';
import { createListId, listTimestamp } from '@/lib/sidebarLists';
import { nip19 } from 'nostr-tools';
import { EmojifiedText } from '@/components/CustomEmoji';

// The static navigation items always present at the top
const STATIC_NAV = [
  { icon: <Home size={18} />, label: 'Home', to: '/', exact: true },
  { icon: <Search size={18} />, label: 'Explore', to: '/explore' },
  { icon: <Bell size={18} />, label: 'Notifications', to: '/notifications', notif: true },
  { icon: <Mail size={18} />, label: 'Messages', to: '/messages' },
];

export function LeftSidebar() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <button
          className="fixed top-4 left-4 z-50 p-2 rounded-full bg-card border border-border text-foreground shadow-lg"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="relative w-72 bg-background border-r border-border h-full overflow-y-auto">
              <button
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
      </>
    );
  }

  return (
    <aside className="sticky top-0 h-screen w-64 xl:w-72 flex-shrink-0 border-r border-border bg-background overflow-y-auto flex flex-col">
      <SidebarContent />
    </aside>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const unreadCount = useUnreadNotificationCount();
  const { sidebarLists, addSidebarList, updateSidebarList, removeSidebarList } = useMixstr();
  const { currentUser, otherUsers, isLoading: accountsLoading, setLogin, removeLogin } = useLoggedInAccounts();
  const [editDialog, setEditDialog] = useState<{ open: boolean; list?: SidebarList }>({ open: false });
  const [authOpen, setAuthOpen] = useState(false);
  const [relayMonitorOpen, setRelayMonitorOpen] = useState(false);
  const { connectedCount, totalCount } = useRelayMonitor();

  const npub = user ? nip19.npubEncode(user.pubkey) : null;

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  const navItemClass = (active: boolean) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 text-sm w-full text-left group',
      active
        ? 'text-primary bg-primary/10'
        : 'text-foreground hover:bg-accent hover:text-primary',
    );

  return (
    <div className="flex flex-col h-full p-3 gap-0.5">
      {/* Logo */}
      <Link
        to="/"
        className="flex items-center gap-2.5 px-3 py-4 mb-1"
        onClick={onNavigate}
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/30">
          <span className="text-primary-foreground font-black text-sm">M</span>
        </div>
        <span className="font-black text-xl tracking-tight text-foreground">
          Mix<span className="text-primary">str</span>
        </span>
      </Link>

      {/* Static nav */}
{STATIC_NAV.map((item) => (
         <Link
           key={item.to}
           to={item.to}
           onClick={onNavigate}
           className={navItemClass(isActive(item.to, item.exact))}
         >
           <span className="relative flex-shrink-0 w-5 flex items-center justify-center">
             {item.icon}
             {item.notif && unreadCount > 0 && (
               <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center bg-primary text-primary-foreground text-[9px] font-bold rounded-full px-0.5">
                 {unreadCount > 99 ? '99+' : unreadCount}
               </span>
             )}
           </span>
           {item.label}
         </Link>
       ))}

      {/* Profile if logged in */}
      {user && npub && (
        <Link
          to={`/${npub}`}
          onClick={onNavigate}
          className={navItemClass(isActive(`/${npub}`))}
        >
          <span className="w-5 flex items-center justify-center flex-shrink-0">
            <User size={18} />
          </span>
          Profile
        </Link>
      )}

      {/* Separator */}
      <div className="border-t border-border my-2" />

      {/* User-configurable list entries — same font/size as static items */}
      {sidebarLists.map((list) => {
        const listPath = `/list/${list.id}`;
        const active = isActive(listPath);
        return (
          <div key={list.id} className="flex items-center group/item">
            <Link
              to={listPath}
              onClick={onNavigate}
              className={cn(navItemClass(active), 'flex-1 min-w-0')}
            >
              <span className="w-5 flex items-center justify-center flex-shrink-0">
                <ListIcon icon={list.icon} size={17} className={active ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'} />
              </span>
              <span className="truncate">{list.label}</span>
            </Link>

            {/* Edit/delete menu — only visible on hover */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover/item:opacity-100 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all flex-shrink-0 mr-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border w-36">
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => setEditDialog({ open: true, list })}
                >
                  <Pencil size={13} />
                  Edit list
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => removeSidebarList(list.id)}
                >
                  <Trash2 size={13} />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      {/* Add list button */}
      <button
        onClick={() => setEditDialog({ open: true, list: undefined })}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-primary hover:bg-accent transition-all duration-150 w-full text-left"
      >
        <span className="w-5 flex items-center justify-center flex-shrink-0">
          <Plus size={17} />
        </span>
        Add a list
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <Link
        to="/settings"
        onClick={onNavigate}
        className={navItemClass(isActive('/settings'))}
      >
        <span className="w-5 flex items-center justify-center flex-shrink-0">
          <Settings size={18} />
        </span>
        Settings
      </Link>

      {/* User profile card / login */}
      <div className="mt-1 mb-1">
        {user && currentUser ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-left group">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarImage src={metadata?.picture} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                    {accountsLoading && !metadata?.name ? (
                      <Skeleton className="w-full h-full rounded-full" />
                    ) : (
                      (metadata?.display_name ?? metadata?.name ?? 'U')[0].toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>
                 <div className="min-w-0 flex-1">
                   {accountsLoading && !metadata?.name ? (
                     <div className="space-y-1">
                       <Skeleton className="h-3 w-24" />
                       <Skeleton className="h-3 w-16" />
                     </div>
                   ) : (
                     <>
                       <p className="text-sm font-semibold truncate text-foreground leading-tight">
                         {currentUser.event ? (
                           <EmojifiedText tags={currentUser.event.tags}>{metadata?.display_name ?? metadata?.name ?? 'Anon'}</EmojifiedText>
                         ) : (
                           metadata?.display_name ?? metadata?.name ?? 'Anon'
                         )}
                       </p>
                       <p className="text-xs text-muted-foreground truncate leading-tight">
                         {metadata?.nip05 ?? user.pubkey.slice(0, 12) + '…'}
                       </p>
                     </>
                   )}
                 </div>
                <ChevronDown size={14} className="text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side="top"
              align="start"
              className="w-64 bg-popover border-border mb-1"
            >
               {/* Current account header */}
               <DropdownMenuLabel className="px-3 py-2 font-normal">
                 <div className="flex items-center gap-2.5">
                   <Avatar className="w-9 h-9 flex-shrink-0">
                     <AvatarImage src={metadata?.picture} />
                     <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                       {(metadata?.display_name ?? metadata?.name ?? 'U')[0].toUpperCase()}
                     </AvatarFallback>
                   </Avatar>
                   <div className="min-w-0">
                     <p className="text-sm font-semibold truncate text-foreground">
                       {currentUser.event ? (
                         <EmojifiedText tags={currentUser.event.tags}>{metadata?.display_name ?? metadata?.name ?? 'Anon'}</EmojifiedText>
                       ) : (
                         metadata?.display_name ?? metadata?.name ?? 'Anon'
                       )}
                     </p>
                     <p className="text-xs text-muted-foreground truncate">
                       {metadata?.nip05 ?? user.pubkey.slice(0, 10) + '…'}
                     </p>
                   </div>
                 </div>
               </DropdownMenuLabel>

              <DropdownMenuSeparator />

              {/* Other accounts */}
              {otherUsers.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground px-3 py-1 font-normal uppercase tracking-wide">
                    Switch account
                  </DropdownMenuLabel>
                   {otherUsers.map((acct) => {
                     const acctName = acct.metadata.display_name ?? acct.metadata.name ?? 'Anon';
                     return (
                       <DropdownMenuItem
                         key={acct.id}
                         onClick={() => { setLogin(acct.id); onNavigate?.(); }}
                         className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                       >
                         <Avatar className="w-7 h-7 flex-shrink-0">
                           <AvatarImage src={acct.metadata.picture} />
                           <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                             {acctName[0].toUpperCase()}
                           </AvatarFallback>
                         </Avatar>
                         <div className="min-w-0 flex-1">
                           <p className="text-sm truncate">
                             {acct.event ? (
                               <EmojifiedText tags={acct.event.tags}>{acctName}</EmojifiedText>
                             ) : (
                               acctName
                             )}
                           </p>
                           <p className="text-xs text-muted-foreground truncate">
                             {acct.metadata.nip05 ?? acct.pubkey.slice(0, 10) + '…'}
                           </p>
                         </div>
                       </DropdownMenuItem>
                     );
                   })}
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Profile link */}
              <DropdownMenuItem asChild className="px-3 py-2 cursor-pointer gap-2.5">
                <Link to={`/${nip19.npubEncode(user.pubkey)}`} onClick={onNavigate}>
                  <User size={15} className="text-muted-foreground" />
                  View profile
                </Link>
              </DropdownMenuItem>

              {/* Add account */}
              <DropdownMenuItem
                onClick={() => { setAuthOpen(true); onNavigate?.(); }}
                className="px-3 py-2 cursor-pointer gap-2.5"
              >
                <UserPlus size={15} className="text-muted-foreground" />
                Add another account
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Log out current */}
              <DropdownMenuItem
                onClick={() => removeLogin(currentUser.id)}
                className="px-3 py-2 cursor-pointer gap-2.5 text-destructive focus:text-destructive"
              >
                <LogOut size={15} />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="px-1">
            <LoginArea className="w-full" />
          </div>
        )}
      </div>

      {/* Relay indicator + Shakespeare credit */}
      <div className="pb-1 flex items-center justify-between px-1">
        {/* Relay connection indicator */}
        <button
          onClick={() => setRelayMonitorOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors group"
          title={`${connectedCount} of ${totalCount} relays connected — click to monitor`}
        >
          <Wifi
            size={14}
            className={cn(
              'transition-colors flex-shrink-0',
              connectedCount > 0 ? 'text-green-500' : 'text-muted-foreground/50',
            )}
          />
          <span className={cn(
            'text-[10px] tabular-nums transition-colors',
            connectedCount > 0 ? 'text-muted-foreground/70 group-hover:text-foreground' : 'text-muted-foreground/40',
          )}>
            {connectedCount}/{totalCount}
          </span>
        </button>

        {/* Shakespeare credit */}
        <a
          href="https://shakespeare.diy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors pr-1"
        >
          Vibed with Shakespeare
        </a>
      </div>

      {/* Relay monitor dialog */}
      <RelayMonitorDialog
        open={relayMonitorOpen}
        onClose={() => setRelayMonitorOpen(false)}
      />

      {/* Edit/Add list dialog */}
      <EditListDialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false })}
        initial={editDialog.list}
        onSave={(list) => {
          if (editDialog.list) {
            updateSidebarList(list.id, list);
          } else {
            addSidebarList({ ...list, id: createListId(), createdAt: listTimestamp() });
          }
        }}
      />

      {/* Add / switch account dialog */}
      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
