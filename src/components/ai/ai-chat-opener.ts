"use client";

import { useSyncExternalStore } from "react";

/** Opens the AI chat; `returnFocus` gets focus back when it closes. */
export type OpenAiChat = (returnFocus?: HTMLElement | null) => void;

// The chat is mounted by the project layout, Gido by the app shell: the chat
// registers here and Gido offers "Ask Gido" only while one is mounted.
let opener: OpenAiChat | null = null;
const listeners = new Set<() => void>();

export function registerAiChat(open: OpenAiChat): () => void {
  opener = open;
  listeners.forEach((listener) => listener());
  return () => {
    if (opener === open) opener = null;
    listeners.forEach((listener) => listener());
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The open function of the mounted AI chat, or null when this page has none. */
export function useAiChatOpener(): OpenAiChat | null {
  return useSyncExternalStore(subscribe, () => opener, () => null);
}
