# Flexdemy

### Your Notes. Your Pace. Your Rules.

Flexdemy is an AI-powered, inclusive adaptive learning platform that transforms a learner's own study material into personalized practice quizzes.

It is designed around a simple idea:

> The assessment should adapt to the learner, not force every learner through the same question bank.

Flexdemy combines AI-generated assessment, adaptive difficulty, concept-level performance tracking, multimodal study-material ingestion, and accessibility features into one learning experience.

---

# Why Flexdemy?

Digital education can still be a rigid, one-size-fits-all experience, especially for learners who rely on informal or handwritten study material.

Traditional assessment platforms commonly have three limitations:

* Static question banks do not adapt to a student's real-time comprehension.
* Generic learning platforms may not provide sufficient accessibility features for learners with dyslexia and other learning differences.
* Many systems assume clean, digital text and do not account for the handwritten notes that are common in everyday study.

Flexdemy addresses these problems with a software-first adaptive assessment engine that turns study material into dynamic practice.

---

# Core USP

## "Your Notes. Your Pace. Your Rules."

Flexdemy's USP is the combination of three layers of personalization:

### 1. Your Material

Instead of forcing learners to study from a fixed question bank, Flexdemy works from their own learning material.

The intended multimodal ingestion layer can process both conventional documents and informal study material such as handwritten notes, using Gemini's vision capabilities to turn visual content into structured study data.

### 2. Your Knowledge Gaps

Flexdemy tracks performance at the concept level.

If a learner repeatedly struggles with one concept, the adaptive engine can prioritize that concept instead of wasting questions on material the learner has already mastered.

### 3. Your Difficulty

Question difficulty is dynamically adjusted according to the learner's performance.

The system works across:

```text
Easy  →  Medium  →  Hard
```

Two consecutive correct answers can increase difficulty, while two consecutive incorrect answers can decrease it.

This creates a continuous feedback loop rather than a fixed quiz.

---

# Key Features

## AI-Generated Questions

Questions are generated dynamically using Google Gemini, rather than relying entirely on a static question bank.

This allows the quiz to be based on the learner's own material and continuously generate new questions.

---

## Zero-Shot Adaptive Scaling

Flexdemy eliminates the dependence on a traditional fixed question bank.

The adaptive engine:

1. Extracts concepts from study material.
2. Tracks performance for each concept.
3. Selects concepts using performance-aware weighting.
4. Generates questions dynamically.
5. Tracks answer streaks.
6. Adjusts difficulty between Easy, Medium and Hard.
7. Generates the next question according to the updated learner state.

The result is a quiz that changes as the learner changes.

---

## Multimodal Ingestion: The Analog Bridge

Flexdemy is designed to bridge the gap between analog study habits and AI-powered education.

A learner may study from:

* Typed documents
* PDFs
* Text files
* Markdown
* Photographs of handwritten notes

When visual or handwritten material is used, Gemini Vision can be used to transcribe the content into structured study data.

This makes the system particularly relevant to environments where students commonly share or photograph handwritten notes.

---

## Dyslexia-First Accessibility

Flexdemy includes a dedicated accessibility mode designed to reduce the cognitive load associated with heavy reading.

The accessibility experience includes:

* Specialized/dyslexia-friendly typography
* Increased spacing
* Text-to-Speech
* Word highlighting
* A simple accessibility toggle

The goal is to make the same learning content available through both visual and auditory interaction.

---

## Native Text-to-Speech

Flexdemy uses the browser's native Web Speech API through:

```javascript
window.speechSynthesis
```

This allows text to be read aloud without requiring a separate third-party audio service.

---

# End-to-End Workflow

```text
                 ┌──────────────────────┐
                 │       LEARNER        │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  Upload Study Notes  │
                 │ PDF / Text / Images  │
                 └──────────┬───────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │      INGESTION LAYER        │
              │                             │
              │ Text extraction / OCR       │
              │ Handwritten note processing │
              └─────────────┬───────────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │     GEMINI AI        │
                 │                      │
                 │ Concept extraction   │
                 │ Content understanding│
                 │ Question generation  │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  ADAPTIVE ENGINE     │
                 │                      │
                 │ Concept performance  │
                 │ Question history     │
                 │ Answer streak        │
                 │ Difficulty           │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ PERSONALIZED QUESTION│
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │    LEARNER ANSWERS   │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ UPDATE PERFORMANCE   │
                 │                      │
                 │ Correct / Incorrect  │
                 │ Concept state        │
                 │ Answer streak        │
                 │ Difficulty           │
                 └──────────┬───────────┘
                            │
                            └───────────────┐
                                            │
                                            ▼
                                  Generate next
                                  personalized
                                     question
```

---

# Adaptive Quiz Logic

Flexdemy maintains a state for every concept.

For example:

```text
Operating Systems
├── Times Asked: 5
├── Correct: 2
├── Incorrect: 3
└── Accuracy: 40%
```

A weaker concept receives a higher selection weight.

Concept selection therefore behaves approximately like:

```text
Strong Concept     → Lower priority
Moderate Concept   → Medium priority
Weak Concept       → Higher priority
```

This prevents the learner from spending most of their quiz time answering questions on concepts they already understand.

---

# Difficulty Adaptation

Difficulty is represented as:

```text
Easy → Medium → Hard
```

### Two consecutive correct answers

```text
Easy
  ↓
Correct
  ↓
Correct
  ↓
Medium
```

### Two consecutive incorrect answers

```text
Hard
  ↓
Incorrect
  ↓
Incorrect
  ↓
Medium
```

Difficulty is clamped to the valid range:

```text
Easy ≤ Difficulty ≤ Hard
```

This keeps the learner in a more appropriate difficulty zone and helps reduce both boredom and unnecessary frustration.

---

# System Architecture

```text
 ┌─────────────────────────────────────────────────────┐
 │                    FRONTEND                         │
 │                                                     │
 │ React 19 + TypeScript + Vite + Tailwind CSS v4     │
 │                                                     │
 │ Login • Dashboard • Upload • Quiz • Results         │
 │ Accessibility • TTS • Dyslexia Mode                │
 └───────────────────────┬─────────────────────────────┘
                         │
                         │ HTTP / API
                         ▼
 ┌─────────────────────────────────────────────────────┐
 │                    BACKEND                          │
 │                                                     │
 │ Python + FastAPI                                    │
 │                                                     │
 │ Adaptive sessions • Quiz generation                 │
 │ Concept tracking • Difficulty adaptation            │
 │                                                     │
 │ Node.js / Express server-side integration           │
 └───────────────────────┬─────────────────────────────┘
                         │
                         ▼
 ┌─────────────────────────────────────────────────────┐
 │                     AI LAYER                        │
 │                                                     │
 │ Google Gemini SDK                                   │
 │ Gemini 3.1 Flash-Lite                               │
 │                                                     │
 │ Content understanding • OCR/Vision                  │
 │ Concept extraction • Question generation            │
 └───────────────────────┬─────────────────────────────┘
                         │
                         ▼
 ┌─────────────────────────────────────────────────────┐
 │                    SUPABASE                         │
 │                                                     │
 │ Authentication + PostgreSQL database                │
 │                                                     │
 │ Profiles • Materials • Quizzes • Questions          │
 │ Quiz attempts                                       │
 └─────────────────────────────────────────────────────┘
```

---

# Technical Approach

## Frontend

Flexdemy uses:

* React 19
* TypeScript
* Vite
* Tailwind CSS v4

The frontend is responsible for:

* Authentication UI
* Dashboard
* Study-material upload
* Quiz configuration
* Interactive quiz interface
* Results
* Accessibility controls
* Text-to-Speech

---

## Backend

The adaptive engine is implemented using:

* Python
* FastAPI
* Pydantic
* Uvicorn

FastAPI provides the REST API used by the adaptive quiz workflow.

The backend maintains adaptive session state and handles:

* Concept tracking
* Difficulty adaptation
* Question selection
* Answer validation
* Adaptive question generation

---

## Node.js and Express

The project also contains a Node.js/Express server-side layer.

Node.js runs the server-side JavaScript/TypeScript components, while Express handles server routes and HTTP communication used by the application.

The repository therefore contains both the FastAPI adaptive engine and the Node/Express server-side layer.

---

# AI and Multimodal Processing

Google Gemini is the core intelligence layer.

The project uses the Google Gemini SDK, with `gemini-3.1-flash-lite` identified in the solution architecture.

Gemini is responsible for tasks such as:

```text
Study Material
      ↓
Content Understanding
      ↓
Concept Extraction
      ↓
Question Generation
      ↓
Adaptive Assessment
```

For visual or handwritten material, Gemini Vision is used as the multimodal OCR path when standard text extraction is insufficient.

---

# Supabase

Supabase provides:

### Authentication

User sign-up and login are handled through Supabase Auth.

### Database

Learner/application data is stored using Supabase PostgreSQL.

The main application entities include:

```text
profiles
study_materials
quizzes
questions
quiz_attempts
```

Conceptually:

```text
User
 │
 ├── Study Materials
 │
 ├── Quizzes
 │      └── Questions
 │
 └── Quiz Attempts
```

Row Level Security is used to keep user-owned application data isolated.

---

# Project Structure

```text
Flexdemy/
│
├── AI_Layer/
│   ├── ai_core.py
│   ├── models.py
│   └── exceptions.py
│
├── backend/
│   └── main.py
│
├── api/
│
├── src/
│   ├── components/
│   │   ├── Views/
│   │   └── ...
│   ├── data/
│   ├── App.tsx
│   ├── main.tsx
│   ├── supabaseClient.ts
│   └── types.ts
│
├── .env.example
├── package.json
├── requirements.txt
├── server.ts
├── vite.config.ts
├── vercel.json
└── README.md
```

---

# Local Setup

## Prerequisites

Install:

* Git
* Python 3.10+
* Node.js 18+
* npm
* A Supabase project
* A Google Gemini API key

---

# 1. Clone the Repository

```bash
git clone https://github.com/apoorva-6575/Flexdemy.git
cd Flexdemy
```

---

# 2. Install Frontend Dependencies

From the project root:

```bash
npm install
```

---

# 3. Create the Python Virtual Environment

We recommend creating the virtual environment inside `backend/`.

### macOS / Linux

```bash
python3 -m venv backend/venv
```

Activate it:

```bash
source backend/venv/bin/activate
```

### Windows PowerShell

```powershell
py -m venv backend\venv
```

Activate it:

```powershell
.\backend\venv\Scripts\Activate.ps1
```

### Windows CMD

```cmd
py -m venv backend\venv
backend\venv\Scripts\activate
```

You should see:

```text
(venv)
```

at the beginning of your terminal prompt.

---

# 4. Install Backend Dependencies

With the virtual environment activated:

```bash
pip install -r requirements.txt
```

---

# 5. Configure Supabase

Create a `.env` file in the project root:

```text
Flexdemy/
├── .env
├── backend/
├── AI_Layer/
├── src/
└── ...
```

Add:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Get these values from your Supabase project settings.

### Important

Use the public/anon key in the frontend.

Never expose a Supabase service-role key in the frontend.

---

# 6. Configure Gemini

Create:

```text
backend/.env
```

Add:

```env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

The Gemini key is required by the AI/adaptive backend.

---

# 7. Environment File Layout

Your local setup should look like:

```text
Flexdemy/
│
├── .env
│   ├── VITE_SUPABASE_URL
│   └── VITE_SUPABASE_ANON_KEY
│
├── backend/
│   ├── .env
│   │   └── GEMINI_API_KEY
│   ├── venv/
│   └── main.py
│
├── AI_Layer/
├── src/
└── ...
```

Do not commit either `.env` file.

---

# Running Flexdemy

The recommended development workflow uses two terminals.

---

## Terminal 1: Backend

From the project root:

### macOS / Linux

```bash
source backend/venv/bin/activate
```

Then start FastAPI:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Windows PowerShell

```powershell
.\backend\venv\Scripts\Activate.ps1
```

Then:

```powershell
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Backend:

```text
http://localhost:8000
```

FastAPI Swagger documentation:

```text
http://localhost:8000/docs
```

---

# Terminal 2: Frontend

Open a new terminal.

Go to the project root:

```bash
cd Flexdemy
```

Start the Vite frontend:

```bash
npm run dev
```

Vite will display the local URL in the terminal, typically:

```text
http://localhost:5173
```

Open that URL in your browser.

---

# Login

Flexdemy uses Supabase Authentication.

For a demonstration account, use the credentials provided separately by the project team or evaluator.

Do not place real passwords or API keys in this public README.

---

# Testing the Backend

After starting FastAPI, open:

```text
http://localhost:8000/
```

The API should respond with a running-status message.

You can also open:

```text
http://localhost:8000/docs
```

to inspect and test the available FastAPI endpoints through Swagger UI.

---

# Typical User Journey

```text
1. Sign in
      ↓
2. Upload notes
      ↓
3. AI processes the material
      ↓
4. Concepts are identified
      ↓
5. Quiz is generated
      ↓
6. Student answers
      ↓
7. Performance is analyzed
      ↓
8. Weak concepts are prioritized
      ↓
9. Difficulty adapts
      ↓
10. Next question is generated
      ↓
11. Repeat
      ↓
12. View results
```

---

# Accessibility Journey

For a learner who prefers auditory or dyslexia-friendly interaction:

```text
Enable Dyslexia Mode
        ↓
Specialized typography
        +
Increased spacing
        +
Word highlighting
        +
Text-to-Speech
        ↓
Lower reading/cognitive barrier
```

This allows the learner to interact with the same educational material through a more accessible interface.

---

# Impact

## For Students

Flexdemy aims to:

* Reduce rote memorization.
* Encourage conceptual understanding.
* Keep learners in an appropriate difficulty zone.
* Focus practice on weaker areas.

## For Neurodivergent Learners

The accessibility layer provides:

* Dyslexia-focused presentation.
* Increased readability.
* Auditory learning through TTS.
* Reduced dependence on heavy visual reading.

## For Bharat

Flexdemy is specifically positioned as a bridge between:

```text
Local analog study habits
        +
Handwritten/shared notes
        +
Modern AI tutoring
```

This makes the platform especially relevant to learners in Tier-2 and Tier-3 cities, where handwritten notes and informal study material remain an important part of everyday learning.

---

# Feasibility and Viability

## Technical Feasibility

The architecture uses asynchronous Python/FastAPI together with Gemini Flash-Lite to support responsive AI interactions.

## Scalability

The FastAPI backend is designed to be stateless, making the architecture suitable for containerization and horizontal scaling.

Potential deployment environments include cloud platforms such as AWS or Render.

## Commercial Viability

Because the heavy AI workload is abstracted to affordable LLM APIs, the architecture can support models such as:

* B2C freemium
* B2B licensing
* Local coaching-center deployments

---

# Future Scope

Potential future extensions include:

* OCR improvements for difficult handwriting
* More document formats
* Long-term learner mastery profiles
* Spaced repetition
* Advanced learning analytics
* Topic mastery dashboards
* Teacher/coaching-center dashboards
* More question types
* Voice-first learning
* Multilingual learning
* Offline/low-connectivity support
* More advanced personalization models

---

# Security Notes

Never commit:

```text
.env
backend/.env
GEMINI_API_KEY
Supabase service-role keys
Passwords
Private credentials
```

If a key is accidentally exposed:

1. Revoke the key.
2. Generate a new key.
3. Replace the local environment variable.
4. Ensure the secret is removed from the repository/history where appropriate.

---

# Team BlackBox

| Member        | Name           |
| ------------- | -------------- |
| Team Member 1 | Bhoomi Saraf   |
| Team Member 2 | Apoorva Kala   |
| Team Member 3 | Anoushka Singh |
| Team Member 4 | Asdaqa Arif    |

---

# Repository

GitHub:

https://github.com/apoorva-6575/Flexdemy

---

# Flexdemy

### Your Notes. Your Pace. Your Rules.

Flexdemy is built around one core principle:

> Personalized education should adapt to the learner's material, comprehension, pace, and accessibility needs.
