import * as pi from "@earendil-works/pi-ai";

export interface ModelProviderGroup {
  id: string;
  name: string;
  models: readonly pi.Model<pi.Api>[];
  apiKeyDetected?: boolean;
}
