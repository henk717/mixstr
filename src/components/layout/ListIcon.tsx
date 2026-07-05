import {
  Home,
  Hash,
  Zap,
  Users,
  Image,
  Music,
  Radio,
  Rss,
  Globe,
  Star,
  Heart,
  Bookmark,
  Newspaper,
  Gamepad2,
  FlaskConical,
  Flame,
  Building2,
  MessageSquare,
  Tv2,
} from 'lucide-react';
import type { SidebarListIcon } from '@/lib/sidebarLists';

interface ListIconProps {
  icon: SidebarListIcon;
  size?: number;
  className?: string;
}

export const ICON_MAP: Record<SidebarListIcon, React.ElementType> = {
  home: Home,
  hash: Hash,
  zap: Zap,
  users: Users,
  image: Image,
  music: Music,
  radio: Radio,
  rss: Rss,
  globe: Globe,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  newspaper: Newspaper,
  gamepad: Gamepad2,
  flask: FlaskConical,
  lightning: Flame,
  community: Building2,
  group: MessageSquare,
  live: Tv2,
};

export function ListIcon({ icon, size = 16, className }: ListIconProps) {
  const Icon = ICON_MAP[icon as SidebarListIcon] ?? Hash;
  return <Icon size={size} className={className} />;
}
