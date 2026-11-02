window.__SH_FILES = {};
Object.keys(window.__SH_PARTS).forEach(function (name) {
  window.__SH_FILES[name] = window.__SH_PARTS[name].join("");
});
Object.keys(window.__SH_FILES).map(function (n) {
  return n + ":" + window.__SH_FILES[n].length;
}).join(",");