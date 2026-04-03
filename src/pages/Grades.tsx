// src/pages/Grades.tsx - Complete Implementation with Beautiful UI

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, TrendingUp, Award, BarChart3, Filter } from 'lucide-react';

interface Module {
  id: string;
  name: string;
  code: string;
  color: string;
  credit_weight: number;
}

interface Assessment {
  id: string;
  name: string;
  type: string;
  mark_achieved: number;
  max_mark: number;
  weight_percent: number;
  module_id: string;
  submitted: boolean;
}

interface GradeData {
  module: Module;
  assessments: Assessment[];
  moduleAverage: number;
}

export default function Grades() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'exam',
    mark_achieved: '',
    max_mark: '100',
    weight_percent: '100',
    module_id: '',
  });

  useEffect(() => {
    if (user) {
      fetchModules();
      fetchAssessments();
    }
  }, [user]);

  const fetchModules = async () => {
    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw error;
      setModules(data || []);
      if (data && data.length > 0) {
        setSelectedModuleId(data[0].id);
        setFormData(prev => ({ ...prev, module_id: data[0].id }));
      }
    } catch (error) {
      toast.error('Failed to load modules');
    }
  };

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw error;
      setAssessments(data || []);
    } catch (error) {
      toast.error('Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAssessment = async () => {
    if (!formData.name || !formData.module_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (editingAssessment) {
        const { error } = await supabase
          .from('assessments')
          .update({
            name: formData.name,
            type: formData.type,
            mark_achieved: formData.mark_achieved ? parseInt(formData.mark_achieved) : null,
            max_mark: parseInt(formData.max_mark),
            weight_percent: parseInt(formData.weight_percent),
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
            mark_achieved: formData.mark_achieved ? parseInt(formData.mark_achieved) : null,
            max_mark: parseInt(formData.max_mark),
            weight_percent: parseInt(formData.weight_percent),
            module_id: formData.module_id,
            submitted: !!formData.mark_achieved,
          });
        if (error) throw error;
        toast.success('Assessment added successfully');
      }
      resetForm();
      fetchAssessments();
      setOpenDialog(false);
    } catch (error) {
      toast.error('Failed to save assessment');
    }
  };

  const handleDeleteAssessment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Assessment deleted');
      fetchAssessments();
    } catch (error) {
      toast.error('Failed to delete assessment');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'exam',
      mark_achieved: '',
      max_mark: '100',
      weight_percent: '100',
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
    setOpenDialog(true);
  };

  // Group assessments by module
  const gradesByModule: GradeData[] = useMemo(() => {
    return modules.map(module => {
      const moduleAssessments = assessments.filter(a => a.module_id === module.id);
      const moduleAverage = moduleAssessments.length > 0
        ? moduleAssessments.reduce((sum, a) => {
            const percentage = a.mark_achieved && a.max_mark
              ? (a.mark_achieved / a.max_mark) * 100
              : 0;
            return sum + (percentage * a.weight_percent / 100);
          }, 0)
        : 0;
      return { module, assessments: moduleAssessments, moduleAverage };
    });
  }, [modules, assessments]);

  const overallAverage = useMemo(() => {
    if (gradesByModule.length === 0) return 0;
    return gradesByModule.reduce((sum, g) => sum + g.moduleAverage, 0) / gradesByModule.length;
  }, [gradesByModule]);

  const selectedModuleData = gradesByModule.find(g => g.module.id === (selectedModuleId || gradesByModule[0]?.module.id));

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Grades & Assessments</h1>
          <p className="text-muted-foreground mt-1">Track your academic performance</p>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingAssessment(null); }} className="gap-2">
              <Plus className="h-4 w-4" /> Add Assessment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAssessment ? 'Edit Assessment' : 'Add New Assessment'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Module</label>
                <Select value={formData.module_id} onValueChange={(value) => setFormData(prev => ({ ...prev, module_id: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Assessment Name</label>
                <Input value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Midterm Exam" />
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
                  <label className="text-sm font-medium">Mark Achieved</label>
                  <Input type="number" value={formData.mark_achieved} onChange={(e) => setFormData(prev => ({ ...prev, mark_achieved: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Mark</label>
                  <Input type="number" value={formData.max_mark} onChange={(e) => setFormData(prev => ({ ...prev, max_mark: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Weight (%)</label>
                <Input type="number" value={formData.weight_percent} onChange={(e) => setFormData(prev => ({ ...prev, weight_percent: e.target.value }))} min="0" max="100" />
              </div>
              <Button onClick={handleSaveAssessment} className="w-full">{editingAssessment ? 'Update' : 'Add'} Assessment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Average</p>
                <p className="text-3xl font-bold mt-1">{overallAverage.toFixed(1)}%</p>
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
              </div>
              <BarChart3 className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modules and Assessments */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Modules Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Modules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {gradesByModule.map(({ module, moduleAverage }) => (
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
                  <p className="text-xs text-muted-foreground">{module.name}</p>
                  <p className="text-xs font-semibold mt-1">{moduleAverage.toFixed(1)}%</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Assessments List */}
        <div className="lg:col-span-3 space-y-4">
          {selectedModuleData && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedModuleData.module.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{selectedModuleData.module.code} • {selectedModuleData.module.credit_weight} credits</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{selectedModuleData.moduleAverage.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Module Average</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {selectedModuleData.assessments.length > 0 ? (
                <div className="space-y-3">
                  {selectedModuleData.assessments.map(assessment => {
                    const percentage = assessment.mark_achieved && assessment.max_mark
                      ? (assessment.mark_achieved / assessment.max_mark) * 100
                      : 0;
                    const getGradeColor = (grade: number) => {
                      if (grade >= 80) return 'text-success';
                      if (grade >= 70) return 'text-blue-500';
                      if (grade >= 60) return 'text-amber-500';
                      return 'text-destructive';
                    };
                    return (
                      <Card key={assessment.id}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold uppercase px-2 py-1 bg-primary/10 text-primary rounded-full">
                                  {assessment.type}
                                </span>
                                <span className="text-xs text-muted-foreground">{assessment.weight_percent}% weight</span>
                              </div>
                              <h3 className="font-medium">{assessment.name}</h3>
                              <div className="flex items-center gap-4 mt-2">
                                <div>
                                  <p className="text-xs text-muted-foreground">Mark</p>
                                  <p className={`text-lg font-bold ${getGradeColor(percentage)}`}>
                                    {assessment.mark_achieved !== null ? `${assessment.mark_achieved}/${assessment.max_mark}` : 'N/A'}
                                  </p>
                                </div>
                                {assessment.mark_achieved !== null && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Percentage</p>
                                    <p className={`text-lg font-bold ${getGradeColor(percentage)}`}>{percentage.toFixed(1)}%</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(assessment)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAssessment(assessment.id)}
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
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center py-12">
                    <p className="text-muted-foreground">No assessments yet. Add one to get started!</p>
                    <Button onClick={() => { resetForm(); setOpenDialog(true); }} variant="outline" className="mt-4">
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