import os
import psycopg2
from dotenv import load_dotenv
from pgvector.psycopg2 import register_vector
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from google import genai

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


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service"}


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

        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
        )
        reply_text = response.text
        sources = [
            {
                "lecture_id": str(lecture_id),
                "lecture_title": lecture_title,
                "timestamp_seconds": None,  # known gap: no timing data yet
            }
            for _, lecture_id, lecture_title, _ in top_chunks
        ]

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