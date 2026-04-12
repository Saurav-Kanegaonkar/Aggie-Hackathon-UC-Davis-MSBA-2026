/* ui.js — Button handling, display updates, wiring to Calculator and History. */

(function () {
  "use strict";

  var display;
  var currentInput = "";

  function init() {
    display = document.getElementById("display");
    History.init("history-list");

    var buttons = document.querySelectorAll(".btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", onButton);
    }

    document.addEventListener("keydown", onKey);
  }

  function onKey(e) {
    var key = e.key;
    if ("0123456789.+-*/()".indexOf(key) !== -1) {
      currentInput += key;
      setDisplay(currentInput);
    } else if (key === "Enter" || key === "=") {
      e.preventDefault();
      if (currentInput === "") return;
      try {
        var result = Calculator.evaluate(currentInput);
        var displayResult = formatResult(result);
        History.add(currentInput, displayResult);
        setDisplay(displayResult);
        currentInput = displayResult;
      } catch (err) {
        setDisplay("Error");
        currentInput = "";
      }
    } else if (key === "Backspace") {
      currentInput = currentInput.slice(0, -1);
      setDisplay(currentInput || "0");
    } else if (key === "Escape" || key === "Delete") {
      currentInput = "";
      setDisplay("0");
    }
  }

  function setDisplay(text) {
    display.textContent = text || "0";
  }

  function onButton(e) {
    var value = e.target.getAttribute("data-value");
    var action = e.target.getAttribute("data-action");

    if (action === "clear") {
      currentInput = "";
      setDisplay("0");
      return;
    }

    if (action === "equals") {
      if (currentInput === "") return;
      try {
        var result = Calculator.evaluate(currentInput);
        var displayResult = formatResult(result);
        History.add(currentInput, displayResult);
        setDisplay(displayResult);
        currentInput = displayResult;
      } catch (err) {
        setDisplay("Error");
        currentInput = "";
      }
      return;
    }

    if (action === "backspace") {
      currentInput = currentInput.slice(0, -1);
      setDisplay(currentInput || "0");
      return;
    }

    // Regular input (digit, operator, paren, dot)
    currentInput += value;
    setDisplay(currentInput);
  }

  function formatResult(num) {
    if (!isFinite(num)) return "Infinity";
    // Round to avoid floating-point display noise
    var rounded = parseFloat(num.toPrecision(12));
    return String(rounded);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
