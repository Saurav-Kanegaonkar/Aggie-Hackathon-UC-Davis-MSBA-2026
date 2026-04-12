/* history.js — In-memory session history for the calculator. */

var History = (function () {
  "use strict";

  var entries = [];
  var listEl = null;

  function init(elementId) {
    listEl = document.getElementById(elementId);
  }

  function add(expression, result) {
    entries.push({ expression: expression, result: result });
    render();
  }

  function clear() {
    entries = [];
    render();
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    for (var i = entries.length - 1; i >= 0; i--) {
      var li = document.createElement("li");
      var exprSpan = document.createElement("span");
      exprSpan.className = "hist-expr";
      exprSpan.textContent = entries[i].expression;
      var resultSpan = document.createElement("span");
      resultSpan.className = "hist-result";
      resultSpan.textContent = " = " + entries[i].result;
      li.appendChild(exprSpan);
      li.appendChild(resultSpan);
      listEl.appendChild(li);
    }
  }

  return { init: init, add: add, clear: clear };
})();
