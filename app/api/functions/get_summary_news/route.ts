import {
  CI_BASE_URL,
  fetchEquipicker,
  isValidTicker,
  normalizeTickerToUS,
} from "../equipicker-utils";

const isValidPeriod = (period: string) => /^\d+[dwm]$/.test(period);
const validModes = new Set(["latest", "positive", "negative"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickerRaw = searchParams.get("ticker") ?? "";
    const period = searchParams.get("period") ?? "";
    const mode = searchParams.get("mode") ?? "";
    const ticker = normalizeTickerToUS(tickerRaw);

    if (!ticker) {
      return new Response(JSON.stringify({ error: "Missing ticker" }), {
        status: 400,
      });
    }

    if (!isValidTicker(ticker)) {
      return new Response(JSON.stringify({ error: "Invalid ticker" }), {
        status: 400,
      });
    }

    if (period && !isValidPeriod(period)) {
      return new Response(JSON.stringify({ error: "Invalid period" }), {
        status: 400,
      });
    }

    if (mode && !validModes.has(mode)) {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
      });
    }

    const apiKey = process.env.EQUIPICKER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing EQUIPICKER_API_KEY" }),
        { status: 500 }
      );
    }

    const url = new URL(`${CI_BASE_URL}/api/news`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("ticker", ticker);
    if (period) url.searchParams.set("period", period);
    if (mode) url.searchParams.set("mode", mode);

    const { res, text } = await fetchEquipicker(url, "summary_news", {
      ticker,
      mode: mode || "latest",
      period: period || "default",
    });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Upstream error", status: res.status }),
        { status: 502 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid upstream JSON" }), {
        status: 502,
      });
    }

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    console.error("Error getting summary news:", error);
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Upstream timeout" }), {
        status: 504,
      });
    }
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error getting news",
      }),
      { status: 500 }
    );
  }
}
