import { Layout } from "./layout";
import { Page } from "./page";

export function App({
  totalMemoryBytes,
}: {
  totalMemoryBytes: number | null;
}) {
  return (
    <Layout totalMemoryBytes={totalMemoryBytes}>
      <Page />
    </Layout>
  );
}
