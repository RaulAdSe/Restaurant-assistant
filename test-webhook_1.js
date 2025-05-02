require('dotenv').config();
const axios = require('axios');

async function testWebhook() {
  // Simple test payload similar to what would be sent by the assistant
  const payload = {
    message: {
      toolCalls: [
        {
          id: 'test_call_1',
          function: { 
            arguments: JSON.stringify({
              reserva_fecha: '2025-04-30',
              hora: '15:00',
              reserva_invitados: '2'
            })
          },
        },
      ],
      type: 'tool-calls',
    },
  };

  try {
    console.log(`Testing webhook at: ${process.env.N8N_WEBHOOK_URL}`);
    console.log(`Sending payload: ${JSON.stringify(payload, null, 2)}`);
    
    const res = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log('Success! Webhook is responding correctly.');
    console.log(`Status code: ${res.status}`);
    console.log(`Response body: ${JSON.stringify(res.data, null, 2)}`);
    return true;
  } catch (err) {
    console.error('Error testing webhook:', err.message);
    
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response body:', JSON.stringify(err.response.data, null, 2));
    }
    return false;
  }
}

// Run the test
testWebhook().then(success => {
  if (!success) {
    console.log('\nPossible solutions:');
    console.log('1. Verify the webhook URL is correct');
    console.log('2. Make sure the n8n workflow is active/deployed');
    console.log('3. Check if n8n server is running and accessible');
    console.log('4. Check n8n logs for any errors processing the webhook');
  }
}); 