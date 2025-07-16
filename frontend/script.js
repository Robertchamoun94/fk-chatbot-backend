document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('userInput');
  const chatbox = document.getElementById('chatbox');
  const sendButton = document.getElementById('sendButton');

  userInput.addEventListener('keydown', function(event) {
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

    // Visa att GPT skriver...
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'bot-message loading';
    loadingMsg.textContent = 'GPT skriver...';
    chatbox.appendChild(loadingMsg);
    chatbox.scrollTop = chatbox.scrollHeight;

    try {
      const response = await fetch(`http://127.0.0.1:5005/ask?query=${encodeURIComponent(question)}`);
      const data = await response.json();
      const answer = data.answer;

      loadingMsg.remove(); // Ta bort "GPT skriver..."

      const botMsg = document.createElement('div');
      botMsg.className = 'bot-message';
      botMsg.textContent = answer || '❌ Kunde inte hämta svar.';
      chatbox.appendChild(botMsg);
      chatbox.scrollTop = chatbox.scrollHeight;

    } catch (error) {
      loadingMsg.remove(); // Ta bort "GPT skriver..." även vid fel

      const errorMsg = document.createElement('div');
      errorMsg.className = 'bot-message';
      errorMsg.textContent = '❌ Ett fel uppstod. Försök igen senare.';
      chatbox.appendChild(errorMsg);
      chatbox.scrollTop = chatbox.scrollHeight;
    }
  });
});
