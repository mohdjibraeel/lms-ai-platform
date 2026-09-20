import os
from dotenv import load_dotenv
from fastapi import FastAPI
from google import genai

load_dotenv()

app = FastAPI()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service"}


@app.post("/ai/chat/test")
def chat_test(payload: dict):
    question = payload["message"]

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=question,
    )

    return {"reply": response.text}