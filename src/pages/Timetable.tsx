import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Calendar,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Repeat,
  LayoutGrid,
  List,
  CalendarDays,
  Sparkles,
  Send,
  X,
  Loader2,
  Bot,
} from "lucide-react";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from "date-fns";
import { syncTimetableEntry } from "@/lib/google-calendar";
import {
  type TimetableEntry,
  type Module,
  TIMETABLE_ENTRY_TYPES,
  TIMETABLE_ENTRY_COLORS,
  TIMETABLE_CATEGORIES,
} from "@/types/database";
import {
  entryMatchesDate,
  getEntriesForDate,
  getWeekDates,
  timeToMinutes,
  minutesToPx,
  DAY_NAMES_FULL,
  DAY_NAMES_SHORT,
  dateStringToDow,
  recurrenceLabel,
} from "../utils/Timetableutils";
import { detectConflict } from "../utils/ConflictDetector";
import {
  buildTimetableSystemPrompt,
  parseTimetableAIResponse,
  type TimetableAIResponse,
} from "../contexts/TimetableAiContext";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const PX_PER_HOUR = 72;

type ViewMode = "day" | "week" | "month" | "list";

interface TimetableForm {
  title: string;
  type: string;
  entry_type: "once" | "recurring";
  specific_date: string;
  day_of_week: string;
  recurrence: "weekly" | "biweekly" | "monthly";
  start_time: string;
  end_time: string;
  location: string;
  notes: string;
  category: string;
  module_id: string;
  color: string;
  recurring: boolean;
}

const blankForm: TimetableForm = {
  title: "",
  type: "class",
  entry_type: "recurring",
  specific_date: "",
  day_of_week: "0",
  recurrence: "weekly",
  start_time: "08:00",
  end_time: "09:00",
  location: "",
  notes: "",
  category: "Lecture",
  module_id: "",
  color: TIMETABLE_ENTRY_COLORS.class,
  recurring: true,
};
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Timetable() {
  const { user } = useAuth();

  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [showDialog, setShowDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState<TimetableForm>(blankForm);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChat, setAiChat] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("timetable_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("start_time"),
      supabase
        .from("modules")
        .select("*")
        .eq("user_id", user.id)
        .eq("archived", false),
    ]).then(([e, m]) => {
      setEntries((e.data || []) as TimetableEntry[]);
      setModules((m.data || []) as Module[]);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiChat]);

  const navigate = (dir: 1 | -1) => {
    setCurrentDate((prev) => {
      if (viewMode === "day")
        return dir === 1 ? addDays(prev, 1) : subDays(prev, 1);
      if (viewMode === "week")
        return dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1);
      if (viewMode === "month")
        return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
      return prev;
    });
  };

  const headerLabel = useMemo(() => {
    if (viewMode === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (viewMode === "week") {
      const dates = getWeekDates(currentDate);
      return `${format(dates[0], "MMM d")} – ${format(dates[6], "MMM d, yyyy")}`;
    }
    if (viewMode === "month") return format(currentDate, "MMMM yyyy");
    return "All Entries";
  }, [viewMode, currentDate]);

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  const openAdd = () => {
    setForm({ ...blankForm });
    setEditEntry(null);
    setShowDialog(true);
  };

  const openEdit = (entry: TimetableEntry) => {
    setForm({
      title: entry.title,
      type: entry.type,
      entry_type: entry.entry_type ?? "recurring",
      specific_date: entry.specific_date ?? "",
      day_of_week: String(entry.day_of_week),
      recurrence: entry.recurrence ?? "weekly",
      start_time: entry.start_time,
      end_time: entry.end_time,
      location: entry.location ?? "",
      notes: entry.notes ?? "",
      category: entry.category ?? "Lecture",
      module_id: entry.module_id ?? "",
      color: entry.color ?? TIMETABLE_ENTRY_COLORS[entry.type] ?? "#2563EB",
      recurring: entry.recurring ?? true,
    });
    setEditEntry(entry);
    setShowDialog(true);
  };

  const saveEntry = async () => {
    if (!user || !form.title.trim()) return;

    // Derive day_of_week for one-time entries from the date string
    const effectiveDow =
      form.entry_type === "once" && form.specific_date
        ? dateStringToDow(form.specific_date)
        : Number(form.day_of_week);

    const payload: Partial<TimetableEntry> = {
      id: editEntry?.id,
      user_id: user.id,
      title: form.title.trim(),
      type: form.type,
      entry_type: form.entry_type,
      specific_date:
        form.entry_type === "once" ? form.specific_date || null : null,
      day_of_week: effectiveDow,
      recurrence: form.entry_type === "recurring" ? form.recurrence : "weekly",
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location,
      notes: form.notes || null,
      category: form.category,
      module_id: form.module_id || null,
      color: form.color,
      recurring: form.entry_type === "recurring",
    };

    // Conflict check
    const conflict = detectConflict(entries, payload, !!editEntry);
    if (conflict.hasConflict) {
      toast.error(conflict.message);
      return;
    }

    if (editEntry) {
      const { data, error } = await supabase
        .from("timetable_entries")
        .update(payload)
        .eq("id", editEntry.id)
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === editEntry.id ? (data as TimetableEntry) : e)),
      );
      toast.success("Entry updated");
    } else {
      const { data, error } = await supabase
        .from("timetable_entries")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setEntries((prev) => [...prev, data as TimetableEntry]);
      toast.success("Entry added");
    }
    setShowDialog(false);
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("timetable_entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setShowDialog(false);
    toast.success("Entry deleted");
  };

  const syncGoogle = async () => {
    setSyncing(true);
    const id = toast.loading(`Syncing ${entries.length} entries…`);
    let ok = 0;
    for (const e of entries) {
      if (await syncTimetableEntry(e)) ok++;
    }
    toast.dismiss(id);
    ok > 0
      ? toast.success(`Synced ${ok}/${entries.length} entries`)
      : toast.error("No entries synced — check Google connection in Settings");
    setSyncing(false);
  };

  const sendAiMessage = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg: ChatMessage = { role: "user", content: aiInput.trim() };
    const history: ChatMessage[] = [...aiChat, userMsg];
    setAiChat(history);
    setAiInput("");
    setAiLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const systemPrompt = buildTimetableSystemPrompt(entries, modules);

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: systemPrompt,
            mode: "json",
          }),
        },
      );

      if (!resp.ok) throw new Error("AI request failed");

      // Collect full text (handles streaming + non-streaming)
      let rawText = "";
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            let line = buf.slice(0, nl).trimEnd();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") break;
            try {
              rawText += JSON.parse(json).choices?.[0]?.delta?.content ?? "";
            } catch {}
          }
        }
      } else {
        const data = await resp.json();
        rawText = data.choices?.[0]?.message?.content ?? "";
      }

      const parsed = parseTimetableAIResponse(rawText);
      if (!parsed) throw new Error("Could not parse AI response");

      // Handle action
      await applyAiAction(parsed);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: parsed.message,
      };
      setAiChat((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error(err.message ?? "AI error");
      setAiChat((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong — please try again.",
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, aiChat, entries, modules, user]);

  const applyAiAction = async (resp: TimetableAIResponse) => {
    if (!user || resp.error) return;

    if (resp.action === "add" && resp.entry) {
      await addEntryFromAI(resp.entry);
    }

    if (resp.action === "add_multiple" && resp.entries) {
      for (const e of resp.entries) await addEntryFromAI(e);
    }

    if (resp.action === "delete" && resp.id) {
      await supabase.from("timetable_entries").delete().eq("id", resp.id);
      setEntries((prev) => prev.filter((e) => e.id !== resp.id));
    }

    if (resp.action === "delete_multiple" && resp.ids) {
      for (const id of resp.ids) {
        await supabase.from("timetable_entries").delete().eq("id", id);
      }
      setEntries((prev) => prev.filter((e) => !resp.ids!.includes(e.id)));
    }
  };

  const addEntryFromAI = async (entry: Partial<TimetableEntry>) => {
    if (!user) return;
    const payload = {
      ...entry,
      user_id: user.id,
      recurring: entry.entry_type !== "once",
    };
    const conflict = detectConflict(entries, payload, false);
    if (conflict.hasConflict) {
      toast.warning(`Skipped "${entry.title}": ${conflict.message}`);
      return;
    }
    const { data, error } = await supabase
      .from("timetable_entries")
      .insert(payload)
      .select()
      .single();
    if (!error && data) {
      setEntries((prev) => [...prev, data as TimetableEntry]);
    }
  };

  const TimeGrid = ({ dates }: { dates: Date[] }) => (
    <div className="flex overflow-auto flex-1">
      {/* Time labels column */}
      <div className="w-16 shrink-0 border-r border-border">
        <div className="h-12 border-b border-border" />
        {HOURS.map((h) => (
          <div
            key={h}
            className="border-b border-border flex items-start justify-end pr-2 pt-1"
            style={{ height: PX_PER_HOUR }}
          >
            <span className="text-[10px] text-muted-foreground font-mono">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {dates.map((date, di) => {
        const dayEntries = getEntriesForDate(entries, date).sort((a, b) =>
          a.start_time.localeCompare(b.start_time),
        );
        const todayBg = isToday(date) ? "bg-primary/5" : "";

        return (
          <div
            key={di}
            className={`flex-1 min-w-[90px] border-r border-border last:border-r-0 ${todayBg}`}
          >
            {/* Day header */}
            <div
              className={`h-12 border-b border-border flex flex-col items-center justify-center sticky top-0 z-10 ${
                isToday(date) ? "bg-primary/10" : "bg-background"
              }`}
            >
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                {format(date, "EEE")}
              </span>
              <span
                className={`text-sm font-bold leading-none ${isToday(date) ? "text-primary" : ""}`}
              >
                {format(date, "d")}
              </span>
            </div>

            {/* Hour grid + entries */}
            <div
              className="relative"
              style={{ height: HOURS.length * PX_PER_HOUR }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-b border-border/40"
                  style={{ top: (h - 6) * PX_PER_HOUR, height: PX_PER_HOUR }}
                />
              ))}

              {dayEntries.map((entry) => {
                const startMin = timeToMinutes(entry.start_time) - 6 * 60;
                const endMin = timeToMinutes(entry.end_time) - 6 * 60;
                const top = minutesToPx(startMin, PX_PER_HOUR);
                const height = Math.max(
                  minutesToPx(endMin - startMin, PX_PER_HOUR),
                  24,
                );
                const color =
                  entry.color ||
                  TIMETABLE_ENTRY_COLORS[entry.type] ||
                  "#2563EB";

                return (
                  <div
                    key={entry.id}
                    onClick={() => openEdit(entry)}
                    className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden group"
                    style={{
                      top,
                      height,
                      backgroundColor: color + "20",
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <p
                      className="text-[11px] font-semibold leading-tight truncate"
                      style={{ color }}
                    >
                      {entry.title}
                    </p>
                    {height > 32 && (
                      <p
                        className="text-[10px] opacity-70 truncate"
                        style={{ color }}
                      >
                        {entry.start_time}–{entry.end_time}
                      </p>
                    )}
                    {height > 48 && entry.location && (
                      <p
                        className="text-[10px] opacity-60 truncate"
                        style={{ color }}
                      >
                        {entry.location}
                      </p>
                    )}
                    {/* One-time badge */}
                    {entry.entry_type === "once" && (
                      <span
                        className="absolute top-0.5 right-5 text-[8px] px-1 rounded-full font-medium"
                        style={{ backgroundColor: color + "30", color }}
                      >
                        1×
                      </span>
                    )}
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        deleteEntry(entry.id);
                      }}
                      className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" style={{ color }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const MonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-border sticky top-0 bg-background z-10">
          {DAY_NAMES_SHORT.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-xs font-medium text-muted-foreground border-r border-border last:border-r-0"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {allDays.map((day, i) => {
            const dayEntries = getEntriesForDate(entries, day);
            const inMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={i}
                className={`min-h-[110px] border-b border-r border-border last:border-r-0 p-1.5 ${
                  !inMonth ? "bg-muted/20" : ""
                } ${isToday(day) ? "bg-primary/5" : ""}`}
              >
                <div
                  className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayEntries.slice(0, 3).map((entry) => {
                    const color =
                      entry.color ||
                      TIMETABLE_ENTRY_COLORS[entry.type] ||
                      "#2563EB";
                    return (
                      <div
                        key={entry.id}
                        onClick={() => openEdit(entry)}
                        className="text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 flex items-center gap-1"
                        style={{
                          backgroundColor: color + "20",
                          color,
                          borderLeft: `2px solid ${color}`,
                        }}
                      >
                        {entry.entry_type === "once" && (
                          <span className="shrink-0 font-bold">1×</span>
                        )}
                        {entry.start_time} {entry.title}
                      </div>
                    );
                  })}
                  {dayEntries.length > 3 && (
                    <p className="text-[10px] text-muted-foreground pl-1">
                      +{dayEntries.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const ListView = () => {
    const sorted = [...entries].sort(
      (a, b) =>
        a.day_of_week - b.day_of_week ||
        a.start_time.localeCompare(b.start_time),
    );
    return (
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No entries yet. Click "Add entry" or ask the AI assistant.
          </div>
        ) : (
          sorted.map((entry) => {
            const color =
              entry.color || TIMETABLE_ENTRY_COLORS[entry.type] || "#2563EB";
            const mod = modules.find((m) => m.id === entry.module_id);
            const scheduleLabel =
              entry.entry_type === "once" && entry.specific_date
                ? format(
                    new Date(entry.specific_date + "T00:00"),
                    "EEE, MMM d yyyy",
                  )
                : `${DAY_NAMES_FULL[entry.day_of_week]} (${recurrenceLabel(entry.recurrence ?? "weekly")})`;

            return (
              <div
                key={entry.id}
                onClick={() => openEdit(entry)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors cursor-pointer group"
              >
                <div
                  className="w-1 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{scheduleLabel}</span>
                    <Clock className="h-3 w-3" />
                    <span>
                      {entry.start_time}–{entry.end_time}
                    </span>
                    {entry.location && (
                      <>
                        <MapPin className="h-3 w-3" />
                        <span>{entry.location}</span>
                      </>
                    )}
                    {mod && (
                      <span className="font-medium" style={{ color }}>
                        {mod.name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[10px] capitalize px-2 py-0.5 rounded-full border"
                    style={{ borderColor: color, color }}
                  >
                    {entry.type}
                  </span>
                  {entry.entry_type === "recurring" && (
                    <Repeat className="h-3 w-3 text-muted-foreground" />
                  )}
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteEntry(entry.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 bg-muted rounded w-48 animate-pulse mb-4" />
        <div className="h-[400px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] md:h-screen animate-fade-in relative">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-2 flex-wrap bg-background z-20">
        <div className="flex items-center gap-2">
          {/* View mode */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {(
              [
                ["day", CalendarDays],
                ["week", LayoutGrid],
                ["month", Calendar],
                ["list", List],
              ] as const
            ).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as ViewMode)}
                className={`px-3 py-1.5 text-xs capitalize flex items-center gap-1.5 border-r border-border last:border-r-0 transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{mode}</span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          {viewMode !== "list" && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => setCurrentDate(new Date())}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {viewMode !== "list" && (
            <span className="text-sm font-medium hidden md:block">
              {headerLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={syncGoogle}
            disabled={syncing || entries.length === 0}
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs bg-gradient-to-r from-violet-500/10 to-blue-500/10 border-violet-300 text-violet-700 hover:from-violet-500/20"
            onClick={() => setAiOpen(true)}
          >
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">AI Assistant</span>
          </Button>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openAdd}>
            <Plus className="h-3 w-3" /> Add entry
          </Button>
        </div>
      </div>

      {/* ── View content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {viewMode === "day" && <TimeGrid dates={[currentDate]} />}
        {viewMode === "week" && <TimeGrid dates={weekDates} />}
        {viewMode === "month" && <MonthView />}
        {viewMode === "list" && <ListView />}
      </div>

      {/* ── AI Assistant panel ───────────────────────────────────────────────── */}
      {aiOpen && (
        <div className="fixed bottom-4 right-4 w-[360px] max-h-[520px] bg-background border border-border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-violet-600 to-blue-600">
            <div className="flex items-center gap-2 text-white">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-semibold">Timetable Assistant</span>
            </div>
            <button
              onClick={() => setAiOpen(false)}
              className="text-white/80 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-3 space-y-2 bg-muted/20">
            {aiChat.length === 0 && (
              <div className="text-center py-6 space-y-2">
                <Sparkles className="h-8 w-8 text-violet-400 mx-auto" />
                <p className="text-sm font-medium">
                  Ask me to manage your timetable
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {[
                    "Add Math every Monday 8–10",
                    "Add exam on April 15th 9–12",
                    "Clear my Fridays",
                    "What's on tomorrow?",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setAiInput(s);
                      }}
                      className="text-[11px] px-2 py-1 rounded-full bg-muted border border-border hover:bg-accent transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiChat.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] text-xs px-3 py-2 rounded-xl ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-background border border-border rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="bg-background border border-border rounded-xl rounded-bl-sm px-3 py-2 flex gap-1">
                  {[0, 0.15, 0.3].map((d, i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: `${d}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-border bg-background">
            <Input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendAiMessage();
                }
              }}
              placeholder="Ask about your timetable…"
              className="text-xs h-8"
              disabled={aiLoading}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={sendAiMessage}
              disabled={!aiInput.trim() || aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Add / Edit dialog ────────────────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {editEntry ? "Edit Entry" : "Add Timetable Entry"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="e.g. CS201 Lecture"
              />
            </div>

            {/* Entry type toggle */}
            <div className="space-y-1.5">
              <Label>Entry Type</Label>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(["once", "recurring"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        entry_type: t,
                        recurring: t === "recurring",
                      }))
                    }
                    className={`flex-1 py-2 text-sm transition-colors ${
                      form.entry_type === t
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent"
                    }`}
                  >
                    {t === "once" ? "One-time" : "Recurring"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date or Day selector */}
            {form.entry_type === "once" ? (
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={form.specific_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, specific_date: e.target.value }))
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Day *</Label>
                  <Select
                    value={form.day_of_week}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, day_of_week: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES_FULL.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Repeat</Label>
                  <Select
                    value={form.recurrence}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, recurrence: v as any }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Every week</SelectItem>
                      <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time *</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, start_time: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>End time *</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, end_time: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Type & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      type: v,
                      color: TIMETABLE_ENTRY_COLORS[v] ?? p.color,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMETABLE_ENTRY_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "Lecture",
                        "Tutorial",
                        "Practical",
                        "Study",
                        "Assignment",
                        "Exam",
                        "Personal",
                        "Other",
                      ] as const
                    ).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Module */}
            <div className="space-y-1.5">
              <Label>Module</Label>
              <Select
                value={form.module_id || "__none__"}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    module_id: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                        {m.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) =>
                  setForm((p) => ({ ...p, location: e.target.value }))
                }
                placeholder="Room / building (optional)"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="Optional notes…"
                rows={2}
              />
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.values(TIMETABLE_ENTRY_COLORS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      form.color === c
                        ? "scale-110 border-foreground"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, color: e.target.value }))
                  }
                  className="h-7 w-7 rounded-full cursor-pointer border-0 bg-transparent"
                  title="Custom colour"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {editEntry && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => deleteEntry(editEntry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={saveEntry}
                disabled={
                  !form.title.trim() ||
                  (form.entry_type === "once" && !form.specific_date)
                }
              >
                {editEntry ? "Save changes" : "Add entry"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
