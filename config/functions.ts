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
  get_weather: get_weather,
  get_joke: get_joke,
};
