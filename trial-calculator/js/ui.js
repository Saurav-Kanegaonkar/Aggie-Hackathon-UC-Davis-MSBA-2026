/**
 * ui.js
 * DOM wiring: button clicks, keyboard input, display updates, history panel.
 */

(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  var expr = '';          // current expression string
  var justEvaled = false; // true right after pressing =

  // ── Elements ───────────────────────────────────────────────────────────────
  var mainDisplay = document.getElementById('main-display');
  var exprDisplay = document.getElementById('expr-display');
  var historyList = document.getElementById('history-list');

  // ── Display helpers ─────────────────────────────────────────────────────────
  function setMain(text, isError) {
    mainDisplay.textContent = text;
    mainDisplay.classList.toggle('error', !!isError);
  }

  function setExpr(text) {
    exprDisplay.textContent = text;
  }

  function refreshDisplay() {
    setMain(expr === '' ? '0' : expr, false);
    setExpr('');
  }

  // ── History rendering ───────────────────────────────────────────────────────
  function renderHistory() {
    var entries = HistoryManager.getAll();
    historyList.innerHTML = '';

    if (entries.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'No calculations yet';
      historyList.appendChild(empty);
      return;
    }

    // Newest first
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i];
      var li = document.createElement('li');
      li.className = 'history-item';
      li.dataset.index = i;

      var exprSpan = document.createElement('div');
      exprSpan.className = 'history-expr';
      exprSpan.textContent = e.expr + ' =';

      var resultSpan = document.createElement('div');
      resultSpan.className = 'history-result';
      resultSpan.textContent = e.result;

      li.appendChild(exprSpan);
      li.appendChild(resultSpan);

      // Click to reload result into display
      li.addEventListener('click', function () {
        var idx = parseInt(this.dataset.index, 10);
        var entry = HistoryManager.getAll()[idx];
        expr = entry.result;
        justEvaled = true;
        setMain(entry.result, false);
        setExpr(entry.expr + ' =');
      });

      historyList.appendChild(li);
    }
  }

  // ── Core actions ────────────────────────────────────────────────────────────
  function doClear() {
    expr = '';
    justEvaled = false;
    setMain('0', false);
    setExpr('');
  }

  function doEquals() {
    if (expr === '' || justEvaled) return;
    var raw = expr;
    try {
      var num = Calculator.evaluate(raw);
      var result = Calculator.formatResult(num);
      HistoryManager.add(raw, result);
      setExpr(raw + ' =');
      setMain(result, false);
      expr = result;
      justEvaled = true;
      renderHistory();
    } catch (err) {
      setExpr(raw);
      setMain('Error: ' + err.message, true);
      justEvaled = false;
    }
  }

  function doSign() {
    if (expr === '' || justEvaled) {
      expr = justEvaled ? '(-' + expr + ')' : '-';
      justEvaled = false;
      refreshDisplay();
      return;
    }
    // Wrap entire current expression in unary negation
    expr = '-(' + expr + ')';
    refreshDisplay();
  }

  // Smart paren: opens '(' when appropriate, closes ')' when open count > close count
  function doParen() {
    if (justEvaled) { expr = ''; justEvaled = false; }
    var openCount = (expr.match(/\(/g) || []).length;
    var closeCount = (expr.match(/\)/g) || []).length;
    var last = expr.slice(-1);
    var insertOpen = expr === '' ||
      last === '(' ||
      '+-*/'.indexOf(last) !== -1 ||
      openCount === closeCount;
    expr += insertOpen ? '(' : ')';
    refreshDisplay();
  }

  function doAppend(val) {
    if (justEvaled) {
      // If user types an operator after =, chain; otherwise start fresh
      if ('+-*/'.indexOf(val) !== -1) {
        justEvaled = false;
        // keep expr (the result) and append operator
      } else {
        expr = '';
        justEvaled = false;
      }
    }
    expr += val;
    refreshDisplay();
  }

  // ── Button clicks ───────────────────────────────────────────────────────────
  document.querySelectorAll('.btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = this.dataset.action;
      var value  = this.dataset.value;

      if (action === 'clear')  { doClear();         return; }
      if (action === 'equals') { doEquals();        return; }
      if (action === 'sign')   { doSign();          return; }
      if (action === 'paren')  { doParen();         return; }
      if (value !== undefined) { doAppend(value);   return; }
    });
  });

  // Clear history button
  document.querySelector('[data-action="clear-history"]').addEventListener('click', function () {
    HistoryManager.clear();
    renderHistory();
  });

  // ── Keyboard support ────────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var key = e.key;

    if (key >= '0' && key <= '9')          { doAppend(key);  return; }
    if (key === '.')                        { doAppend('.');  return; }
    if (key === '+')                        { doAppend('+');  return; }
    if (key === '-')                        { doAppend('-');  return; }
    if (key === '*')                        { doAppend('*');  return; }
    if (key === '/')                        { e.preventDefault(); doAppend('/'); return; }
    if (key === '(' || key === ')')         { doAppend(key);  return; }
    if (key === 'Enter' || key === '=')     { doEquals();     return; }
    if (key === 'Escape' || key === 'c' || key === 'C') { doClear(); return; }
    if (key === 'Backspace') {
      if (justEvaled) { doClear(); return; }
      expr = expr.slice(0, -1);
      refreshDisplay();
    }
  });

  // ── Init ────────────────────────────────────────────────────────────────────
  renderHistory();
})();
