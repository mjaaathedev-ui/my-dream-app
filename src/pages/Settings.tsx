import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Save, MessageSquare, Bell, Shield, Calendar, Mail, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { CAREER_FIELDS, YEAR_OPTIONS, SESSION_TYPES } from '@/types/database';
import { useSearchParams } from 'react-router-dom';

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
  const [reminderDaysBefore, setReminderDaysBefore] = useState([profile?.reminder_days_before || 3]);
  const [defaultSessionType, setDefaultSessionType] = useState(profile?.default_session_type || 'pomodoro');
  const [defaultPomodoro, setDefaultPomodoro] = useState([profile?.default_pomodoro_minutes || 50]);
  const [checkinTime, setCheckinTime] = useState(profile?.preferred_checkin_time || '07:00');
  const [timezone, setTimezone] = useState(profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  // WhatsApp
  const [whatsappNumber, setWhatsappNumber] = useState(profile?.whatsapp_number || '');
  const [whatsappEnabled, setWhatsappEnabled] = useState(profile?.whatsapp_enabled || false);

  const [saving, setSaving] = useState(false);

  const maskPhone = (num: string) => {
    if (!num || num.length < 8) return num;
    return num.substring(0, 4) + '** *** ' + num.substring(num.length - 4);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('users_profile').update({
      full_name: fullName, institution, degree, year_of_study: yearOfStudy,
      career_goal: careerGoal, career_field: careerField, why_it_matters: whyItMatters,
      target_average: targetAverage[0], has_funding_condition: hasFunding,
      funding_condition: hasFunding ? fundingCondition : '',
      daily_study_target_hours: dailyTarget[0], email_reminders_enabled: emailReminders,
      reminder_days_before: reminderDaysBefore[0],
      default_session_type: defaultSessionType,
      default_pomodoro_minutes: defaultPomodoro[0],
      preferred_checkin_time: checkinTime,
      timezone,
      whatsapp_number: whatsappNumber,
      whatsapp_enabled: whatsappEnabled,
    }).eq('user_id', user.id);
    if (error) toast.error(error.message);
    else { toast.success('Settings saved'); await refreshProfile(); }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-[700px] mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Profile */}
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

      {/* Targets */}
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

      {/* Study Preferences */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Study Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default session type</Label>
            <Select value={defaultSessionType} onValueChange={setDefaultSessionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SESSION_TYPES.filter(t => t.value !== 'custom').map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default pomodoro length: <span className="font-mono text-primary">{defaultPomodoro[0]} min</span></Label>
            <Slider value={defaultPomodoro} onValueChange={setDefaultPomodoro} min={15} max={90} step={5} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Preferred check-in time</Label>
              <Input type="time" value={checkinTime} onChange={e => setCheckinTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="e.g. Africa/Johannesburg" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Email reminders</Label><Switch checked={emailReminders} onCheckedChange={setEmailReminders} />
          </div>
          <div className="space-y-2">
            <Label>Remind me <span className="font-mono text-primary">{reminderDaysBefore[0]}</span> days before assessments</Label>
            <Slider value={reminderDaysBefore} onValueChange={setReminderDaysBefore} min={1} max={14} step={1} />
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">WhatsApp Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Phone number</Label>
            <Input
              value={whatsappNumber}
              onChange={e => setWhatsappNumber(e.target.value)}
              placeholder="+27 81 234 5678"
            />
            {profile?.whatsapp_verified && (
              <p className="text-xs text-success flex items-center gap-1"><Shield className="h-3 w-3" /> Verified: {maskPhone(profile.whatsapp_number)}</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label>Enable WhatsApp notifications</Label>
            <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
          </div>
          {whatsappEnabled && (
            <div className="space-y-2 p-3 bg-accent rounded-md">
              <p className="text-xs font-medium text-muted-foreground">Notification types:</p>
              <div className="space-y-2">
                {['Daily check-in', 'Assessment reminders', 'Drift alerts', 'Streak celebrations', 'Weekly summary'].map(item => (
                  <div key={item} className="flex items-center gap-2">
                    <Checkbox id={item} defaultChecked />
                    <label htmlFor={item} className="text-xs">{item}</label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Messages are sent from a Twilio WhatsApp number. Carrier rates may apply. This is a one-way notification service with optional two-way AI advisor replies.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={saveProfile} disabled={saving} className="gap-1"><Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save settings'}</Button>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
