(function () {
  var display = document.getElementById("display");
  var buttonGrid = document.getElementById("button-grid");
  var historyList = document.getElementById("history-list");
  var expression = "";

  function setDisplay(value, isError) {
    display.textContent = value;
    display.style.color = isError ? "#ffd7cf" : "#f5fbff";
  }

  function renderHistory() {
    var entries = window.CalculatorHistory.getEntries();

    if (!entries.length) {
      historyList.innerHTML = '<li class="history-empty">No calculations yet.</li>';
      return;
    }

    historyList.innerHTML = entries.map(function (entry) {
      return [
        '<li class="history-item">',
        '<span class="history-expression">' + escapeHtml(entry.expression) + "</span>",
        '<span class="history-result">' + escapeHtml(entry.result) + "</span>",
        "</li>"
      ].join("");
    }).join("");
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function clearAll() {
    expression = "";
    setDisplay("0", false);
  }

  function appendValue(value) {
    expression += value;
    setDisplay(expression, false);
  }

  function evaluateCurrentExpression() {
    try {
      var result = window.CalculatorEngine.evaluateExpression(expression);
      window.CalculatorHistory.addEntry(expression, result);
      expression = result === "Error" ? "" : result;
      setDisplay(result, false);
      renderHistory();
    } catch (error) {
      setDisplay("Error", true);
      expression = "";
    }
  }

  buttonGrid.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) {
      return;
    }

    if (button.dataset.action === "clear") {
      clearAll();
      return;
    }

    if (button.dataset.action === "evaluate") {
      evaluateCurrentExpression();
      return;
    }

    if (button.dataset.value) {
      appendValue(button.dataset.value);
    }
  });

  window.addEventListener("keydown", function (event) {
    if ((/[0-9]/).test(event.key) || "+-*/().".indexOf(event.key) !== -1) {
      appendValue(event.key);
      return;
    }

    if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      evaluateCurrentExpression();
      return;
    }

    if (event.key === "Escape") {
      clearAll();
      return;
    }

    if (event.key === "Backspace") {
      expression = expression.slice(0, -1);
      setDisplay(expression || "0", false);
    }
  });

  clearAll();
  renderHistory();
})();
