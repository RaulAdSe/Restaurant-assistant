const axios = require('axios');
require('dotenv').config();

/**
 * Handles availability check function calls by forwarding them to the n8n webhook
 * @param {Object} args - Arguments passed from the assistant's function call
 * @returns {Object} - Result object with availability information
 */
module.exports = async function checkAvailability(args) {
  console.log('Checking availability with n8n webhook...');
  
  // Prepare the payload for n8n webhook
  const payload = {
    message: {
      toolCalls: [
        {
          id: 'manual_call_1',
          function: { arguments: JSON.stringify(args) },
        },
      ],
      type: 'tool-calls',
    },
  };

  try {
    // Make sure the webhook URL is set
    if (!process.env.N8N_WEBHOOK_URL) {
      throw new Error('N8N_WEBHOOK_URL is not set in .env file');
    }

    console.log(`Sending request to: ${process.env.N8N_WEBHOOK_URL}`);
    console.log(`Request payload: ${JSON.stringify(payload, null, 2)}`);
    
    // Send the request to n8n webhook
    const res = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 // 10 second timeout
    });

    console.log(`Response status: ${res.status}`);
    console.log('Response from n8n:', JSON.stringify(res.data, null, 2));
    
    // Handle different response formats
    if (typeof res.data === 'string') {
      // If response is a plain string
      return { 
        result: res.data, 
        available: !res.data.toLowerCase().includes('no hay disponibilidad') 
      };
    } else if (res.data && res.data.results && res.data.results[0] && res.data.results[0].result) {
      // If response is in the expected JSON format
      return res.data.results[0].result;
    } else {
      // Any other format
      return { 
        result: JSON.stringify(res.data),
        available: false,
        message: 'Formato de respuesta no reconocido'
      };
    }
  } catch (err) {
    console.error('Error in checkAvailability:', err.message);
    
    // Enhanced error logging
    if (err.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
      console.error('Response status:', err.response.status);
      console.error('Response headers:', JSON.stringify(err.response.headers, null, 2));
    } else if (err.request) {
      // The request was made but no response was received
      console.error('No response received. Request details:', JSON.stringify(err.request, null, 2));
    }
    
    return { 
      error: err.message,
      available: false,
      message: 'Error al verificar disponibilidad'
    };
  }
}; 