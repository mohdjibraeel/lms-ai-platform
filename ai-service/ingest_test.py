import psycopg2 # type: ignore
from sentence_transformers import SentenceTransformer # type: ignore

LECTURE_ID = "ec14697e-d6a4-4011-89ff-d9f8bd432b28"
COURSE_ID_QUERY = "SELECT course_id FROM modules WHERE id = (SELECT module_id FROM lectures WHERE id = %s)"

conn = psycopg2.connect(
    host="localhost",
    port=5433,
    dbname="lms_ai_db",
    user="lms_user",
    password="lms_pass",
)
cur = conn.cursor()

cur.execute("SELECT transcript FROM lectures WHERE id = %s", (LECTURE_ID,))
transcript = cur.fetchone()[0]

cur.execute(COURSE_ID_QUERY, (LECTURE_ID,))
course_id = cur.fetchone()[0]

chunks = [c.strip() for c in transcript.split(". ") if c.strip()]
print(f"Split into {len(chunks)} chunks")

model = SentenceTransformer("all-MiniLM-L6-v2")

for i, chunk_text in enumerate(chunks):
    embedding = model.encode(chunk_text).tolist()
    cur.execute(
        """
        INSERT INTO document_chunks (course_id, lecture_id, chunk_text, embedding)
        VALUES (%s, %s, %s, %s)
        """,
        (course_id, LECTURE_ID, chunk_text, embedding),
    )
    print(f"Saved chunk {i + 1}: {chunk_text[:60]}...")

conn.commit()
cur.close()
conn.close()
print("Done.")