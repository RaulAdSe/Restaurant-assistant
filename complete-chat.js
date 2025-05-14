require('dotenv').config();
const axios = require('axios');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Assistant configuration
const ASSISTANT_ID = 'asst_b9nj6pRfL5ZIRJJ7fxd1JA8o';

// Prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Check availability function
async function checkAvailability(args) {
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
    
    // Parse the availability response
    let available = false;
    let mesa_id = '';
    let dispo_id = '';
    let idmesa = '';
    
    // Handle different response formats
    if (typeof res.data === 'string') {
      // If response is a plain string
      return { 
        result: res.data, 
        available: !res.data.toLowerCase().includes('no hay disponibilidad') 
      };
    } else if (res.data && res.data.results && res.data.results[0]) {
      const result = res.data.results[0].result;
      
      // Check if result contains availability info
      if (typeof result === 'string' && result.startsWith('disponible:')) {
        const parts = result.split(',');
        
        // Extract disponible status
        const disponiblePart = parts[0].split(':')[1].trim();
        available = disponiblePart === 'Disponible' || disponiblePart === 'true';
        
        // Extract mesa ID if available
        if (parts.length > 1 && parts[1].includes('idmesa_mesas')) {
          mesa_id = parts[1].split(':')[1].trim();
        }
        
        // Extract dispo ID if available
        if (parts.length > 2 && parts[2].includes('idmesa_disp')) {
          dispo_id = parts[2].split(':')[1].trim();
        }
        
        // Extract idmesa if available
        if (parts.length > 3 && parts[3].includes('idmesa')) {
          idmesa = parts[3].split(':')[1].trim();
        }
        
        return {
          available,
          mesa_id,
          dispo_id,
          idmesa,
          result
        };
      }
      
      return {
        available: result.includes('disponible:true'),
        result
      };
    }
    
    return { 
      available: false,
      error: 'Formato de respuesta no reconocido',
      raw_response: res.data
    };
  } catch (err) {
    console.error('Error in checkAvailability:', err.message);
    
    // Enhanced error logging
    if (err.response) {
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
      console.error('Response status:', err.response.status);
    } else if (err.request) {
      console.error('No response received');
    }
    
    return { 
      available: false,
      error: err.message
    };
  }
}

// Extract structured data from entire conversation
async function extractStructuredData(threadId, retryCount = 0, maxRetries = 3) {
  try {
    console.log(`\n📊 Analizando conversación para extraer datos... (intento ${retryCount + 1}/${maxRetries + 1})`);
    
    // Add a new message asking for structured data extraction
    await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      role: 'user',
      content: `Analiza toda esta conversación y genera un JSON con la siguiente estructura exacta:
{
  "reserva_fecha": "YYYY-MM-DD",
  "reserva_hora": "HH:MM",
  "reserva_invitados": "número de personas",
  "reserva_nombre": "nombre del cliente",
  "reserva_telefono": "número de teléfono",
  "solicitudes_especiales": "cualquier preferencia mencionada"
}

Rellena cada campo con la información de la conversación. Los campos obligatorios son fecha, hora, invitados, nombre y teléfono. Si falta alguno, usa cadena vacía.
IMPORTANTE: NO INCLUYAS NINGÚN TEXTO EXPLICATIVO, SOLO EL JSON.`,
    }, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
    });
    
    // Run the assistant to get the analysis
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
    
    // Poll for run status
    let runStatus = 'queued';
    console.log('Esperando análisis...');
    let timeout = 0;
    const maxTimeout = 15; // Aumentado a 15 segundos para dar más tiempo
    
    while (['queued', 'in_progress'].includes(runStatus)) {
      await new Promise(r => setTimeout(r, 1000));
      process.stdout.write('.');
      
      timeout++;
      if (timeout >= maxTimeout) {
        console.log('\n⚠️ Timeout alcanzado después de 15 segundos.');
        
        if (retryCount < maxRetries) {
          console.log(`Reintentando análisis (intento ${retryCount + 2}/${maxRetries + 1})...`);
          return extractStructuredData(threadId, retryCount + 1, maxRetries);
        } else {
          console.log('Se alcanzó el número máximo de intentos.');
          return null;
        }
      }
      
      const status = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: { 
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        },
      });
      
      runStatus = status.data.status;
      
      // Log if status changes to an unexpected state
      if (!['queued', 'in_progress', 'completed'].includes(runStatus)) {
        console.log(`\n⚠️ Estado inesperado del análisis: ${runStatus}`);
      }
    }
    console.log('\n');
    
    // Get the assistant's analysis
    const analysisMessages = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      },
    });
    
    const analysisMsg = analysisMessages.data.data[0];
    if (analysisMsg && analysisMsg.content && analysisMsg.content.length > 0) {
      const analysisText = analysisMsg.content[0].text.value;
      
      // Try to parse JSON from response
      try {
        // Look for JSON in the response
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedData = JSON.parse(jsonMatch[0]);
          console.log('📊 Datos extraídos:');
          console.log(JSON.stringify(extractedData, null, 2));
          return extractedData;
        }
      } catch (error) {
        console.error('Error al procesar JSON:', error.message);
      }
      
      console.log('Respuesta del asistente:', analysisText);
    }
    
    // Si llegamos aquí, hubo un problema con el análisis
    if (retryCount < maxRetries) {
      console.log('No se pudo extraer un JSON válido, reintentando...');
      return extractStructuredData(threadId, retryCount + 1, maxRetries);
    }
    
    return null;
  } catch (error) {
    console.error('Error al extraer datos estructurados:', error.message);
    
    // Reintentar en caso de error si no se han agotado los intentos
    if (retryCount < maxRetries) {
      console.log(`Error en el intento ${retryCount + 1}, reintentando...`);
      return extractStructuredData(threadId, retryCount + 1, maxRetries);
    }
    
    return null;
  }
}

// Capture name from user message
function extractName(message) {
  const lowerMessage = message.toLowerCase();
  
  // Various name patterns in Spanish
  if (lowerMessage.includes("mi nombre es") || lowerMessage.includes("me llamo")) {
    let name = "";
    
    // Extract after "mi nombre es" or "me llamo"
    if (lowerMessage.includes("mi nombre es")) {
      name = message.split(/mi nombre es/i)[1].trim();
    } else if (lowerMessage.includes("me llamo")) {
      name = message.split(/me llamo/i)[1].trim();
    }
    
    // Clean up the name
    name = name.split(/[,\.]/)[0].trim(); // Remove anything after comma or period
    name = name.split(/y|con|el teléfono|el telefono/i)[0].trim(); // Remove content after conjunction
    
    return name;
  }
  
  // If no patterns match, return the original message
  return message;
}

// Capture phone from user message
function extractPhone(message) {
  // Find the longest sequence of digits (likely the phone number)
  const phoneMatches = message.match(/\d+/g);
  if (phoneMatches && phoneMatches.length > 0) {
    // Return the longest sequence of digits
    const longestNumber = phoneMatches.reduce((a, b) => a.length > b.length ? a : b);
    // Only return if it has at least 6 digits (likely a phone number)
    return longestNumber.length >= 6 ? longestNumber : '';
  }
  return '';
}

// Function to submit final reservation
async function submitReservation(reservationData, conversationDuration, startTime) {
  try {
    // Notify user about webhook test before sending final data
    console.log('\n⚠️ IMPORTANTE: Antes de finalizar la reserva, asegúrate de:');
    console.log('1. Abrir tu flujo de trabajo en n8n');
    console.log('2. Hacer clic en el botón "Test workflow" en el canvas');
    console.log('3. O activar el flujo de trabajo para uso permanente\n');
    
    await prompt('¿Has hecho clic en "Test workflow" en n8n? (Presiona Enter para continuar)');
    
    // Prepare summary
    let summaryText = `Reserva para ${reservationData.reserva_nombre} el ${reservationData.reserva_fecha} a las ${reservationData.reserva_hora} para ${reservationData.reserva_invitados} personas.`;
    
    if (reservationData.solicitudes_especiales) {
      summaryText += ` Solicitudes especiales: ${reservationData.solicitudes_especiales}`;
    }
    
    const payload = {
      message: {
        analysis: {
          summary: summaryText,
          structuredData: {
            Reserva: true,
            reserva_nombre: reservationData.reserva_nombre,
            reserva_fecha: reservationData.reserva_fecha,
            reserva_hora: reservationData.reserva_hora,
            reserva_invitados: reservationData.reserva_invitados,
            reserva_telefono: reservationData.reserva_telefono,
            reserva_idMesa: reservationData.reserva_idMesa || "",
            reserva_idDispo: reservationData.reserva_idDispo || "",
            reserva_idmesa: reservationData.reserva_idmesa || ""
          },
          durationSeconds: conversationDuration || Math.floor((new Date() - new Date()) / 1000),
          startedAt: startTime ? startTime.toISOString() : new Date().toISOString(),
          cost: "1.99",
          type: "text"
        }
      }
    };
    
    console.log('Enviando datos de reserva al webhook...');
    console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);
    
    // Send the request to n8n webhook
    const res = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log(`Response status: ${res.status}`);
    console.log('Response from n8n:', JSON.stringify(res.data, null, 2));
    
    return true;
  } catch (err) {
    console.error('Error submitting reservation:', err.message);
    if (err.response) {
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
    return false;
  }
}

// Main chat function
async function startChat() {
  try {
    console.log('🔄 Inicializando el asistente "Andy" del Restaurante Park...\n');
    
    // Record conversation start time
    const conversationStartTime = new Date();
    
    // Create a new thread
    const thread = await axios.post('https://api.openai.com/v1/threads', {}, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
    });
    
    const threadId = thread.data.id;
    console.log(`📝 Conversación iniciada (ID: ${threadId})\n`);
    
    // Reservation data we'll collect
    let reservationData = {
      reserva_fecha: '',
      reserva_hora: '',
      reserva_invitados: '',
      reserva_nombre: '',
      reserva_telefono: '',
      reserva_idMesa: '',
      reserva_idDispo: '',
      reserva_idmesa: '' // Nuevo campo para el idmesa
    };
    
    // Get current date and time in Spain/Madrid timezone
    const now = new Date();
    
    // Adjust for 2-hour time difference
    const adjustedDate = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // Add 2 hours
    
    const spainTime = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'long'
    }).format(adjustedDate);
    
    // For ISO date and time, also use the adjusted time
    const isoDate = adjustedDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeString = adjustedDate.toLocaleTimeString('es-ES', {timeZone: 'Europe/Madrid'});
    
    // Send system message with current date and time
    await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      role: 'user',
      content: `La fecha actual en horario España (Europe/Madrid) es: ${spainTime}. 
Para tus cálculos internos: date=${isoDate}, time=${timeString}.
Por favor, usa esta información para verificar la disponibilidad y confirmar que las reservas no estén en el pasado.`,
    }, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
    });
    
    // Initial greeting
    console.log('🤖 Andy: Hola! Soy Andy, el agente virtual del Restaurante Park. En qué puedo ayudarte?');
    
    // Chat loop
    let reservationComplete = false;
    let availabilityChecked = false;
    let collectedPhone = false;
    let n8nAlertShown = false;
    let readyToFinalize = false;
    
    while (!reservationComplete) {
      // Get user message
      const userMessage = await prompt('\n👤 Tú: ');
      
      if (userMessage.toLowerCase() === 'salir' || userMessage.toLowerCase() === 'exit') {
        console.log('\n👋 ¡Hasta luego! Gracias por contactar al Restaurante Park.');
        break;
      }
      
      // Detect if user is providing phone number - usando el patrón más general
      if (availabilityChecked && !collectedPhone && 
          (userMessage.toLowerCase().includes('telefono') || 
           userMessage.toLowerCase().includes('teléfono') ||
           /\d{6,}/.test(userMessage))) { // Cualquier secuencia de 6+ dígitos
        
        // Asignar el teléfono extraído a los datos de reserva
        const extractedPhone = extractPhone(userMessage);
        if (extractedPhone) {
          reservationData.reserva_telefono = extractedPhone;
        }
        
        collectedPhone = true;
        console.log('\n⚠️ IMPORTANTE: Antes de finalizar la reserva, asegúrate de:');
        console.log('1. Abrir tu flujo de trabajo en n8n');
        console.log('2. Hacer clic en el botón "Test workflow" en el canvas');
        console.log('3. O activar el flujo de trabajo para uso permanente\n');
        
        await prompt('¿Has hecho clic en "Test workflow" en n8n? (Presiona Enter para continuar)');
        n8nAlertShown = true;
      }
      
      // Add message to thread
      await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        role: 'user',
        content: userMessage,
      }, {
        headers: { 
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
      });
      
      // Run the assistant
      console.log('🔄 El asistente está pensando...');
      
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
      
      // Poll for run status
      let runStatus = 'queued';
      while (['queued', 'in_progress', 'requires_action'].includes(runStatus)) {
        await new Promise(r => setTimeout(r, 1000));
        
        const status = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
          headers: { 
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          },
        });
        
        runStatus = status.data.status;
        
        // Handle tool calls if required
        if (runStatus === 'requires_action') {
          console.log('🛠️ Verificando disponibilidad...');
          
          const toolCalls = status.data.required_action?.submit_tool_outputs?.tool_calls;
          if (toolCalls) {
            const toolOutputs = [];
            
            for (const toolCall of toolCalls) {
              if (toolCall.function.name === 'checkAvailability') {
                const args = JSON.parse(toolCall.function.arguments);
                console.log(`📅 Checking availability for: ${args.reserva_fecha} at ${args.hora} for ${args.reserva_invitados} people`);
                
                // Save reservation data
                reservationData.reserva_fecha = args.reserva_fecha;
                reservationData.reserva_hora = args.hora;
                reservationData.reserva_invitados = args.reserva_invitados;
                
                // Notify user about webhook test
                console.log('\n⚠️ IMPORTANTE: Antes de verificar disponibilidad, asegúrate de:');
                console.log('1. Abrir tu flujo de trabajo en n8n');
                console.log('2. Hacer clic en el botón "Test workflow" en el canvas');
                console.log('3. O activar el flujo de trabajo para uso permanente\n');
                
                await prompt('¿Has hecho clic en "Test workflow" en n8n? (Presiona Enter para continuar)');
                
                // Check availability
                const availabilityResult = await checkAvailability(args);
                console.log('Availability result:', availabilityResult);
                
                // Store mesa ID and dispo ID if available
                if (availabilityResult.mesa_id) {
                  reservationData.reserva_idMesa = availabilityResult.mesa_id;
                }
                if (availabilityResult.dispo_id) {
                  reservationData.reserva_idDispo = availabilityResult.dispo_id;
                }
                // Store idmesa if available
                if (availabilityResult.idmesa) {
                  reservationData.reserva_idmesa = availabilityResult.idmesa;
                }
                
                availabilityChecked = true;
                
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(availabilityResult)
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
          }
        }
      }
      
      // Get assistant's response
      if (runStatus === 'completed') {
        const msgs = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages`, {
          headers: { 
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          },
        });
        
        const assistantMsgs = msgs.data.data.filter(m => m.role === 'assistant');
        const latestMsg = assistantMsgs[0];
        
        if (latestMsg && latestMsg.content && latestMsg.content.length > 0) {
          const assistantResponse = latestMsg.content[0].text.value;
          console.log(`\n🤖 Andy: ${assistantResponse}`);
          
          // Mejor método para decidir cuando una reserva está completa
          // En lugar de depender de respuestas específicas del chat
          const isConfirmationMessage = (
              assistantResponse.toLowerCase().includes("realizo la reserva") ||
              assistantResponse.toLowerCase().includes("quedamos así") || 
              assistantResponse.toLowerCase().includes("reserva confirmada") ||
              assistantResponse.toLowerCase().includes("reservado") ||
              assistantResponse.toLowerCase().includes("confirmada")
          );
          
          // Verificar que tengamos los datos mínimos necesarios para una reserva
          const hasRequiredData = () => {
            // Extraer posibles datos del mensaje actual
            if (!reservationData.reserva_nombre) {
              const possibleName = extractName(userMessage);
              if (possibleName && possibleName !== userMessage) {
                reservationData.reserva_nombre = possibleName;
              }
            }
            
            if (!reservationData.reserva_telefono) {
              const possiblePhone = extractPhone(userMessage);
              if (possiblePhone) {
                reservationData.reserva_telefono = possiblePhone;
              }
            }
            
            // Verificar que tengamos los datos mínimos necesarios
            return (
              reservationData.reserva_fecha && 
              reservationData.reserva_hora && 
              reservationData.reserva_invitados && 
              (reservationData.reserva_nombre || collectedPhone) // Si tenemos teléfono probablemente también tengamos nombre
            );
          };
          
          // Finalizar si es un mensaje de confirmación Y tenemos todos los datos necesarios
          // O si tenemos todos los datos necesarios incluyendo teléfono
          if ((collectedPhone && isConfirmationMessage) || 
              (collectedPhone && hasRequiredData())) {
            
            // Show n8n alert if it hasn't been shown yet
            if (!n8nAlertShown) {
              console.log('\n⚠️ IMPORTANTE: Antes de finalizar la reserva, asegúrate de:');
              console.log('1. Abrir tu flujo de trabajo en n8n');
              console.log('2. Hacer clic en el botón "Test workflow" en el canvas');
              console.log('3. O activar el flujo de trabajo para uso permanente\n');
              
              await prompt('¿Has hecho clic en "Test workflow" en n8n? (Presiona Enter para continuar)');
              n8nAlertShown = true;
            }
            
            console.log('\n🏁 Conversación completa. Finalizando reserva...');
            
            // Calculate conversation duration in seconds
            const conversationDuration = Math.floor((new Date() - conversationStartTime) / 1000);
            
            // Extract all data from the conversation
            const extractedData = await extractStructuredData(threadId);
            
            if (extractedData) {
              // Preserve mesa_id and dispo_id from availability check
              extractedData.reserva_idMesa = reservationData.reserva_idMesa || "";
              extractedData.reserva_idDispo = reservationData.reserva_idDispo || "";
              extractedData.reserva_idmesa = reservationData.reserva_idmesa || "";
              
              // Use the combined data for the final reservation, passing the duration
              await submitReservation(extractedData, conversationDuration, conversationStartTime);
              reservationComplete = true;
              console.log('\n✅ ¡Reserva completada con éxito!');
            } else {
              console.log('\n⚠️ Error: No se pudieron extraer los datos necesarios de la conversación');
              console.log('Solicitando información faltante al usuario...');
              
              // Añadir mensaje al thread solicitando información directa
              await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                role: 'user',
                content: `Parece que hubo un problema técnico. Por favor, confirma explícitamente la siguiente información para completar la reserva:
1. Fecha de la reserva (YYYY-MM-DD)
2. Hora (HH:MM)
3. Número de personas
4. Nombre completo
5. Número de teléfono
6. Cualquier solicitud especial`,
              }, {
                headers: { 
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                  'OpenAI-Beta': 'assistants=v2'
                },
              });
              
              // No finalizamos la reserva para permitir continuar la conversación
              // El usuario tendrá otra oportunidad de proporcionar la información
              // En un siguiente ciclo del bucle se intentará extraer y finalizar nuevamente
            }
          }
        } else {
          console.log('\n🤖 Andy: Lo siento, no pude generar una respuesta.');
        }
      } else {
        console.log(`\n⚠️ Error: La conversación terminó con estado "${runStatus}"`);
      }
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  } finally {
    rl.close();
  }
}

// Start the chat
console.log('💬 ASISTENTE DE RESERVAS DEL RESTAURANTE PARK');
console.log('-------------------------------------------');
console.log('Escribe "salir" o "exit" para terminar la conversación\n');

startChat(); 