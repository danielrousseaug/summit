"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
// Using regular div with scrolling instead of ScrollArea component
import {
  Bot,
  User,
  Send,
  Loader2,
  BookOpen,
  MessageCircle
} from "lucide-react";
import toast from "react-hot-toast";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  pageContext?: number;
}

interface AITutorChatProps {
  courseId: string;
  currentPage: number;
  totalPages: number;
  isVisible: boolean;
}

export default function AITutorChat({ courseId, currentPage, totalPages, isVisible }: AITutorChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when chat becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  // Add welcome message when chat first opens (only once)
  useEffect(() => {
    if (isVisible && messages.length === 0) {
      const welcomeMessage: Message = {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Hello! I'm your AI tutor. I can help you understand the content you're reading. Feel free to ask me questions about what you're reading, request explanations, or ask for study tips!`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isVisible]); // Remove dependencies on currentPage and totalPages

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      pageContext: currentPage
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/courses/${courseId}/ai-tutor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          message: inputValue.trim(),
          page_number: currentPage,
          conversation_history: messages.slice(-6) // Last 6 messages for context
        })
      });

      if (!response.ok) {
        throw new Error(`AI tutor request failed: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response || "I apologize, but I couldn't generate a response. Please try again.",
        timestamp: new Date(),
        pageContext: currentPage
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("AI tutor error:", error);
      toast.error("Failed to get AI response. Please try again.");

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isVisible) return null;

  return (
    <Card className="w-80 h-[80vh] flex flex-col shadow-sm border border-gray-100 dark:border-gray-700">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-start space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <Bot className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-sm">AI Tutor</CardTitle>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              <BookOpen className="w-3 h-3 inline mr-1" />
              Page {currentPage} of {totalPages}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 min-h-0" ref={scrollAreaRef}>
          <div className="space-y-4 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex-shrink-0 mt-1">
                    <Bot className="w-3 h-3 text-gray-700 dark:text-gray-300" />
                  </div>
                )}

                <div className={`max-w-[240px] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-gray-100'
                    : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs ${
                      message.role === 'user' ? 'text-gray-300 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {formatTime(message.timestamp)}
                    </span>
                    {message.pageContext && (
                      <span className={`text-xs ${
                        message.role === 'user' ? 'text-gray-300 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        p.{message.pageContext}
                      </span>
                    )}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 flex-shrink-0 mt-1">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex-shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-gray-700 dark:text-gray-300" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                    <span className="text-sm text-gray-600">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 flex-shrink-0">
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about this page..."
              className="flex-1 text-sm"
              disabled={isLoading}
              maxLength={500}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputValue.trim() || isLoading}
              className="bg-gray-900 hover:bg-gray-800 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            <MessageCircle className="w-3 h-3 inline mr-1" />
            Ask questions about page {currentPage}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}