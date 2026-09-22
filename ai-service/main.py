import os
import json
import time
import psycopg2
from dotenv import load_dotenv
from pgvector.psycopg2 import register_vector
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from google import genai
from google.genai.errors import ServerError

load_dotenv()

app = FastAPI()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Loaded once at startup, reused for every request — loading this model
# fresh on every single chat message would be slow and wasteful.
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")


def get_db_connection():
    conn = psycopg2.connect(
        host="localhost", port=5433, dbname="lms_ai_db",
        user="lms_user", password="lms_pass",
    )
    register_vector(conn)
    return conn


def call_gemini(prompt: str, max_retries: int = 2) -> str:
    """Calls Gemini, retrying once if the service is temporarily overloaded (503)."""
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
            raise HTTPException(
                status_code=503,
                detail="AI service is temporarily overloaded, please try again in a moment",
            ) from e


def parse_json_response(raw_text: str, error_message: str):
    """Strips markdown code fences Gemini sometimes adds, then parses JSON safely."""
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        raw_text = raw_text.replace("json\n", "", 1)
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=error_message)


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
    conn = get_db_connection()
    cur = conn.cursor()
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
    cur.close()
    conn.close()
    return {"session_id": str(session_id), "mode": mode}


class SendMessageRequest(BaseModel):
    message: str


@app.post("/ai/chat/sessions/{session_id}/messages")
def send_message(session_id: str, payload: SendMessageRequest):
    conn = get_db_connection()
    cur = conn.cursor()

    # Look up the session so we know which course to search within,
    # and what explanation mode the student is currently using.
    cur.execute(
        "SELECT course_id, mode FROM ai_chat_sessions WHERE id = %s",
        (session_id,),
    )
    row = cur.fetchone()
    if row is None:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")
    course_id, mode = row

    # Save the student's question first, so it's recorded even if
    # something later fails.
    cur.execute(
        """
        INSERT INTO ai_chat_messages (session_id, sender, content)
        VALUES (%s, 'user', %s)
        """,
        (session_id, payload.message),
    )

    question_embedding = embedding_model.encode(payload.message)

    # Search only within this session's course — this is the actual
    # course-scoping FR-A2 requires.
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
                    "timestamp_seconds": None,  # known gap: no timing data yet
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
        raise HTTPException(
            status_code=400,
            detail=f"mode must be one of {sorted(VALID_MODES)}",
        )

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE ai_chat_sessions SET mode = %s WHERE id = %s RETURNING id",
        (payload.mode, session_id),
    )
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"session_id": session_id, "mode": payload.mode}


# ---------------------------------------------------------------------------
# FR-A3 — Lecture summarization
# ---------------------------------------------------------------------------

@app.post("/ai/lectures/{lecture_id}/summarize")
def summarize_lecture(lecture_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT title, transcript FROM lectures WHERE id = %s", (lecture_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Lecture not found")

    title, transcript = row
    if not transcript:
        raise HTTPException(status_code=400, detail="This lecture has no transcript yet")

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

    cur.execute(
        """
        SELECT l.title, l.transcript, m.id
        FROM lectures l
        JOIN modules m ON m.id = l.module_id
        WHERE l.id = %s
        """,
        (lecture_id,),
    )
    row = cur.fetchone()
    if row is None:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Lecture not found")

    lecture_title, transcript, module_id = row
    if not transcript:
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="This lecture has no transcript yet")

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

    cur.execute(
        """
        SELECT title, transcript FROM lectures
        WHERE module_id = %s AND transcript IS NOT NULL AND transcript != ''
        ORDER BY order_index
        """,
        (module_id,),
    )
    lectures = cur.fetchall()

    if not lectures:
        cur.close()
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="No lectures with transcripts found for this module yet",
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
    attempts = cur.fetchall()

    if not attempts:
        cur.close()
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="No completed quiz attempts found for this student in this course yet",
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