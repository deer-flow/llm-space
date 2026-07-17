"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { HostServices } from "./types";

const HostServicesContext = createContext<HostServices | null>(null);

/**
 * Provides the host capabilities the Thread Playground needs (transport, tool
 * execution, skills/mcp/paths access, navigation). The desktop app supplies an
 * Electrobun-backed value; a web build supplies a display-only stub.
 */
export function HostServicesProvider({
  value,
  children,
}: {
  value: HostServices;
  children: ReactNode;
}) {
  return (
    <HostServicesContext.Provider value={value}>
      {children}
    </HostServicesContext.Provider>
  );
}

export function useHostServices(): HostServices {
  const ctx = useContext(HostServicesContext);
  if (!ctx) {
    throw new Error(
      "useHostServices must be used within a HostServicesProvider"
    );
  }
  return ctx;
}
