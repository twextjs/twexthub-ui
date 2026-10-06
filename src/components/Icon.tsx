import React from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  Ban,
  Bell,
  Building2,
  Bookmark,
  Boxes,
  Braces,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Columns,
  Compass,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  FilePen,
  FileText,
  Flame,
  Gauge,
  GitCompareArrows,
  Home,
  Image,
  ImagePlus,
  Info,
  Key,
  Laptop,
  LayoutGrid,
  Link,
  List,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  SquarePen,
  Sun,
  Table,
  Tag,
  Terminal,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  User,
  UserPlus,
  Users,
  Webhook,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Icon names used across the app, mapped to Lucide glyphs below. The union is
 * what callers see; swapping what a name resolves to never touches them.
 */
export type IconName =
  | 'add'
  | 'business'
  | 'add_photo_alternate'
  | 'arrow_back'
  | 'arrow_forward'
  | 'arrow_outward'
  | 'block'
  | 'bookmark'
  | 'build'
  | 'calendar_today'
  | 'campaign'
  | 'cancel'
  | 'check'
  | 'check_circle'
  | 'chevron_left'
  | 'chevron_right'
  | 'close'
  | 'compare_arrows'
  | 'content_copy'
  | 'content_cut'
  | 'dark_mode'
  | 'data_object'
  | 'delete'
  | 'description'
  | 'dns'
  | 'done_all'
  | 'download'
  | 'draft'
  | 'edit'
  | 'edit_note'
  | 'error'
  | 'expand_more'
  | 'explore'
  | 'grid_view'
  | 'group'
  | 'gpp_maybe'
  | 'home'
  | 'image'
  | 'info'
  | 'inventory_2'
  | 'key'
  | 'laptop'
  | 'light_mode'
  | 'link'
  | 'local_fire_department'
  | 'lock'
  | 'login'
  | 'logout'
  | 'menu'
  | 'monitoring'
  | 'notifications'
  | 'open_in_new'
  | 'person'
  | 'person_add'
  | 'progress_activity'
  | 'refresh'
  | 'restart_alt'
  | 'save'
  | 'schedule'
  | 'search'
  | 'sell'
  | 'settings'
  | 'shield'
  | 'sort'
  | 'speed'
  | 'storage'
  | 'swap_horiz'
  | 'table_chart'
  | 'terminal'
  | 'trending_up'
  | 'tune'
  | 'upload'
  | 'verified_user'
  | 'view_column'
  | 'view_list'
  | 'visibility'
  | 'warning'
  | 'webhook';

const ICONS: Record<IconName, LucideIcon> = {
  add: Plus,
  business: Building2,
  add_photo_alternate: ImagePlus,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  arrow_outward: ArrowUpRight,
  block: Ban,
  bookmark: Bookmark,
  build: Wrench,
  calendar_today: CalendarDays,
  campaign: Megaphone,
  cancel: CircleX,
  check: Check,
  check_circle: CircleCheck,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  close: X,
  compare_arrows: GitCompareArrows,
  content_copy: Copy,
  content_cut: Scissors,
  dark_mode: Moon,
  data_object: Braces,
  delete: Trash2,
  description: FileText,
  dns: Server,
  done_all: CheckCheck,
  download: Download,
  draft: FilePen,
  edit: Pencil,
  edit_note: SquarePen,
  error: CircleAlert,
  expand_more: ChevronDown,
  explore: Compass,
  grid_view: LayoutGrid,
  group: Users,
  gpp_maybe: ShieldAlert,
  home: Home,
  image: Image,
  info: Info,
  inventory_2: Boxes,
  key: Key,
  laptop: Laptop,
  light_mode: Sun,
  link: Link,
  local_fire_department: Flame,
  lock: Lock,
  login: LogIn,
  logout: LogOut,
  menu: Menu,
  monitoring: Activity,
  notifications: Bell,
  open_in_new: ExternalLink,
  person: User,
  person_add: UserPlus,
  progress_activity: LoaderCircle,
  refresh: RefreshCw,
  restart_alt: RotateCcw,
  save: Save,
  schedule: Clock,
  search: Search,
  sell: Tag,
  settings: Settings,
  shield: Shield,
  sort: ArrowUpDown,
  speed: Gauge,
  storage: Database,
  swap_horiz: ArrowLeftRight,
  table_chart: Table,
  terminal: Terminal,
  trending_up: TrendingUp,
  tune: SlidersHorizontal,
  upload: Upload,
  verified_user: ShieldCheck,
  view_column: Columns,
  view_list: List,
  visibility: Eye,
  warning: TriangleAlert,
  webhook: Webhook,
};

interface IconProps {
  name: IconName;
  /** Solid variant. Lucide strokes the outline; this fills the same shape. */
  filled?: boolean;
  className?: string;
}

/**
 * Icons here are decoration: the control around them carries the accessible
 * name, so the glyph is aria-hidden and the name reaches the DOM only as a
 * class. Size and tint come from the span (font-size, text-*), and the
 * "filled" outline/solid switch lives in this component.
 */
export const Icon: React.FC<IconProps> = ({ name, filled = false, className }) => {
  const Lucide = ICONS[name];
  const classes = ['icon', `i-${name}`, filled && 'icon-filled', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-hidden="true">
      <Lucide fill={filled ? 'currentColor' : 'none'} />
    </span>
  );
};
