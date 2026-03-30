import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Upload, FileText, Loader2, CheckCircle2, XCircle,
  AlertTriangle, ChevronRight, Sparkles, X
} from 'lucide-react';
import { MODULE_COLORS } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedModule {
  name: string;
  code: string;
  credit_weight: number;
  semester?: string;
  assessments: ExtractedAssessment[];
  color: string;
  // UI state
  selected: boolean;
  existingModuleId?: string; // if matched to an existing module
}

interface ExtractedAssessment {
  name: string;
  type: 'test' | 'assignment' | 'exam' | 'practical' | 'project';
  mark_achieved: number | null;
  max_mark: number;
  weight_percent: number;
  selected: boolean;
}

type Step = 'upload' | 'parsing' | 'confirm' | 'saving' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  existingModules: { id: string; name: string; code: string }[];
  onComplete: () => void; // parent refreshes data
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assignColors(modules: Omit<ExtractedModule, 'color' | 'selected'>[]): ExtractedModule[] {
  return modules.map((m, i) => ({
    ...m,
    color: MODULE_COLORS[i % MODULE_COLORS.length],
    selected: true,
    assessments: m.assessments.map(a => ({ ...a, selected: true })),
  }));
}

function matchToExisting(
  extracted: ExtractedModule[],
  existing: { id: string; name: string; code: string }[]
): ExtractedModule[] {
  return extracted.map(em => {
    const match = existing.find(
      ex =>
        ex.code.toLowerCase() === em.code.toLowerCase() ||
        ex.name.toLowerCase() === em.name.toLowerCase()
    );
    return { ...em, existingModuleId: match?.id };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TranscriptUpload({ open, onClose, existingModules, onComplete }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [modules, setModules] = useState<ExtractedModule[]>([]);
  const [rawText, setRawText] = useState('');

  // ── Reset on close ──────────────────────────────────────────────────────────
  const handleClose = () => {
    setStep('upload');
    setFileName('');
    setParseError('');
    setModules([]);
    setRawText('');
    onClose();
  };

  // ── File drop ───────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !user) return;
    setFileName(file.name);
    setParseError('');
    setStep('parsing');

    try {
      // 1. Upload to Supabase Storage
      const filePath = `${user.id}/transcripts/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('study-files')
        .upload(filePath, file);
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      // 2. Call extract-text edge function
      const { data: extractData, error: extractErr } = await supabase.functions.invoke('extract-text', {
        body: {
          file_path: filePath,
          file_name: file.name,
          file_type: file.type || 'application/pdf',
          module_name: null,
          mode: 'transcript', // hint to the function
        },
      });

      if (extractErr) throw new Error(`Extraction failed: ${extractErr.message}`);

      const extracted = extractData?.extracted_text || '';
      if (!extracted || extracted.length < 20) {
        throw new Error('Could not extract readable text from this file. Try a text-based PDF.');
      }
      setRawText(extracted);

      // 3. Ask AI to parse transcript structure
      const parsed = await parseTranscriptWithAI(extracted);
      if (!parsed || parsed.length === 0) {
        throw new Error('No modules or marks found in this transcript. Make sure it contains academic results.');
      }

      const withColors = assignColors(parsed);
      const withMatches = matchToExisting(withColors, existingModules);
      setModules(withMatches);
      setStep('confirm');
    } catch (err: any) {
      setParseError(err.message || 'Something went wrong.');
      setStep('upload');
    }
  }, [user, existingModules]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    multiple: false,
    disabled: step !== 'upload',
  });

  // ── AI parsing ──────────────────────────────────────────────────────────────
  async function parseTranscriptWithAI(text: string): Promise<Omit<ExtractedModule, 'color' | 'selected'>[]> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';

    const prompt = `You are parsing a university academic transcript. Extract all modules/courses and their assessments/marks.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "modules": [
    {
      "name": "Module Full Name",
      "code": "MOD101",
      "credit_weight": 16,
      "semester": "Semester 1 2024",
      "assessments": [
        {
          "name": "Assessment name (e.g. Test 1, Final Exam, Assignment 1)",
          "type": "test|assignment|exam|practical|project",
          "mark_achieved": 75,
          "max_mark": 100,
          "weight_percent": 40
        }
      ]
    }
  ]
}

Rules:
- If mark is not available, set mark_achieved to null
- If weight is not shown, estimate from context (tests usually 20-40%, exams 40-60%)
- If credit_weight is not shown, default to 16
- type must be one of: test, assignment, exam, practical, project
- Extract every module you can find
- If only a final grade is shown (no sub-assessments), create one assessment called "Final Grade" with type "exam" and weight_percent 100

Transcript text:
${text.substring(0, 60000)}`;

    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        context: 'You are a transcript parser. Return only JSON.',
        mode: 'json',
      }),
    });

    if (!resp.ok) throw new Error('AI parsing failed. Check your connection and try again.');

    // Collect full response (may be streamed)
    let fullText = '';
    const contentType = resp.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && resp.body) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            fullText += parsed.choices?.[0]?.delta?.content || '';
          } catch {}
        }
      }
    } else {
      const data = await resp.json();
      fullText = data.choices?.[0]?.message?.content || '';
    }

    // Strip markdown code fences if present
    fullText = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsed = JSON.parse(fullText);
      return parsed.modules || [];
    } catch {
      throw new Error('AI returned an unexpected format. Please try again.');
    }
  }

  // ── Module / assessment toggles ─────────────────────────────────────────────
  const toggleModule = (idx: number) => {
    setModules(prev => prev.map((m, i) =>
      i === idx ? { ...m, selected: !m.selected, assessments: m.assessments.map(a => ({ ...a, selected: !m.selected })) } : m
    ));
  };

  const toggleAssessment = (modIdx: number, aIdx: number) => {
    setModules(prev => prev.map((m, i) =>
      i === modIdx
        ? { ...m, assessments: m.assessments.map((a, j) => j === aIdx ? { ...a, selected: !a.selected } : a) }
        : m
    ));
  };

  const updateMark = (modIdx: number, aIdx: number, val: string) => {
    const num = val === '' ? null : Number(val);
    setModules(prev => prev.map((m, i) =>
      i === modIdx
        ? { ...m, assessments: m.assessments.map((a, j) => j === aIdx ? { ...a, mark_achieved: num } : a) }
        : m
    ));
  };

  const updateModuleField = (modIdx: number, field: keyof ExtractedModule, val: any) => {
    setModules(prev => prev.map((m, i) => i === modIdx ? { ...m, [field]: val } : m));
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    setStep('saving');
    try {
      for (const mod of modules.filter(m => m.selected)) {
        let moduleId = mod.existingModuleId;

        // Create module if not existing
        if (!moduleId) {
          const { data, error } = await supabase.from('modules').insert({
            user_id: user.id,
            name: mod.name,
            code: mod.code,
            credit_weight: mod.credit_weight,
            color: mod.color,
            semester: mod.semester || '',
            sort_order: 999,
          }).select().single();
          if (error) throw new Error(`Failed to create module ${mod.name}: ${error.message}`);
          moduleId = data.id;
        }

        // Insert selected assessments
        const selectedAssessments = mod.assessments.filter(a => a.selected);
        if (selectedAssessments.length > 0) {
          const rows = selectedAssessments.map(a => ({
            user_id: user.id,
            module_id: moduleId!,
            name: a.name,
            type: a.type,
            weight_percent: a.weight_percent,
            mark_achieved: a.mark_achieved,
            max_mark: a.max_mark,
            submitted: a.mark_achieved !== null,
          }));
          const { error } = await supabase.from('assessments').insert(rows);
          if (error) throw new Error(`Failed to save assessments for ${mod.name}: ${error.message}`);
        }
      }

      setStep('done');
      toast.success('Transcript imported successfully!');
      setTimeout(() => {
        onComplete();
        handleClose();
      }, 1800);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save. Please try again.');
      setStep('confirm');
    }
  };

  const selectedCount = modules.filter(m => m.selected).length;
  const totalAssessments = modules
    .filter(m => m.selected)
    .reduce((sum, m) => sum + m.assessments.filter(a => a.selected).length, 0);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Import Transcript</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload your academic transcript — AI will extract your modules and marks
                </p>
              </div>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {(['upload', 'confirm', 'done'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step === 'done' || (step === 'confirm' && i <= 1) || (step === 'upload' && i === 0)
                    ? 'bg-primary text-primary-foreground'
                    : step === 'parsing' && i <= 1
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {step === 'done' && i < 2 ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className="text-xs text-muted-foreground capitalize hidden sm:block">{s === 'upload' ? 'Upload' : s === 'confirm' ? 'Review' : 'Done'}</span>
                {i < 2 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">

          {/* ── UPLOAD STEP ── */}
          {(step === 'upload' || step === 'parsing') && (
            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/50'
                } ${step === 'parsing' ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input {...getInputProps()} />
                {step === 'parsing' ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Parsing {fileName}…</p>
                      <p className="text-xs text-muted-foreground mt-1">AI is reading your transcript and extracting modules & marks</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Drop your transcript here</p>
                      <p className="text-xs text-muted-foreground mt-1">Supports PDF, images (JPG, PNG), or text files</p>
                    </div>
                    <Button variant="outline" size="sm" className="mt-1">Browse file</Button>
                  </div>
                )}
              </div>

              {parseError && (
                <div className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Parsing failed</p>
                    <p className="text-xs text-destructive/80 mt-0.5">{parseError}</p>
                  </div>
                </div>
              )}

              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Tips for best results
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Use the official transcript PDF from your student portal</li>
                  <li>• Make sure the PDF is text-based (not a scanned image)</li>
                  <li>• If marks aren't on the transcript yet, they'll be left blank for you to fill in</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── CONFIRM STEP ── */}
          {(step === 'confirm' || step === 'saving') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{modules.length} modules</span>.
                  Review and deselect anything you don't want to import.
                </p>
                <div className="text-xs text-muted-foreground">
                  {selectedCount} modules · {totalAssessments} assessments selected
                </div>
              </div>

              {modules.map((mod, modIdx) => (
                <div
                  key={modIdx}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    mod.selected ? 'border-border' : 'border-border/50 opacity-50'
                  }`}
                >
                  {/* Module header */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleModule(modIdx)}
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      mod.selected ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {mod.selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: mod.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{mod.name}</span>
                        {mod.existingModuleId && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                            will add to existing
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{mod.code} · {mod.credit_weight} credits{mod.semester ? ` · ${mod.semester}` : ''}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {mod.assessments.filter(a => a.selected).length}/{mod.assessments.length} assessments
                    </span>
                  </div>

                  {/* Assessments */}
                  {mod.selected && mod.assessments.length > 0 && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {mod.assessments.map((assessment, aIdx) => (
                        <div
                          key={aIdx}
                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                            assessment.selected ? 'bg-white' : 'bg-muted/30'
                          }`}
                        >
                          <div
                            className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                              assessment.selected ? 'bg-primary border-primary' : 'border-border'
                            }`}
                            onClick={() => toggleAssessment(modIdx, aIdx)}
                          >
                            {assessment.selected && <div className="h-1.5 w-1.5 bg-primary-foreground rounded-full" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">{assessment.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 capitalize">{assessment.type}</span>
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">{assessment.weight_percent}%</span>
                          <div className="flex items-center gap-1 w-24">
                            <Input
                              type="number"
                              value={assessment.mark_achieved ?? ''}
                              onChange={e => updateMark(modIdx, aIdx, e.target.value)}
                              placeholder="—"
                              className="h-6 text-xs px-2 font-mono w-14"
                              disabled={!assessment.selected}
                            />
                            <span className="text-xs text-muted-foreground">/{assessment.max_mark}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── DONE STEP ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h3 className="text-base font-semibold mb-1">Transcript imported!</h3>
              <p className="text-sm text-muted-foreground">
                {selectedCount} modules and {totalAssessments} assessments added to your profile.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'confirm' || step === 'saving') && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0 bg-background">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={step === 'saving'}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={step === 'saving' || selectedCount === 0}
              className="gap-2"
            >
              {step === 'saving' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <>Import {selectedCount} module{selectedCount !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}