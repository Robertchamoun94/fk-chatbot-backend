from chromadb import PersistentClient
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
import os
import openai

def semantic_search_full(query, top_k=5):
    client = PersistentClient(path="data/chroma_index")
    collection = client.get_or_create_collection(
        name="fk-full",
        embedding_function=OpenAIEmbeddingFunction(api_key=os.getenv("OPENAI_API_KEY"))
    )

    results = collection.query(query_texts=[query], n_results=top_k)
    docs = results.get("documents", [[]])[0]
    context = "\n\n".join(docs)

    system_instruction = (
        "Du är en expert på Försäkringskassans regler. "
        "Svara endast med korrekt och faktabaserad information från kontexten nedan. "
        "Om frågan inte kan besvaras med informationen – säg att du inte vet."
    )

    openai.api_key = os.getenv("OPENAI_API_KEY")
    completion = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"Fråga: {query}\n\nKONTEKST:\n{context}"}
        ],
        temperature=0
    )

    return completion.choices[0].message.content
def ask_rag(query):
    return semantic_search_full(query)
