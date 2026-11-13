import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code,
  Ellipsis,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Heading1,
  Heading2,
  Heading3,
  House,
  Image,
  Italic,
  Link,
  ListTree,
  LocateFixed,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Every icon of the UI, from one set (Lucide) and drawn the same way, so the
 * bars and dialogs do not mix emoji with text symbols. Icons are decoration:
 * the button they sit in carries the title / aria-label.
 */
function icon(Shape: LucideIcon, defaultSize = 16) {
  return function Icon({ size = defaultSize }: { size?: number }) {
    return <Shape className="icon" size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
  };
}

export const IconSidebar = icon(FolderTree);
export const IconOutline = icon(ListTree);
export const IconHelp = icon(CircleHelp);
export const IconMore = icon(Ellipsis);
export const IconCaret = icon(ChevronDown, 12);
export const IconClose = icon(X);
export const IconPlus = icon(Plus, 14);
export const IconCheck = icon(Check, 14);
export const IconWarning = icon(TriangleAlert, 13);

export const IconH1 = icon(Heading1, 17);
export const IconH2 = icon(Heading2, 17);
export const IconH3 = icon(Heading3, 17);
export const IconBold = icon(Bold);
export const IconItalic = icon(Italic);
export const IconCode = icon(Code);
export const IconLink = icon(Link);

export const IconTreeOpen = icon(ChevronDown, 13);
export const IconTreeClosed = icon(ChevronRight, 13);
export const IconImage = icon(Image, 13);
export const IconReveal = icon(LocateFixed, 14);
export const IconRefresh = icon(RefreshCw, 14);
export const IconOpenFolder = icon(FolderOpen, 14);
export const IconHome = icon(House, 15);
export const IconFolder = icon(Folder, 14);
export const IconFile = icon(FileText, 14);
export const IconUp = icon(ArrowUp, 14);
export const IconDown = icon(ArrowDown, 14);

/** The same arrow as markup, for the one button that is built outside React (the changes view). */
export const ARROW_RIGHT_SVG =
  '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
