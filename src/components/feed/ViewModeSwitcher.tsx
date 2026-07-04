import { AlignLeft, BookOpen, Grid, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedViewMode } from '@/contexts/MixstrContext';

interface ViewModeSwitcherProps {
  mode: FeedViewMode;
  onChange: (mode: FeedViewMode) => void;
}

const MODES: { value: FeedViewMode; icon: React.ReactNode; label: string }[] = [
  { value: 'short', icon: <AlignLeft size={16} />, label: 'Short' },
  { value: 'longform', icon: <BookOpen size={16} />, label: 'Long' },
  { value: 'media', icon: <Grid size={16} />, label: 'Media' },
  { value: 'audio', icon: <Music size={16} />, label: 'Audio' },
];

export function ViewModeSwitcher({ mode, onChange }: ViewModeSwitcherProps) {
  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
            mode === m.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
          title={m.label}
        >
          {m.icon}
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
