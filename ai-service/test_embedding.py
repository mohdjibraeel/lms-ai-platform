from sentence_transformers import SentenceTransformer # type: ignore

model = SentenceTransformer("all-MiniLM-L6-v2")

sentence = "Quicksort degrades to O(n^2) when the pivot is always the smallest or largest element."

embedding = model.encode(sentence)

print("Type:", type(embedding))
print("How many numbers:", len(embedding))
print("First 5 numbers:", embedding[:5])