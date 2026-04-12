(function () {
  var entries = [];

  function addEntry(expression, result) {
    entries.unshift({
      expression: expression,
      result: result
    });
  }

  function getEntries() {
    return entries.slice();
  }

  function clearEntries() {
    entries = [];
  }

  window.CalculatorHistory = {
    addEntry: addEntry,
    getEntries: getEntries,
    clearEntries: clearEntries
  };
})();
