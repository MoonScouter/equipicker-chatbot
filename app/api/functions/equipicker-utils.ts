export const CI_BASE_URL =
  process.env.EQUIPICKER_CI_BASE_URL ?? "https://ci.equipicker.com";
export const API_BASE_URL =
  process.env.EQUIPICKER_API_BASE_URL ?? "https://api.equipicker.com";

export const normalizeTickerToUS = (ticker: string): string => {
  const trimmed = ticker.trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  if (upper.endsWith(".US")) {
    const base = trimmed.slice(0, -3);
    return `${base.toUpperCase()}.US`;
  }

  // If a country suffix is present (e.g., ".CA"), replace it with ".US".
  if (/\.[A-Z]{2}$/.test(upper)) {
    const base = trimmed.slice(0, -3);
    return `${base.toUpperCase()}.US`;
  }

  return `${trimmed.toUpperCase()}.US`;
};

export const isValidTicker = (ticker: string): boolean =>
  /^[A-Z0-9][A-Z0-9.-]{0,20}\.US$/.test(ticker);

export const normalizeTickersListToUS = (
  input: string,
  maxCount: number
): { tickers: string[]; error?: string } => {
  const raw = input.trim();
  if (!raw) return { tickers: [], error: "Missing tickers" };

  const tokens = raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const ticker = normalizeTickerToUS(token);
    if (!ticker || !isValidTicker(ticker)) {
      return { tickers: [], error: "Invalid ticker in list" };
    }
    if (!seen.has(ticker)) {
      normalized.push(ticker);
      seen.add(ticker);
    }
  }

  if (normalized.length === 0) {
    return { tickers: [], error: "Missing tickers" };
  }
  if (normalized.length > maxCount) {
    return { tickers: [], error: `Too many tickers (max ${maxCount})` };
  }

  return { tickers: normalized };
};

export const fetchEquipicker = async (
  url: URL,
  label: string,
  meta: Record<string, unknown>
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(url.toString(), { signal: controller.signal }).finally(
    () => clearTimeout(timeoutId)
  );
  const text = await res.text();

  if (!res.ok && process.env.NODE_ENV !== "production") {
    console.error(`${label} failed:`, {
      status: res.status,
      body: text.slice(0, 500),
      ...meta,
    });
  }

  return { res, text };
};
