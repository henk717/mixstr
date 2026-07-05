import { useMemo, useRef, useState } from 'react';
import { useFollowingProfiles, type FollowingProfile } from '@/hooks/useFollowingProfiles';
import { encodeNpub, profileLabel } from '@/lib/mentions';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MentionTextareaProps extends React.ComponentProps<'textarea'> {}

function makeChangeEvent(value: string): React.ChangeEvent<HTMLTextAreaElement> {
  return { target: { value } } as React.ChangeEvent<HTMLTextAreaElement>;
}

export function MentionTextarea({
  value,
  onChange,
  className,
  ref,
  ...props
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { data: profiles = [], isLoading } = useFollowingProfiles();

  const text = String(value ?? '');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return profiles
      .filter((p) => {
        const label = profileLabel(p).toLowerCase();
        return label.includes(q) || p.pubkey.toLowerCase().startsWith(q);
      })
      .slice(0, 6);
  }, [profiles, query]);

  function computeMentionState() {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? 0;
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');

    if (lastAt === -1) {
      setOpen(false);
      return;
    }

    const prefix = before.slice(0, lastAt);
    if (prefix.length > 0 && !/\s/.test(prefix.slice(-1))) {
      setOpen(false);
      return;
    }

    const mentionQuery = before.slice(lastAt + 1);
    if (/\s/.test(mentionQuery)) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setQuery(mentionQuery);
    setSelectedIndex(0);
  }

  function insert(profile: FollowingProfile) {
    const el = textareaRef.current;
    if (!el) return;

    const cursor = el.selectionStart ?? 0;
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');
    if (lastAt === -1) return;

    const prefix = text.slice(0, lastAt);
    const suffix = text.slice(cursor);
    const reference = encodeNpub(profile.pubkey);
    const newValue = `${prefix}${reference} ${suffix}`;

    onChange?.(makeChangeEvent(newValue));
    setOpen(false);

    requestAnimationFrame(() => {
      el.focus();
      const pos = prefix.length + reference.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange?.(e);
    // Defer so the cursor has settled after the controlled update.
    requestAnimationFrame(computeMentionState);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insert(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleKeyUp() {
    computeMentionState();
  }

  function handleClick() {
    computeMentionState();
  }

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={(node) => {
          textareaRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
          }
        }}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        className={cn('resize-none', className)}
      />

      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-60 overflow-y-auto p-1">
          {isLoading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading profiles…</div>
          )}
          {filtered.map((profile, index) => {
            const label = profileLabel(profile);
            return (
              <button
                key={profile.pubkey}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(profile);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left',
                  index === selectedIndex && 'bg-accent text-accent-foreground',
                )}
              >
                <Avatar className="w-6 h-6 flex-shrink-0">
                  <AvatarImage src={profile.picture} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                    {label[0]?.toUpperCase() ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-medium">{label}</div>
                  {profile.nip05 && (
                    <div className="truncate text-xs text-muted-foreground">{profile.nip05}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
