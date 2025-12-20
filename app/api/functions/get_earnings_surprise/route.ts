const normalizeTicker = (ticker: string): string => {
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickerRaw = searchParams.get("ticker") ?? "";
    const ticker = normalizeTicker(tickerRaw);

    if (!ticker) {
      return new Response(JSON.stringify({ error: "Missing ticker" }), {
        status: 400,
      });
    }

    if (!/^[A-Z0-9][A-Z0-9.-]{0,20}\.US$/.test(ticker)) {
      return new Response(JSON.stringify({ error: "Invalid ticker" }), {
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

    const url = new URL("https://ci.equipicker.com/api/earnings_surprise");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("ticker", ticker);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal }).finally(
      () => clearTimeout(timeoutId)
    );
    const text = await res.text();

    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Equipicker earnings_surprise failed:", {
          status: res.status,
          ticker,
          body: text.slice(0, 500),
        });
      }
      return new Response(
        JSON.stringify({
          error: "Upstream error",
          status: res.status,
        }),
        { status: 502 }
      );
    }

    // Upstream returns JSON; keep passthrough but guard parse errors.
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
    console.error("Error getting earnings surprise:", error);
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Upstream timeout" }), {
        status: 504,
      });
    }
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error getting earnings",
      }),
      { status: 500 }
    );
  }
}
