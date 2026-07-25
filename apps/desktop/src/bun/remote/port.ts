import net from "node:net";

export async function findFreePort(host = "127.0.0.1"): Promise<number> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(_fallbackPort()));
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port || _fallbackPort()));
    });
  });
}

function _fallbackPort(): number {
  return 40_000 + Math.floor(Math.random() * 10_000);
}
