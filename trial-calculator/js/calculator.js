(function () {
  function tokenize(expression) {
    var tokens = [];
    var index = 0;
    var trimmed = expression.replace(/\s+/g, "");

    while (index < trimmed.length) {
      var char = trimmed[index];

      if (/[0-9.]/.test(char)) {
        var number = char;
        index += 1;

        while (index < trimmed.length && /[0-9.]/.test(trimmed[index])) {
          number += trimmed[index];
          index += 1;
        }

        if ((number.match(/\./g) || []).length > 1 || number === ".") {
          throw new Error("Invalid number");
        }

        tokens.push({ type: "number", value: Number(number) });
        continue;
      }

      if ("+-*/()".indexOf(char) !== -1) {
        tokens.push({ type: "operator", value: char });
        index += 1;
        continue;
      }

      throw new Error("Invalid character");
    }

    return tokens;
  }

  function createParser(tokens) {
    var current = 0;

    function peek() {
      return tokens[current];
    }

    function consume(value) {
      if (peek() && peek().value === value) {
        current += 1;
        return true;
      }
      return false;
    }

    function parseExpression() {
      var value = parseTerm();

      while (peek() && (peek().value === "+" || peek().value === "-")) {
        var operator = peek().value;
        current += 1;
        var right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }

      return value;
    }

    function parseTerm() {
      var value = parseFactor();

      while (peek() && (peek().value === "*" || peek().value === "/")) {
        var operator = peek().value;
        current += 1;
        var right = parseFactor();
        value = operator === "*" ? value * right : value / right;
      }

      return value;
    }

    function parseFactor() {
      if (consume("-")) {
        return -parseFactor();
      }

      if (consume("(")) {
        var value = parseExpression();
        if (!consume(")")) {
          throw new Error("Missing closing parenthesis");
        }
        return value;
      }

      var token = peek();
      if (!token || token.type !== "number") {
        throw new Error("Invalid expression");
      }

      current += 1;
      return token.value;
    }

    return {
      parse: function () {
        var result = parseExpression();
        if (current !== tokens.length) {
          throw new Error("Invalid expression");
        }
        return result;
      }
    };
  }

  function normalizeResult(result) {
    if (!Number.isFinite(result)) {
      return result > 0 ? "Infinity" : result < 0 ? "-Infinity" : "Error";
    }

    if (Number.isInteger(result)) {
      return String(result);
    }

    return String(Number(result.toFixed(10)));
  }

  function evaluateExpression(expression) {
    if (!expression || !expression.trim()) {
      throw new Error("Enter an expression");
    }

    var parser = createParser(tokenize(expression));
    return normalizeResult(parser.parse());
  }

  window.CalculatorEngine = {
    evaluateExpression: evaluateExpression
  };
})();
