import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Target, Plus, Check, Sparkles } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import type { Goal } from '@/types/database';

export default function Goals() {
  const { user, profile } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('semester');
  const [desc, setDesc] = useState('');
  const [targetVal, setTargetVal] = useState('');
  const [deadline, setDeadline] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setGoals((data || []) as Goal[]); setLoading(false); });
  }, [user]);

  const addGoal = async () => {
    if (!user || !title) return;
    const { data, error } = await supabase.from('goals').insert({
      user_id: user.id, type, title, description: desc,
      target_value: targetVal ? Number(targetVal) : null,
      deadline: deadline || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setGoals([data as Goal, ...goals]);
    setShowAdd(false); setTitle(''); setDesc(''); setTargetVal(''); setDeadline('');
    toast.success('Goal created');
  };

  const toggleAchieved = async (goal: Goal) => {
    const { error } = await supabase.from('goals').update({ achieved: !goal.achieved }).eq('id', goal.id);
    if (error) { toast.error(error.message); return; }
    setGoals(goals.map(g => g.id === goal.id ? { ...g, achieved: !g.achieved } : g));
  };

  if (loading) return <div className="p-6"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div>;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Goals & Accountability</h1>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> Add Goal</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Goal</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Achieve 75% semester average" /></div>
              <div className="space-y-2"><Label>Type</Label>
                <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semester">Semester</SelectItem>
                    <SelectItem value="module">Module</SelectItem>
                    <SelectItem value="career">Career</SelectItem>
                    <SelectItem value="funding">Funding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
              <div className="flex gap-3">
                <div className="space-y-2 flex-1"><Label>Target value</Label><Input type="number" value={targetVal} onChange={e => setTargetVal(e.target.value)} placeholder="e.g. 75" /></div>
                <div className="space-y-2 flex-1"><Label>Deadline</Label><Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
              </div>
              <Button onClick={addGoal} className="w-full" disabled={!title}>Create goal</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mission card */}
      {profile && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-medium text-sm mb-1">Your Mission</h3>
                <p className="text-sm text-muted-foreground">{profile.career_goal || 'Set your career goal'}</p>
                {profile.why_it_matters && <p className="text-xs text-muted-foreground mt-1 italic">"{profile.why_it_matters}"</p>}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Target: <span className="font-mono">{profile.target_average}%</span></span>
                  {profile.has_funding_condition && <span>Funding: {profile.funding_condition}</span>}
                  <span>{differenceInDays(new Date(), new Date(profile.created_at))} days in</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals list */}
      <div className="space-y-3">
        {goals.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No goals yet. Create your first one to stay accountable.</div>
        ) : goals.map(g => (
          <Card key={g.id} className={`border-border shadow-sm ${g.achieved ? 'opacity-60' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleAchieved(g)}
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors ${g.achieved ? 'bg-success border-success' : 'border-border hover:border-primary'}`}>
                  {g.achieved && <Check className="h-3 w-3 text-success-foreground" />}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${g.achieved ? 'line-through' : ''}`}>{g.title}</span>
                    <span className="status-pill status-pill-blue capitalize">{g.type}</span>
                  </div>
                  {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    {g.target_value && <span>Target: {g.target_value}</span>}
                    {g.deadline && <span>{differenceInDays(new Date(g.deadline), new Date())} days left</span>}
                  </div>
                  {g.target_value && (
                    <Progress value={(g.current_value / g.target_value) * 100} className="mt-2 h-1.5" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
