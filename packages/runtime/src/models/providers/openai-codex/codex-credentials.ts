import type { CustomProviderApi } from "../../types";

export type CodexCredentials =
  | {
      api: CustomProviderApi;
      apiKey: string;
      baseUrl: string;
      mode: "apiKey";
    }
  | {
      apiKey: string;
      mode: "oauth";
    };
