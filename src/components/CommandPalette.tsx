import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, BookOpen, Bot, Timer, Calendar, FileEdit, TrendingUp,
  Target, Settings, CheckSquare, Zap, Sparkle,
} from 'lucide-react';

const PAGES = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Modules & Grades', url: '/grades', icon: BookOpen },
  { title: 'Study Optimizer', url: '/optimizer', icon: Zap },
  { title: 'AI Advisor', url: '/advisor', icon: Bot },
  { title: 'Study Mode', url: '/study', icon: Timer },
  { title: 'Timetable', url: '/timetable', icon: Calendar },
  { title: 'Exam Mode', url: '/exam', icon: FileEdit },
  { title: 'Progress Hub', url: '/progress', icon: TrendingUp },
  { title: 'Goals', url: '/goals', icon: Target },
  { title: 'Tasks', url: '/tasks', icon: CheckSquare },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const AI_SHORTCUTS = [
  'What should I focus on today?',
  'Am I on track for my target?',
  'Plan my study day',
  "What's due in the next 7 days?",
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (url: string) => { setOpen(false); setQuery(''); navigate(url); };
  const ask = (text: string) => go(`/advisor?q=${encodeURIComponent(text)}`);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search pages, or type a question for the AI advisor..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.trim() ? (
            <button className="text-sm underline" onClick={() => ask(query.trim())}>
              Ask the AI advisor: “{query.trim()}”
            </button>
          ) : 'No results.'}
        </CommandEmpty>

        {query.trim().length > 2 && (
          <>
            <CommandGroup heading="Ask AI">
              <CommandItem value={`ask ${query}`} onSelect={() => ask(query.trim())}>
                <Sparkle className="mr-2 h-4 w-4" />
                Ask the advisor: “{query.trim()}”
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          {PAGES.map(p => (
            <CommandItem key={p.url} value={p.title} onSelect={() => go(p.url)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick questions">
          {AI_SHORTCUTS.map(s => (
            <CommandItem key={s} value={s} onSelect={() => ask(s)}>
              <Bot className="mr-2 h-4 w-4" />
              {s}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
