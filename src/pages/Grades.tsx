import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, TrendingUp, Award, BarChart3, Filter, AlertCircle, Target, Zap, Brain } from 'lucide-react';

interface Module {
  id: string;
  name: string;
  code: string;
  color: string;
  credit_weight: number;
  user_id: string;
}

interface Assessment {
  id: string;
  name: string;
  type: string;
  mark_achieved: number | null;
  max_mark: number;
  weight_percent: number;
  module_id: string;
  user_id: string;
  submitted: boolean;
  created_at: string;
}

interface GradeData {
  module: Module;
  assessments: Assessment[];
  submittedAssessments: Assessment[];
  pendingAssessments: Assessment[];
  currentProgress: number;
  currentProgressWeight: number;
  pendingWeight: number;
}

interface ModuleGoal {
  moduleId: string;
  targetGrade: number;
  currentProgress: number;
  requiredAverage: number;
  isAchievable: boolean;
  status: 'achieved' | 'challenging' | 'achievable' | 'impossible';
  message: string;
}

export default function Grades() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [openModuleGoalDialog, setOpenModuleGoalDialog] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [moduleGoals, setModuleGoals] = useState<{ [key: string]: number }>({});

  const [formData, setFormData] = useState({
    name: '',
    type: 'exam',
    mark_achieved: '',
    max_mark: '100',
    weight_percent: '',
    module_id: '',
  });

  const [moduleGoalForm, setModuleGoalForm] = useState({
    moduleId: '',
    targetGrade: 70,
  });

  useEffect(() => {
    if (user) {
      fetchModules();
      fetchAssessments();
      fetchModuleGoals();
    }
  }, [user]);

  const fetchModules = async () => {
    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('user_id', user?.id)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      
      setModules(data || []);
      if (data && data.length > 0) {
        setSelectedModuleId(data[0].id);
        setFormData(prev => ({ ...prev, module_id: data[0].id }));
      }
    } catch (error: any) {
      toast.error('Failed to load modules');
      console.error(error);
    }
  };

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setAssessments(data || []);
    } catch (error: any) {
      toast.error('Failed to load assessments');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModuleGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('module_goals')
        .select('module_id, target_grade')
        .eq('user_id', user?.id);
      
      if (error) throw error;
      
      const goalsMap: { [key: string]: number } = {};
      data?.forEach(goal => {
        goalsMap[goal.module_id] = goal.target_grade;
      });
      setModuleGoals(goalsMap);
    } catch (error: any) {
      console.error('Failed to fetch module goals:', error);
    }
  };

  const saveModuleGoal = async () => {
    if (!moduleGoalForm.moduleId) {
      toast.error('Please select a module');
      return;
    }

    try {
      const existingGoal = moduleGoals[moduleGoalForm.moduleId];
      
      if (existingGoal !== undefined) {
        const { error } = await supabase
          .from('module_goals')
          .update({ target_grade: moduleGoalForm.targetGrade })
          .eq('module_id', moduleGoalForm.moduleId)
          .eq('user_id', user?.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('module_goals')
          .insert({
            user_id: user?.id,
            module_id: moduleGoalForm.moduleId,
            target_grade: moduleGoalForm.targetGrade,
          });
        
        if (error) throw error;
      }
      
      setModuleGoals(prev => ({
        ...prev,
        [moduleGoalForm.moduleId]: moduleGoalForm.targetGrade,
      }));
      
      toast.success('Module goal saved successfully');
      setOpenModuleGoalDialog(false);
      setModuleGoalForm({ moduleId: '', targetGrade: 70 });
    } catch (error: any) {
      toast.error('Failed to save module goal');
      console.error(error);
    }
  };

  const handleSaveAssessment = async () => {
    if (!formData.name || !formData.module_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!formData.weight_percent) {
      toast.error('Please enter weight percentage');
      return;
    }

    try {
      const markValue = formData.mark_achieved !== '' ? parseInt(formData.mark_achieved) : null;
      const maxMark = parseInt(formData.max_mark);
      const weightPercent = parseInt(formData.weight_percent);

      if (markValue !== null && markValue > maxMark) {
        toast.error('Mark achieved cannot exceed max mark');
        return;
      }

      if (weightPercent > 100) {
        toast.error('Weight cannot exceed 100%');
        return;
      }

      if (editingAssessment) {
        const { error } = await supabase
          .from('assessments')
          .update({
            name: formData.name,
            type: formData.type,
            mark_achieved: markValue,
            max_mark: maxMark,
            weight_percent: weightPercent,
            submitted: markValue !== null,
          })
          .eq('id', editingAssessment.id);
        
        if (error) throw error;
        toast.success('Assessment updated successfully');
      } else {
        const { error } = await supabase
          .from('assessments')
          .insert({
            user_id: user?.id,
            name: formData.name,
            type: formData.type,
            mark_achieved: markValue,
            max_mark: maxMark,
            weight_percent: weightPercent,
            module_id: formData.module_id,
            submitted: markValue !== null,
          });
        
        if (error) throw error;
        toast.success('Assessment added successfully');
      }
      
      resetForm();
      fetchAssessments();
      setOpenDialog(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save assessment');
      console.error(error);
    }
  };

  const handleDeleteAssessment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assessment?')) return;

    try {
      const { error } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success('Assessment deleted');
      fetchAssessments();
    } catch (error: any) {
      toast.error('Failed to delete assessment');
      console.error(error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'exam',
      mark_achieved: '',
      max_mark: '100',
      weight_percent: '',
      module_id: selectedModuleId || '',
    });
    setEditingAssessment(null);
  };

  const openEditDialog = (assessment: Assessment) => {
    setEditingAssessment(assessment);
    setFormData({
      name: assessment.name,
      type: assessment.type,
      mark_achieved: assessment.mark_achieved?.toString() || '',
      max_mark: assessment.max_mark.toString(),
      weight_percent: assessment.weight_percent.toString(),
      module_id: assessment.module_id,
    });
    setSelectedModuleId(assessment.module_id);
    setOpenDialog(true);
  };

  const gradesByModule: GradeData[] = useMemo(() => {
    return modules.map(module => {
      const moduleAssessments = assessments.filter(a => a.module_id === module.id);
      
      const submittedAssessments = moduleAssessments.filter(
        a => a.mark_achieved !== null && a.mark_achieved !== undefined && a.submitted
      );

      const pendingAssessments = moduleAssessments.filter(
        a => a.mark_achieved === null || !a.submitted
      );

      let currentProgress = 0;
      let currentProgressWeight = 0;

      if (submittedAssessments.length > 0) {
        const weightedScoreSum = submittedAssessments.reduce((sum, assessment) => {
          const percentage = (assessment.mark_achieved! / assessment.max_mark) * 100;
          const weightedScore = (percentage * assessment.weight_percent) / 100;
          return sum + weightedScore;
        }, 0);

        currentProgressWeight = submittedAssessments.reduce((sum, a) => sum + a.weight_percent, 0);
        
        currentProgress = currentProgressWeight > 0 ? (weightedScoreSum / currentProgressWeight) * 100 : 0;
      }

      const pendingWeight = pendingAssessments.reduce((sum, a) => sum + a.weight_percent, 0);

      return { 
        module, 
        assessments: moduleAssessments, 
        submittedAssessments,
        pendingAssessments,
        currentProgress,
        currentProgressWeight,
        pendingWeight,
      };
    });
  }, [modules, assessments]);

  const moduleGoalsData: ModuleGoal[] = useMemo(() => {
    return gradesByModule.map(({ module, currentProgress, currentProgressWeight, pendingWeight }) => {
      const targetGrade = moduleGoals[module.id] || 70;
      
      if (pendingWeight === 0) {
        const isAchieved = currentProgress >= targetGrade;
        return {
          moduleId: module.id,
          targetGrade,
          currentProgress: currentProgress,
          requiredAverage: 0,
          isAchievable: isAchieved,
          status: isAchieved ? 'achieved' : 'impossible',
          message: isAchieved 
            ? `Target Achieved: Your current progress of ${currentProgress.toFixed(1)}% meets your goal of ${targetGrade}%`
            : `Target Not Met: Your current progress of ${currentProgress.toFixed(1)}% is below your goal of ${targetGrade}%`,
        };
      }

      const requiredAverage = (targetGrade - (currentProgress * currentProgressWeight / 100)) / (pendingWeight / 100);

      let status: 'achieved' | 'challenging' | 'achievable' | 'impossible' = 'achievable';
      let message = '';

      if (requiredAverage <= 0) {
        status = 'achieved';
        message = `Target Secure: Your current progress of ${currentProgress.toFixed(1)}% (from ${currentProgressWeight.toFixed(0)}% of work) already guarantees your goal of ${targetGrade}%, even with 0% on remaining assessments.`;
      } else if (requiredAverage > 100) {
        status = 'impossible';
        message = `Target Impossible: You need ${requiredAverage.toFixed(1)}% on remaining assessments to reach ${targetGrade}%, but the maximum is 100%. Adjust your goal or improve previous work.`;
      } else if (requiredAverage > 80) {
        status = 'challenging';
        message = `Target Challenging: You need ${requiredAverage.toFixed(1)}% on your remaining ${pendingWeight.toFixed(0)}% of work to reach ${targetGrade}%. This is achievable but requires strong performance.`;
      } else {
        status = 'achievable';
        message = `Target Achievable: You need ${requiredAverage.toFixed(1)}% on your remaining ${pendingWeight.toFixed(0)}% of work to reach ${targetGrade}%. This is well within reach with consistent effort.`;
      }

      return {
        moduleId: module.id,
        targetGrade,
        currentProgress: currentProgress,
        requiredAverage: Math.max(0, requiredAverage),
        isAchievable: requiredAverage <= 100 && requiredAverage > 0,
        status,
        message,
      };
    });
  }, [gradesByModule, moduleGoals]);

  const { overallProgress, totalCreditsWithGrades } = useMemo(() => {
    const modulesWithGrades = gradesByModule.filter(
      g => g.submittedAssessments.length > 0 && g.currentProgress > 0
    );

    if (modulesWithGrades.length === 0) {
      return { overallProgress: 0, totalCreditsWithGrades: 0 };
    }

    const totalWeightedScore = modulesWithGrades.reduce((sum, g) => {
      return sum + (g.currentProgress * g.module.credit_weight);
    }, 0);

    const totalCreditWeight = modulesWithGrades.reduce((sum, g) => {
      return sum + g.module.credit_weight;
    }, 0);

    const average = totalCreditWeight > 0 ? totalWeightedScore / totalCreditWeight : 0;

    return { overallProgress: average, totalCreditsWithGrades: totalCreditWeight };
  }, [gradesByModule]);

  const selectedModuleData = gradesByModule.find(
    g => g.module.id === (selectedModuleId || gradesByModule[0]?.module.id)
  );

  const selectedModuleGoal = moduleGoalsData.find(
    g => g.moduleId === (selectedModuleId || gradesByModule[0]?.module.id)
  );

  const getGradeColor = (grade: number) => {
    if (grade >= 80) return 'text-green-700';
    if (grade >= 70) return 'text-blue-700';
    if (grade >= 60) return 'text-amber-700';
    if (grade >= 50) return 'text-orange-700';
    return 'text-red-700';
  };

  const getGradeBgColor = (grade: number) => {
    if (grade >= 80) return 'bg-green-100';
    if (grade >= 70) return 'bg-blue-100';
    if (grade >= 60) return 'bg-amber-100';
    if (grade >= 50) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case 'achieved':
        return 'bg-green-50 border-green-200';
      case 'achievable':
        return 'bg-blue-50 border-blue-200';
      case 'challenging':
        return 'bg-amber-50 border-amber-200';
      case 'impossible':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getGoalStatusTextColor = (status: string) => {
    switch (status) {
      case 'achieved':
        return 'text-green-900';
      case 'achievable':
        return 'text-blue-900';
      case 'challenging':
        return 'text-amber-900';
      case 'impossible':
        return 'text-red-900';
      default:
        return 'text-gray-900';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 bg-muted rounded w-64 animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Grades & Assessments</h1>
          <p className="text-muted-foreground mt-1">Track your current progress and plan to achieve your goals</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openModuleGoalDialog} onOpenChange={setOpenModuleGoalDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Target className="h-4 w-4" /> Set Goals
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Module Target Grade</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Module</label>
                  <Select value={moduleGoalForm.moduleId} onValueChange={(value) => setModuleGoalForm(prev => ({ ...prev, moduleId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a module" />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-3 block">
                    Target Grade: <span className="text-primary font-bold text-lg">{moduleGoalForm.targetGrade}%</span>
                  </label>
                  <Slider 
                    value={[moduleGoalForm.targetGrade]} 
                    onValueChange={(value) => setModuleGoalForm(prev => ({ ...prev, targetGrade: value[0] }))}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-900">
                    Set a target grade for this module. The system will dynamically calculate what you need on remaining assessments.
                  </p>
                </div>
                
                <Button onClick={saveModuleGoal} className="w-full">Save Goal</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setEditingAssessment(null); }} className="gap-2">
                <Plus className="h-4 w-4" /> Add Assessment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingAssessment ? 'Edit Assessment' : 'Add New Assessment'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Module *</label>
                  <Select value={formData.module_id} onValueChange={(value) => setFormData(prev => ({ ...prev, module_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a module" />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Assessment Name *</label>
                  <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                    placeholder="e.g. Midterm Exam"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exam">Exam</SelectItem>
                      <SelectItem value="assignment">Assignment</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="practical">Practical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Mark Achieved <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input 
                      type="number" 
                      value={formData.mark_achieved} 
                      onChange={(e) => setFormData(prev => ({ ...prev, mark_achieved: e.target.value }))} 
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Mark</label>
                    <Input 
                      type="number" 
                      value={formData.max_mark} 
                      onChange={(e) => setFormData(prev => ({ ...prev, max_mark: e.target.value }))} 
                      min="1"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Weight (%)</label>
                  <Input 
                    type="number" 
                    value={formData.weight_percent} 
                    onChange={(e) => setFormData(prev => ({ ...prev, weight_percent: e.target.value }))} 
                    min="0" 
                    max="100"
                    placeholder="e.g. 20"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Assessment weight towards module grade</p>
                </div>
                
                <Button onClick={handleSaveAssessment} className="w-full">
                  {editingAssessment ? 'Update Assessment' : 'Add Assessment'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Progress</p>
                <p className={`text-3xl font-bold mt-1 ${getGradeColor(selectedModuleData?.currentProgress || 0)}`}>
                  {selectedModuleData && selectedModuleData.currentProgressWeight > 0 
                    ? selectedModuleData.currentProgress.toFixed(2) 
                    : 'N/A'}%
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedModuleData && selectedModuleData.currentProgressWeight > 0 
                    ? `Based on ${selectedModuleData.currentProgressWeight.toFixed(0)}% total weight` 
                    : 'No assessments yet'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Modules</p>
                <p className="text-3xl font-bold mt-1">{modules.length}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {gradesByModule.filter(g => g.submittedAssessments.length > 0).length} with grades
                </p>
              </div>
              <Award className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assessments</p>
                <p className="text-3xl font-bold mt-1">{assessments.length}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {assessments.filter(a => a.submitted).length} submitted, {assessments.filter(a => !a.submitted).length} pending
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {gradesByModule.every(g => g.submittedAssessments.length === 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-900">No grades recorded yet</p>
                <p className="text-sm text-amber-800 mt-1">
                  Add assessments with marks to see your progress and goal tracking
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Modules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {gradesByModule.map(({ module, currentProgress, submittedAssessments, currentProgressWeight, pendingWeight }) => {
                const goal = moduleGoalsData.find(g => g.moduleId === module.id);
                return (
                  <button
                    key={module.id}
                    onClick={() => setSelectedModuleId(module.id)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedModuleId === module.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: module.color }} />
                      <span className="font-medium text-sm">{module.code}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{module.name}</p>
                    <div className="mt-2 space-y-1">
                      <div>
                        <p className={`text-xs font-semibold ${getGradeColor(currentProgress)}`}>
                          {currentProgressWeight > 0 ? `${currentProgress.toFixed(1)}%` : 'No grades'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {submittedAssessments.length} done{pendingWeight > 0 ? `, ${pendingWeight.toFixed(0)}% left` : ''}
                        </p>
                      </div>
                      {goal && moduleGoals[module.id] && (
                        <div className="pt-1 border-t border-border">
                          <p className="text-xs text-muted-foreground">Goal: {goal.targetGrade}%</p>
                          <p className={`text-xs font-semibold mt-0.5 ${
                            goal.status === 'achieved' || goal.status === 'achievable' ? 'text-green-600' : 
                            goal.status === 'challenging' ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {goal.status.charAt(0).toUpperCase() + goal.status.slice(1)}
                          </p>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-900">
                <Brain className="h-4 w-4" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-blue-800 mb-3">
                Use AI to analyze your progress
              </p>
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full text-xs"
                onClick={() => {
                  toast.info('AI Advisor feature coming soon!');
                }}
              >
                <Zap className="h-3 w-3 mr-1" />
                Get Insights
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {selectedModuleData && selectedModuleGoal && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{selectedModuleData.module.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedModuleData.module.code} • {selectedModuleData.module.credit_weight} credits
                      </p>
                    </div>
                    <div className={`text-right p-4 rounded-lg ${getGradeBgColor(selectedModuleData.currentProgress)}`}>
                      <p className={`text-2xl font-bold ${getGradeColor(selectedModuleData.currentProgress)}`}>
                        {selectedModuleData.currentProgressWeight > 0 ? selectedModuleData.currentProgress.toFixed(2) : 'N/A'}%
                      </p>
                      <p className="text-xs text-muted-foreground">Current Progress</p>
                      <p className="text-xs mt-1">
                        {selectedModuleData.submittedAssessments.length}/{selectedModuleData.assessments.length} assessments
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {moduleGoals[selectedModuleData.module.id] && (
                <Card className={`border-2 ${getGoalStatusColor(selectedModuleGoal.status)}`}>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`text-sm font-medium ${getGoalStatusTextColor(selectedModuleGoal.status)}`}>
                            Target Grade: {selectedModuleGoal.targetGrade}%
                          </p>
                          <p className={`text-sm mt-2 leading-relaxed ${getGoalStatusTextColor(selectedModuleGoal.status)}`}>
                            {selectedModuleGoal.message}
                          </p>
                        </div>
                        <Target className={`h-6 w-6 shrink-0 ${
                          selectedModuleGoal.status === 'achieved' || selectedModuleGoal.status === 'achievable' ? 'text-green-600' : 
                          selectedModuleGoal.status === 'challenging' ? 'text-amber-600' : 'text-red-600'
                        }`} />
                      </div>

                      {selectedModuleData.pendingWeight > 0 && (
                        <div className={`pt-3 border-t-2 ${
                          selectedModuleGoal.status === 'achieved' ? 'border-green-200' :
                          selectedModuleGoal.status === 'achievable' ? 'border-blue-200' :
                          selectedModuleGoal.status === 'challenging' ? 'border-amber-200' : 'border-red-200'
                        }`}>
                          <div className="flex items-baseline gap-2">
                            <p className={`text-sm font-semibold ${getGoalStatusTextColor(selectedModuleGoal.status)}`}>
                              Need on remaining:
                            </p>
                            <p className={`text-xl font-bold ${getGoalStatusTextColor(selectedModuleGoal.status)}`}>
                              {selectedModuleGoal.requiredAverage.toFixed(1)}%
                            </p>
                          </div>
                          <p className={`text-xs mt-1 ${getGoalStatusTextColor(selectedModuleGoal.status)} opacity-75`}>
                            on {selectedModuleData.pendingWeight.toFixed(0)}% remaining assessments
                          </p>
                        </div>
                      )}

                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setModuleGoalForm({
                            moduleId: selectedModuleData.module.id,
                            targetGrade: moduleGoals[selectedModuleData.module.id] || 70,
                          });
                          setOpenModuleGoalDialog(true);
                        }}
                        className="w-full text-xs mt-2"
                      >
                        Edit Goal
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedModuleData.assessments.length > 0 ? (
                <div className="space-y-3">
                  {selectedModuleData.submittedAssessments.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-green-700">Submitted Assessments ({selectedModuleData.submittedAssessments.length})</h3>
                      {selectedModuleData.submittedAssessments.map(assessment => {
                        const percentage = (assessment.mark_achieved! / assessment.max_mark) * 100;
                        return (
                          <Card key={assessment.id}>
                            <CardContent className="pt-6">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-xs font-semibold uppercase px-2 py-1 bg-primary/10 text-primary rounded-full">
                                      {assessment.type}
                                    </span>
                                    <span className="text-xs text-muted-foreground">Weight: {assessment.weight_percent}%</span>
                                    <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded">
                                      Submitted
                                    </span>
                                  </div>
                                  <h3 className="font-medium">{assessment.name}</h3>
                                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Mark</p>
                                      <p className={`text-lg font-bold ${getGradeColor(percentage)}`}>
                                        {assessment.mark_achieved}/{assessment.max_mark}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Percentage</p>
                                      <p className={`text-lg font-bold ${getGradeColor(percentage)}`}>
                                        {percentage.toFixed(1)}%
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(assessment)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteAssessment(assessment.id)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {selectedModuleData.pendingAssessments.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-amber-700">Pending Assessments ({selectedModuleData.pendingAssessments.length})</h3>
                      {selectedModuleData.pendingAssessments.map(assessment => (
                        <Card key={assessment.id} className="border-amber-200 bg-amber-50">
                          <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="text-xs font-semibold uppercase px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                                    {assessment.type}
                                  </span>
                                  <span className="text-xs text-muted-foreground">Weight: {assessment.weight_percent}%</span>
                                  <span className="text-xs font-medium text-amber-600 bg-amber-200 px-2 py-0.5 rounded">
                                    Not Graded
                                  </span>
                                </div>
                                <h3 className="font-medium">{assessment.name}</h3>
                                <p className="text-xs text-muted-foreground mt-2">Out of {assessment.max_mark} marks</p>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(assessment)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAssessment(assessment.id)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center py-12">
                    <p className="text-muted-foreground">No assessments for this module yet.</p>
                    <Button 
                      onClick={() => { 
                        setFormData(prev => ({ ...prev, module_id: selectedModuleData.module.id }));
                        setOpenDialog(true); 
                      }} 
                      variant="outline" 
                      className="mt-4"
                    >
                      Add Assessment
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}