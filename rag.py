from flask import Flask, request, jsonify
from flask_cors import CORS
from semantic_search import ask_rag

app = Flask(__name__)
CORS(app)  # Aktivera CORS så frontend kan nå backend

@app.route("/rag", methods=["POST"])
def rag_endpoint():
    data = request.get_json()
    query = data.get("query", "")

    if not query:
        return jsonify({"error": "Ingen fråga angavs"}), 400

    try:
        answer = ask_rag(query)
        return jsonify({"query": query, "answer": answer})
    except Exception as e:
        import traceback
        print("❌ Fel i backend:", e)
        traceback.print_exc()
        return jsonify({"error": "Fel vid generering av svar"}), 500

if __name__ == "__main__":
    app.run(port=5005)
