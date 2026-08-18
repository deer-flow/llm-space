import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  MessageVirtualizationProvider,
  useMessageVirtualization,
} from "../../src/components/message-virtualization-provider";
import { ThemeProvider } from "../../src/components/theme-provider";

function Probe() {
  const value = useMessageVirtualization();
  return (
    <output
      data-mode={value.mode}
      data-auto-threshold={value.autoThreshold}
      data-custom-threshold={value.customThreshold}
      data-virtualize-20={value.shouldVirtualize(20)}
      data-virtualize-21={value.shouldVirtualize(21)}
    />
  );
}

function render(totalMemoryBytes: number | null) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <MessageVirtualizationProvider totalMemoryBytes={totalMemoryBytes}>
        <Probe />
      </MessageVirtualizationProvider>
    </ThemeProvider>
  );
}

describe("MessageVirtualizationProvider", () => {
  test("preserves the previous 20-message behavior without a host provider", () => {
    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain('data-mode="auto"');
    expect(markup).toContain('data-auto-threshold="20"');
    expect(markup).toContain('data-virtualize-20="false"');
    expect(markup).toContain('data-virtualize-21="true"');
  });

  test("defaults to Auto with the standard memory tier", () => {
    const markup = render(null);
    expect(markup).toContain('data-mode="auto"');
    expect(markup).toContain('data-auto-threshold="25"');
    expect(markup).toContain('data-custom-threshold="20"');
    expect(markup).toContain('data-virtualize-20="false"');
    expect(markup).toContain('data-virtualize-21="false"');
  });

  test("uses the benchmark-calibrated physical-memory tier", () => {
    expect(render(64 * 2 ** 30)).toContain('data-auto-threshold="30"');
  });
});
