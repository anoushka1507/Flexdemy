import React, { useState } from 'react';

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
}

// Track D optional 6a: a visual map of how a course's topics,
// subtopics, and concepts relate — including prerequisite order.
// Thin version: a grouped hierarchy with prerequisite links shown
// as tags, not a draggable node-and-arrow graph (that's real extra
// work for no functional difference — this still visually shows
// topics, subtopics, concepts, and their prerequisite relationships,
// which is what the requirement actually asks for).
export const CourseFlowMapModal: React.FC<CourseFlowMapModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [concepts, setConcepts] = useState<ConceptNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setConcepts(null);
    setError('');
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/extract-concepts', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Could not analyze this file (${response.status}).`);
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

  const topics = concepts
    ? Array.from(new Set(concepts.map((c) => c.topic)))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-[#d8d7e8] overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 bg-[#7372A5] text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">Course Flow Map</h3>
            <p className="text-xs text-gray-200">
              Topics, subtopics, and prerequisite order for your material
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-left">
          {!concepts && (
            <>
              <div className="border-2 border-dashed border-[#d8d7e8] rounded-2xl p-6 text-center bg-[#f6f6fa] relative">
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.pptx,.mp4,.mov,.webm,.mkv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span className="material-symbols-outlined text-3xl text-[#7372A5] mb-1">
                  account_tree
                </span>
                <p className="text-xs font-bold text-[#222138]">
                  {selectedFile
                    ? `Selected: ${selectedFile.name}`
                    : 'Click to upload material to map'}
                </p>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                onClick={handleGenerate}
                disabled={!selectedFile || loading}
                className="w-full py-3 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-sm shadow-md disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : 'Generate Course Map'}
              </button>
            </>
          )}

          {concepts && topics.length === 0 && (
            <p className="text-xs text-gray-500">
              No concepts could be extracted from this file.
            </p>
          )}

          {concepts &&
            topics.map((topic) => {
              const topicConcepts = concepts.filter((c) => c.topic === topic);
              const subtopics = Array.from(
                new Set(topicConcepts.map((c) => c.subtopic).filter((s) => s))
              );

              return (
                <div
                  key={topic}
                  className="border border-[#d8d7e8] rounded-2xl p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[#7372A5]">
                      folder
                    </span>
                    <h4 className="font-bold text-sm text-[#222138]">
                      {topic}
                    </h4>
                  </div>

                  {subtopics.length > 0 ? (
                    subtopics.map((subtopic) => (
                      <div key={subtopic} className="ml-6 mb-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">
                          {subtopic}
                        </p>
                        <div className="ml-4 space-y-1.5">
                          {topicConcepts
                            .filter((c) => c.subtopic === subtopic)
                            .map((c) => (
                              <ConceptRow key={c.label} concept={c} />
                            ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="ml-6 space-y-1.5">
                      {topicConcepts.map((c) => (
                        <ConceptRow key={c.label} concept={c} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

          {concepts && (
            <button
              onClick={() => {
                setConcepts(null);
                setSelectedFile(null);
              }}
              className="text-xs font-bold text-[#7372A5] hover:underline"
            >
              Map a different file
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ConceptRow: React.FC<{ concept: ConceptNode }> = ({ concept }) => (
  <div className="flex items-start gap-1.5 text-xs text-gray-700">
    <span className="material-symbols-outlined text-sm text-[#7372A5] mt-0.5">
      radio_button_checked
    </span>
    <div>
      <span className="font-medium">{concept.label}</span>
      {concept.prerequisites.length > 0 && (
        <span className="text-[11px] text-amber-700">
          {' '}
          — requires: {concept.prerequisites.join(', ')}
        </span>
      )}
    </div>
  </div>
);
