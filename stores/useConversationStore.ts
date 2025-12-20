import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Item } from "@/lib/assistant";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { INITIAL_MESSAGE } from "@/config/constants";

interface ConversationState {
  // Items displayed in the chat
  chatMessages: Item[];
  // Items sent to the Responses API
  conversationItems: any[];
  // Whether we are waiting for the assistant response
  isAssistantLoading: boolean;
  // OpenAI conversation ID (Conversations API)
  openaiConversationId: string | null;

  setChatMessages: (items: Item[]) => void;
  setConversationItems: (messages: any[]) => void;
  addChatMessage: (item: Item) => void;
  addConversationItem: (message: ChatCompletionMessageParam) => void;
  setAssistantLoading: (loading: boolean) => void;
  setOpenaiConversationId: (id: string | null) => void;
  rawSet: (state: any) => void;
  resetConversation: () => void;
}

const useConversationStore = create<ConversationState>()(
  persist(
    (set) => ({
      chatMessages: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: INITIAL_MESSAGE }],
        },
      ],
      conversationItems: [],
      isAssistantLoading: false,
      openaiConversationId: null,
      setChatMessages: (items) => set({ chatMessages: items }),
      setConversationItems: (messages) => set({ conversationItems: messages }),
      addChatMessage: (item) =>
        set((state) => ({ chatMessages: [...state.chatMessages, item] })),
      addConversationItem: (message) =>
        set((state) => ({
          conversationItems: [...state.conversationItems, message],
        })),
      setAssistantLoading: (loading) => set({ isAssistantLoading: loading }),
      setOpenaiConversationId: (id) => set({ openaiConversationId: id }),
      rawSet: set,
      resetConversation: () =>
        set(() => ({
          chatMessages: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: INITIAL_MESSAGE }],
            },
          ],
          conversationItems: [],
          openaiConversationId: null,
        })),
    }),
    {
      name: "conversation-store",
      partialize: (state) => ({
        chatMessages: state.chatMessages,
        conversationItems: state.conversationItems,
        openaiConversationId: state.openaiConversationId,
      }),
    }
  )
);

export default useConversationStore;
