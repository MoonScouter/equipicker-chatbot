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
    name: "get_earnings_surprise",
    description:
      "Retrieve last five quarters reporting dates, actual vs estimated EPS and related surprise, price evolution 5 days before and after the reporting based on the ticker symbol.",
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
    name: "get_multiples",
    description:
      "Retrieve price multiples for ticker symbol and its peer companies: PE, Forward PE, PEG, price-to-book, price-to-sales, EV-to-Sales, EV-to-EBITDA.",
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
    name: "get_financial_ratios",
    description:
      "Retrieve financial ratios for ticker symbol and its related peer companies: ROA, ROE, operating margin, net margin, Y/Y evolution of last quarter revenues and net income , leverage, last reported period.",
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
    name: "get_multiples_list",
    description:
      "Retrieve valuation multiples for a list of tickers (no pre-set peers). Returns per-ticker: PE, Forward PE, PEG, price-to-book, price-to-sales, EV-to-Sales, EV-to-EBITDA.",
    strict: false,
    required: ["tickers"],
    parameters: {
      tickers: {
        description:
          "List of ticker symbols (e.g., AAPL.US,UBER.US) or a single comma-separated string.",
        type: "string",
      },
    },
  },
  {
    name: "get_financial_ratios_list",
    description:
      "Retrieve core financial ratios for a list of tickers (no pre-set peers). Returns per-ticker: ROA, ROE, operating margin, net margin, leverage, Y/Y evolution of last quarter revenues and net income, last reported period.",
    strict: false,
    required: ["tickers"],
    parameters: {
      tickers: {
        description:
          "List of ticker symbols (e.g., AAPL.US,AMZN.US) or a single comma-separated string.",
        type: "string",
      },
    },
  },
  {
    name: "get_summary_news",
    description:
      "Retrieve sentiment-scored news summaries for a company over a specified period. Supports filtering for latest, most positive, or most negative news items.",
    strict: false,
    required: ["ticker"],
    parameters: {
      ticker: {
        type: "string",
        description: "Ticker symbol for the company (e.g., CAVA.US).",
      },
      period: {
        type: "string",
        description:
          "Look-back period for the news query. Format is a number followed by a letter (d=days, w=weeks, m=months). Examples: 1d, 5w, 3m.",
      },
      mode: {
        type: "string",
        enum: ["latest", "positive", "negative"],
        description:
          "Type of news to return: 'latest' for all, 'positive' for most positive 25%, or 'negative' for most negative 25%.",
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
