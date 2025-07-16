import os
import json
from chromadb import Client
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

# Ladda OpenAI API-nyckel
openai_key = os.getenv("OPENAI_API_KEY")
embedding_function = OpenAIEmbeddingFunction(api_key=openai_key)

# Initiera Chroma EphemeralClient
client = Client()
collection = client.get_or_create_collection(
    name="fk-full",
    embedding_function=embedding_function
)

# 🧠 Bygg nytt index från dina chunks vid start
def load_chunks_into_index(json_path="data/fk-full.json"):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    ids = [str(i) for i in range(len(data))]
    texts = [chunk["text"] for chunk in data]

    collection.add(documents=texts, ids=ids)
    print(f"✅ {len(texts)} dokument indexerade.")

# 🔍 Semantisk sökning
def ask_rag(query, top_k=5):
    results = collection.query(query_texts=[query], n_results=top_k)
    docs = results.get("documents", [[]])[0]

    # Konkatenera resultaten
    return "\n\n".join(docs)


# 🔁 Kör indexering automatiskt när filen laddas
load_chunks_into_index()
