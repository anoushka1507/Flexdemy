from typing import Literal

from pydantic import BaseModel, Field


Difficulty = Literal["easy", "medium", "hard"]
StreakDirection = Literal["correct", "incorrect", ""]


# ============================================================
# 1.1 EXTRACTION MODELS
# ============================================================

SourceType = Literal["pdf", "slide", "video", "text"]


class Chunk(BaseModel):
    chunk_index: int
    text: str
    approx_page_range: str = Field(
        default="1",
        description="Approximate pages this text spans, e.g., '1-2'"
    )
    source_type: SourceType = "pdf"
    locator: str = Field(
        default="",
        description=(
            "Human-readable citation target for this chunk, e.g. "
            "'Page 3-4', 'Slide 7', '12:34-13:02'. Falls back to "
            "approx_page_range when empty."
        ),
    )
    source_filename: str = ""
    content_hash: str = ""
    mime_type: str = ""
    doc_id: str = ""
    topic_hint: str = ""
    extraction_status: str = "ok"
    warnings: list[str] = Field(default_factory=list)


# ============================================================
# 1.2 CONCEPT MODELS
# ============================================================

class ConceptDraft(BaseModel):
    label: str = Field(
        description="Short, concise name of the concept"
    )
    description: str = Field(
        description="One-line explanation of the concept"
    )
    topic: str = Field(
        default="General",
        description="Parent topic this concept belongs to",
    )
    subtopic: str = Field(
        default="",
        description=(
            "Optional finer grouping within 'topic', if the "
            "material naturally splits into sections under it. "
            "Leave empty when 'topic' alone is specific enough."
        ),
    )
    prerequisites: list[str] = Field(
        default_factory=list,
        description=(
            "Labels of other concepts from this SAME extraction "
            "that a student should understand first. Empty if "
            "this concept has no prerequisites among the others."
        ),
    )
    source_chunk_index: int


class Concept(BaseModel):
    label: str
    description: str
    topic: str = "General"
    subtopic: str = ""
    prerequisites: list[str] = Field(default_factory=list)
    source_chunk_indices: list[int]
    locators: list[str] = Field(default_factory=list)


# ============================================================
# 1.3 QUESTION GENERATION MODELS
# ============================================================

QuestionType = Literal["mcq", "short_answer", "numerical"]


class OptionDraft(BaseModel):
    text: str
    is_correct: bool
    misconception_tag: str | None = Field(
        default=None,
        description=(
            "Named misconception for wrong answers. "
            "Null for the correct answer."
        ),
    )


class QuestionDraft(BaseModel):
    question_text: str
    question_type: QuestionType = "mcq"
    options: list[OptionDraft] = Field(default_factory=list)
    difficulty: Difficulty

    # Short-answer / numerical questions skip `options` and are
    # graded against these instead.
    expected_answer: str | None = None
    numerical_tolerance: float | None = None

    topic: str = "General"
    concept_label: str = ""
    source_locator: str = Field(
        default="",
        description="Citation target this question was generated from.",
    )
    explanation: str = Field(
        default="",
        description="Detailed educational explanation of why the correct answer is right and why key distractors/misconceptions are wrong.",
    )
    hint: str = Field(
        default="",
        description="Helpful educational hint guiding the student without giving away the answer.",
    )


class ValidationResult(BaseModel):
    passed: bool
    notes: str = Field(
        description="Explanation of why the question passed or failed"
    )


class AnswerVerification(BaseModel):
    """Second-pass, independently-prompted grading for a learner's answer."""

    is_correct: bool
    confidence: float = Field(ge=0.0, le=1.0)
    feedback: str
    source_locator: str = ""


# ============================================================
# 1.4 ADAPTIVE ENGINE MODELS
# ============================================================

class ConceptState(BaseModel):
    """
    Runtime performance state for one concept.

    Difficulty and answer streak are GLOBAL to the quiz session.
    This object only tracks how well the student is doing on
    this particular concept.
    """

    concept_label: str

    times_asked: int = 0

    correct_count: int = 0

    incorrect_count: int = 0

    mastery_score: float = 0.30


class AdaptiveQuestion(BaseModel):
    """
    Question stored in adaptive session history.
    """

    question_number: int

    concept_label: str

    difficulty: Difficulty

    question: QuestionDraft


class AdaptiveSession(BaseModel):
    """
    Complete server-side state for one adaptive quiz.
    """

    session_id: str

    title: str

    total_questions: int

    starting_difficulty: Difficulty

    current_difficulty: Difficulty

    streak_direction: StreakDirection = ""

    streak_count: int = 0

    concepts: list[Concept]

    concept_states: dict[str, ConceptState]

    question_types: list[str] = Field(
        default_factory=lambda: ["mcq"]
    )

    questions_asked: int = 0

    current_concept_label: str | None = None

    current_question: QuestionDraft | None = None

    current_question_number: int | None = None

    is_diagnostic: bool = False

    user_id: str | None = None

    answered_results: dict[int, dict] = Field(
        default_factory=dict
    )

    history: list[AdaptiveQuestion] = Field(
        default_factory=list
    )


class AdaptiveQuizStartResponse(BaseModel):
    session_id: str
    title: str
    total_questions: int
    question_number: int
    concept_label: str
    difficulty: Difficulty
    question: QuestionDraft


class AdaptiveQuizAnswerRequest(BaseModel):
    session_id: str
    question_number: int
    selected_option_index: int


class AdaptiveQuizAnswerResponse(BaseModel):
    session_id: str
    completed: bool

    question_number: int
    total_questions: int

    was_correct: bool

    answered_concept: str
    answered_difficulty: Difficulty

    new_difficulty: Difficulty

    streak_direction: StreakDirection
    streak_count: int

    next_question_number: int | None = None

    next_concept: str | None = None

    next_difficulty: Difficulty | None = None
    question: QuestionDraft | None = None

    explanation: str | None = None
    feedback: str | None = None
    misconception: str | None = None
    source_locator: str | None = None


# ============================================================
# 1.5 REPORT MODELS
# ============================================================

class ConceptReport(BaseModel):
    concept_label: str
    final_difficulty: Difficulty
    accuracy: float
    question_count: int


class QuizReportData(BaseModel):
    concepts: list[ConceptReport]
    weakest_concept_labels: list[str]


# ============================================================
# 1.6 STRETCH GOAL
# ============================================================

class CalibrationEstimate(BaseModel):
    suggested_starting_difficulty: Difficulty

    confidence_note: str = Field(
        description="Heuristic note about why this difficulty was chosen."
    )


class ChatTurn(BaseModel):
    role: Literal["user", "model"]
    text: str


# ============================================================
# 1.7 GROUNDED CHAT / RETRIEVAL
# ============================================================

class Citation(BaseModel):
    chunk_index: int
    locator: str
    excerpt: str
    source_type: SourceType = "text"
    source_filename: str = ""


class GroundedChatResponse(BaseModel):
    answer: str
    is_grounded: bool = Field(
        description="False when the question could not be "
        "answered from the uploaded material.",
    )
    citations: list[Citation] = Field(default_factory=list)


# ============================================================
# 1.7b REVISION FLASHCARDS (Track D, Requirement 6b)
# ============================================================

class Flashcard(BaseModel):
    front: str = Field(
        description="Short question, term, or prompt side."
    )
    back: str = Field(
        description="The answer or explanation side."
    )
    source_locator: str = ""


# ============================================================
# 1.8 LEARNER MODEL
# ============================================================

class TopicMastery(BaseModel):
    topic: str
    mastery_score: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Bayesian Knowledge Tracing (BKT) per-topic mastery probability P(L).",
    )
    times_seen: int = 0
    last_updated: str = ""