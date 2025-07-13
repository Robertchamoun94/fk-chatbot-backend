document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('userInput');
  const chatbox = document.getElementById('chatbox');
  const sendButton = document.getElementById('sendButton');

  sendButton.addEventListener('click', async () => {
    const question = userInput.value.trim();
    if (!question) return;

    // Visa användarens fråga
    const userMsg = document.createElement('div');
    userMsg.className = 'user-message';
    userMsg.textContent = question;
    chatbox.appendChild(userMsg);

    userInput.value = '';

    try {
      const response = await fetch('https://fk-chatbot-backend.onrender.com/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question })
      });

      const data = await response.json();

      const botMsg = document.createElement('div');
      botMsg.className = 'bot-message';
      botMsg.textContent = data.answer || 'Ett fel uppstod. Försök igen senare.';
      chatbox.appendChild(botMsg);

    } catch (error) {
      const errorMsg = document.createElement('div');
      errorMsg.className = 'bot-message';
      errorMsg.textContent = 'Ett fel uppstod. Försök igen senare.';
      chatbox.appendChild(errorMsg);
      console.error(error);
    }
  });
});
