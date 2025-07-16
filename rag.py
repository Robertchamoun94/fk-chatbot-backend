from flask import Flask, request, jsonify
from semantic_search import ask_rag  # <- använder din befintliga GPT+Chroma-funktion

app = Flask(__name__)

@app.route('/rag', methods=['POST'])
def rag():
    data = request.get_json()
    query = data.get('query', '')
    if not query:
        return jsonify({'error': 'Query saknas'}), 400

    try:
        answer = ask_rag(query)
        return jsonify({'answer': answer})
    except Exception as e:
        print("❌ Fel i Python RAG:", e)
        return jsonify({'error': 'Fel vid generering av svar'}), 500

if __name__ == '__main__':
    app.run(port=5005)
from flask import Flask, request, jsonify
from semantic_search import ask_rag  # använder din GPT+Chroma-funktion

app = Flask(__name__)

@app.route("/ask", methods=["GET"])
def ask():
    query = request.args.get("query", "")
    if not query:
        return jsonify({"error": "Ingen fråga angavs"}), 400
    answer = ask_rag(query)
    return jsonify({"query": query, "answer": answer})

if __name__ == "__main__":
    app.run(port=5005)
