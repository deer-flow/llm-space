"use client";

import type { Thread } from "@llm-space/core";

import { ThreadPlayground } from "@/components/thread-playground";

const thread: Thread = {
  title: "",
  model: {
    // provider: "doubao",
    // id: "doubao-seed-2.0-pro",
    // provider: "openai-codex",
    // id: "gpt-5.5",
    provider: "deepseek",
    id: "deepseek-v4-flash",
  },
  context: {
    systemPrompt: "",
    tools: [
      {
        name: "weather_report",
        description: "Get the weather report for a given location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The location to get the weather report for",
            },
          },
          required: ["location"],
        },
      },
    ],
    messages: [
      {
        id: "70c75bc2-5509-42fb-857a-49f6acf1f5f0",
        role: "user",
        content: [{ type: "text", text: "Hello, how are you?" }],
      },
      {
        id: "70c75bc2-5509-42fb-857a-49f6acf1f5f1",
        role: "assistant",
        content: [{ type: "text", text: "Hello. How can I help you today?" }],
      },
      {
        id: "70c75bc2-5509-42fb-857a-49f6acf1f5f2",
        role: "user",
        content: [{ type: "text", text: "Is it raining in Tokyo?" }],
      },
    ],
  },
};

export default function HomePage() {
  return (
    <div className="h-screen w-screen">
      <ThreadPlayground className="bg-background size-full shadow-lg" />
    </div>
  );
}
