import type { BuiltinTool } from "@llm-space/core";

import type { ToolEntry } from "../tool-registry";

const MAX_EXPRESSION_LENGTH = 1_000;

type Token =
  | { type: "number"; value: number; position: number }
  | { type: "identifier"; value: string; position: number }
  | { type: "operator"; value: string; position: number }
  | { type: "eof"; position: number };

interface MathFunction {
  minArgs: number;
  maxArgs: number;
  evaluate: (...args: number[]) => number;
}

const FUNCTIONS: Record<string, MathFunction> = {
  abs: unary(Math.abs),
  acos: unary(Math.acos),
  asin: unary(Math.asin),
  atan: unary(Math.atan),
  atan2: binary(Math.atan2),
  ceil: unary(Math.ceil),
  cos: unary(Math.cos),
  exp: unary(Math.exp),
  floor: unary(Math.floor),
  log: unary(Math.log),
  log10: unary(Math.log10),
  max: variadic(Math.max),
  min: variadic(Math.min),
  pow: binary(Math.pow),
  round: unary(Math.round),
  sin: unary(Math.sin),
  sqrt: unary(Math.sqrt),
  tan: unary(Math.tan),
  trunc: unary(Math.trunc),
};

const CONSTANTS: Record<string, number> = {
  e: Math.E,
  pi: Math.PI,
};

export const calculatorTool: BuiltinTool = {
  type: "builtin",
  name: "calculator",
  icon: "calculator",
  description:
    "Evaluate a mathematical expression safely. You must use this tool for every task that involves mathematical calculation, even the simplest arithmetic; never calculate the result yourself. Supports parentheses, +, -, *, /, %, **, constants pi/e, and common functions such as sin, cos, tan, sqrt, log, min, and max. Math.* names are also accepted.",
  strict: true,
  parameters: {
    type: "object",
    required: ["expression"],
    properties: {
      expression: {
        type: "string",
        description:
          "The mathematical expression to evaluate, for example: 2 * (3 + 4), Math.sin(Math.PI / 2), or sqrt(81).",
      },
    },
    additionalProperties: false,
  },
};

export function calculate(expression: string): number {
  if (typeof expression !== "string") {
    throw new Error("expression must be a string.");
  }
  if (!expression.trim()) {
    throw new Error("expression must not be empty.");
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(
      `expression exceeds the ${MAX_EXPRESSION_LENGTH} character limit.`
    );
  }

  try {
    return new Parser(tokenize(expression)).parse();
  } catch (error) {
    if (error instanceof CalculatorError) {
      throw new Error(`Calculator ${error.kind} error: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

export const calculatorBuiltInTools: ToolEntry[] = [
  {
    tool: calculatorTool,
    execute(args: Record<string, unknown>) {
      if (typeof args.expression !== "string") {
        return Promise.reject(new Error("expression must be a string."));
      }
      return Promise.resolve(calculate(args.expression));
    },
  },
];

class CalculatorError extends Error {
  constructor(
    readonly kind: "syntax" | "range",
    message: string
  ) {
    super(message);
  }
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.parseAdditive();
    const token = this.peek();
    if (token.type !== "eof") {
      this.syntax(`unexpected token ${describeToken(token)}`, token.position);
    }
    return finite(value);
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (this.matches("+") || this.matches("-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      value = finite(operator === "+" ? value + right : value - right);
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (
      this.matches("*") ||
      this.matches("/") ||
      this.matches("%")
    ) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new CalculatorError("range", "division by zero.");
      }
      value = finite(
        operator === "*"
          ? value * right
          : operator === "/"
            ? value / right
            : value % right
      );
    }
    return value;
  }

  private parseUnary(): number {
    if (this.matches("+")) {
      return this.parseUnary();
    }
    if (this.matches("-")) {
      return finite(-this.parseUnary());
    }
    return this.parsePower();
  }

  private parsePower(): number {
    let value = this.parsePrimary();
    if (this.matches("**")) {
      value = finite(Math.pow(value, this.parseUnary()));
    }
    return value;
  }

  private parsePrimary(): number {
    const token = this.advance();
    if (token.type === "number") {
      return token.value;
    }
    if (token.type === "operator" && token.value === "(") {
      const value = this.parseAdditive();
      this.consume(")", "expected ')' to close the expression");
      return value;
    }
    if (token.type === "identifier") {
      return this.parseIdentifier(token);
    }
    this.syntax(`expected a number, function, or '('`, token.position);
  }

  private parseIdentifier(token: Extract<Token, { type: "identifier" }>): number {
    const name = normalizeIdentifier(token.value);
    if (!this.matches("(")) {
      const constant = CONSTANTS[name];
      if (constant === undefined) {
        this.syntax(`unknown constant '${token.value}'`, token.position);
      }
      return constant;
    }

    const fn = FUNCTIONS[name];
    if (!fn) {
      this.syntax(`unknown function '${token.value}'`, token.position);
    }
    const args: number[] = [];
    if (!this.check(")")) {
      do {
        args.push(this.parseAdditive());
      } while (this.matches(","));
    }
    this.consume(")", `expected ')' after arguments to '${token.value}'`);
    if (args.length < fn.minArgs || args.length > fn.maxArgs) {
      const expected =
        fn.minArgs === fn.maxArgs
          ? `${fn.minArgs}`
          : `${fn.minArgs} or more`;
      this.syntax(
        `'${token.value}' expects ${expected} argument${fn.minArgs === 1 && fn.maxArgs === 1 ? "" : "s"}, got ${args.length}`,
        token.position
      );
    }
    return finite(fn.evaluate(...args));
  }

  private matches(value: string): boolean {
    if (!this.check(value)) return false;
    this.index += 1;
    return true;
  }

  private check(value: string): boolean {
    const token = this.peek();
    return token.type === "operator" && token.value === value;
  }

  private consume(value: string, message: string): void {
    if (!this.matches(value)) this.syntax(message, this.peek().position);
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== "eof") this.index += 1;
    return token;
  }

  private previous(): Extract<Token, { type: "operator" }> {
    return this.tokens[this.index - 1] as Extract<Token, { type: "operator" }>;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private syntax(message: string, position: number): never {
    throw new CalculatorError("syntax", `${message} at position ${position}.`);
  }
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/\d/.test(char) || (char === "." && /\d/.test(expression[index + 1] ?? ""))) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
        expression.slice(index)
      );
      if (!match) {
        throw new CalculatorError(
          "syntax",
          `invalid number at position ${index}.`
        );
      }
      const value = Number(match[0]);
      if (!Number.isFinite(value)) {
        throw new CalculatorError("range", `number is outside the supported range at position ${index}.`);
      }
      tokens.push({ type: "number", value, position: index });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(
        expression.slice(index)
      );
      if (!match) {
        throw new CalculatorError(
          "syntax",
          `invalid identifier at position ${index}.`
        );
      }
      tokens.push({ type: "identifier", value: match[0], position: index });
      index += match[0].length;
      continue;
    }
    const twoCharacters = expression.slice(index, index + 2);
    if (twoCharacters === "**") {
      tokens.push({ type: "operator", value: twoCharacters, position: index });
      index += 2;
      continue;
    }
    if ("+-*/%(),".includes(char)) {
      tokens.push({ type: "operator", value: char, position: index });
      index += 1;
      continue;
    }
    throw new CalculatorError(
      "syntax",
      `unsupported character '${char}' at position ${index}.`
    );
  }
  tokens.push({ type: "eof", position: expression.length });
  return tokens;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.startsWith("Math.")
    ? identifier.slice("Math.".length).toLowerCase()
    : identifier.toLowerCase();
}

function finite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new CalculatorError(
      "range",
      "result is not a finite number (overflow or invalid function domain)."
    );
  }
  return value;
}

function describeToken(token: Token): string {
  if (token.type === "eof") return "end of expression";
  return `'${token.value}'`;
}

function unary(evaluate: (value: number) => number): MathFunction {
  return { minArgs: 1, maxArgs: 1, evaluate };
}

function binary(evaluate: (left: number, right: number) => number): MathFunction {
  return { minArgs: 2, maxArgs: 2, evaluate };
}

function variadic(evaluate: (...values: number[]) => number): MathFunction {
  return { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, evaluate };
}
