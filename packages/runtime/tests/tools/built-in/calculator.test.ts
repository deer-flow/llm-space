import { describe, expect, test } from "bun:test";

import { calculate, calculatorTool } from "../../../src/tools/built-in/calculator";

describe("calculator built-in tool", () => {
  test("evaluates arithmetic with JavaScript-style power precedence", () => {
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("2 ** 3 ** 2")).toBe(512);
    expect(calculate("-2 ** 2")).toBe(-4);
  });

  test("supports constants, Math names, and common functions", () => {
    expect(calculate("Math.sin(Math.PI / 2) + sqrt(81)")).toBeCloseTo(10);
    expect(calculate("max(2, 5, -1) + log10(100)")).toBe(7);
  });

  test("rejects unsafe syntax and non-finite results", () => {
    expect(() => calculate("process.exit()")).toThrow(
      "Calculator syntax error: unknown function 'process.exit'"
    );
    expect(() => calculate("1 / 0")).toThrow(
      "Calculator range error: division by zero."
    );
    expect(() => calculate("sqrt(-1)")).toThrow(
      "Calculator range error: result is not a finite number"
    );
    expect(() => calculate("1e309")).toThrow("Calculator range error");
  });

  test("publishes a strict expression-only schema", () => {
    const parameters = calculatorTool.parameters as Record<string, unknown>;
    expect(calculatorTool.name).toBe("calculator");
    expect(calculatorTool.description).toContain(
      "even the simplest arithmetic"
    );
    expect(parameters.required).toEqual(["expression"]);
    expect(parameters.additionalProperties).toBe(false);
  });
});
