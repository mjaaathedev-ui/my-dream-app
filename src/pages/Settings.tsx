import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { CAREER_FIELDS, YEAR_OPTIONS } from '@/types/database';

export default function Settings() {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [institution, setInstitution] = useState(profile?.institution || '');
  const [degree, setDegree] = useState(profile?.degree || '');
  const [yearOfStudy, setYearOfStudy] = useState(profile?.year_of_study || '');
  const [careerGoal, setCareerGoal] = useState(profile?.career_goal || '');
  const [careerField, setCareerField] = useState(profile?.career_field || '');
  const [whyItMatters, setWhyItMatters] = useState(profile?.why_it_matters || '');
  const [targetAverage, setTargetAverage] = useState([profile?.target_average || 70]);
  const [hasFunding, setHasFunding] = useState(profile?.has_funding_condition || false);
  const [fundingCondition, setFundingCondition] = useState(profile?.funding_condition || '');
  const [dailyTarget, setDailyTarget] = useState([profile?.daily_study_target_hours || 4]);
  const [emailReminders, setEmailReminders] = useState<boolean>(profile?.email_reminders_enabled ?? true);
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('users_profile').update({
      full_name: fullName, institution, degree, year_of_study: yearOfStudy,
      career_goal: careerGoal, career_field: careerField, why_it_matters: whyItMatters,
      target_average: targetAverage[0], has_funding_condition: hasFunding,
      funding_condition: hasFunding ? fundingCondition : '',
      daily_study_target_hours: dailyTarget[0], email_reminders_enabled: emailReminders,
    }).eq('user_id', user.id);
    if (error) toast.error(error.message);
    else { toast.success('Settings saved'); await refreshProfile(); }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-[700px] mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Institution</Label><Input value={institution} onChange={e => setInstitution(e.target.value)} /></div>
            <div className="space-y-2"><Label>Degree</Label><Input value={degree} onChange={e => setDegree(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Year</Label>
              <Select value={yearOfStudy} onValueChange={setYearOfStudy}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Career field</Label>
              <Select value={careerField} onValueChange={setCareerField}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAREER_FIELDS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Career goal</Label><Input value={careerGoal} onChange={e => setCareerGoal(e.target.value)} /></div>
          <div className="space-y-2"><Label>Why it matters</Label><Textarea value={whyItMatters} onChange={e => setWhyItMatters(e.target.value)} rows={3} /></div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Targets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Target average: <span className="font-mono text-primary">{targetAverage[0]}%</span></Label>
            <Slider value={targetAverage} onValueChange={setTargetAverage} min={50} max={100} step={1} />
          </div>
          <div className="space-y-2">
            <Label>Daily study target: <span className="font-mono text-primary">{dailyTarget[0]}h</span></Label>
            <Slider value={dailyTarget} onValueChange={setDailyTarget} min={1} max={12} step={0.5} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Funding condition</Label><Switch checked={hasFunding} onCheckedChange={setHasFunding} />
          </div>
          {hasFunding && <Input value={fundingCondition} onChange={e => setFundingCondition(e.target.value)} placeholder="e.g. Must maintain 65%" />}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Notifications</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Email reminders</Label><Switch checked={emailReminders} onCheckedChange={setEmailReminders} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={saveProfile} disabled={saving} className="gap-1"><Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save settings'}</Button>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
