import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Item } from "@/lib/assistant";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { INITIAL_LANGUAGE_OPTIONS, INITIAL_MESSAGE } from "@/config/constants";

interface ConversationState {
  // Items displayed in the chat
  chatMessages: Item[];
  // Items sent to the Responses API
  conversationItems: any[];
  // Whether we are waiting for the assistant response
  isAssistantLoading: boolean;
  // OpenAI conversation ID (Conversations API)
  openaiConversationId: string | null;
  // Hydration flag for persisted state
  hasHydrated: boolean;

  setChatMessages: (items: Item[]) => void;
  setConversationItems: (messages: any[]) => void;
  addChatMessage: (item: Item) => void;
  addConversationItem: (message: ChatCompletionMessageParam) => void;
  setAssistantLoading: (loading: boolean) => void;
  setOpenaiConversationId: (id: string | null) => void;
  setHasHydrated: (value: boolean) => void;
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
          followUps: INITIAL_LANGUAGE_OPTIONS,
        },
      ],
      conversationItems: [],
      isAssistantLoading: false,
      openaiConversationId: null,
      hasHydrated: false,
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
      setHasHydrated: (value) => set({ hasHydrated: value }),
      rawSet: set,
      resetConversation: () =>
        set(() => ({
          chatMessages: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: INITIAL_MESSAGE }],
              followUps: INITIAL_LANGUAGE_OPTIONS,
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
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("Failed to rehydrate conversation store:", error);
        }
        if (state?.chatMessages && state.chatMessages.length === 1) {
          const [firstMessage] = state.chatMessages;
          const firstContent = firstMessage?.content?.[0];
          if (
            firstMessage?.type === "message" &&
            firstMessage.role === "assistant" &&
            !firstMessage.followUps &&
            firstContent?.type === "output_text" &&
            typeof firstContent.text === "string" &&
            firstContent.text.trim() === INITIAL_MESSAGE.trim()
          ) {
            state.setChatMessages([
              {
                ...firstMessage,
                followUps: INITIAL_LANGUAGE_OPTIONS,
              },
            ]);
          }
        }
        state?.setHasHydrated(true);
      },
    }
  )
);

export default useConversationStore;
