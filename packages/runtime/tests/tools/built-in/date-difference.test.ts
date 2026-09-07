import { describe, expect, test } from "bun:test";

import {
  dateDifference,
  dateDifferenceTool,
} from "../../../src/tools/built-in/date-difference";

describe("date_difference built-in tool", () => {
  test("calculates date intervals with explicit endpoint inclusion", () => {
    const base = { start: "2026-09-01", end: "2026-09-03" };
    expect(dateDifference(base)).toBe("2 days");
    expect(
      dateDifference({ ...base, includeStart: true, includeEnd: true })
    ).toBe("3 days");
    expect(
      dateDifference({ ...base, includeStart: false, includeEnd: false })
    ).toBe("1 day");
    expect(
      dateDifference({ ...base, includeStart: false, includeEnd: true })
    ).toBe("2 days");
  });

  test("returns date-time differences with explicit units", () => {
    expect(
      dateDifference({
        start: "2026-09-01 10:20:30",
        end: "2026-09-03 13:24:35",
      })
    ).toBe("2 days, 3 hours, 4 minutes, 5 seconds");
    expect(
      dateDifference({
        start: "2026-09-01 10:20:30",
        end: "2026-09-01 10:20:30",
      })
    ).toBe("0 seconds");
  });

  test("validates dates, ordering, and matching precision", () => {
    expect(() =>
      dateDifference({ start: "2025-02-29", end: "2025-03-01" })
    ).toThrow("start contains an invalid day");
    expect(() =>
      dateDifference({ start: "2026-09-03", end: "2026-09-01" })
    ).toThrow("end must not be earlier than start");
    expect(() =>
      dateDifference({
        start: "2026-09-01",
        end: "2026-09-03 00:00:00",
      })
    ).toThrow("same format and precision");
  });

  test("publishes the mandatory-use instruction and strict schema", () => {
    const parameters = dateDifferenceTool.parameters as Record<string, unknown>;
    expect(dateDifferenceTool.description).toContain(
      "even when the calculation seems simple"
    );
    expect(parameters.required).toEqual([
      "start",
      "end",
      "include_start",
      "include_end",
    ]);
    expect(parameters.additionalProperties).toBe(false);
  });
});
