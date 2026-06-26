"use client";

import type { Thread } from "@llm-space/core";
import { useCallback, useEffect, useState } from "react";

import { ThreadPlayground } from "@/components/thread-playground";

export default function HomePage() {
  const handleChange = useCallback((thread: Thread) => {
    console.info("thread changed", thread);
  }, []);
  const { data: thread, loading } = useQueryThread("thread");
  return (
    <div className="h-screen w-screen">
      <ThreadPlayground
        className="bg-background size-full shadow-lg"
        loading={loading}
        initialValue={thread}
        onChange={handleChange}
      />
    </div>
  );
}

function useQueryThread(filename: string) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void fetch(`/data/${filename}.json?t=` + Date.now())
      .then((res) => res.json())
      .then(setThread)
      .catch((error: unknown) => {
        console.error("Failed to load thread", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filename]);
  return { data: thread, loading };
}
