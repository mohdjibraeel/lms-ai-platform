import os
import json
import time
import psycopg2  # pyright: ignore[reportMissingModuleSource]
import redis  # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]
from pgvector.psycopg2 import register_vector  # pyright: ignore[reportMissingImports]
from fastapi import FastAPI, HTTPException, Request  # pyright: ignore[reportMissingImports]
from fastapi.responses import JSONResponse  # pyright: ignore[reportMissingImports]
from fastapi.exceptions import RequestValidationError  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel  # pyright: ignore[reportMissingImports]
from sentence_transformers import SentenceTransformer  # pyright: ignore[reportMissingImports]
from google import genai
from google.genai.errors import ServerError  # pyright: ignore[reportMissingImports]

load_dotenv()

app = FastAPI()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

redis_client = redis.Redis(host="localhost", port=6380, decode_responses=True)


# ---------------------------------------------------------------------------
# Gap 5 — PRD-compliant error format (§8.8)
# ---------------------------------------------------------------------------

class APIError(HTTPException):
    """Raise this instead of HTTPException directly, so every error we
    return matches the PRD's { "error": { code, message, field } } shape."""
    def __init__(self, status_code: int, code: str, message: str, field: str | None = None):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.field = field


@app.exception_handler(APIError)
def api_error_handler(request: Request, exc: APIError):
    body = {"error": {"code": exc.code, "message": exc.message}}
    if exc.field:
        body["error"]["field"] = exc.field
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError):
    # Catches malformed request bodies (e.g. missing "message" field)
    # and reformats FastAPI's default error into the PRD's shape.
    first_error = exc.errors()[0]
    field = ".".join(str(p) for p in first_error["loc"] if p != "body")
    return JSONResponse(
        status_code=400,
        content={"error": {
            "code": "VALIDATION_ERROR",
            "message": first_error["msg"],
            "field": field,
        }},
    )


# ---------------------------------------------------------------------------
# Gap 6 — Rate limiting, /ai/chat/* only, 20 req/min/user (PRD §8.9)
# ---------------------------------------------------------------------------

def check_rate_limit(user_id: str, limit: int = 20, window_seconds: int = 60):
    key = f"ratelimit:ai_chat:{user_id}"
    try:
        current = redis_client.incr(key)
        if current == 1:
            redis_client.expire(key, window_seconds)
        if current > limit:
            raise APIError(
                status_code=429,
                code="RATE_LIMIT_EXCEEDED",
                message="Too many AI chat requests. Limit is 20 per minute, please slow down.",
            )
    except redis.exceptions.RedisError:
        # Redis being down shouldn't take down the whole AI Tutor —
        # fail open rather than blocking every request.
        pass


def get_db_connection():
    conn = psycopg2.connect(
        host="localhost", port=5433, dbname="lms_ai_db",
        user="lms_user", password="lms_pass",
    )
    register_vector(conn)
    return conn


def call_gemini(prompt: str, max_retries: int = 2) -> str:
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
            )
            return response.text
        except ServerError as e:
            if attempt < max_retries - 1:
                time.sleep(3)
                continue
            raise APIError(
                status_code=503,
                code="AI_SERVICE_UNAVAILABLE",
                message="AI service is temporarily overloaded, please try again in a moment",
            ) from e


def parse_json_response(raw_text: str, error_message: str):
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        raw_text = raw_text.replace("json\n", "", 1)
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        raise APIError(status_code=502, code="AI_BAD_RESPONSE", message=error_message)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service"}


# ---------------------------------------------------------------------------
# FR-A1 / FR-A2 / FR-A6 — Chat sessions, messages, explanation mode
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    user_id: str
    course_id: str


@app.post("/ai/chat/sessions")
def create_session(payload: CreateSessionRequest):
    check_rate_limit(payload.user_id)

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO ai_chat_sessions (user_id, course_id)
            VALUES (%s, %s)
            RETURNING id, mode
            """,
            (payload.user_id, payload.course_id),
        )
        session_id, mode = cur.fetchone()
        conn.commit()
    except psycopg2.errors.ForeignKeyViolation:
        conn.rollback()
        raise APIError(
            status_code=400, code="VALIDATION_ERROR",
            message="user_id or course_id does not exist", field="user_id",
        )
    except psycopg2.errors.InvalidTextRepresentation:
        conn.rollback()
        raise APIError(
            status_code=400, code="VALIDATION_ERROR",
            message="user_id and course_id must be valid UUIDs", field="user_id",
        )
    finally:
        cur.close()
        conn.close()

    return {"session_id": str(session_id), "mode": mode}


class SendMessageRequest(BaseModel):
    message: str


def get_session_or_404(cur, session_id: str):
    try:
        cur.execute(
            "SELECT user_id, course_id, mode FROM ai_chat_sessions WHERE id = %s",
            (session_id,),
        )
    except psycopg2.errors.InvalidTextRepresentation:
        raise APIError(status_code=400, code="VALIDATION_ERROR", message="session_id must be a valid UUID")
    row = cur.fetchone()
    if row is None:
        raise APIError(status_code=404, code="NOT_FOUND", message="Session not found")
    return row


@app.post("/ai/chat/sessions/{session_id}/messages")
def send_message(session_id: str, payload: SendMessageRequest):
    conn = get_db_connection()
    cur = conn.cursor()

    user_id, course_id, mode = get_session_or_404(cur, session_id)
    check_rate_limit(str(user_id))

    cur.execute(
        """
        INSERT INTO ai_chat_messages (session_id, sender, content)
        VALUES (%s, 'user', %s)
        """,
        (session_id, payload.message),
    )

    question_embedding = embedding_model.encode(payload.message)

    cur.execute(
        """
        SELECT dc.chunk_text, dc.lecture_id, l.title,
               dc.embedding <=> %s AS distance
        FROM document_chunks dc
        JOIN lectures l ON l.id = dc.lecture_id
        WHERE dc.course_id = %s
        ORDER BY distance
        LIMIT 3
        """,
        (question_embedding, course_id),
    )
    top_chunks = cur.fetchall()

    if not top_chunks:
        reply_text = "I don't have any course material to answer that yet."
        sources = []
    else:
        context = "\n".join(c[0] for c in top_chunks)
        prompt = f"""Answer the student's question using ONLY the context below.
If the context doesn't contain the answer, say so.
Explanation level: {mode}

Context:
{context}

Question: {payload.message}"""

        reply_text = call_gemini(prompt)

        seen_lecture_ids = set()
        sources = []
        for _, lecture_id, lecture_title, _ in top_chunks:
            if lecture_id not in seen_lecture_ids:
                seen_lecture_ids.add(lecture_id)
                sources.append({
                    "lecture_id": str(lecture_id),
                    "lecture_title": lecture_title,
                    "timestamp_seconds": None,
                })

    cur.execute(
        """
        INSERT INTO ai_chat_messages (session_id, sender, content, source_lecture_ids)
        VALUES (%s, 'ai', %s, %s::uuid[])
        """,
        (session_id, reply_text, [str(c[1]) for c in top_chunks]),
    )

    conn.commit()
    cur.close()
    conn.close()

    return {"reply": reply_text, "sources": sources, "mode": mode}


VALID_MODES = {"beginner", "intermediate", "advanced"}


class UpdateModeRequest(BaseModel):
    mode: str


@app.put("/ai/chat/sessions/{session_id}/mode")
def update_mode(session_id: str, payload: UpdateModeRequest):
    if payload.mode not in VALID_MODES:
        raise APIError(
            status_code=400, code="VALIDATION_ERROR",
            message=f"mode must be one of {sorted(VALID_MODES)}", field="mode",
        )

    conn = get_db_connection()
    cur = conn.cursor()

    user_id, _, _ = get_session_or_404(cur, session_id)
    check_rate_limit(str(user_id))

    cur.execute(
        "UPDATE ai_chat_sessions SET mode = %s WHERE id = %s RETURNING id",
        (payload.mode, session_id),
    )
    conn.commit()
    cur.close()
    conn.close()

    return {"session_id": session_id, "mode": payload.mode}


# ---------------------------------------------------------------------------
# FR-A3 — Lecture summarization
# ---------------------------------------------------------------------------

@app.post("/ai/lectures/{lecture_id}/summarize")
def summarize_lecture(lecture_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT title, transcript FROM lectures WHERE id = %s", (lecture_id,))
    except psycopg2.errors.InvalidTextRepresentation:
        cur.close()
        conn.close()
        raise APIError(status_code=400, code="VALIDATION_ERROR", message="lecture_id must be a valid UUID")
    row = cur.fetchone()
    cur.close()
    conn.close()

    if row is None:
        raise APIError(status_code=404, code="NOT_FOUND", message="Lecture not found")

    title, transcript = row
    if not transcript:
        raise APIError(status_code=400, code="NO_TRANSCRIPT", message="This lecture has no transcript yet")

    prompt = f"""Summarize the following lecture transcript into 3-5 short key points,
as a bullet list. Be concise and factual, do not add information not in the transcript.

Lecture title: {title}

Transcript:
{transcript}"""

    summary = call_gemini(prompt)

    return {"lecture_id": lecture_id, "lecture_title": title, "summary": summary}


# ---------------------------------------------------------------------------
# FR-A5 — Auto-generate quiz from a lecture transcript
# ---------------------------------------------------------------------------

@app.post("/ai/lectures/{lecture_id}/generate-quiz")
def generate_quiz(lecture_id: str):
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT l.title, l.transcript, m.id
            FROM lectures l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = %s
            """,
            (lecture_id,),
        )
    except psycopg2.errors.InvalidTextRepresentation:
        cur.close()
        conn.close()
        raise APIError(status_code=400, code="VALIDATION_ERROR", message="lecture_id must be a valid UUID")

    row = cur.fetchone()
    if row is None:
        cur.close()
        conn.close()
        raise APIError(status_code=404, code="NOT_FOUND", message="Lecture not found")

    lecture_title, transcript, module_id = row
    if not transcript:
        cur.close()
        conn.close()
        raise APIError(status_code=400, code="NO_TRANSCRIPT", message="This lecture has no transcript yet")

    prompt = f"""Based on the lecture transcript below, write exactly 5 multiple-choice
questions to test understanding. Reply with ONLY valid JSON, no other text, in this
exact shape:

[
  {{
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct_index": 0
  }}
]

correct_index is the 0-based position of the right answer in "options".

Lecture title: {lecture_title}

Transcript:
{transcript}"""

    raw_text = call_gemini(prompt)
    questions = parse_json_response(raw_text, "AI did not return valid quiz data, please try again")

    cur.execute(
        """
        INSERT INTO quizzes (module_id, title, is_ai_generated, generated_from_lecture_id)
        VALUES (%s, %s, true, %s)
        RETURNING id
        """,
        (module_id, f"AI-Generated Quiz: {lecture_title}", lecture_id),
    )
    quiz_id = cur.fetchone()[0]

    for i, q in enumerate(questions):
        cur.execute(
            """
            INSERT INTO quiz_questions (quiz_id, question_text, question_type, order_index)
            VALUES (%s, %s, 'mcq', %s)
            RETURNING id
            """,
            (quiz_id, q["question"], i),
        )
        question_id = cur.fetchone()[0]

        for j, option_text in enumerate(q["options"]):
            cur.execute(
                """
                INSERT INTO quiz_options (question_id, option_text, is_correct)
                VALUES (%s, %s, %s)
                """,
                (question_id, option_text, j == q["correct_index"]),
            )

    conn.commit()
    cur.close()
    conn.close()

    return {
        "quiz_id": str(quiz_id),
        "title": f"AI-Generated Quiz: {lecture_title}",
        "question_count": len(questions),
        "is_ai_generated": True,
    }


# ---------------------------------------------------------------------------
# FR-A7 — Flashcards per module
# ---------------------------------------------------------------------------

@app.post("/ai/modules/{module_id}/flashcards")
def generate_flashcards(module_id: str):
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT title, transcript FROM lectures
            WHERE module_id = %s AND transcript IS NOT NULL AND transcript != ''
            ORDER BY order_index
            """,
            (module_id,),
        )
    except psycopg2.errors.InvalidTextRepresentation:
        cur.close()
        conn.close()
        raise APIError(status_code=400, code="VALIDATION_ERROR", message="module_id must be a valid UUID")

    lectures = cur.fetchall()

    if not lectures:
        cur.close()
        conn.close()
        raise APIError(
            status_code=400, code="NO_TRANSCRIPT",
            message="No lectures with transcripts found for this module yet",
        )

    combined_transcript = "\n\n".join(
        f"[{title}]\n{transcript}" for title, transcript in lectures
    )

    prompt = f"""Based on the lecture material below, create exactly 6 flashcards
for spaced-revision study. Reply with ONLY valid JSON, no other text, in this
exact shape:

[
  {{"question": "...", "answer": "..."}}
]

Keep answers short and factual, one key idea per card.

Material:
{combined_transcript}"""

    raw_text = call_gemini(prompt)
    cards = parse_json_response(raw_text, "AI did not return valid flashcard data, please try again")

    for card in cards:
        cur.execute(
            "INSERT INTO flashcards (module_id, question, answer) VALUES (%s, %s, %s)",
            (module_id, card["question"], card["answer"]),
        )

    conn.commit()
    cur.close()
    conn.close()

    return {"module_id": module_id, "flashcard_count": len(cards), "flashcards": cards}


# ---------------------------------------------------------------------------
# FR-A4 — Personalized study plan from quiz score history
# ---------------------------------------------------------------------------

class StudyPlanRequest(BaseModel):
    user_id: str
    course_id: str


@app.post("/ai/study-plan")
def generate_study_plan(payload: StudyPlanRequest):
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT q.title, qa.score, qa.submitted_at
            FROM quiz_attempts qa
            JOIN quizzes q ON q.id = qa.quiz_id
            JOIN modules m ON m.id = q.module_id
            WHERE qa.user_id = %s AND m.course_id = %s AND qa.score IS NOT NULL
            ORDER BY qa.submitted_at DESC
            """,
            (payload.user_id, payload.course_id),
        )
    except psycopg2.errors.InvalidTextRepresentation:
        cur.close()
        conn.close()
        raise APIError(
            status_code=400, code="VALIDATION_ERROR",
            message="user_id and course_id must be valid UUIDs", field="user_id",
        )

    attempts = cur.fetchall()

    if not attempts:
        cur.close()
        conn.close()
        raise APIError(
            status_code=400, code="NO_QUIZ_HISTORY",
            message="No completed quiz attempts found for this student in this course yet",
        )

    history_text = "\n".join(
        f"- {title}: scored {score}/100" for title, score, _ in attempts
    )

    prompt = f"""A student has this quiz score history in one course:

{history_text}

Based on this, write a short personalized study plan. Reply with ONLY valid JSON,
no other text, in this exact shape:

{{
  "overall_summary": "1-2 sentence honest assessment",
  "focus_areas": [
    {{"topic": "quiz title with the weakest score", "why": "short reason", "suggested_action": "what to do about it"}}
  ]
}}

Only include a topic in focus_areas if its score was below 70. If all scores are
70+, return an empty focus_areas array and say so in overall_summary."""

    raw_text = call_gemini(prompt)
    plan = parse_json_response(raw_text, "AI did not return a valid study plan, please try again")

    cur.execute(
        """
        INSERT INTO study_plans (user_id, course_id, plan_json)
        VALUES (%s, %s, %s)
        RETURNING id, generated_at
        """,
        (payload.user_id, payload.course_id, json.dumps(plan)),
    )
    plan_id, generated_at = cur.fetchone()

    conn.commit()
    cur.close()
    conn.close()

    return {"plan_id": str(plan_id), "generated_at": str(generated_at), "plan": plan}