import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { apiFetch } from '../utils/api';

interface ConceptNode {
  label: string;
  description: string;
  topic: string;
  subtopic: string;
  prerequisites: string[];
}

interface CourseFlowMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPracticeTopic?: (topic: string) => void;
}

interface RankedConcept extends ConceptNode {
  level: number; // 0: Foundations, 1: Core, 2: Advanced
  masteryScore: number | null; // Bayesian Knowledge Tracing P(L), null if unassessed
  masteryStatus: 'needs_practice' | 'in_progress' | 'mastered' | 'not_assessed';
}

export const CourseFlowMapModal: React.FC<CourseFlowMapModalProps> = ({
  isOpen,
  onClose,
  onPracticeTopic,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [concepts, setConcepts] = useState<ConceptNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeConcept, setActiveConcept] = useState<RankedConcept | null>(null);
  const [viewMode, setViewMode] = useState<'dag' | 'outline'>('dag');
  const [masteryData, setMasteryData] = useState<Record<string, number>>({});

  // Fetch student's BKT mastery profile on open to color-code DAG nodes
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const fetchMastery = async () => {
      try {
        const res = await apiFetch('/api/mastery');
        if (res.ok) {
          const data = await res.json();
          const scores: Record<string, number> = {};
          Object.entries(data.topics || {}).forEach(([topic, info]: any) => {
            scores[topic.toLowerCase()] = info.mastery_score;
          });
          if (mounted) setMasteryData(scores);
        }
      } catch (err) {
        console.warn('Failed to load mastery data for DAG map:', err);
      }
    };

    fetchMastery();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Compute Topological Sort DAG into Learning Tiers (Level 0 -> Level 1 -> Level 2+)
  const rankedConcepts: RankedConcept[] = useMemo(() => {
    if (!concepts || concepts.length === 0) return [];

    // Deduplicate concepts by normalized label
    const dedupedMap = new Map<string, ConceptNode>();
    for (const c of concepts) {
      const key = (c.label || '').toLowerCase().trim();
      if (key && !dedupedMap.has(key)) {
        dedupedMap.set(key, c);
      }
    }
    const cleanConcepts = Array.from(dedupedMap.values());

    const labelMap = new Map<string, ConceptNode>();
    cleanConcepts.forEach((c) => labelMap.set(c.label.toLowerCase().trim(), c));

    // Calculate topological levels using Kahn's / Longest Path DAG algorithm
    const levels = new Map<string, number>();

    // Step 1: Base level calculation with cycle detection guard (max 10 iterations)
    for (let iter = 0; iter < 10; iter++) {
      let changed = false;
      for (const concept of cleanConcepts) {
        const cKey = concept.label.toLowerCase().trim();
        const currentLevel = levels.get(cKey) ?? 0;

        // Check prerequisites that exist in this concept pool
        const validPrereqs = (concept.prerequisites || [])
          .map((p) => (p || '').toLowerCase().trim())
          .filter((p) => p && labelMap.has(p) && p !== cKey);

        if (validPrereqs.length === 0) {
          if (!levels.has(cKey)) {
            levels.set(cKey, 0);
            changed = true;
          }
        } else {
          let maxPrereqLevel = 0;
          for (const p of validPrereqs) {
            const pLevel = levels.get(p) ?? 0;
            if (pLevel >= maxPrereqLevel) {
              maxPrereqLevel = pLevel + 1;
            }
          }
          if (maxPrereqLevel !== currentLevel) {
            levels.set(cKey, maxPrereqLevel);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    return cleanConcepts.map((c) => {
      const cKey = c.label.toLowerCase().trim();
      const rawLevel = levels.get(cKey) ?? 0;
      // Clamp to Tier 0, Tier 1, Tier 2
      const level = Math.min(2, rawLevel);

      // Lookup student BKT score P(L) for topic or concept
      const topicKey = (c.topic || '').toLowerCase().trim();
      const topicScore = masteryData[topicKey] ?? masteryData[cKey];

      // Distinguish unassessed from measured mastery: never treat missing attempts as measured mastery
      let masteryStatus: 'needs_practice' | 'in_progress' | 'mastered' | 'not_assessed';
      if (topicScore === undefined || topicScore === null) {
        masteryStatus = 'not_assessed';
      } else if (topicScore >= 0.75) {
        masteryStatus = 'mastered';
      } else if (topicScore >= 0.40) {
        masteryStatus = 'in_progress';
      } else {
        masteryStatus = 'needs_practice';
      }

      return {
        ...c,
        level,
        masteryScore: topicScore ?? null,
        masteryStatus,
      };
    });
  }, [concepts, masteryData]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setConcepts(null);
    setActiveConcept(null);
    setError('');
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await apiFetch('/api/extract-concepts', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMessage = `Could not analyze this file (${response.status}).`;
        try {
          const errData = await response.json();
          if (errData && errData.detail) {
            errMessage = errData.detail;
          }
        } catch (_) {}
        throw new Error(errMessage);
      }

      const data = await response.json();
      setConcepts(data.concepts || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not build the course map.'
      );
    } finally {
      setLoading(false);
    }
  };

  const tier0 = rankedConcepts.filter((c) => c.level === 0);
  const tier1 = rankedConcepts.filter((c) => c.level === 1);
  const tier2 = rankedConcepts.filter((c) => c.level >= 2);

  const getStatusBadge = (status: RankedConcept['masteryStatus'], score: number | null) => {
    switch (status) {
      case 'mastered':
        return (
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
            Mastered • P(L)={score?.toFixed(2)}
          </span>
        );
      case 'in_progress':
        return (
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
            In Progress • P(L)={score?.toFixed(2)}
          </span>
        );
      case 'needs_practice':
        return (
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">
            Needs Practice • P(L)={score?.toFixed(2)}
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-300">
            Not Assessed • No attempts yet
          </span>
        );
    }
  };

  const getNodeBorder = (status: RankedConcept['masteryStatus'], isSelected: boolean) => {
    if (isSelected) return 'border-[#7372A5] ring-2 ring-[#7372A5]/30 shadow-md bg-purple-50/40';
    switch (status) {
      case 'mastered':
        return 'border-emerald-300 hover:border-emerald-400 bg-emerald-50/30';
      case 'in_progress':
        return 'border-amber-300 hover:border-amber-400 bg-amber-50/30';
      case 'needs_practice':
        return 'border-rose-200 hover:border-rose-300 bg-rose-50/30';
      default:
        return 'border-gray-200 hover:border-gray-300 bg-white';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="course-flow-title">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl border border-[#d8d7e8] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-[#7372A5] text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl">account_tree</span>
              <h3 id="course-flow-title" className="font-extrabold text-lg">Course Flow & Prerequisite DAG</h3>
            </div>
            <p className="text-xs text-purple-100 mt-0.5">
              Explore topic dependencies, learning order, and your mastery.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {concepts && (
              <div className="flex rounded-xl bg-white/10 p-1 text-xs">
                <button
                  onClick={() => setViewMode('dag')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    viewMode === 'dag'
                      ? 'bg-white text-[#7372A5] shadow-xs'
                      : 'text-white hover:text-purple-200'
                  }`}
                >
                  DAG Flow
                </button>
                <button
                  onClick={() => setViewMode('outline')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    viewMode === 'outline'
                      ? 'bg-white text-[#7372A5] shadow-xs'
                      : 'text-white hover:text-purple-200'
                  }`}
                >
                  Topic Tree
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-left">
          {!concepts && (
            <div className="max-w-xl mx-auto space-y-4 py-8">
              <div className="border-2 border-dashed border-[#d8d7e8] rounded-3xl p-8 text-center bg-[#f6f6fa] relative hover:border-[#7372A5] transition-all">
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.pptx,.mp4,.mov,.webm,.mkv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span className="material-symbols-outlined text-4xl text-[#7372A5] mb-2 block">
                  upload_file
                </span>
                <p className="text-sm font-bold text-[#222138]">
                  {selectedFile
                    ? `Selected: ${selectedFile.name}`
                    : 'Upload course notes, slides, or transcript to map'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Extracts prerequisites, topological tiers, and BKT color-coding
                </p>
              </div>

              {error && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-rose-600 text-sm mt-0.5">error</span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-rose-800">Extraction Unsuccessful</p>
                      <p className="text-xs text-rose-700 leading-relaxed">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={!selectedFile || loading}
                  className="flex-1 py-3.5 rounded-2xl bg-[#7372A5] hover:bg-[#585785] text-white font-extrabold text-sm shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span>Extracting Concepts & Prerequisites...</span>
                  ) : error ? (
                    <>
                      <span className="material-symbols-outlined text-sm">refresh</span>
                      <span>Retry Concept Extraction</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">hub</span>
                      <span>Generate Course Prerequisite DAG</span>
                    </>
                  )}
                </button>
                {selectedFile && !loading && (
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setError('');
                    }}
                    className="px-4 py-3.5 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-bold text-xs"
                    title="Clear selected file"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {concepts && concepts.length === 0 && (
            <div className="p-8 text-center space-y-3">
              <span className="material-symbols-outlined text-3xl text-gray-400">info</span>
              <p className="text-xs text-gray-500">
                No distinct concepts could be extracted from this file.
              </p>
              <button
                onClick={() => {
                  setConcepts(null);
                  setSelectedFile(null);
                }}
                className="text-xs font-bold text-[#7372A5] hover:underline"
              >
                Upload a different document
              </button>
            </div>
          )}

          {/* DAG Map View */}
          {concepts && concepts.length > 0 && viewMode === 'dag' && (
            <div className="space-y-6">
              {/* Mastery Legend */}
              <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-2xl bg-[#f8f8fc] border border-[#e8e8f2] text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-[#222138]">Mastery Legend:</span>
                  <span className="flex items-center gap-1.5 font-semibold text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                    Not Assessed (No attempts)
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold text-rose-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                    Needs Practice (&lt;40%)
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold text-amber-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    In Progress (40-75%)
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Mastered (&gt;75%)
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-400">
                  Client-side DAG • 0 LLM Tokens
                </span>
              </div>

              {/* 3-Column Tiered Layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative">
                {/* Tier 1: Foundations */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-purple-200">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 text-[#7372A5] font-extrabold text-xs flex items-center justify-center">
                      1
                    </span>
                    <div>
                      <h4 className="font-extrabold text-xs text-[#222138] uppercase tracking-wide">
                        Tier 1: Foundations
                      </h4>
                      <p className="text-[10px] text-gray-400">Entry-level prerequisites</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {tier0.map((c) => (
                      <div
                        key={c.label}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select foundation concept ${c.label}`}
                        onClick={() => setActiveConcept(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveConcept(c);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${getNodeBorder(
                          c.masteryStatus,
                          activeConcept?.label === c.label
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <h5 className="font-extrabold text-xs text-[#222138] leading-snug">
                            {c.label}
                          </h5>
                          {getStatusBadge(c.masteryStatus, c.masteryScore)}
                        </div>
                        <span className="text-[10px] font-bold text-[#7372A5] block mb-1">
                          {c.topic}
                        </span>
                        <p className="text-[11px] text-gray-600 line-clamp-2">
                          {c.description}
                        </p>
                      </div>
                    ))}
                    {tier0.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No entry nodes found.</p>
                    )}
                  </div>
                </div>

                {/* Tier 2: Core Concepts */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-purple-200">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 text-[#7372A5] font-extrabold text-xs flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <h4 className="font-extrabold text-xs text-[#222138] uppercase tracking-wide">
                        Tier 2: Core Principles
                      </h4>
                      <p className="text-[10px] text-gray-400">Depends on foundations</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {tier1.map((c) => (
                      <div
                        key={c.label}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select core principle ${c.label}`}
                        onClick={() => setActiveConcept(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveConcept(c);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${getNodeBorder(
                          c.masteryStatus,
                          activeConcept?.label === c.label
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <h5 className="font-extrabold text-xs text-[#222138] leading-snug">
                            {c.label}
                          </h5>
                          {getStatusBadge(c.masteryStatus, c.masteryScore)}
                        </div>
                        <span className="text-[10px] font-bold text-[#7372A5] block mb-1">
                          {c.topic}
                        </span>
                        <p className="text-[11px] text-gray-600 line-clamp-2">
                          {c.description}
                        </p>
                        {c.prerequisites.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.prerequisites.map((p) => (
                              <span
                                key={p}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100/70 text-[#7372A5]"
                              >
                                ← {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {tier1.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No intermediate nodes.</p>
                    )}
                  </div>
                </div>

                {/* Tier 3: Advanced Applications */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-purple-200">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 text-[#7372A5] font-extrabold text-xs flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <h4 className="font-extrabold text-xs text-[#222138] uppercase tracking-wide">
                        Tier 3: Advanced
                      </h4>
                      <p className="text-[10px] text-gray-400">Capstone applications</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {tier2.map((c) => (
                      <div
                        key={c.label}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select advanced application ${c.label}`}
                        onClick={() => setActiveConcept(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveConcept(c);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${getNodeBorder(
                          c.masteryStatus,
                          activeConcept?.label === c.label
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <h5 className="font-extrabold text-xs text-[#222138] leading-snug">
                            {c.label}
                          </h5>
                          {getStatusBadge(c.masteryStatus, c.masteryScore)}
                        </div>
                        <span className="text-[10px] font-bold text-[#7372A5] block mb-1">
                          {c.topic}
                        </span>
                        <p className="text-[11px] text-gray-600 line-clamp-2">
                          {c.description}
                        </p>
                        {c.prerequisites.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.prerequisites.map((p) => (
                              <span
                                key={p}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100/70 text-[#7372A5]"
                              >
                                ← {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {tier2.length === 0 && (
                      <p className="text-xs text-gray-400 italic">All concepts masterable in Tiers 1-2.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Concept Details Drawer */}
              {activeConcept && (
                <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-[#222138]">
                        {activeConcept.label}
                      </span>
                      {getStatusBadge(activeConcept.masteryStatus, activeConcept.masteryScore)}
                    </div>
                    <button
                      onClick={() => setActiveConcept(null)}
                      className="text-gray-400 hover:text-gray-600 text-xs font-bold"
                    >
                      Close details
                    </button>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{activeConcept.description}</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-600 pt-1">
                    <div>
                      <strong className="text-gray-700">Topic:</strong> {activeConcept.topic}
                    </div>
                    {activeConcept.subtopic && (
                      <div>
                        <strong className="text-gray-700">Subtopic:</strong> {activeConcept.subtopic}
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <strong className="text-gray-700">Prerequisites:</strong>{' '}
                      {activeConcept.prerequisites.length > 0
                        ? activeConcept.prerequisites.join(', ')
                        : 'None (Foundational concept)'}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-purple-200/80 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 text-purple-900 font-semibold text-[11px]">
                      <span className="material-symbols-outlined text-sm text-[#7372A5]">tips_and_updates</span>
                      <span>
                        <strong>Action:</strong>{' '}
                        {activeConcept.masteryStatus === 'not_assessed'
                          ? 'Take a diagnostic or practice quiz to establish baseline mastery.'
                          : activeConcept.masteryStatus === 'needs_practice'
                          ? 'Priority review recommended. Target this weak topic to reinforce foundations.'
                          : activeConcept.masteryStatus === 'in_progress'
                          ? 'Consolidate understanding with targeted practice questions.'
                          : 'Solid mastery achieved! Keep sharp with periodic spaced reviews.'}
                      </span>
                    </div>

                    {onPracticeTopic && (
                      <button
                        onClick={() => {
                          onPracticeTopic(activeConcept.topic || activeConcept.label);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-xs">quiz</span>
                        <span>Practise Topic</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Outline View */}
          {concepts && concepts.length > 0 && viewMode === 'outline' && (
            <div className="space-y-4">
              {Array.from(new Set(concepts.map((c) => c.topic))).map((topic) => {
                const topicConcepts = rankedConcepts.filter((c) => c.topic === topic);
                return (
                  <div key={topic} className="border border-[#d8d7e8] rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#7372A5]">folder</span>
                      <h4 className="font-bold text-sm text-[#222138]">{topic}</h4>
                    </div>

                    <div className="space-y-2 ml-4">
                      {topicConcepts.map((c) => (
                        <div
                          key={c.label}
                          className="flex items-start justify-between gap-2 text-xs p-2.5 rounded-xl bg-[#f8f8fc] border border-[#e8e8f2]"
                        >
                          <div>
                            <span className="font-bold text-gray-800">{c.label}</span>
                            <p className="text-[11px] text-gray-500 mt-0.5">{c.description}</p>
                            {c.prerequisites.length > 0 && (
                              <span className="text-[10px] text-amber-700 block mt-1">
                                Requires: {c.prerequisites.join(', ')}
                              </span>
                            )}
                          </div>
                          {getStatusBadge(c.masteryStatus, c.masteryScore)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {concepts && (
            <div className="pt-2 border-t border-[#d8d7e8] flex justify-between items-center">
              <button
                onClick={() => {
                  setConcepts(null);
                  setSelectedFile(null);
                  setActiveConcept(null);
                }}
                className="text-xs font-bold text-[#7372A5] hover:underline"
              >
                ← Map a different file
              </button>
              <span className="text-[11px] text-gray-400">
                {rankedConcepts.length} concepts loaded
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
