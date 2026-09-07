import type { BuiltinTool } from "@llm-space/core";

import type { ToolEntry } from "../tool-registry";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const SECONDS_PER_DAY = 86_400;

type Precision = "date" | "datetime";

interface ParsedDateTime {
  precision: Precision;
  seconds: number;
}

export const dateDifferenceTool: BuiltinTool = {
  type: "builtin",
  name: "date_difference",
  icon: "calendar-clock",
  description:
    "Calculate the difference between two dates or date-times. You must use this tool for every task that involves calculating a date, time, duration, or interval difference, even when the calculation seems simple; never calculate the result yourself. Inputs must both use either YYYY-MM-DD or YYYY-MM-DD HH:mm:ss. The calculation is timezone-free. By default it includes the start and excludes the end ([start, end)).",
  strict: true,
  parameters: {
    type: "object",
    required: ["start", "end", "include_start", "include_end"],
    properties: {
      start: {
        type: "string",
        description:
          "The earlier boundary in YYYY-MM-DD or YYYY-MM-DD HH:mm:ss format.",
      },
      end: {
        type: "string",
        description:
          "The later boundary, using the same format and precision as start.",
      },
      include_start: {
        type: "boolean",
        description:
          "Whether to include the start boundary. Use true unless the user explicitly wants to exclude it.",
        default: true,
      },
      include_end: {
        type: "boolean",
        description:
          "Whether to include the end boundary. Use false unless the user explicitly wants to include it.",
        default: false,
      },
    },
    additionalProperties: false,
  },
};

export function dateDifference({
  start,
  end,
  includeStart = true,
  includeEnd = false,
}: {
  start: string;
  end: string;
  includeStart?: boolean;
  includeEnd?: boolean;
}): string {
  const parsedStart = parseDateTime(start, "start");
  const parsedEnd = parseDateTime(end, "end");
  if (parsedStart.precision !== parsedEnd.precision) {
    throw new Error(
      "start and end must use the same format and precision: both dates or both date-times."
    );
  }
  if (parsedEnd.seconds < parsedStart.seconds) {
    throw new Error("end must not be earlier than start.");
  }

  const unitSeconds =
    parsedStart.precision === "date" ? SECONDS_PER_DAY : 1;
  const elapsedSeconds = parsedEnd.seconds - parsedStart.seconds;
  const adjustedSeconds = Math.max(
    0,
    elapsedSeconds +
      (includeEnd ? unitSeconds : 0) -
      (includeStart ? 0 : unitSeconds)
  );

  return parsedStart.precision === "date"
    ? formatUnit(adjustedSeconds / SECONDS_PER_DAY, "day")
    : formatDuration(adjustedSeconds);
}

export const dateDifferenceBuiltInTools: ToolEntry[] = [
  {
    tool: dateDifferenceTool,
    execute(args: Record<string, unknown>) {
      if (typeof args.start !== "string") {
        return Promise.reject(new Error("start must be a string."));
      }
      if (typeof args.end !== "string") {
        return Promise.reject(new Error("end must be a string."));
      }
      if (typeof args.include_start !== "boolean") {
        return Promise.reject(new Error("include_start must be a boolean."));
      }
      if (typeof args.include_end !== "boolean") {
        return Promise.reject(new Error("include_end must be a boolean."));
      }
      return Promise.resolve(
        dateDifference({
          start: args.start,
          end: args.end,
          includeStart: args.include_start,
          includeEnd: args.include_end,
        })
      );
    },
  },
];

function parseDateTime(value: string, field: "start" | "end"): ParsedDateTime {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const dateTimeMatch = DATE_TIME_PATTERN.exec(value);
  const dateMatch = dateTimeMatch ? null : DATE_PATTERN.exec(value);
  const match = dateTimeMatch ?? dateMatch;
  if (!match) {
    throw new Error(
      `${field} must use YYYY-MM-DD or YYYY-MM-DD HH:mm:ss format.`
    );
  }

  const precision: Precision = dateTimeMatch ? "datetime" : "date";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);

  if (year < 1 || year > 9_999) {
    throw new Error(`${field} year must be between 0001 and 9999.`);
  }
  if (month < 1 || month > 12) {
    throw new Error(`${field} contains an invalid month.`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`${field} contains an invalid day.`);
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`${field} contains an invalid time.`);
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return { precision, seconds: date.getTime() / 1_000 };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function formatDuration(totalSeconds: number): string {
  let remaining = totalSeconds;
  const days = Math.floor(remaining / SECONDS_PER_DAY);
  remaining %= SECONDS_PER_DAY;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(formatUnit(days, "day"));
  if (hours > 0) parts.push(formatUnit(hours, "hour"));
  if (minutes > 0) parts.push(formatUnit(minutes, "minute"));
  if (seconds > 0) parts.push(formatUnit(seconds, "second"));
  return parts.length > 0 ? parts.join(", ") : "0 seconds";
}

function formatUnit(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}
