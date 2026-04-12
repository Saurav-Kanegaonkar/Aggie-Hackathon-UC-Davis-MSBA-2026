// task-01: Calculator core arithmetic engine

/**
 * Evaluate an arithmetic expression string and return the numeric result.
 * Supports +, -, *, /, parentheses, decimal numbers, and unary minus.
 *
 * @param {string} expression - e.g. "2+3*4", "(2+3)*4", "-5+3"
 * @returns {number} The evaluated result
 * @throws {Error} On invalid expressions (empty, mismatched parens, etc.)
 */
function evaluate(expression) {
  const expr = expression.replace(/\s+/g, "");
  if (expr.length === 0) {
    throw new Error("Empty expression");
  }

  let pos = 0;

  function peek() {
    return pos < expr.length ? expr[pos] : null;
  }

  function consume() {
    return expr[pos++];
  }

  // Parse addition and subtraction (lowest precedence).
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  // Parse multiplication and division.
  function parseMulDiv() {
    let left = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseUnary();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  // Parse unary minus/plus.
  function parseUnary() {
    if (peek() === "-") {
      consume();
      return -parseUnary();
    }
    if (peek() === "+") {
      consume();
      return parseUnary();
    }
    return parseAtom();
  }

  // Parse a number or parenthesized sub-expression.
  function parseAtom() {
    if (peek() === "(") {
      consume(); // skip '('
      const result = parseAddSub();
      if (peek() !== ")") {
        throw new Error("Mismatched parentheses");
      }
      consume(); // skip ')'
      return result;
    }

    const start = pos;
    while (peek() !== null && (peek() >= "0" && peek() <= "9" || peek() === ".")) {
      consume();
    }

    if (pos === start) {
      throw new Error("Unexpected character: " + (peek() || "end of input"));
    }

    return parseFloat(expr.slice(start, pos));
  }

  const result = parseAddSub();

  if (pos < expr.length) {
    throw new Error("Unexpected character: " + expr[pos]);
  }

  return result;
}
