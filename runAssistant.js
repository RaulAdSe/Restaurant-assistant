const axios = require('axios');
const checkAvailability = require('./functions/checkAvailability');

module.exports = async function runAssistant(threadId) {
  const ASSISTANT_ID = 'asst_b9nj6pRfL5ZIRJJ7fxd1JA8o'; // Your assistant ID

  // Remind user to click Test workflow in n8n
  console.log('\n⚠️ IMPORTANT: Before proceeding, please make sure to:');
  console.log('1. Open your n8n workflow');
  console.log('2. Click the "Test workflow" button on the canvas');
  console.log('3. Or activate the workflow for permanent use\n');
  
  const proceed = await confirmContinue();
  if (!proceed) {
    console.log('Operation cancelled. Please click Test workflow in n8n first, then try again.');
    return;
  }

  try {
    console.log(`Starting assistant run with thread ID: ${threadId}`);
    
    // Start a run with the assistant
    const run = await axios.post(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      assistant_id: ASSISTANT_ID,
    }, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
    });

    const runId = run.data.id;
    console.log(`Run created with ID: ${runId}`);

    // Poll for run status
    let runStatus = 'queued';
    while (['queued', 'in_progress', 'requires_action'].includes(runStatus)) {
      await new Promise(r => setTimeout(r, 2000));
      
      const status = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: { 
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        },
      });

      runStatus = status.data.status;
      console.log(`Run status: ${runStatus}`);

      // Handle tool calls if required
      if (runStatus === 'requires_action') {
        const toolCalls = status.data.required_action?.submit_tool_outputs?.tool_calls;
        if (toolCalls) {
          console.log('Tool call required:', JSON.stringify(toolCalls, null, 2));
          
          const toolOutputs = [];
          
          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'checkAvailability') {
              const args = JSON.parse(toolCall.function.arguments);
              console.log('Checking availability with args:', args);
              
              const output = await checkAvailability(args);
              console.log('Tool output:', output);
              
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(output)
              });
            }
          }

          // Submit tool outputs
          await axios.post(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
            tool_outputs: toolOutputs,
          }, {
            headers: { 
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2'
            },
          });
          console.log('Tool outputs submitted');
        }
      }
    }

    if (runStatus === 'completed') {
      // Get the assistant's message
      const msgs = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: { 
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        },
      });

      const assistantMsgs = msgs.data.data.filter(m => m.role === 'assistant');
      const latestMsg = assistantMsgs[0];
      
      if (latestMsg && latestMsg.content && latestMsg.content.length > 0) {
        console.log('\n🤖 Assistant says:\n', latestMsg.content[0].text.value);
      } else {
        console.log('No assistant message found');
      }
    } else {
      console.log(`Run ended with status: ${runStatus}`);
    }
  } catch (error) {
    console.error('Error in runAssistant:', error.response?.data || error.message);
  }
};

// Simple function to ask for confirmation
async function confirmContinue() {
  console.log('Have you clicked the "Test workflow" button in n8n? (Press Enter to continue or Ctrl+C to cancel)');
  return new Promise(resolve => {
    process.stdin.once('data', () => {
      resolve(true);
    });
  });
} 