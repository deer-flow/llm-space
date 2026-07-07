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
];
