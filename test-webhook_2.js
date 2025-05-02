require('dotenv').config();
const axios = require('axios');

async function testWebhookConfirmation() {
  const payload = {
      message: {
        analysis: {
          summary: "Llamada para agendar reserva.",
          structuredData: {
            Reserva: true,
            reserva_nombre: "Carlos Ruiz",
            reserva_fecha: "2025-04-30",
            reserva_hora: "15:00",
            reserva_invitados: "2",
            reserva_telefono: "+34123456789",
            reserva_idMesa: "recgBL7HdsqFrkBzx", // Airtable Mesas table record ID
            reserva_dispID: "reclkrih0Garyz5ae"  // Airtable Dispo table record ID
          }
        },
        durationSeconds: 78,
        startedAt: "2025-04-30T14:58:00.000Z",
        cost: 1.99,
        type: "text"
      }
  };

  try {
    console.log(`Testing second webhook at: ${process.env.N8N_WEBHOOK_URL}`);
    const res = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    console.log('✅ Confirmation webhook test successful.');
    console.log(`Response status: ${res.status}`);
    console.log(`Response body: ${JSON.stringify(res.data, null, 2)}`);
    return true;
  } catch (err) {
    console.error('❌ Error testing confirmation webhook:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Body:', JSON.stringify(err.response.data, null, 2));
    }
    return false;
  }
}

testWebhookConfirmation().then(success => {
  if (!success) {
    console.log('\n🛠 Suggested fixes:');
    console.log('1. Verify the webhook path and environment variable.');
    console.log('2. Ensure the second half of the workflow is active and correctly structured.');
    console.log('3. Confirm the IDs match actual Airtable record IDs.');
  }
});
