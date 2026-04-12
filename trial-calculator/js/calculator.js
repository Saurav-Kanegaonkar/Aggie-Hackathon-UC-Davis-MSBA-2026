/**
 * calculator.js
 * Math engine: tokenizer + Shunting-yard parser + evaluator.
 * No eval(). Handles operator precedence, parentheses, unary minus,
 * division by zero, and invalid expressions.
 */

var Calculator = (function () {

  // ── Tokenizer ──────────────────────────────────────────────────────────────
  // Returns an array of tokens: numbers (as strings) and operator/paren chars.
  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    var str = expr.replace(/\s+/g, '');

    while (i < str.length) {
      var ch = str[i];

      // Number (integer or decimal)
      if (ch >= '0' && ch <= '9' || ch === '.') {
        var num = '';
        var dotCount = 0;
        while (i < str.length && (str[i] >= '0' && str[i] <= '9' || str[i] === '.')) {
          if (str[i] === '.') {
            dotCount++;
            if (dotCount > 1) throw new Error('Invalid number');
          }
          num += str[i++];
        }
        tokens.push({ type: 'num', value: num });
        continue;
      }

      // Operators and parens
      if ('+-*/()'.indexOf(ch) !== -1) {
        tokens.push({ type: ch === '(' || ch === ')' ? 'paren' : 'op', value: ch });
        i++;
        continue;
      }

      throw new Error('Unknown character: ' + ch);
    }
    return tokens;
  }

  // ── Resolve unary minus ────────────────────────────────────────────────────
  // Converts unary '-' to a special marker token so the evaluator can handle
  // expressions like -5+3 or (-5*2).
  function resolveUnary(tokens) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var prev = out.length > 0 ? out[out.length - 1] : null;
      var isUnary = tok.type === 'op' && tok.value === '-' &&
        (prev === null || (prev.type === 'op') || (prev.type === 'paren' && prev.value === '('));
      if (isUnary) {
        out.push({ type: 'unary', value: 'u-' });
      } else {
        out.push(tok);
      }
    }
    return out;
  }

  // ── Shunting-yard ──────────────────────────────────────────────────────────
  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2, 'u-': 3 };
  var RIGHT_ASSOC = { 'u-': true };

  function toRPN(tokens) {
    var output = [];
    var opStack = [];

    function popOp() { output.push(opStack.pop()); }

    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];

      if (tok.type === 'num') {
        output.push(tok);
        continue;
      }

      if (tok.type === 'unary') {
        opStack.push(tok);
        continue;
      }

      if (tok.type === 'op') {
        while (opStack.length > 0) {
          var top = opStack[opStack.length - 1];
          if (top.type === 'paren') break;
          var topPrec = PREC[top.value] || 0;
          var tokPrec = PREC[tok.value] || 0;
          if (topPrec > tokPrec || (topPrec === tokPrec && !RIGHT_ASSOC[tok.value])) {
            popOp();
          } else {
            break;
          }
        }
        opStack.push(tok);
        continue;
      }

      if (tok.type === 'paren') {
        if (tok.value === '(') {
          opStack.push(tok);
        } else {
          // ')'
          var foundLeft = false;
          while (opStack.length > 0) {
            var top2 = opStack[opStack.length - 1];
            if (top2.type === 'paren' && top2.value === '(') {
              opStack.pop();
              foundLeft = true;
              break;
            }
            popOp();
          }
          if (!foundLeft) throw new Error('Mismatched parentheses');
        }
      }
    }

    while (opStack.length > 0) {
      var remaining = opStack.pop();
      if (remaining.type === 'paren') throw new Error('Mismatched parentheses');
      output.push(remaining);
    }

    return output;
  }

  // ── RPN Evaluator ──────────────────────────────────────────────────────────
  function evalRPN(rpn) {
    var stack = [];

    for (var i = 0; i < rpn.length; i++) {
      var tok = rpn[i];

      if (tok.type === 'num') {
        stack.push(parseFloat(tok.value));
        continue;
      }

      if (tok.type === 'unary') {
        if (stack.length < 1) throw new Error('Invalid expression');
        stack.push(-stack.pop());
        continue;
      }

      if (tok.type === 'op') {
        if (stack.length < 2) throw new Error('Invalid expression');
        var b = stack.pop();
        var a = stack.pop();
        var result;
        switch (tok.value) {
          case '+': result = a + b; break;
          case '-': result = a - b; break;
          case '*': result = a * b; break;
          case '/':
            if (b === 0) throw new Error('Division by zero');
            result = a / b;
            break;
          default: throw new Error('Unknown operator: ' + tok.value);
        }
        stack.push(result);
      }
    }

    if (stack.length !== 1) throw new Error('Invalid expression');
    return stack[0];
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function evaluate(expr) {
    if (!expr || expr.trim() === '') throw new Error('Empty expression');
    var tokens = tokenize(expr);
    if (tokens.length === 0) throw new Error('Empty expression');
    var resolved = resolveUnary(tokens);
    var rpn = toRPN(resolved);
    return evalRPN(rpn);
  }

  // Format result: trim excessive decimals, avoid JS float noise
  function formatResult(n) {
    if (!isFinite(n)) throw new Error('Not a number');
    // Round to 10 significant digits to hide float noise
    var s = parseFloat(n.toPrecision(10)).toString();
    return s;
  }

  return { evaluate: evaluate, formatResult: formatResult };
})();
