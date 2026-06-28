"use client";

import { FileSystemTreeView } from "@/components/file-system-tree-view";

export default function TestPage() {
  return (
    <div className="bg-background mx-auto h-screen max-w-64 border-x">
      <FileSystemTreeView className="h-full" />
    </div>
  );
}
