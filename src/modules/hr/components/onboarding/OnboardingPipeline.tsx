'use client';

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus, FileText, FileSignature, Shirt, CheckCircle2,
  ChevronRight, Clock, MoreVertical, Trash2, ArrowRight,
  Phone, Calendar, Building2, User, CheckCircle, Circle, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useBranch } from "@/contexts/BranchContext";
import { BrandLoader } from "@/components/ui/brand-loader";
import {
  listOnboardingCandidates, cancelOnboardingCandidate,
  type OnboardingCandidate, type OnboardingStage,
} from "@/services/supabase/OnboardingService";
import { OnboardingWizard } from "./OnboardingWizard";
import { EmployeeForm } from "../employee/EmployeeForm";

const STAGES: { key: OnboardingStage; label: string; icon: any; color: string }[] = [
  { key: 'details', label: 'Details', icon: UserPlus, color: 'blue' },
  { key: 'documents', label: 'Documents', icon: FileText, color: 'purple' },
  { key: 'agreement', label: 'Agreement', icon: FileSignature, color: 'amber' },
  { key: 'uniform', label: 'Uniform', icon: Shirt, color: 'cyan' },
  { key: 'review', label: 'Review', icon: CheckCircle2, color: 'emerald' },
];

function stageIndex(stage: OnboardingStage): number {
  const idx = STAGES.findIndex(s => s.key === stage);
  return idx >= 0 ? idx : 0;
}

function stageProgress(stage: OnboardingStage): number {
  if (stage === 'onboarded') return 100;
  const idx = stageIndex(stage);
  return Math.round((idx / STAGES.length) * 100);
}

export function OnboardingPipeline() {
  const [candidates, setCandidates] = useState<OnboardingCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState<OnboardingCandidate | null>(null);
  const [activeStepKey, setActiveStepKey] = useState<OnboardingStage | null>(null);
  const { toast } = useToast();
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.code || currentBranch?.id;
  // Inventory rows key `branch` on the branch UUID, not the BR-code, so the
  // uniform step needs the raw id to match stock.
  const branchUuid = currentBranch?.id;

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    const result = await listOnboardingCandidates(branchId);
    if (result.success) setCandidates(result.data);
    setIsLoading(false);
  }, [branchId]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const handleStartNew = () => setShowNewForm(true);

  const handleNewFormSave = async (formData: any) => {
    // This is handled by the OnboardingWizard's handleEmployeeFormSave
    setShowNewForm(false);
    loadCandidates();
  };

  const handleCancel = async (id: string) => {
    const result = await cancelOnboardingCandidate(id);
    if (result.success) { toast({ title: "Cancelled" }); loadCandidates(); }
  };

  const openStepModal = (candidate: OnboardingCandidate, stepKey: OnboardingStage) => {
    setActiveCandidate(candidate);
    setActiveStepKey(stepKey);
  };

  const closeStepModal = (didChange: boolean) => {
    setActiveCandidate(null);
    setActiveStepKey(null);
    if (didChange) loadCandidates();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <BrandLoader size="lg" message="Loading onboarding pipeline..." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Employee Onboarding</h3>
          <p className="text-sm text-muted-foreground">
            Add details → Collect documents → Sign agreement → Issue uniform → Review & onboard
          </p>
        </div>
        <Button onClick={handleStartNew} className="bg-safend-red hover:bg-safend-red/90 text-white">
          <UserPlus className="h-4 w-4 mr-2" />
          Start Onboarding
        </Button>
      </div>

      {/* Stage overview strip */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card text-xs font-medium">
              <s.icon className="h-3.5 w-3.5 text-safend-red" />
              {s.label}
              <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                {candidates.filter(c => c.stage === s.key).length}
              </Badge>
            </div>
            {i < STAGES.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Candidates */}
      <AnimatePresence mode="popLayout">
        {candidates.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 bg-muted/50 rounded-full mb-4">
                  <UserPlus className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h4 className="text-lg font-semibold mb-1">No candidates in the pipeline</h4>
                <p className="text-muted-foreground text-sm mb-4">Start onboarding a new hire to begin the process</p>
                <Button onClick={handleStartNew} className="bg-safend-red hover:bg-safend-red/90 text-white">
                  <UserPlus className="h-4 w-4 mr-2" /> Start Onboarding
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {candidates.map((candidate, idx) => {
              const currentIdx = stageIndex(candidate.stage);
              const progress = stageProgress(candidate.stage);
              const completedSteps = currentIdx;
              return (
                <motion.div
                  key={candidate.id}
                  layout
                  initial={{ opacity: 0, y: 30, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.06 }}
                  whileHover={{ y: -4, boxShadow: '0 20px 40px -12px rgba(215,25,32,0.15)' }}
                  className="rounded-xl"
                >
                  <Card className="overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 rounded-xl" style={{ aspectRatio: '3/2' }}>
                    {/* Red accent top bar */}
                    <div className="h-1 bg-linear-to-r from-safend-red via-red-400 to-safend-red" />

                    <CardContent className="p-4 h-[calc(100%-4px)] flex flex-col justify-between">
                      {/* Row 1: Photo + Info side by side */}
                      <div className="flex gap-3">
                        {/* Rectangular photo */}
                        <div className="w-20 h-24 rounded-lg overflow-hidden bg-muted/40 shrink-0 border">
                          {candidate.photoUrl ? (
                            <img src={candidate.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                        {/* Name + details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-bold text-base leading-tight truncate">{candidate.name}</p>
                              <p className="text-xs text-muted-foreground">{candidate.designation || 'Unassigned'}</p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 hover:opacity-100 shrink-0">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="text-red-600" onClick={() => handleCancel(candidate.id!)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Cancel
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] mt-1">
                            <div className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{candidate.phone || '—'}</div>
                            <div className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" />{candidate.department || '—'}</div>
                            <div className="flex items-center gap-1 text-muted-foreground"><Calendar className="h-3 w-3" />{candidate.joinDate ? new Date(candidate.joinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</div>
                            <div className="flex items-center gap-1 text-muted-foreground"><User className="h-3 w-3" />{candidate.gender ? candidate.gender.charAt(0).toUpperCase() + candidate.gender.slice(1) : '—'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Progress with milestones */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-muted-foreground">{completedSteps} of {STAGES.length} steps completed</span>
                          <span className="font-bold text-safend-red">{progress}%</span>
                        </div>
                        {/* Milestone stepper */}
                        <div className="flex items-center">
                          {STAGES.map((s, i) => {
                            const isDone = i < currentIdx;
                            const isCurrent = i === currentIdx;
                            return (
                              <React.Fragment key={s.key}>
                                {/* Dot */}
                                <div className={`w-3 h-3 rounded-full shrink-0 border-2 ${
                                  isDone ? 'bg-safend-red border-safend-red' :
                                  isCurrent ? 'bg-white border-safend-red' :
                                  'bg-gray-200 border-gray-300'
                                }`}>
                                  {isDone && <CheckCircle className="w-full h-full text-white" />}
                                </div>
                                {/* Connecting line (not after last) */}
                                {i < STAGES.length - 1 && (
                                  <div className={`flex-1 h-[2px] ${i < currentIdx ? 'bg-safend-red' : 'bg-gray-200'}`} />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {/* Labels */}
                        <div className="flex justify-between">
                          {STAGES.map((s, i) => (
                            <span key={s.key} className={`text-[7px] text-center leading-tight w-[18%] ${
                              i < currentIdx ? 'text-safend-red font-medium' :
                              i === currentIdx ? 'text-safend-red font-bold' :
                              'text-muted-foreground'
                            }`}>{s.label}</span>
                          ))}
                        </div>
                      </div>

                      {/* Row 3: Step buttons */}
                      <div className="grid grid-cols-5 gap-1">
                        {STAGES.map((stage, i) => {
                          const isDone = i < currentIdx;
                          const isCurrent = i === currentIdx;
                          const isFuture = i > currentIdx;
                          return (
                            <motion.button
                              key={stage.key}
                              type="button"
                              whileHover={!isFuture ? { scale: 1.06, y: -1 } : {}}
                              whileTap={!isFuture ? { scale: 0.93 } : {}}
                              disabled={isFuture}
                              onClick={() => { if (!isFuture) openStepModal(candidate, stage.key); }}
                              className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-0.5 text-[8px] font-semibold transition-all ${
                                isDone
                                  ? 'bg-emerald-50 text-emerald-700 shadow-xs cursor-pointer'
                                  : isCurrent
                                  ? 'bg-safend-red text-white shadow-md shadow-red-200 cursor-pointer'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              {isDone ? (
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                              ) : isCurrent ? (
                                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                                  <stage.icon className="h-3.5 w-3.5" />
                                </motion.div>
                              ) : (
                                <Circle className="h-3.5 w-3.5" />
                              )}
                              <span className="leading-none">{stage.label}</span>
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Row 4: Footer */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-dashed text-[9px] text-muted-foreground">
                        <span>{candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                        <span className="inline-flex items-center gap-1 font-medium text-safend-red">
                          <ArrowRight className="h-3 w-3" /> {STAGES[currentIdx]?.label}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* ── New employee form (Step 1 for new candidates) ── */}
      {showNewForm && (
        <OnboardingWizard
          candidate={null}
          branchId={branchId}
          branchUuid={branchUuid}
          stepOverride="details"
          onClose={(didChange) => { setShowNewForm(false); if (didChange) loadCandidates(); }}
        />
      )}

      {/* ── Step-specific modal ── */}
      {activeCandidate && activeStepKey && (
        <OnboardingWizard
          candidate={activeCandidate}
          branchId={branchId}
          branchUuid={branchUuid}
          stepOverride={activeStepKey}
          onClose={closeStepModal}
        />
      )}
    </div>
  );
}
