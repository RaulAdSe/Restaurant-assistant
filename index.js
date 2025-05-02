require('dotenv').config();
const axios = require('axios');
const runAssistant = require('./runAssistant');

(async () => {
  try {
    // Create a new thread
    const thread = await axios.post('https://api.openai.com/v1/threads', {}, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
    });

    const threadId = thread.data.id;
    console.log(`Thread created with ID: ${threadId}`);

    // Add a message to the thread
    await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      role: 'user',
      content: 'Hola, quiero reservar para mañana a las 14:00 para 2 personas',
    }, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
    });

    console.log('Message added to thread');
    
    // Run the assistant
    await runAssistant(threadId);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
})(); 