import os
from chromadb import PersistentClient
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from openai import OpenAI

# Initiera din GPT-funktion
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def semantic_search_full(query, top_k=5):
    # Ladda upp ditt index från din tidigare Chroma-indexering
    client = PersistentClient(path="data/chroma_index")
    collection = client.get_or_create_collection(
        name="fk-full",
        embedding_function=OpenAIEmbeddingFunction(api_key=os.getenv("OPENAI_API_KEY"))
    )

    # Hämta topp-K dokument som liknar frågan
    results = collection.query(query_texts=[query], n_results=top_k)
    docs = results.get("documents", [[]])[0]
    context = "\n\n".join(docs)

    # Systeminstruktion till GPT
    system_instruction = (
        "Du är en expert på Försäkringskassans regler. "
        "Svara endast med korrekt och faktabaserad information från kontexten nedan. "
        "Om frågan inte kan besvaras med informationen – säg att du inte vet."
    )

    # Anropa GPT med korrekt API-syntax (OpenAI v1.x)
    completion = openai_client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"Fråga: {query}\n\nKONTEKST:\n{context}"}
        ],
        temperature=0
    )

    # Returnera svaret som text
    return completion.choices[0].message.content

# Exponerad funktion som importeras i rag.py
def ask_rag(query):
    return semantic_search_full(query)
