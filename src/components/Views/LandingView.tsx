import React from 'react';
import { ViewMode } from '../../types';

interface LandingViewProps {
  setCurrentView: (view: ViewMode) => void;
  onOpenUploadModal: () => void;
  onStartDemoQuiz: () => void;
  dyslexiaMode: boolean;
  setDyslexiaMode: (enabled: boolean) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  setCurrentView,
  onOpenUploadModal,
  onStartDemoQuiz,
  dyslexiaMode,
  setDyslexiaMode,
}) => {
  return (
    <div className="min-h-screen bg-[#f6f6fa] text-[#222138] text-left">
      
      {/* Top Navigation */}
      <nav className="bg-white border-b border-[#d8d7e8] px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md">
            <span className="material-symbols-outlined text-2xl">bolt</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-[#222138]">
            Flex<span className="text-[#7372A5]">demy</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-gray-600">
          <button onClick={() => setCurrentView('dashboard')} className="hover:text-[#7372A5]">
            Dashboard
          </button>
          <a href="#features" className="hover:text-[#7372A5]">Features</a>
          <a href="#how-it-works" className="hover:text-[#7372A5]">How It Works</a>
          <a href="#about" className="hover:text-[#7372A5]">About</a>
        </div>

        <div className="flex items-center gap-4">
          {/* Dyslexia Mode Toggle Button in Nav */}
          <div className="flex items-center gap-2 bg-[#ececf4] px-3 py-1.5 rounded-xl border border-[#d8d7e8]">
            <span className="material-symbols-outlined text-[#7372A5] text-lg">visibility</span>
            <span className="text-xs text-gray-700 font-medium hidden sm:inline">Dyslexia Mode: </span>
            <span className={`text-xs font-bold ${dyslexiaMode ? 'text-[#7372A5]' : 'text-gray-500'}`}>
              {dyslexiaMode ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={() => setDyslexiaMode(!dyslexiaMode)}
              role="switch"
              aria-checked={dyslexiaMode}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                dyslexiaMode ? 'bg-[#7372A5]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  dyslexiaMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        
        {/* Left Hero Content */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ececf4] text-[#7372A5] text-xs font-bold uppercase tracking-wider border border-[#d8d7e8]">
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <span>Your notes. Your pace. Your rules</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-[#222138] tracking-tight leading-tight">
            Upload Your Material, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7372A5] to-[#8c8bbd]">
              Take Smart Quizzes
            </span>
          </h1>

          <p className="text-base text-gray-600 max-w-lg leading-relaxed">
            Turn lecture notes, textbook PDFs, or slides into personalized interactive quizzes in seconds. Tailored feedback and dyslexia-friendly typography make studying effective for everyone.
          </p>

          {/* Call to Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={onOpenUploadModal}
              className="px-6 py-3.5 rounded-2xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-sm shadow-lg shadow-[#7372A5]/30 hover:scale-105 transition-transform flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">upload_file</span>
              <span>Upload Material Now</span>
            </button>

            <button
              onClick={onStartDemoQuiz}
              className="px-6 py-3.5 rounded-2xl bg-white border-2 border-[#d8d7e8] text-[#7372A5] hover:bg-[#ececf4] font-bold text-sm shadow-sm transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">play_circle</span>
              <span>Try Demo Quiz</span>
            </button>
          </div>

          

        </div>

        {/* Right Hero Upload Card - Prominent Dyslexia Toggle right inside Upload Materials Page */}
        <div className="bg-white rounded-3xl p-8 shadow-2xl border border-[#d8d7e8] relative overflow-hidden space-y-6">
          
          {/* Header with Dyslexia Toggle Highlight */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#d8d7e8]">
            <div className="text-center w-full">
              <h3 className="text-xl font-bold text-[#222138]">Upload Your Material</h3>
              <p className="text-xs text-gray-500">PDF, DOCX, PPTX, or raw text</p>
            </div>

            
          </div>

          {/* Dropzone Box */}
          <div
            onClick={onOpenUploadModal}
            className="border-2 border-dashed border-[#d8d7e8] hover:border-[#7372A5] bg-[#f6f6fa] rounded-2xl p-8 text-center cursor-pointer transition-all hover:bg-[#ececf4]/60 group"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-3xl">cloud_upload</span>
            </div>
            <h4 className="font-bold text-sm text-[#222138] mb-1">
              Drag & drop files here, or click to browse
            </h4>
            <p className="text-xs text-gray-400 mb-4">
              Supported formats: PDF, DOCX, TXT (up to 25MB)
            </p>
            <span className="inline-block bg-[#7372A5] hover:bg-[#585785] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm">
              Select Document
            </span>
          </div>

          <div className="bg-[#ececf4]/80 p-4 rounded-2xl border border-[#d8d7e8] flex items-start gap-3">
            <span className="material-symbols-outlined text-[#7372A5] text-xl mt-0.5">auto_awesome</span>
            <p className="text-xs text-gray-700 leading-relaxed font-medium">
              Our AI will analyze your material and instantly create adaptive quizzes tailored to your content with explanations and hints.
            </p>
          </div>
        </div>

      </section>

      {/* Feature Strip Grid */}
      <section id="features" className="bg-white py-16 border-y border-[#d8d7e8]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-3xl font-extrabold text-[#222138]">Built for Modern Learners</h2>
            <p className="text-xs text-gray-500 mt-2">Designed with accessibility, AI intelligence, and cognitive ease in mind</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-[#f6f6fa] border border-[#d8d7e8] hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl">upload_file</span>
              </div>
              <h3 className="font-bold text-base text-[#222138] mb-1">1. Upload Anything</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Import lecture notes, PDFs, or articles seamlessly into the system.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#f6f6fa] border border-[#d8d7e8] hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl">psychology</span>
              </div>
              <h3 className="font-bold text-base text-[#222138] mb-1">2. AI Analyzes</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Gemini AI extracts key concepts, formulas, and critical test points.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#f6f6fa] border border-[#d8d7e8] hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl">quiz</span>
              </div>
              <h3 className="font-bold text-base text-[#222138] mb-1">3. Quiz Generated</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Take interactive quizzes with hint support and accessibility mode.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#f6f6fa] border border-[#d8d7e8] hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl">trending_up</span>
              </div>
              <h3 className="font-bold text-base text-[#222138] mb-1">4. Track & Improve</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                View detailed analytics, topic mastery radar, and automated study recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs font-bold text-[#7372A5] uppercase tracking-wider">Simple Process</span>
          <h2 className="text-3xl font-extrabold text-[#222138] mt-1">How Flexdemy Works</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-2xl border border-[#d8d7e8] shadow-sm relative">
            <span className="text-4xl font-extrabold text-[#d8d7e8] absolute top-4 right-4">01</span>
            <h3 className="font-bold text-lg text-[#222138] mb-2">Connect Your Content</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Paste text or drag and drop your study material into the upload zone.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#d8d7e8] shadow-sm relative">
            <span className="text-4xl font-extrabold text-[#d8d7e8] absolute top-4 right-4">02</span>
            <h3 className="font-bold text-lg text-[#222138] mb-2">Customize Difficulty</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Select your desired difficulty level, question length, and dyslexia mode preference.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#d8d7e8] shadow-sm relative">
            <span className="text-4xl font-extrabold text-[#d8d7e8] absolute top-4 right-4">03</span>
            <h3 className="font-bold text-lg text-[#222138] mb-2">Master Your Subjects</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Answer adaptive questions, review explanations, and practice weak topics.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#222138] text-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#7372A5] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-xl">bolt</span>
            </div>
            <span className="text-lg font-bold text-white">Flexdemy</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Flexdemy Inc. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
};
