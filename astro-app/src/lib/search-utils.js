// Portado literalmente desde assets/js/site/catalog-grid.js (buscador difuso + orden).
// Misma lógica, mismos umbrales, mismo comportamiento — solo se convierte en funciones
// puras (sin tocar el DOM) para poder usarlas desde un componente React.

export const SORTERS = {
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  "name-asc": (a, b) => a.name.localeCompare(b.name, "es"),
  "name-desc": (a, b) => b.name.localeCompare(a.name, "es"),
};

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function editDistance(a, b) {
  const dp = [];
  for (let i = 0; i <= a.length; i++) dp.push([i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function wordMatches(queryWord, productWord) {
  if (productWord.includes(queryWord)) return true;
  const threshold = queryWord.length <= 2 ? 0 : queryWord.length <= 5 ? 1 : 2;
  return editDistance(queryWord, productWord) <= threshold;
}

export function matchesSearch(p, query, categoryLabels) {
  if (!query) return true;
  const haystack = normalize(`${p.name} ${p.variant || ""} ${p.color} ${categoryLabels[p.category] || ""}`)
    .split(/\s+/)
    .filter(Boolean);
  const queryWords = normalize(query).split(/\s+/).filter(Boolean);
  return queryWords.every((qw) => haystack.some((hw) => wordMatches(qw, hw)));
}

export function fmt(n) {
  return "$" + n.toLocaleString("es-CO");
}
