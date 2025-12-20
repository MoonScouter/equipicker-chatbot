import { getDeveloperPrompt, MODEL } from "@/config/constants";
import { getTools } from "@/lib/tools/tools";
import OpenAI from "openai";

const textFromMessageContent = (content: any): string => {
  if (typeof content === "string") return content;
  if (!content) return "";
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (typeof part === "object") return part.text ?? "";
        return "";
      })
      .join("");
  }
  if (typeof content === "object") return content.text ?? "";
  return "";
};

const sanitizeInputItems = (items: any[]): any[] => {
  const sanitized: any[] = [];
  for (const item of items ?? []) {
    if (!item || typeof item !== "object") continue;

    if (item.type === "function_call_output") {
      if (item.call_id && typeof item.output === "string") {
        sanitized.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: item.output,
        });
      }
      continue;
    }

    if (item.type === "mcp_approval_response") {
      if (item.approval_request_id) {
        sanitized.push({
          type: "mcp_approval_response",
          approve: !!item.approve,
          approval_request_id: item.approval_request_id,
        });
      }
      continue;
    }

    const role = item.role ?? (item.type === "message" ? item.role : undefined);
    if (role === "user" || role === "assistant" || role === "system") {
      sanitized.push({ role, content: textFromMessageContent(item.content) });
    }
  }
  return sanitized;
};

export async function POST(request: Request) {
  try {
    const { inputItems, toolsState, conversationId, debug } =
      await request.json();

    const tools = await getTools(toolsState);

    console.log("Tools:", tools);

    const sanitizedInputItems = sanitizeInputItems(
      Array.isArray(inputItems) ? inputItems : []
    );
    console.log("Received input items:", sanitizedInputItems);
    if (process.env.NODE_ENV !== "production" && debug?.fullHistory) {
      console.log("Full history (debug):", debug.fullHistory);
    }

    const key = process.env.OPENAI_API_KEY ?? "(missing)";
    const maskedKey =
      key.length > 10 ? `${key.slice(0, 5)}…${key.slice(-4)}` : key;
    console.log("Using OPENAI_API_KEY:", maskedKey);

    if (sanitizedInputItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "No input items provided" }),
        { status: 400 }
      );
    }

    const openai = new OpenAI();
    const requestConversationId = conversationId as string | undefined;
    let activeConversationId = requestConversationId || null;

    if (!activeConversationId) {
      const convoRes = await fetch("https://api.openai.com/v1/conversations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!convoRes.ok) {
        const errorText = await convoRes.text();
        throw new Error(`Failed to create conversation: ${errorText}`);
      }
      const convoData = await convoRes.json();
      activeConversationId = convoData.id ?? null;
    }

    const requestPayload: any = {
      model: MODEL,
      input: sanitizedInputItems,
      instructions: getDeveloperPrompt(),
      tools,
      stream: true,
      parallel_tool_calls: true,
      store: true,
      ...(activeConversationId ? { conversation: activeConversationId } : {}),
    };

    console.log("OpenAI request payload:", requestPayload);

    const events = await openai.responses.create(requestPayload);

    // Create a ReadableStream that emits SSE data
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (!requestConversationId && activeConversationId) {
            const meta = JSON.stringify({
              event: "meta.conversation",
              data: { conversationId: activeConversationId },
            });
            controller.enqueue(`data: ${meta}\n\n`);
          }
          for await (const event of events) {
            // Sending all events to the client
            const data = JSON.stringify({
              event: event.type,
              data: event,
            });
            controller.enqueue(`data: ${data}\n\n`);
          }
          // End of stream
          controller.close();
        } catch (error) {
          console.error("Error in streaming loop:", error);
          controller.error(error);
        }
      },
    });

    // Return the ReadableStream as SSE
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error in POST handler:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
