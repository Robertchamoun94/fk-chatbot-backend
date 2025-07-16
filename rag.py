from flask import Flask, request, jsonify
from flask_cors import CORS
from semantic_search import ask_rag  # din GPT + Chroma-funktion

app = Flask(__name__)
CORS(app)  # 💡 Tillåt anrop från frontend (t.ex. från file:// eller localhost)

@app.route("/ask", methods=["GET"])
def ask():
    query = request.args.get("query", "")
    if not query:
        return jsonify({"error": "Ingen fråga angavs"}), 400

    try:
        answer = ask_rag(query)
        return jsonify({"query": query, "answer": answer})
    except Exception as e:
        import traceback
        print("❌ Fel i Python RAG:")
        traceback.print_exc()
        return jsonify({"error": "Fel vid generering av svar"}), 500

if __name__ == "__main__":
    app.run(port=5005)
