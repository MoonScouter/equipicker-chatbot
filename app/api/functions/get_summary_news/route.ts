import {
  CI_BASE_URL,
  fetchEquipicker,
  isValidTicker,
  normalizeTickerToUS,
} from "../equipicker-utils";
import OpenAI from "openai";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TEXT_VERBOSITY,
  NEWS_CURATE_MAX_ITEMS,
  NEWS_CURATE_NEGATIVE_N,
  NEWS_CURATE_POSITIVE_N,
  NEWS_CURATE_RECENT_N,
  NEWS_KEEP_FIRST_N,
  SECONDARY_MODEL,
} from "@/config/constants";

const isValidPeriod = (period: string) => /^\d+[dwm]$/.test(period);
const validModes = new Set(["latest", "positive", "negative"]);
const openai = new OpenAI();

const SUMMARY_DEVELOPER_PROMPT =
  "You are a helpful assistant supporting with summarizations of articles lists. " +
  "You focus on the macro and company related news that you find. " +
  "Provide the summary as a narrative text in max 200 words.";
const SUMMARY_USER_PROMPT =
  "Provide the summary of the news articles as per your instructions.";

const normalizePolarity = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const articleKey = (article: any) =>
  `${article?.date ?? ""}|${article?.title ?? ""}`;

const extractOutputText = (response: any) => {
  if (typeof response?.output_text === "string") {
    return response.output_text;
  }
  const messageItem = Array.isArray(response?.output)
    ? response.output.find(
        (item: any) => item?.type === "message" && item?.role === "assistant"
      )
    : null;
  if (!messageItem?.content) return "";
  return Array.isArray(messageItem.content)
    ? messageItem.content.map((part: any) => part?.text ?? "").join("")
    : "";
};

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

    if (!Array.isArray(data)) {
      return new Response(JSON.stringify(data), { status: 200 });
    }

    if (data.length <= NEWS_KEEP_FIRST_N) {
      return new Response(JSON.stringify(data), { status: 200 });
    }

    const tail = data.slice(NEWS_KEEP_FIRST_N);
    const tailWithPolarity = tail
      .map((article: any) => {
        const polarity = normalizePolarity(article?.polarity);
        if (polarity === null) return null;
        return { article, polarity };
      })
      .filter(Boolean) as { article: any; polarity: number }[];

    const recent = tailWithPolarity
      .slice(0, NEWS_CURATE_RECENT_N)
      .map((entry) => entry.article);

    const withPolarity = tailWithPolarity;

    const mostPositive = [...withPolarity]
      .sort((a, b) => b.polarity - a.polarity)
      .slice(0, NEWS_CURATE_POSITIVE_N)
      .map((entry) => entry.article);

    const mostNegative = [...withPolarity]
      .sort((a, b) => a.polarity - b.polarity)
      .slice(0, NEWS_CURATE_NEGATIVE_N)
      .map((entry) => entry.article);

    const curated: any[] = [];
    const seen = new Set<string>();
    const pushUnique = (article: any) => {
      const key = articleKey(article);
      if (seen.has(key)) return;
      seen.add(key);
      curated.push(article);
    };

    recent.forEach(pushUnique);
    mostPositive.forEach(pushUnique);
    mostNegative.forEach(pushUnique);

    const cappedCurated = curated.slice(0, NEWS_CURATE_MAX_ITEMS);

    if (cappedCurated.length === 0) {
      const extraNewsItem = {
        date: "",
        title: "extra_news",
        summary:
          "No additional articles with polarity were available to summarize.",
        polarity: "",
      };
      return new Response(
        JSON.stringify([...data.slice(0, NEWS_KEEP_FIRST_N), extraNewsItem]),
        { status: 200 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY for summary generation",
        }),
        { status: 500 }
      );
    }

    let summaryText = "";
    try {
      const curatedText = cappedCurated
        .map((article: any, index: number) => {
          const date = article?.date ?? "";
          const title = article?.title ?? "";
          const summary = article?.summary ?? "";
          return `${index + 1}. [${date}] ${title}\n${summary}`;
        })
        .join("\n\n");

      const response = await openai.responses.create({
        model: SECONDARY_MODEL,
        input: [
          { role: "developer", content: SUMMARY_DEVELOPER_PROMPT },
          {
            role: "user",
            content:
              `${SUMMARY_USER_PROMPT}\n\n` +
              `There are ${tail.length} additional articles beyond the first ${NEWS_KEEP_FIRST_N}. ` +
              `You are given ${cappedCurated.length} curated items (recent + polarity extremes).\n\n` +
              `Articles:\n${curatedText}`,
          },
        ],
        reasoning: { effort: DEFAULT_REASONING_EFFORT },
        text: { verbosity: DEFAULT_TEXT_VERBOSITY },
      });

      summaryText = extractOutputText(response).trim();
    } catch (error) {
      summaryText =
        error instanceof Error
          ? `Summary unavailable: ${error.message}`
          : "Summary unavailable.";
    }

    if (!summaryText) {
      summaryText = "Summary unavailable.";
    }

    const extraNewsItem = {
      date: "",
      title: "extra_news",
      summary: summaryText,
      polarity: "",
    };

    return new Response(
      JSON.stringify([...data.slice(0, NEWS_KEEP_FIRST_N), extraNewsItem]),
      { status: 200 }
    );

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
