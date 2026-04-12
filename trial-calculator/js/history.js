/**
 * history.js
 * In-memory session history: add, clear, iterate.
 * Exposes a HistoryManager object; UI rendering is handled by ui.js.
 */

var HistoryManager = (function () {
  var _entries = [];  // [{ expr, result }]

  function add(expr, result) {
    _entries.push({ expr: expr, result: result });
  }

  function clear() {
    _entries = [];
  }

  function getAll() {
    return _entries.slice(); // return a copy
  }

  function count() {
    return _entries.length;
  }

  return { add: add, clear: clear, getAll: getAll, count: count };
})();
