import { useState, useRef, useEffect } from 'react';
import { Wifi, Activity, Circle, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRelayMonitor } from '@/hooks/useRelayMonitor';
import type { RelayStatus, EventLogKind } from '@/lib/relayMonitor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: RelayStatus): string {
  switch (status) {
    case 'connected':    return 'bg-green-500';
    case 'connecting':   return 'bg-yellow-400';
    case 'disconnected': return 'bg-muted-foreground';
    case 'error':        return 'bg-red-500';
  }
}

function statusLabel(status: RelayStatus): string {
  switch (status) {
    case 'connected':    return 'Connected';
    case 'connecting':   return 'Connecting…';
    case 'disconnected': return 'Disconnected';
    case 'error':        return 'Error';
  }
}

function logKindColor(kind: EventLogKind): string {
  switch (kind) {
    case 'publish': return 'text-blue-400';
    case 'ok':      return 'text-green-400';
    case 'notice':  return 'text-yellow-400';
    case 'error':   return 'text-red-400';
    case 'auth':    return 'text-purple-400';
  }
}

function logKindLabel(kind: EventLogKind): string {
  switch (kind) {
    case 'publish': return 'PUB';
    case 'ok':      return 'OK';
    case 'notice':  return 'NOTE';
    case 'error':   return 'ERR';
    case 'auth':    return 'AUTH';
  }
}

function relayTypeLabel(type: 'pinned' | 'gossip'): string {
  switch (type) {
    case 'pinned':   return 'Pinned';
    case 'gossip':   return 'Gossip';
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function stripWss(url: string): string {
  return url.replace(/^wss?:\/\//, '');
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RelayMonitorDialogProps {
  open: boolean;
  onClose: () => void;
}

export function RelayMonitorDialog({ open, onClose }: RelayMonitorDialogProps) {
  const { relays, eventLog, connectedCount, totalCount } = useRelayMonitor();
  const [tab, setTab] = useState<'relays' | 'log'>('relays');

  // Auto-scroll log to top on new entries (log is newest-first)
  const logRef = useRef<HTMLDivElement>(null);

  // Keep cleared log entries tracked locally so user can clear the view
  const [clearedBefore, setClearedBefore] = useState<string | null>(null);
  const visibleLog = clearedBefore
    ? eventLog.filter(e => e.id > clearedBefore)
    : eventLog;

  useEffect(() => {
    if (tab === 'log' && logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [eventLog.length, tab]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full bg-card border-border p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-3 text-base">
            <Wifi size={18} className="text-primary" />
            Relay Monitor
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground font-normal">
                {connectedCount} / {totalCount} connected
              </span>
              {/* Live dot */}
              <span className={cn('w-2 h-2 rounded-full animate-pulse', connectedCount > 0 ? 'bg-green-500' : 'bg-muted-foreground')} />
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'relays' | 'log')} className="flex flex-col flex-1 min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-5 gap-1 h-10">
            <TabsTrigger
              value="relays"
              className="rounded-md text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Wifi size={13} className="mr-1.5" />
              Relays ({totalCount})
            </TabsTrigger>
            <TabsTrigger
              value="log"
              className="rounded-md text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Activity size={13} className="mr-1.5" />
              Event Log
              {visibleLog.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1 font-bold">
                  {visibleLog.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Relays Tab ── */}
          <TabsContent value="relays" className="flex-1 min-h-0 m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1 h-[420px]">
              <div className="px-3 py-2 space-y-1">
                {relays.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No relays connected yet. Content will load shortly.
                  </div>
                ) : (
                  relays.map((relay) => (
                    <div
                      key={relay.url}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors group"
                    >
                      {/* Status dot */}
                      <span className="relative flex-shrink-0">
                        <span className={cn('block w-2.5 h-2.5 rounded-full', statusColor(relay.status))} />
                        {relay.status === 'connected' && (
                          <span className={cn('absolute inset-0 rounded-full animate-ping opacity-40', statusColor(relay.status))} />
                        )}
                      </span>

                      {/* URL */}
                      <span className="flex-1 min-w-0 font-mono text-xs text-foreground truncate" title={relay.url}>
                        {stripWss(relay.url)}
                      </span>

                      {/* Type badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-1.5 h-4 font-medium flex-shrink-0',
                          relay.type === 'pinned' && 'border-primary/40 text-primary',
                          relay.type === 'gossip' && 'border-muted-foreground/40 text-muted-foreground',
                        )}
                      >
                        {relayTypeLabel(relay.type)}
                      </Badge>

                      {/* Events count */}
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 w-16 text-right tabular-nums">
                        {relay.eventsReceived > 0 ? `${relay.eventsReceived} ev` : ''}
                      </span>

                      {/* Status label */}
                      <span className={cn(
                        'text-[10px] flex-shrink-0 w-20 text-right',
                        relay.status === 'connected' ? 'text-green-400' :
                        relay.status === 'connecting' ? 'text-yellow-400' :
                        relay.status === 'error' ? 'text-red-400' :
                        'text-muted-foreground',
                      )}>
                        {statusLabel(relay.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Legend */}
            <div className="border-t border-border px-5 py-2.5 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Connected</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Connecting</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground" /> Offline</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Error</span>
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1"><Circle size={8} className="text-primary" /> Pinned</span>
                <span className="flex items-center gap-1"><Circle size={8} className="text-muted-foreground" /> Gossip</span>
              </span>
            </div>
          </TabsContent>

          {/* ── Event Log Tab ── */}
          <TabsContent value="log" className="flex-1 min-h-0 m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
              <span className="text-[10px] text-muted-foreground">
                Showing latest {visibleLog.length} entries (max {200})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                onClick={() => {
                  const last = eventLog[0];
                  if (last) setClearedBefore(last.id);
                }}
              >
                <Trash2 size={10} />
                Clear
              </Button>
            </div>

            <ScrollArea className="flex-1 h-[390px]">
              <div ref={logRef} className="px-3 py-2 space-y-0.5 font-mono text-[11px]">
                {visibleLog.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm font-sans">
                    No events yet. Publish a note or wait for relay activity.
                  </div>
                ) : (
                  visibleLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 py-1 px-2 rounded hover:bg-accent/30 transition-colors"
                    >
                      {/* Time */}
                      <span className="text-muted-foreground/60 flex-shrink-0 mt-0.5 text-[10px]">
                        {formatTime(entry.timestamp)}
                      </span>

                      {/* Kind badge */}
                      <span className={cn('flex-shrink-0 font-bold w-8 text-right mt-0.5', logKindColor(entry.kind))}>
                        {logKindLabel(entry.kind)}
                      </span>

                      {/* Relay */}
                      <span className="text-muted-foreground flex-shrink-0 max-w-[140px] truncate mt-0.5" title={entry.relay}>
                        <ChevronRight size={9} className="inline -mt-0.5" />
                        {stripWss(entry.relay)}
                      </span>

                      {/* Message */}
                      <span className="text-foreground/80 flex-1 min-w-0 break-all">
                        {entry.message}
                        {entry.detail && (
                          <span className="text-muted-foreground/60 ml-1">({entry.detail})</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
