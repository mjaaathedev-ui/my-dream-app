import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/shared/MetricCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  TrendingUp,
  Target,
  Trash2,
  Calculator,
  FileUp,
} from "lucide-react";
import type { Module, Assessment } from "@/types/database";
import { ASSESSMENT_TYPES, MODULE_COLORS } from "@/types/database";
import TranscriptUpload from "@/components/TranscriptUpload";

export default function Grades() {
  const { user, profile } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddAssessment, setShowAddAssessment] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [targetMark, setTargetMark] = useState("");

  // Module form
  const [mName, setMName] = useState("");
  const [mCode, setMCode] = useState("");
  const [mCredits, setMCredits] = useState("16");
  const [mColor, setMColor] = useState<string>(MODULE_COLORS[0]);
  const [mSemester, setMSemester] = useState("");

  // Assessment form
  const [aName, setAName] = useState("");
  const [aType, setAType] = useState<string>("assignment");
  const [aDueDate, setADueDate] = useState("");
  const [aWeight, setAWeight] = useState("");
  const [aMaxMark, setAMaxMark] = useState("100");

  // Journal prompt after mark entry
  const [journalPrompt, setJournalPrompt] = useState<{
    assessment: Assessment;
    mark: number;
  } | null>(null);
  const [journalText, setJournalText] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [mRes, aRes] = await Promise.all([
      supabase
        .from("modules")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order"),
      supabase.from("assessments").select("*").eq("user_id", user.id),
    ]);
    const mods = (mRes.data || []) as Module[];
    setModules(mods);
    setAssessments((aRes.data || []) as Assessment[]);
    if (mods.length > 0 && !selectedModule) setSelectedModule(mods[0]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const moduleAssessments = useMemo(
    () =>
      selectedModule
        ? assessments
            .filter((a) => a.module_id === selectedModule.id)
            .sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            )
        : [],
    [selectedModule, assessments],
  );

  const moduleAverage = useMemo(() => {
    const submitted = moduleAssessments.filter(
      (a) => a.submitted && a.mark_achieved !== null,
    );
    if (submitted.length === 0) return null;
    const totalWeight = submitted.reduce((s, a) => s + a.weight_percent, 0);
    if (totalWeight === 0) return null;
    return Math.round(
      submitted.reduce(
        (s, a) =>
          s + (a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent,
        0,
      ) / totalWeight,
    );
  }, [moduleAssessments]);

  const requiredMark = useMemo(() => {
    if (!targetMark || !selectedModule) return null;
    const target = Number(targetMark);
    const submitted = moduleAssessments.filter(
      (a) => a.submitted && a.mark_achieved !== null,
    );
    const remaining = moduleAssessments.filter((a) => !a.submitted);
    const submittedWeight = submitted.reduce((s, a) => s + a.weight_percent, 0);
    const submittedWeighted = submitted.reduce(
      (s, a) =>
        s + (a.mark_achieved! / (a.max_mark || 100)) * 100 * a.weight_percent,
      0,
    );
    const remainingWeight = remaining.reduce((s, a) => s + a.weight_percent, 0);
    if (remainingWeight === 0) return null;
    const needed =
      (target * (submittedWeight + remainingWeight) - submittedWeighted) /
      remainingWeight;
    return Math.round(needed * 10) / 10;
  }, [targetMark, moduleAssessments, selectedModule]);

  const gradeChartData = useMemo(() => {
    return moduleAssessments
      .filter((a) => a.submitted && a.mark_achieved !== null)
      .map((a, i) => ({
        name: a.name.substring(0, 15),
        mark: Math.round((a.mark_achieved! / (a.max_mark || 100)) * 100),
        index: i + 1,
      }));
  }, [moduleAssessments]);

  const addModule = async () => {
    if (!user || !mName) return;
    const { data, error } = await supabase
      .from("modules")
      .insert({
        user_id: user.id,
        name: mName,
        code: mCode,
        credit_weight: Number(mCredits),
        color: mColor,
        semester: mSemester,
        sort_order: modules.length,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const mod = data as Module;
    setModules([...modules, mod]);
    setSelectedModule(mod);
    setShowAddModule(false);
    setMName("");
    setMCode("");
    setMCredits("16");
    setMSemester("");
    toast.success("Module added");
  };

  const addAssessment = async () => {
    if (!user || !selectedModule || !aName) return;
    const { data, error } = await supabase
      .from("assessments")
      .insert({
        user_id: user.id,
        module_id: selectedModule.id,
        name: aName,
        type: aType,
        due_date: aDueDate || null,
        weight_percent: Number(aWeight),
        max_mark: Number(aMaxMark),
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setAssessments([...assessments, data as Assessment]);
    setShowAddAssessment(false);
    setAName("");
    setAType("assignment");
    setADueDate("");
    setAWeight("");
    setAMaxMark("100");
    toast.success("Assessment added");
  };

  const updateMark = async (assessment: Assessment, mark: string) => {
    const markNum = mark === "" ? null : Number(mark);
    const { error } = await supabase
      .from("assessments")
      .update({ mark_achieved: markNum, submitted: markNum !== null })
      .eq("id", assessment.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAssessments(
      assessments.map((a) =>
        a.id === assessment.id
          ? { ...a, mark_achieved: markNum, submitted: markNum !== null }
          : a,
      ),
    );
    if (markNum !== null) {
      toast.success(`Mark saved: ${markNum}/${assessment.max_mark}`);
      // Trigger journal prompt
      setJournalPrompt({ assessment, mark: markNum });
      setJournalText("");
    }
  };

  const saveJournalEntry = async () => {
    if (!user || !journalPrompt || !journalText.trim()) {
      setJournalPrompt(null);
      return;
    }
    await supabase.from("journal_entries").insert({
      user_id: user.id,
      entry_type: "reflection",
      content: journalText,
      module_id: journalPrompt.assessment.module_id,
      assessment_id: journalPrompt.assessment.id,
    });
    setJournalPrompt(null);
    setJournalText("");
    toast.success("Reflection saved");
  };

  const deleteAssessment = async (id: string) => {
    const { error } = await supabase.from("assessments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAssessments(assessments.filter((a) => a.id !== id));
    toast.success("Assessment deleted");
  };

  // Called when transcript import completes
  const handleTranscriptComplete = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 bg-muted rounded w-48 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Modules & Grades</h1>
        <div className="flex gap-2">
          {/* Transcript upload button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowTranscript(true)}
          >
            <FileUp className="h-3.5 w-3.5" />
            Import Transcript
          </Button>

          {/* Add module */}
          <Dialog open={showAddModule} onOpenChange={setShowAddModule}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-3 w-3" /> Add Module
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Module</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Module name</Label>
                  <Input
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                    placeholder="e.g. Data Structures"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1">
                    <Label>Code</Label>
                    <Input
                      value={mCode}
                      onChange={(e) => setMCode(e.target.value)}
                      placeholder="CS201"
                    />
                  </div>
                  <div className="space-y-2 w-24">
                    <Label>Credits</Label>
                    <Input
                      type="number"
                      value={mCredits}
                      onChange={(e) => setMCredits(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Semester</Label>
                  <Input
                    value={mSemester}
                    onChange={(e) => setMSemester(e.target.value)}
                    placeholder="S1 2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {MODULE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setMColor(c)}
                        className={`h-8 w-8 rounded-md border-2 ${
                          mColor === c
                            ? "border-foreground"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <Button
                  onClick={addModule}
                  className="w-full"
                  disabled={!mName}
                >
                  Add module
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Module list */}
        <div className="space-y-2">
          {modules.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No modules"
              description="Add your first module or import a transcript to get started."
              actionLabel="Import Transcript"
              onAction={() => setShowTranscript(true)}
            />
          ) : (
            modules.map((m) => {
              const mAssessments = assessments.filter(
                (a) => a.module_id === m.id,
              );
              const mSubmitted = mAssessments.filter(
                (a) => a.submitted && a.mark_achieved !== null,
              );
              const mAvg =
                mSubmitted.length > 0
                  ? Math.round(
                      mSubmitted.reduce(
                        (s, a) =>
                          s +
                          (a.mark_achieved! / (a.max_mark || 100)) *
                            100 *
                            a.weight_percent,
                        0,
                      ) / mSubmitted.reduce((s, a) => s + a.weight_percent, 0),
                    )
                  : null;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModule(m)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedModule?.id === m.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="text-sm font-medium truncate">
                      {m.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{m.code}</span>
                    <span>•</span>
                    <span>{m.credit_weight} credits</span>
                    {mAvg !== null && (
                      <>
                        <span>•</span>
                        <span className="font-mono">{mAvg}%</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Module detail */}
        {selectedModule ? (
          <div className="space-y-6">
            {/* Module header card */}
            <Card className="border-border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedModule.color }}
                      />
                      <h2 className="text-lg font-semibold">
                        {selectedModule.name}
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedModule.code} • {selectedModule.credit_weight}{" "}
                      credits
                      {selectedModule.semester
                        ? ` • ${selectedModule.semester}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold font-mono">
                      {moduleAverage !== null ? `${moduleAverage}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      current average
                    </p>
                  </div>
                </div>

                {/* What do I need calculator */}
                <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-md">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    What do I need?
                  </span>
                  <Input
                    type="number"
                    placeholder="Target %"
                    value={targetMark}
                    onChange={(e) => setTargetMark(e.target.value)}
                    className="w-24 h-8"
                  />
                  {requiredMark !== null && (
                    <span
                      className={`text-sm font-mono font-medium ${
                        requiredMark > 100 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {requiredMark > 100
                        ? "Not achievable"
                        : `Need ${requiredMark}% avg on remaining`}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Assessments table */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Assessments
                  </CardTitle>
                  <Dialog
                    open={showAddAssessment}
                    onOpenChange={setShowAddAssessment}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1">
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Assessment</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={aName}
                            onChange={(e) => setAName(e.target.value)}
                            placeholder="e.g. Midterm Test"
                          />
                        </div>
                        <div className="flex gap-3">
                          <div className="space-y-2 flex-1">
                            <Label>Type</Label>
                            <Select value={aType} onValueChange={setAType}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ASSESSMENT_TYPES.map((t) => (
                                  <SelectItem
                                    key={t}
                                    value={t}
                                    className="capitalize"
                                  >
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 w-24">
                            <Label>Weight %</Label>
                            <Input
                              type="number"
                              value={aWeight}
                              onChange={(e) => setAWeight(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="space-y-2 flex-1">
                            <Label>Due date</Label>
                            <Input
                              type="date"
                              value={aDueDate}
                              onChange={(e) => setADueDate(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2 w-24">
                            <Label>Max mark</Label>
                            <Input
                              type="number"
                              value={aMaxMark}
                              onChange={(e) => setAMaxMark(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button
                          onClick={addAssessment}
                          className="w-full"
                          disabled={!aName}
                        >
                          Add assessment
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {moduleAssessments.length === 0 ? (
                  <EmptyState
                    icon={BookOpen}
                    title="No assessments"
                    description="Add your first assessment for this module."
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_80px_80px_80px_80px_40px] gap-2 px-2 py-1 text-xs text-muted-foreground font-medium">
                      <span>Name</span>
                      <span>Type</span>
                      <span>Due</span>
                      <span>Weight</span>
                      <span>Mark</span>
                      <span />
                    </div>
                    {moduleAssessments.map((a) => (
                      <div
                        key={a.id}
                        className="grid grid-cols-[1fr_80px_80px_80px_80px_40px] gap-2 px-2 py-2 rounded-md hover:bg-accent items-center"
                      >
                        <span className="text-sm truncate">{a.name}</span>
                        <span className="text-xs capitalize text-muted-foreground">
                          {a.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.due_date
                            ? format(new Date(a.due_date), "MMM d")
                            : "—"}
                        </span>
                        <span className="text-xs font-mono">
                          {a.weight_percent}%
                        </span>
                        <Input
                          type="number"
                          className="h-7 text-xs font-mono"
                          placeholder="—"
                          value={a.mark_achieved ?? ""}
                          onChange={(e) => updateMark(a, e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => deleteAssessment(a.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Grade trend chart */}
            {gradeChartData.length > 1 && (
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Grade Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={gradeChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 10 }}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="mark"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: "hsl(var(--primary))", r: 3 }}
                        />
                        {profile?.target_average && (
                          <ReferenceLine
                            y={profile.target_average}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 4"
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Select a module"
            description="Choose a module from the list or add a new one."
          />
        )}
      </div>

      {/* Transcript upload modal */}
      <TranscriptUpload
        open={showTranscript}
        onClose={() => setShowTranscript(false)}
        existingModules={modules.map((m) => ({
          id: m.id,
          name: m.name,
          code: m.code,
        }))}
        onComplete={handleTranscriptComplete}
      />

      {/* Journal prompt after mark entry */}
      <Dialog
        open={!!journalPrompt}
        onOpenChange={() => setJournalPrompt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick reflection</DialogTitle>
          </DialogHeader>
          {journalPrompt && (
            <div className="space-y-4">
              <div className="p-3 bg-accent rounded-lg">
                <p className="text-sm font-medium">
                  You scored {journalPrompt.mark}/
                  {journalPrompt.assessment.max_mark} on{" "}
                  <span className="text-primary">
                    {journalPrompt.assessment.name}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Math.round(
                    (journalPrompt.mark /
                      (journalPrompt.assessment.max_mark || 100)) *
                      100,
                  )}
                  % · {journalPrompt.assessment.weight_percent}% of module
                </p>
              </div>
              <div className="space-y-2">
                <Label>What happened? What will you do differently?</Label>
                <Textarea
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="Reflect on this assessment..."
                  rows={4}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setJournalPrompt(null)}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={saveJournalEntry}
                  disabled={!journalText.trim()}
                >
                  Save reflection
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
