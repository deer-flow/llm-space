import math
import re
from dataclasses import dataclass
from typing import Callable

from langchain.tools import tool


MAX_EXPRESSION_LENGTH = 1_000


class CalculatorError(ValueError):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


@dataclass(frozen=True)
class Token:
    type: str
    value: object
    position: int


@dataclass(frozen=True)
class MathFunction:
    min_args: int
    max_args: float
    evaluate: Callable[..., float]


def _unary(fn: Callable[[float], float]) -> MathFunction:
    return MathFunction(1, 1, fn)


def _binary(fn: Callable[[float, float], float]) -> MathFunction:
    return MathFunction(2, 2, fn)


def _variadic(fn: Callable[..., float]) -> MathFunction:
    return MathFunction(1, math.inf, fn)


def _js_round(value: float) -> float:
    return math.floor(value + 0.5)


FUNCTIONS = {
    "abs": _unary(abs),
    "acos": _unary(math.acos),
    "asin": _unary(math.asin),
    "atan": _unary(math.atan),
    "atan2": _binary(math.atan2),
    "ceil": _unary(math.ceil),
    "cos": _unary(math.cos),
    "exp": _unary(math.exp),
    "floor": _unary(math.floor),
    "log": _unary(math.log),
    "log10": _unary(math.log10),
    "max": _variadic(max),
    "min": _variadic(min),
    "pow": _binary(math.pow),
    "round": _unary(_js_round),
    "sin": _unary(math.sin),
    "sqrt": _unary(math.sqrt),
    "tan": _unary(math.tan),
    "trunc": _unary(math.trunc),
}

CONSTANTS = {"e": math.e, "pi": math.pi}
NUMBER_RE = re.compile(r"^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*")


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise CalculatorError(
            "range",
            "result is not a finite number (overflow or invalid function domain).",
        )
    return value


def _tokenize(expression: str) -> list[Token]:
    tokens = []
    index = 0
    while index < len(expression):
        char = expression[index]
        if char.isspace():
            index += 1
            continue
        if char.isdigit() or (
            char == "."
            and index + 1 < len(expression)
            and expression[index + 1].isdigit()
        ):
            match = NUMBER_RE.match(expression[index:])
            if not match:
                raise CalculatorError("syntax", f"invalid number at position {index}.")
            text = match.group(0)
            value = float(text)
            if not math.isfinite(value):
                raise CalculatorError(
                    "range",
                    f"number is outside the supported range at position {index}.",
                )
            tokens.append(Token("number", value, index))
            index += len(text)
            continue
        if char.isascii() and (char.isalpha() or char == "_"):
            match = IDENTIFIER_RE.match(expression[index:])
            assert match is not None
            value = match.group(0)
            tokens.append(Token("identifier", value, index))
            index += len(value)
            continue
        if expression[index : index + 2] == "**":
            tokens.append(Token("operator", "**", index))
            index += 2
            continue
        if char in "+-*/%(),":
            tokens.append(Token("operator", char, index))
            index += 1
            continue
        raise CalculatorError(
            "syntax", f"unsupported character '{char}' at position {index}."
        )
    tokens.append(Token("eof", None, len(expression)))
    return tokens


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.index = 0

    def parse(self) -> float:
        value = self.parse_additive()
        token = self.peek()
        if token.type != "eof":
            self.syntax(f"unexpected token {self.describe(token)}", token.position)
        return _finite(value)

    def parse_additive(self) -> float:
        value = self.parse_multiplicative()
        while self.matches("+") or self.matches("-"):
            operator = self.previous().value
            right = self.parse_multiplicative()
            value = _finite(value + right if operator == "+" else value - right)
        return value

    def parse_multiplicative(self) -> float:
        value = self.parse_unary()
        while self.matches("*") or self.matches("/") or self.matches("%"):
            operator = self.previous().value
            right = self.parse_unary()
            if operator in ("/", "%") and right == 0:
                raise CalculatorError("range", "division by zero.")
            if operator == "*":
                value = _finite(value * right)
            elif operator == "/":
                value = _finite(value / right)
            else:
                value = _finite(math.fmod(value, right))
        return value

    def parse_unary(self) -> float:
        if self.matches("+"):
            return self.parse_unary()
        if self.matches("-"):
            return _finite(-self.parse_unary())
        return self.parse_power()

    def parse_power(self) -> float:
        value = self.parse_primary()
        if self.matches("**"):
            try:
                value = _finite(math.pow(value, self.parse_unary()))
            except (OverflowError, ValueError):
                raise CalculatorError(
                    "range",
                    "result is not a finite number (overflow or invalid function domain).",
                ) from None
        return value

    def parse_primary(self) -> float:
        token = self.advance()
        if token.type == "number":
            return token.value
        if token.type == "operator" and token.value == "(":
            value = self.parse_additive()
            self.consume(")", "expected ')' to close the expression")
            return value
        if token.type == "identifier":
            return self.parse_identifier(token)
        self.syntax("expected a number, function, or '('", token.position)

    def parse_identifier(self, token: Token) -> float:
        name = str(token.value)
        normalized = name[5:].lower() if name.startswith("Math.") else name.lower()
        if not self.matches("("):
            if normalized not in CONSTANTS:
                self.syntax(f"unknown constant '{name}'", token.position)
            return CONSTANTS[normalized]

        fn = FUNCTIONS.get(normalized)
        if fn is None:
            self.syntax(f"unknown function '{name}'", token.position)
        args = []
        if not self.check(")"):
            while True:
                args.append(self.parse_additive())
                if not self.matches(","):
                    break
        self.consume(")", f"expected ')' after arguments to '{name}'")
        if len(args) < fn.min_args or len(args) > fn.max_args:
            expected = (
                str(fn.min_args)
                if fn.min_args == fn.max_args
                else f"{fn.min_args} or more"
            )
            suffix = "" if fn.min_args == 1 and fn.max_args == 1 else "s"
            self.syntax(
                f"'{name}' expects {expected} argument{suffix}, got {len(args)}",
                token.position,
            )
        try:
            return _finite(float(fn.evaluate(*args)))
        except (OverflowError, ValueError):
            raise CalculatorError(
                "range",
                "result is not a finite number (overflow or invalid function domain).",
            ) from None

    def matches(self, value: str) -> bool:
        if not self.check(value):
            return False
        self.index += 1
        return True

    def check(self, value: str) -> bool:
        token = self.peek()
        return token.type == "operator" and token.value == value

    def consume(self, value: str, message: str) -> None:
        if not self.matches(value):
            self.syntax(message, self.peek().position)

    def advance(self) -> Token:
        token = self.peek()
        if token.type != "eof":
            self.index += 1
        return token

    def previous(self) -> Token:
        return self.tokens[self.index - 1]

    def peek(self) -> Token:
        return self.tokens[self.index]

    @staticmethod
    def describe(token: Token) -> str:
        return "end of expression" if token.type == "eof" else f"'{token.value}'"

    @staticmethod
    def syntax(message: str, position: int):
        raise CalculatorError("syntax", f"{message} at position {position}.")


@tool
def calculator(expression: str) -> float:
    """Evaluate a mathematical expression safely.

    You must use this tool for every task that involves mathematical
    calculation, even the simplest arithmetic; never calculate the result
    yourself.

    Supports parentheses, +, -, *, /, %, **, constants pi/e, and common
    functions such as sin, cos, tan, sqrt, log, min, and max. Math.* names are
    also accepted.

    Args:
        expression: The expression to evaluate, for example ``2 * (3 + 4)``,
            ``Math.sin(Math.PI / 2)``, or ``sqrt(81)``.
    """
    if not isinstance(expression, str):
        raise ValueError("expression must be a string.")
    if not expression.strip():
        raise ValueError("expression must not be empty.")
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise ValueError(
            f"expression exceeds the {MAX_EXPRESSION_LENGTH} character limit."
        )
    try:
        return Parser(_tokenize(expression)).parse()
    except CalculatorError as error:
        raise ValueError(f"Calculator {error.kind} error: {error}") from None
