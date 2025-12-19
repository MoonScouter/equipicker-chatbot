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

const sanitizeInput = (messages: any[]): any[] => {
  const sanitized: any[] = [];
  const seenFunctionCallIds = new Set<string>();
  for (const item of messages ?? []) {
    if (!item || typeof item !== "object") continue;

    if (item.type === "function_call") {
      if (
        typeof item.call_id === "string" &&
        typeof item.name === "string" &&
        typeof item.arguments === "string"
      ) {
        seenFunctionCallIds.add(item.call_id);
        sanitized.push({
          type: "function_call",
          call_id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        });
      }
      continue;
    }

    if (item.type === "function_call_output") {
      if (item.call_id && typeof item.output === "string") {
        // Only include tool outputs that have a matching tool call earlier in the
        // input history; otherwise OpenAI will reject the request.
        if (seenFunctionCallIds.has(item.call_id)) {
          sanitized.push({
            type: "function_call_output",
            call_id: item.call_id,
            output: item.output,
          });
        }
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
    const { messages, toolsState } = await request.json();

    const tools = await getTools(toolsState);

    console.log("Tools:", tools);

    const sanitizedMessages = sanitizeInput(
      Array.isArray(messages) ? messages : []
    );
    console.log("Received messages:", sanitizedMessages);

    const key = process.env.OPENAI_API_KEY ?? "(missing)";
    const maskedKey =
      key.length > 10 ? `${key.slice(0, 5)}…${key.slice(-4)}` : key;
    console.log("Using OPENAI_API_KEY:", maskedKey);

    const openai = new OpenAI();

    const events = await openai.responses.create({
      model: MODEL,
      input: sanitizedMessages,
      instructions: getDeveloperPrompt(),
      tools,
      stream: true,
      parallel_tool_calls: false,
    });

    // Create a ReadableStream that emits SSE data
    const stream = new ReadableStream({
      async start(controller) {
        try {
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
