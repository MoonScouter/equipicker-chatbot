// Functions mapping to tool calls
// Define one function per tool call - each tool call should have a matching function
// Parameters for a tool call are passed as an object to the corresponding function

export const get_weather = async ({
  location,
  unit,
}: {
  location: string;
  unit: string;
}) => {
  const res = await fetch(
    `/api/functions/get_weather?location=${location}&unit=${unit}`
  ).then((res) => res.json());

  return res;
};

export const get_company_overview = async ({
  ticker,
}: {
  ticker: string;
}) => {
  const res = await fetch(
    `/api/functions/get_company_overview?ticker=${encodeURIComponent(ticker)}`
  ).then((res) => res.json());

  return res;
};

export const get_earnings_surprise = async ({
  ticker,
}: {
  ticker: string;
}) => {
  const res = await fetch(
    `/api/functions/get_earnings_surprise?ticker=${encodeURIComponent(ticker)}`
  ).then((res) => res.json());

  return res;
};

export const get_multiples = async ({
  ticker,
}: {
  ticker: string;
}) => {
  const res = await fetch(
    `/api/functions/get_multiples?ticker=${encodeURIComponent(ticker)}`
  ).then((res) => res.json());

  return res;
};

export const get_financial_ratios = async ({
  ticker,
}: {
  ticker: string;
}) => {
  const res = await fetch(
    `/api/functions/get_financial_ratios?ticker=${encodeURIComponent(ticker)}`
  ).then((res) => res.json());

  return res;
};

export const get_multiples_list = async ({
  tickers,
}: {
  tickers: string;
}) => {
  const res = await fetch(
    `/api/functions/get_multiples_list?tickers=${encodeURIComponent(tickers)}`
  ).then((res) => res.json());

  return res;
};

export const get_financial_ratios_list = async ({
  tickers,
}: {
  tickers: string;
}) => {
  const res = await fetch(
    `/api/functions/get_financial_ratios_list?tickers=${encodeURIComponent(
      tickers
    )}`
  ).then((res) => res.json());

  return res;
};

export const get_summary_news = async ({
  ticker,
  period,
  mode,
}: {
  ticker: string;
  period?: string;
  mode?: "latest" | "positive" | "negative";
}) => {
  const params = new URLSearchParams();
  params.set("ticker", ticker);
  if (period) params.set("period", period);
  if (mode) params.set("mode", mode);
  const res = await fetch(`/api/functions/get_summary_news?${params}`).then(
    (response) => response.json()
  );

  return res;
};

export const get_joke = async ({ topic }: { topic?: string }) => {
  const query = topic ? `?topic=${encodeURIComponent(topic)}` : "";
  const res = await fetch(`/api/functions/get_joke${query}`).then((res) =>
    res.json()
  );
  return res;
};

export const functionsMap = {
  get_company_overview: get_company_overview,
  get_earnings_surprise: get_earnings_surprise,
  get_multiples: get_multiples,
  get_financial_ratios: get_financial_ratios,
  get_multiples_list: get_multiples_list,
  get_financial_ratios_list: get_financial_ratios_list,
  get_summary_news: get_summary_news,
  get_weather: get_weather,
  get_joke: get_joke,
};
