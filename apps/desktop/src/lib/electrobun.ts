import { Electroview } from "electrobun/view";

import type { DesktopRPCType } from "../shared/rpc";

// Electrobun's RPC (rpc-anywhere) defaults `maxRequestTime` to 1000ms, so any
// renderer→bun request that takes longer than a second rejects with
// "RPC request timed out." Model listing, large `fsRead`s, and MCP-backed
// requests routinely exceed that. Match the bun side's ceiling
// (`MAX_REQUEST_TIME_MS` in `bun/rpc/index.ts`).
const MAX_REQUEST_TIME_MS = 5 * 60_000 + 10_000;

const rpc = Electroview.defineRPC<DesktopRPCType>({
  maxRequestTime: MAX_REQUEST_TIME_MS,
  handlers: { requests: {}, messages: {} },
});

export const electrobun = new Electroview({ rpc });
