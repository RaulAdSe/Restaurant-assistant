# Restaurant Assistant Simulator

A text-based simulation of "Andy," the restaurant reservation assistant that interacts with OpenAI's Assistant API and routes availability check requests to an n8n webhook.

## Features

- Interact with the OpenAI assistant via text messages
- Process checkAvailability tool calls
- Route requests to an n8n webhook
- Receive and display responses in text mode

## Prerequisites

- Node.js 14+ installed
- OpenAI API key
- n8n webhook URL

## Installation

1. Clone the repository or download the files
2. Install dependencies:

```bash
npm install
```

3. Configure the environment variables:
   - Copy `.env.example` to `.env` (or edit the existing `.env` file)
   - Add your OpenAI API key: `OPENAI_API_KEY=sk-...`
   - Add your n8n webhook URL: `N8N_WEBHOOK_URL=https://your-n8n.io/webhook/...`

## Usage

Run the application:

```bash
npm start
```

The application will:
1. Create a new OpenAI thread
2. Send an initial message asking to book a table
3. Process the assistant's response
4. Handle checkAvailability tool calls by routing them to your n8n webhook
5. Display the final assistant response

## Files Structure

- `index.js` - Main entry point
- `runAssistant.js` - Logic for executing the assistant
- `functions/checkAvailability.js` - Function for routing availability checks to n8n

## Customization

You can modify the initial message in `index.js` to test different reservation scenarios.

## License

ISC 