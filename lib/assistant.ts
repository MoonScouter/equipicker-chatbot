import { parse } from "partial-json";
import { handleTool } from "@/lib/tools/tools-handling";
import useConversationStore from "@/stores/useConversationStore";
import useToolsStore, { ToolsState } from "@/stores/useToolsStore";
import { Annotation } from "@/components/annotations";
import { functionsMap } from "@/config/functions";

const normalizeAnnotation = (annotation: any): Annotation => ({
  ...annotation,
  fileId: annotation.file_id ?? annotation.fileId,
  containerId: annotation.container_id ?? annotation.containerId,
});

const MAX_TOOL_LOOP_ITERATIONS = 4;

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

export const sanitizeInputItems = (items: any[]): any[] => {
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

    // Accept message-shaped items and normalize their content to plain text.
    const role = item.role ?? (item.type === "message" ? item.role : undefined);
    if (role === "user" || role === "assistant" || role === "system") {
      const contentText = textFromMessageContent(item.content);
      sanitized.push({ role, content: contentText });
    }
  }

  return sanitized;
};

export interface ContentItem {
  type: "input_text" | "output_text" | "refusal" | "output_audio";
  annotations?: Annotation[];
  text?: string;
}

// Message items for storing conversation history matching API shape
export interface MessageItem {
  type: "message";
  role: "user" | "assistant" | "system";
  id?: string;
  content: ContentItem[];
}

// Custom items to display in chat
export interface ToolCallItem {
  type: "tool_call";
  tool_type:
    | "file_search_call"
    | "web_search_call"
    | "function_call"
    | "mcp_call"
    | "code_interpreter_call";
  status: "in_progress" | "completed" | "failed" | "searching";
  id: string;
  name?: string | null;
  call_id?: string;
  arguments?: string;
  parsedArguments?: any;
  output?: string | null;
  code?: string;
  files?: {
    file_id: string;
    mime_type: string;
    container_id?: string;
    filename?: string;
  }[];
}

export interface McpListToolsItem {
  type: "mcp_list_tools";
  id: string;
  server_label: string;
  tools: { name: string; description?: string }[];
}

export interface McpApprovalRequestItem {
  type: "mcp_approval_request";
  id: string;
  server_label: string;
  name: string;
  arguments?: string;
}

export type Item =
  | MessageItem
  | ToolCallItem
  | McpListToolsItem
  | McpApprovalRequestItem;

type PendingFunctionCall = {
  itemId: string;
  callId: string;
  name: keyof typeof functionsMap;
  arguments: string;
  parsedArguments: any;
};

export const handleTurn = async (
  inputItems: any[],
  toolsState: ToolsState,
  conversationId: string | null,
  debug: { fullHistory: any[] } | null,
  onMessage: (data: any) => void | Promise<void>
) => {
  try {
    const { googleIntegrationEnabled } = useToolsStore.getState();
    // Get response from the API (defined in app/api/turn_response/route.ts)
    const response = await fetch("/api/turn_response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputItems,
        conversationId,
        toolsState,
        googleIntegrationEnabled,
        debug,
      }),
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} - ${response.statusText}`);
      return;
    }

    // Reader for streaming data
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value);
      buffer += chunkValue;

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") {
            done = true;
            break;
          }
          const data = JSON.parse(dataStr);
          await onMessage(data);
        }
      }
    }

    // Handle any remaining data in buffer
    if (buffer && buffer.startsWith("data: ")) {
      const dataStr = buffer.slice(6);
      if (dataStr !== "[DONE]") {
        const data = JSON.parse(dataStr);
        await onMessage(data);
      }
    }
  } catch (error) {
    console.error("Error handling turn:", error);
  }
};

export const processMessages = async (
  inputItems: any[] = [],
  toolLoopIteration = 0
) => {
  const {
    chatMessages,
    conversationItems,
    setChatMessages,
    setConversationItems,
    setAssistantLoading,
    openaiConversationId,
    setOpenaiConversationId,
  } = useConversationStore.getState();

  const toolsState = useToolsStore.getState() as ToolsState;

  const conversationItemsState = Array.isArray(conversationItems)
    ? conversationItems
    : [];
  if (!Array.isArray(conversationItems)) {
    setConversationItems(conversationItemsState);
  }
  const sanitizedInputItems = sanitizeInputItems(inputItems);

  if (sanitizedInputItems.length === 0) {
    setAssistantLoading(false);
    return;
  }

  let assistantMessageContent = "";
  const functionArgumentsByItemId = new Map<string, string>();
  const mcpArgumentsByItemId = new Map<string, string>();
  const pendingFunctionCalls: PendingFunctionCall[] = [];
  const pendingFunctionCallIds = new Set<string>();
  let hadToolCallsInResponse = false;

  await handleTurn(
    sanitizedInputItems,
    toolsState,
    openaiConversationId,
    process.env.NODE_ENV !== "production"
      ? { fullHistory: conversationItemsState }
      : null,
    async ({ event, data }) => {
      switch (event) {
        case "meta.conversation": {
          const conversationId = data?.conversationId;
          if (typeof conversationId === "string" && conversationId.length > 0) {
            setOpenaiConversationId(conversationId);
          }
          break;
        }
        case "response.output_text.delta":
        case "response.output_text.annotation.added": {
          const { delta, item_id, annotation } = data;

          let partial = "";
          if (typeof delta === "string") {
            partial = delta;
          }
          assistantMessageContent += partial;

          // If the last message isn't an assistant message, create a new one
          const lastItem = chatMessages[chatMessages.length - 1];
          if (
            !lastItem ||
            lastItem.type !== "message" ||
            lastItem.role !== "assistant" ||
            (lastItem.id && lastItem.id !== item_id)
          ) {
            chatMessages.push({
              type: "message",
              role: "assistant",
              id: item_id,
              content: [
                {
                  type: "output_text",
                  text: assistantMessageContent,
                },
              ],
            } as MessageItem);
          } else {
            const contentItem = lastItem.content[0];
            if (contentItem && contentItem.type === "output_text") {
              contentItem.text = assistantMessageContent;
              if (annotation) {
                contentItem.annotations = [
                  ...(contentItem.annotations ?? []),
                  normalizeAnnotation(annotation),
                ];
              }
            }
          }

          setChatMessages([...chatMessages]);
          setAssistantLoading(false);
          break;
        }

        case "response.output_item.added": {
          const { item } = data || {};
          // New item coming in
          if (!item || !item.type) {
            break;
          }
          setAssistantLoading(false);
          // Handle differently depending on the item type
          switch (item.type) {
            case "function_call": {
              hadToolCallsInResponse = true;
              const initialArgs = item.arguments || "";
              functionArgumentsByItemId.set(item.id, initialArgs);
              let parsedArguments: any = {};
              try {
                if (initialArgs.length > 0) {
                  parsedArguments = parse(initialArgs);
                }
              } catch {
                // partial JSON can fail parse; ignore
              }
              chatMessages.push({
                type: "tool_call",
                tool_type: "function_call",
                status: "in_progress",
                id: item.id,
                name: item.name, // function name,e.g. "get_weather"
                arguments: initialArgs,
                parsedArguments,
                output: null,
              });
              setChatMessages([...chatMessages]);
              break;
            }
            case "web_search_call": {
              hadToolCallsInResponse = true;
              chatMessages.push({
                type: "tool_call",
                tool_type: "web_search_call",
                status: item.status || "in_progress",
                id: item.id,
              });
              setChatMessages([...chatMessages]);
              break;
            }
            case "file_search_call": {
              hadToolCallsInResponse = true;
              chatMessages.push({
                type: "tool_call",
                tool_type: "file_search_call",
                status: item.status || "in_progress",
                id: item.id,
              });
              setChatMessages([...chatMessages]);
              break;
            }
            case "mcp_call": {
              hadToolCallsInResponse = true;
              const initialArgs = item.arguments || "";
              mcpArgumentsByItemId.set(item.id, initialArgs);
              let parsedArguments: any = {};
              try {
                if (initialArgs.length > 0) {
                  parsedArguments = parse(initialArgs);
                }
              } catch {
                // partial JSON can fail parse; ignore
              }
              chatMessages.push({
                type: "tool_call",
                tool_type: "mcp_call",
                status: "in_progress",
                id: item.id,
                name: item.name,
                arguments: initialArgs,
                parsedArguments,
                output: null,
              });
              setChatMessages([...chatMessages]);
              break;
            }
            case "code_interpreter_call": {
              hadToolCallsInResponse = true;
              chatMessages.push({
                type: "tool_call",
                tool_type: "code_interpreter_call",
                status: item.status || "in_progress",
                id: item.id,
                code: "",
                files: [],
              });
              setChatMessages([...chatMessages]);
              break;
            }
          }
          break;
        }

        case "response.output_item.done": {
          // After output item is done, adding tool call ID
          const { item } = data || {};

          // Reasoning items are internal to the Responses API and should not be
          // replayed as part of the next request payload.
          if (!item || item.type === "reasoning") {
            break;
          }

          const toolCallMessage = chatMessages.find((m) => m.id === item.id);
          let updatedChatMessage = false;
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.call_id = item.call_id;
            updatedChatMessage = true;
          }

          if (item.type === "function_call") {
            hadToolCallsInResponse = true;
            const callId = item.call_id;
            const argumentsText =
              functionArgumentsByItemId.get(item.id) ?? item.arguments ?? "";
            let parsedArguments: any = {};
            try {
              if (argumentsText.length > 0) {
                parsedArguments = parse(argumentsText);
              }
            } catch {
              // partial JSON can fail parse; ignore
            }

            if (toolCallMessage && toolCallMessage.type === "tool_call") {
              toolCallMessage.arguments = argumentsText;
              toolCallMessage.parsedArguments = parsedArguments;
              updatedChatMessage = true;
            }

            if (callId && item.name) {
              const alreadyRecorded = conversationItemsState.some(
                (it: any) => it?.type === "function_call" && it?.call_id === callId
              );
              if (!alreadyRecorded) {
                conversationItemsState.push({
                  type: "function_call",
                  call_id: callId,
                  name: item.name,
                  arguments: argumentsText,
                });
                setConversationItems([...conversationItemsState]);
              }

              if (!pendingFunctionCallIds.has(callId)) {
                pendingFunctionCalls.push({
                  itemId: item.id,
                  callId,
                  name: item.name as keyof typeof functionsMap,
                  arguments: argumentsText,
                  parsedArguments,
                });
                pendingFunctionCallIds.add(callId);
              }
            }
          }

          if (
            toolCallMessage &&
            toolCallMessage.type === "tool_call" &&
            toolCallMessage.tool_type === "mcp_call"
          ) {
            toolCallMessage.output = item.output;
            toolCallMessage.status = "completed";
            updatedChatMessage = true;
          }

          if (updatedChatMessage) {
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.function_call_arguments.delta": {
          // Streaming arguments delta to show in the chat
          const itemId = data.item_id;
          const currentArgs = functionArgumentsByItemId.get(itemId) || "";
          const nextArgs = currentArgs + (data.delta || "");
          functionArgumentsByItemId.set(itemId, nextArgs);
          let parsedFunctionArguments: any = {};

          const toolCallMessage = chatMessages.find(
            (m) => m.id === itemId
          );
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.arguments = nextArgs;
            try {
              if (nextArgs.length > 0) {
                parsedFunctionArguments = parse(nextArgs);
              }
              toolCallMessage.parsedArguments = parsedFunctionArguments;
            } catch {
              // partial JSON can fail parse; ignore
            }
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.function_call_arguments.done": {
          // This has the full final arguments string
          const { item_id, arguments: finalArgs } = data;

          functionArgumentsByItemId.set(item_id, finalArgs || "");
          let parsedFunctionArguments: any = {};

          const toolCallMessage = chatMessages.find((m) => m.id === item_id);
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.arguments = finalArgs;
            try {
              if (finalArgs && finalArgs.length > 0) {
                parsedFunctionArguments = parse(finalArgs);
              }
              toolCallMessage.parsedArguments = parsedFunctionArguments;
            } catch {
              // partial JSON can fail parse; ignore
            }
            setChatMessages([...chatMessages]);
          }
          break;
        }
        // Streaming MCP tool call arguments
        case "response.mcp_call_arguments.delta": {
          // Append delta to MCP arguments
          const itemId = data.item_id;
          const currentArgs = mcpArgumentsByItemId.get(itemId) || "";
          const nextArgs = currentArgs + (data.delta || "");
          mcpArgumentsByItemId.set(itemId, nextArgs);
          let parsedMcpArguments: any = {};
          const toolCallMessage = chatMessages.find(
            (m) => m.id === itemId
          );
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.arguments = nextArgs;
            try {
              if (nextArgs.length > 0) {
                parsedMcpArguments = parse(nextArgs);
              }
              toolCallMessage.parsedArguments = parsedMcpArguments;
            } catch {
              // partial JSON can fail parse; ignore
            }
            setChatMessages([...chatMessages]);
          }
          break;
        }
        case "response.mcp_call_arguments.done": {
          // Final MCP arguments string received
          const { item_id, arguments: finalArgs } = data;
          mcpArgumentsByItemId.set(item_id, finalArgs || "");
          const toolCallMessage = chatMessages.find((m) => m.id === item_id);
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.arguments = finalArgs;
            try {
              toolCallMessage.parsedArguments =
                finalArgs && finalArgs.length > 0 ? parse(finalArgs) : {};
            } catch {
              // partial JSON can fail parse; ignore
            }
            toolCallMessage.status = "completed";
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.web_search_call.completed": {
          const { item_id, output } = data;
          const toolCallMessage = chatMessages.find((m) => m.id === item_id);
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.output = output;
            toolCallMessage.status = "completed";
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.file_search_call.completed": {
          const { item_id, output } = data;
          const toolCallMessage = chatMessages.find((m) => m.id === item_id);
          if (toolCallMessage && toolCallMessage.type === "tool_call") {
            toolCallMessage.output = output;
            toolCallMessage.status = "completed";
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.code_interpreter_call_code.delta": {
          const { delta, item_id } = data;
          const toolCallMessage = [...chatMessages]
            .reverse()
            .find(
              (m) =>
                m.type === "tool_call" &&
                m.tool_type === "code_interpreter_call" &&
                m.status !== "completed" &&
                m.id === item_id
            ) as ToolCallItem | undefined;
          // Accumulate deltas to show the code streaming
          if (toolCallMessage) {
            toolCallMessage.code = (toolCallMessage.code || "") + delta;
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.code_interpreter_call_code.done": {
          const { code, item_id } = data;
          const toolCallMessage = [...chatMessages]
            .reverse()
            .find(
              (m) =>
                m.type === "tool_call" &&
                m.tool_type === "code_interpreter_call" &&
                m.status !== "completed" &&
                m.id === item_id
            ) as ToolCallItem | undefined;

          // Mark the call as completed and set the code
          if (toolCallMessage) {
            toolCallMessage.code = code;
            toolCallMessage.status = "completed";
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.code_interpreter_call.completed": {
          const { item_id } = data;
          const toolCallMessage = chatMessages.find(
            (m) => m.type === "tool_call" && m.id === item_id
          ) as ToolCallItem | undefined;
          if (toolCallMessage) {
            toolCallMessage.status = "completed";
            setChatMessages([...chatMessages]);
          }
          break;
        }

        case "response.completed": {
          console.log("response completed", data);
          const { response } = data;

          // Handle MCP tools list (append all lists, not just the first)
          const mcpListToolsMessages = response.output.filter(
            (m: Item) => m.type === "mcp_list_tools"
          ) as McpListToolsItem[];

          if (mcpListToolsMessages && mcpListToolsMessages.length > 0) {
            for (const msg of mcpListToolsMessages) {
              chatMessages.push({
                type: "mcp_list_tools",
                id: msg.id,
                server_label: msg.server_label,
                tools: msg.tools || [],
              });
            }
            setChatMessages([...chatMessages]);
          }

          // Handle MCP approval request
          const mcpApprovalRequestMessage = response.output.find(
            (m: Item) => m.type === "mcp_approval_request"
          );

          if (mcpApprovalRequestMessage) {
            chatMessages.push({
              type: "mcp_approval_request",
              id: mcpApprovalRequestMessage.id,
              server_label: mcpApprovalRequestMessage.server_label,
              name: mcpApprovalRequestMessage.name,
              arguments: mcpApprovalRequestMessage.arguments,
            });
            setChatMessages([...chatMessages]);
          }

          // Persist the assistant text (built from output_text deltas) as plain
          // history for the next request, instead of storing raw streamed items.
          if (
            assistantMessageContent.trim().length > 0 &&
            !hadToolCallsInResponse
          ) {
            conversationItemsState.push({
              role: "assistant",
              content: assistantMessageContent,
            });
            setConversationItems([...conversationItemsState]);
          }

          break;
        }

        // Handle other events as needed
      }
    }
  );

  if (pendingFunctionCalls.length > 0) {
    if (toolLoopIteration >= MAX_TOOL_LOOP_ITERATIONS) {
      const warning =
        "I've hit the limit for tool calls in a single user turn. Please rephrase or split your request and try again.";
      chatMessages.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: warning }],
      });
      setChatMessages([...chatMessages]);
      conversationItemsState.push({ role: "assistant", content: warning });
      setConversationItems([...conversationItemsState]);
      return;
    }
    let updatedChatMessages = false;
    const toolOutputItems: any[] = [];
    for (const pendingCall of pendingFunctionCalls) {
      let toolResult: any;
      try {
        toolResult = await handleTool(
          pendingCall.name,
          pendingCall.parsedArguments
        );
      } catch (error) {
        toolResult = {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const output = JSON.stringify(toolResult);
      toolOutputItems.push({
        type: "function_call_output",
        call_id: pendingCall.callId,
        output,
      });
      const toolCallMessage = chatMessages.find(
        (m) => m.id === pendingCall.itemId
      );
      if (toolCallMessage && toolCallMessage.type === "tool_call") {
        toolCallMessage.output = output;
        toolCallMessage.status = "completed";
        updatedChatMessages = true;
      }

      const alreadyRecorded = conversationItemsState.some(
        (it: any) =>
          it?.type === "function_call_output" && it?.call_id === pendingCall.callId
      );
      if (!alreadyRecorded) {
        conversationItemsState.push({
          type: "function_call_output",
          call_id: pendingCall.callId,
          output,
        });
      }
    }

    if (updatedChatMessages) {
      setChatMessages([...chatMessages]);
    }
    setConversationItems([...conversationItemsState]);

    // Continue the tool loop until the model no longer requests tools.
    if (toolOutputItems.length > 0) {
      await processMessages(toolOutputItems, toolLoopIteration + 1);
    }
  }
};
