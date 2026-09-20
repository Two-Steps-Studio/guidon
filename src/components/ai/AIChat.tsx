"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bot, User, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AIChat({ projectId }: { projectId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: [...messages, userMsg],
        }),
      });

      if (!res.ok) throw new Error("AI request failed");
      const data = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div
        className="fixed bottom-6 right-6 z-50"
        onClick={() => setIsOpen(true)}
      >
        <Button size="icon" className="rounded-full h-12 w-12 shadow-lg hover:scale-110 transition-transform">
          <Sparkles className="h-6 w-6" />
        </Button>
      </div>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Guidon AI Assistant
            </SheetTitle>
          </SheetHeader>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground mt-10 space-y-2">
                <Bot className="h-10 w-10 mx-auto opacity-20" />
                <p>How can I help you with this project?</p>
                <p className="text-xs">I can update tasks, add memory, or answer questions.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn(
                "flex gap-3",
                m.role === "user" ? "flex-row-reverse" : "flex-row"
              )}>
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "max-w-[80%] p-3 rounded-lg text-sm",
                  m.role === "user" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"
                )}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="bg-muted p-3 rounded-lg text-sm italic text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-background">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask AI to do something..."
                className="min-h-0 h-10 resize-none py-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button type="submit" disabled={isLoading} size="icon" className="h-10 w-10 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
