"use client";
import React, { useState } from "react";
import Chat from "./chat";
import useConversationStore from "@/stores/useConversationStore";
import { Item, processMessages } from "@/lib/assistant";
import { Button } from "@/components/ui/button";

export default function Assistant() {
  const [chatInstanceKey, setChatInstanceKey] = useState(0);
  const {
    chatMessages,
    addConversationItem,
    addChatMessage,
    setAssistantLoading,
    resetConversation,
    isAssistantLoading,
  } = useConversationStore();

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const userItem: Item = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: message.trim() }],
    };
    const userMessage: any = {
      role: "user",
      content: message.trim(),
    };

    try {
      setAssistantLoading(true);
      addConversationItem(userMessage);
      addChatMessage(userItem);
      await processMessages([userMessage]);
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  const handleApprovalResponse = async (
    approve: boolean,
    id: string
  ) => {
    const approvalItem = {
      type: "mcp_approval_response",
      approve,
      approval_request_id: id,
    } as any;
    try {
      addConversationItem(approvalItem);
      await processMessages([approvalItem]);
    } catch (error) {
      console.error("Error sending approval response:", error);
    }
  };

  return (
    <div className="relative h-full p-4 w-full bg-white">
      <div className="absolute left-4 top-4 z-10">
        <Button
          variant="outline"
          size="sm"
          disabled={isAssistantLoading}
          onClick={() => {
            setAssistantLoading(false);
            resetConversation();
            setChatInstanceKey((k) => k + 1);
          }}
        >
          New chat
        </Button>
      </div>
      <Chat
        key={chatInstanceKey}
        items={chatMessages}
        onSendMessage={handleSendMessage}
        onApprovalResponse={handleApprovalResponse}
      />
    </div>
  );
}
