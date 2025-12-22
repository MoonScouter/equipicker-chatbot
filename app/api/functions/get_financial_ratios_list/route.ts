import {
  API_BASE_URL,
  fetchEquipicker,
  normalizeTickersListToUS,
} from "../equipicker-utils";

const MAX_TICKERS = 15;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersRaw = searchParams.get("tickers") ?? "";
    const { tickers, error } = normalizeTickersListToUS(tickersRaw, MAX_TICKERS);

    if (error) {
      return new Response(JSON.stringify({ error }), { status: 400 });
    }

    const apiKey = process.env.EQUIPICKER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing EQUIPICKER_API_KEY" }),
        { status: 500 }
      );
    }

    const url = new URL(`${API_BASE_URL}/api/financial_ratios_list`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("tickers", tickers.join(","));

    const { res, text } = await fetchEquipicker(url, "financial_ratios_list", {
      count: tickers.length,
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
    console.error("Error getting financial ratios list:", error);
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Upstream timeout" }), {
        status: 504,
      });
    }
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Error getting ratios list",
      }),
      { status: 500 }
    );
  }
}
