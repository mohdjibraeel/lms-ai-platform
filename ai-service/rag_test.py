import os
import psycopg2
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from google import genai

load_dotenv()

QUESTION = "Why does quicksort degrade to O(n^2) on already-sorted input?"

conn = psycopg2.connect(
    host="localhost", port=5433, dbname="lms_ai_db",
    user="lms_user", password="lms_pass",
)
cur = conn.cursor()

# DEBUG: prove the connection can see the 5 rows we already verified via psql
cur.execute("SELECT COUNT(*) FROM document_chunks")
print("DEBUG - total rows visible to this script:", cur.fetchone()[0])

model = SentenceTransformer("all-MiniLM-L6-v2")
question_embedding = model.encode(QUESTION).tolist()

# DEBUG: confirm the question embedding has the right shape
print("DEBUG - question embedding length:", len(question_embedding))

cur.execute(
    """
    SELECT chunk_text, lecture_id, embedding <=> %s::vector AS distance
    FROM document_chunks
    ORDER BY distance
    LIMIT 3
    """,
    (question_embedding,),
)
top_chunks = cur.fetchall()

# DEBUG: how many rows did the similarity search actually return?
print("DEBUG - rows returned by similarity search:", len(top_chunks))

print("--- Top matching chunks ---")
for chunk_text, lecture_id, distance in top_chunks:
    print(f"[{distance:.4f}] {chunk_text}")

if not top_chunks:
    print("\nNo matching chunks found — stopping before calling Gemini.")
    cur.close()
    conn.close()
    exit()

context = "\n".join(c[0] for c in top_chunks)
prompt = f"""Answer the student's question using ONLY the context below.
If the context doesn't contain the answer, say so.

Context:
{context}

Question: {QUESTION}"""

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=prompt,
)

print("\n--- Gemini's grounded answer ---")
print(response.text)
print("\n--- Cited lecture ---")
print(top_chunks[0][1])

cur.close()
conn.close()