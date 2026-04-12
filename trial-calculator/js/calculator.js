/* calculator.js — Recursive descent parser with operator precedence.
   Handles: +, -, *, /, parentheses, unary minus, decimals.
   Divide-by-zero returns Infinity (browser default). */

var Calculator = (function () {
  "use strict";

  function evaluate(expr) {
    var tokens = tokenize(expr);
    var pos = { i: 0 };
    var result = parseExpression(tokens, pos);
    if (pos.i < tokens.length) {
      throw new Error("Unexpected token: " + tokens[pos.i]);
    }
    return result;
  }

  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    while (i < expr.length) {
      var ch = expr[i];
      if (ch === " ") { i++; continue; }
      if ("+-*/()".indexOf(ch) !== -1) {
        tokens.push(ch);
        i++;
      } else if (isDigitOrDot(ch)) {
        var num = "";
        while (i < expr.length && isDigitOrDot(expr[i])) {
          num += expr[i];
          i++;
        }
        tokens.push(parseFloat(num));
        if (isNaN(tokens[tokens.length - 1])) {
          throw new Error("Invalid number: " + num);
        }
      } else {
        throw new Error("Invalid character: " + ch);
      }
    }
    return tokens;
  }

  function isDigitOrDot(ch) {
    return (ch >= "0" && ch <= "9") || ch === ".";
  }

  // expression = term (('+' | '-') term)*
  function parseExpression(tokens, pos) {
    var left = parseTerm(tokens, pos);
    while (pos.i < tokens.length && (tokens[pos.i] === "+" || tokens[pos.i] === "-")) {
      var op = tokens[pos.i]; pos.i++;
      var right = parseTerm(tokens, pos);
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  // term = unary (('*' | '/') unary)*
  function parseTerm(tokens, pos) {
    var left = parseUnary(tokens, pos);
    while (pos.i < tokens.length && (tokens[pos.i] === "*" || tokens[pos.i] === "/")) {
      var op = tokens[pos.i]; pos.i++;
      var right = parseUnary(tokens, pos);
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  // unary = '-' unary | primary
  function parseUnary(tokens, pos) {
    if (pos.i < tokens.length && tokens[pos.i] === "-") {
      pos.i++;
      return -parseUnary(tokens, pos);
    }
    return parsePrimary(tokens, pos);
  }

  // primary = NUMBER | '(' expression ')'
  function parsePrimary(tokens, pos) {
    if (pos.i >= tokens.length) {
      throw new Error("Unexpected end of expression");
    }
    var tok = tokens[pos.i];
    if (typeof tok === "number") {
      pos.i++;
      return tok;
    }
    if (tok === "(") {
      pos.i++;
      var val = parseExpression(tokens, pos);
      if (pos.i >= tokens.length || tokens[pos.i] !== ")") {
        throw new Error("Missing closing parenthesis");
      }
      pos.i++;
      return val;
    }
    throw new Error("Unexpected token: " + tok);
  }

  return { evaluate: evaluate };
})();
