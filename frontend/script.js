document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('userInput');
  const chatbox = document.getElementById('chatbox');
  const sendButton = document.getElementById('sendButton');

  userInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Förhindra radbrytning
      sendButton.click();     // Klicka på knappen programmatiskt
    }
  });

  sendButton.addEventListener('click', async () => {
    const question = userInput.value.trim();
    if (!question) return;

    // Visa användarens fråga
    const userMsg = document.createElement('div');
    userMsg.className = 'user-message';
    userMsg.textContent = question;
    chatbox.appendChild(userMsg);
    chatbox.scrollTop = chatbox.scrollHeight;

    userInput.value = '';

    // Visa "GPT skriver..."
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'bot-message loading';
    loadingMsg.textContent = 'skriver...';
    chatbox.appendChild(loadingMsg);
    chatbox.scrollTop = chatbox.scrollHeight;

    try {
      const response = await fetch('https://fk-chatbot-backend.onrender.com/rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: question })
      });

      const data = await response.json();
      const answer = data.answer || data.error || '❌ Kunde inte hämta svar.';

      loadingMsg.remove();

      const botMsg = document.createElement('div');
      botMsg.className = 'bot-message';
      botMsg.textContent = answer;
      chatbox.appendChild(botMsg);
      chatbox.scrollTop = chatbox.scrollHeight;

    } catch (error) {
      loadingMsg.remove();

      const errorMsg = document.createElement('div');
      errorMsg.className = 'bot-message';
      errorMsg.textContent = '❌ Ett fel uppstod. Kontrollera att backend är igång.';
      chatbox.appendChild(errorMsg);
      chatbox.scrollTop = chatbox.scrollHeight;
    }
  });
});
