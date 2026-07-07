import type { BuiltinTool } from "@llm-space/core";

// -- weather_report -----------------------------------------------------------

interface WeatherReport {
  city: string;
  date: string;
  weather: string;
  temperature: {
    unit: "celsius";
    max: number;
    min: number;
  };
}

interface WttrResponse {
  current_condition?: {
    weatherDesc?: { value?: string }[];
  }[];
  weather?: {
    date?: string;
    maxtempC?: string;
    mintempC?: string;
    hourly?: {
      time?: string;
      weatherDesc?: { value?: string }[];
    }[];
  }[];
}

export const weatherReportTool: BuiltinTool = {
  type: "builtin",
  name: "weather_report",
  icon: "cloud-sun",
  description: "Get today's weather report for a city.",
  strict: true,
  parameters: {
    type: "object",
    required: ["city"],
    properties: {
      city: {
        type: "string",
        description: "The city to get today's weather report for.",
      },
    },
    additionalProperties: false,
  },
};

function _encodeWttrCity(city: string): string {
  return city.trim().split(/\s+/).map(encodeURIComponent).join("+");
}

function _getWeatherDescription(data: WttrResponse): string {
  const today = data.weather?.[0];

  const noon = today?.hourly?.find((item) => item.time === "1200");
  const noonDesc = noon?.weatherDesc?.[0]?.value;
  if (noonDesc) {
    return noonDesc;
  }

  const currentDesc = data.current_condition?.[0]?.weatherDesc?.[0]?.value;
  if (currentDesc) {
    return currentDesc;
  }

  return "Unknown";
}

export async function weather_report(city: string): Promise<WeatherReport> {
  const normalizedCity = city.trim();
  if (!normalizedCity) {
    throw new Error("city is required.");
  }
  const location = _encodeWttrCity(normalizedCity);

  const res = await fetch(`https://wttr.in/${location}?format=j1&lang=en`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "llm-space-weather-tool/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`weather_report failed: ${res.status}`);
  }

  const data = (await res.json()) as WttrResponse;
  const today = data.weather?.[0];

  if (!today?.date || !today.maxtempC || !today.mintempC) {
    throw new Error("weather_report failed: missing today's forecast");
  }

  return {
    city: normalizedCity,
    date: today.date,
    weather: _getWeatherDescription(data),
    temperature: {
      unit: "celsius",
      max: Number(today.maxtempC),
      min: Number(today.mintempC),
    },
  };
}

// -- present_files ------------------------------------------------------------

export const presentFilesTool: BuiltinTool = {
  type: "builtin",
  name: "present_files",
  icon: "files",
  description:
    'You should always use this tool to present the artifacts and foundings after each creation or edit. Other wise the user won\'t be able to "see" them. Use when delivering final artifacts, reports, charts, or other outputs the user should see or download.',
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "paths"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what files are being presented and why",
      },
      paths: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Absolute paths to the files to present to the user",
      },
    },
    additionalProperties: false,
  },
};

export async function present_files(): Promise<"OK"> {
  return Promise.resolve("OK");
}

// -- todo_write ---------------------------------------------------------------

export const todoWriteTool: BuiltinTool = {
  type: "builtin",
  name: "todo_write",
  icon: "list-todo",
  description:
    "Creates or updates the assistant's visible todo list for tracking multi-step work. Only use for non-trivial tasks with several concrete steps where tracking progress helps the user — skip it for single-step or trivial requests, where it just adds overhead. Each call replaces the entire list, so pass the full set of todos every time, and keep statuses current as work progresses.",
  strict: true,
  parameters: {
    type: "object",
    required: ["todos"],
    properties: {
      todos: {
        type: "array",
        description: "The complete set of todo items to display.",
        items: {
          type: "object",
          required: ["content", "status"],
          properties: {
            content: {
              type: "string",
              description: "Short description of the work item.",
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "Current state of the todo item.",
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

export async function todo_write(): Promise<"OK"> {
  return Promise.resolve("OK");
}

// -- ask_user_question --------------------------------------------------------

export const askUserQuestionTool: BuiltinTool = {
  type: "builtin",
  name: "ask_user_question",
  icon: "circle-help",
  // Always ends the run: its answer must come from a human, so it can never be
  // auto-executed (not by "auto run tools", not by the ReAct loop).
  terminate: true,
  description:
    'Collect structured multiple-choice answers from the user. Use only when blocked on a decision that is genuinely the user\'s to make — one you cannot resolve from the request, the code, or sensible defaults. Each question must have at least 2 options; users can always select "Other" for custom text. Set multi_select to true for multi-select questions.',
  strict: true,
  parameters: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        description:
          "A list of 1–4 parallel, independent questions with predefined answer choices.",
        items: {
          type: "object",
          required: ["question", "header", "options", "multi_select"],
          properties: {
            question: {
              type: "string",
              description:
                "Full question text. Be specific and end with a question mark where appropriate.",
            },
            header: {
              type: "string",
              description:
                "Very short tab or tag label for the question, maximum 12 characters, for example Auth or Library.",
            },
            options: {
              type: "array",
              description:
                "A list of 2–4 distinct selectable choices. Choices are mutually exclusive unless multi_select is true.",
              items: {
                type: "object",
                required: ["label", "description"],
                properties: {
                  label: {
                    type: "string",
                    description:
                      "Short display label for this choice, ideally 1–5 words.",
                  },
                  description: {
                    type: "string",
                    description:
                      "Explanation of what this choice means or implies.",
                  },
                  preview: {
                    type: "string",
                    description:
                      "Optional markdown preview shown when this option is focused. Intended for single-select questions only.",
                  },
                },
                additionalProperties: false,
              },
            },
            multi_select: {
              type: "boolean",
              description:
                "If true, the user may select multiple options. If false, the user must select exactly one option.",
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

// -- registry -----------------------------------------------------------------

export const miscBuiltInTools = [
  {
    tool: weatherReportTool,
    async execute(args: Record<string, unknown>) {
      const city = args.city;
      if (typeof city !== "string" || !city.trim()) {
        throw new Error("city is required.");
      }
      return weather_report(city);
    },
  },
  {
    tool: presentFilesTool,
    async execute() {
      return present_files();
    },
  },
  {
    tool: todoWriteTool,
    async execute() {
      return todo_write();
    },
  },
  {
    tool: askUserQuestionTool,
    // Never auto-executed: `terminate` keeps it out of every auto-run path. This
    // guard only fires if it is somehow invoked directly.
    execute() {
      return Promise.reject(
        new Error(
          "ask_user_question needs a human answer and cannot be executed automatically."
        )
      );
    },
  },
];
