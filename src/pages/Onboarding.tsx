import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { BookOpen, Target, GraduationCap, Palette, Calendar, Plus, X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { CAREER_FIELDS, YEAR_OPTIONS, MODULE_COLORS } from '@/types/database';

interface ModuleInput {
  name: string;
  code: string;
  credit_weight: number;
  color: string;
}

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [degree, setDegree] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');

  // Step 2
  const [careerGoal, setCareerGoal] = useState('');
  const [careerField, setCareerField] = useState('');
  const [whyItMatters, setWhyItMatters] = useState('');

  // Step 3
  const [targetAverage, setTargetAverage] = useState([70]);
  const [hasFunding, setHasFunding] = useState(false);
  const [fundingCondition, setFundingCondition] = useState('');

  // Step 4
  const [modules, setModules] = useState<ModuleInput[]>([
    { name: '', code: '', credit_weight: 16, color: MODULE_COLORS[0] },
  ]);

  const addModule = () => {
    if (modules.length >= 6) return;
    setModules([...modules, { name: '', code: '', credit_weight: 16, color: MODULE_COLORS[modules.length % MODULE_COLORS.length] }]);
  };

  const removeModule = (idx: number) => {
    setModules(modules.filter((_, i) => i !== idx));
  };

  const updateModule = (idx: number, field: keyof ModuleInput, value: string | number) => {
    const updated = [...modules];
    (updated[idx] as any)[field] = value;
    setModules(updated);
  };

  const canProceed = () => {
    switch (step) {
      case 1: return fullName && institution && degree && yearOfStudy;
      case 2: return careerGoal && careerField;
      case 3: return true;
      case 4: return modules.some(m => m.name);
      case 5: return true;
      default: return true;
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('users_profile')
        .update({
          full_name: fullName,
          institution,
          degree,
          year_of_study: yearOfStudy,
          career_goal: careerGoal,
          career_field: careerField,
          why_it_matters: whyItMatters,
          target_average: targetAverage[0],
          has_funding_condition: hasFunding,
          funding_condition: hasFunding ? fundingCondition : '',
          onboarding_completed: true,
        })
        .eq('user_id', user.id);
      
      if (profileError) throw profileError;

      // Create modules
      const validModules = modules.filter(m => m.name);
      if (validModules.length > 0) {
        const { error: modulesError } = await supabase
          .from('modules')
          .insert(validModules.map((m, i) => ({
            user_id: user.id,
            name: m.name,
            code: m.code,
            credit_weight: m.credit_weight,
            color: m.color,
            sort_order: i,
          })));
        if (modulesError) throw modulesError;
      }

      await refreshProfile();
      toast.success('Welcome to StudyOS!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const stepIcons = [GraduationCap, Target, Sparkles, Palette, Calendar];
  const stepTitles = ['Welcome to StudyOS', 'Your north star', 'Set your targets', 'Add your modules', 'Sync your calendar'];
  const StepIcon = stepIcons[step - 1];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[520px]">
        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <StepIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{stepTitles[step - 1]}</h2>
                <p className="text-sm text-muted-foreground">Step {step} of 5</p>
              </div>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-2">
                  <Label>Institution</Label>
                  <Input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="e.g. University of Cape Town" />
                </div>
                <div className="space-y-2">
                  <Label>Degree programme</Label>
                  <Input value={degree} onChange={e => setDegree(e.target.value)} placeholder="e.g. BSc Computer Science" />
                </div>
                <div className="space-y-2">
                  <Label>Year of study</Label>
                  <Select value={yearOfStudy} onValueChange={setYearOfStudy}>
                    <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Career goal</Label>
                  <Input value={careerGoal} onChange={e => setCareerGoal(e.target.value)} placeholder="e.g. Software engineer at a top tech company" />
                </div>
                <div className="space-y-2">
                  <Label>Career field</Label>
                  <Select value={careerField} onValueChange={setCareerField}>
                    <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                    <SelectContent>
                      {CAREER_FIELDS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Why does this matter to you?</Label>
                  <Textarea value={whyItMatters} onChange={e => setWhyItMatters(e.target.value)} placeholder="What drives you? This will be referenced throughout your journey." rows={4} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Target final average: <span className="font-mono text-primary">{targetAverage[0]}%</span></Label>
                  <Slider value={targetAverage} onValueChange={setTargetAverage} min={50} max={100} step={1} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Bursary / funding condition?</Label>
                    <Switch checked={hasFunding} onCheckedChange={setHasFunding} />
                  </div>
                  {hasFunding && (
                    <Input value={fundingCondition} onChange={e => setFundingCondition(e.target.value)} placeholder="e.g. Must maintain 65% average" />
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Add the modules you're currently taking.</p>
                {modules.map((mod, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input value={mod.name} onChange={e => updateModule(i, 'name', e.target.value)} placeholder="Module name" />
                      <div className="flex gap-2">
                        <Input value={mod.code} onChange={e => updateModule(i, 'code', e.target.value)} placeholder="Code" className="w-28" />
                        <Input type="number" value={mod.credit_weight} onChange={e => updateModule(i, 'credit_weight', Number(e.target.value))} placeholder="Credits" className="w-24" />
                        <div className="flex gap-1">
                          {MODULE_COLORS.slice(0, 5).map(c => (
                            <button key={c} onClick={() => updateModule(i, 'color', c)} className={`h-8 w-8 rounded-md border-2 transition-all ${mod.color === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    {modules.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 mt-1" onClick={() => removeModule(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {modules.length < 6 && (
                  <Button variant="outline" size="sm" onClick={addModule} className="gap-1">
                    <Plus className="h-3 w-3" /> Add module
                  </Button>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 text-center py-4">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="font-medium mb-1">Google Calendar sync</h3>
                  <p className="text-sm text-muted-foreground">Sync your timetable and assessment deadlines with Google Calendar. You can set this up later in Settings.</p>
                </div>
                <Button variant="outline" disabled className="gap-2">
                  <Calendar className="h-4 w-4" /> Connect Google Calendar
                </Button>
                <p className="text-xs text-muted-foreground">This feature requires Google OAuth setup. You can skip for now.</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {step < 5 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                  Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={saving}>
                  {saving ? 'Setting up...' : 'Get started'} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
