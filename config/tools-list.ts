// List of tools available to the assistant
// No need to include the top-level wrapper object as it is added in lib/tools/tools.ts
// More information on function calling: https://platform.openai.com/docs/guides/function-calling

export const toolsList = [
  {
    name: "get_company_overview",
    description:
      "Retrieve the overview of a company based on the ticker symbol. Retrieved information: name, ticker, sector, industry, market cap, market cap category, beta, most recent quarter.",
    strict: false,
    required: ["ticker"],
    parameters: {
      ticker: {
        type: "string",
        description: "Ticker symbol for the company (e.g., DOCU.US).",
      },
    },
  },
  {
    name: "get_weather",
    description: "Get the weather for a given location",
    parameters: {
      location: {
        type: "string",
        description: "Location to get weather for",
      },
      unit: {
        type: "string",
        description: "Unit to get weather in",
        enum: ["celsius", "fahrenheit"],
      },
    },
  },
  {
    name: "get_joke",
    description: "Get a programming joke",
    strict: false,
    required: [],
    parameters: {
      topic: {
        type: "string",
        description: "Optional topic or keyword to include in the joke",
      },
    },
  },
];
