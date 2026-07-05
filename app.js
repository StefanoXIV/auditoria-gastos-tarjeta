// ---------- Estado y persistencia ----------

const STORAGE_KEYS = {
  categories: "gastos.categories.v1",
  categoriesSeen: "gastos.categoriesSeen.v1",
  overrides: "gastos.merchantOverrides.v1",
  history: "gastos.history.v1"
};

// Paleta categórica validada (skill dataviz) — orden fijo, nunca se reasigna por monto
// para que cada categoría mantenga siempre el mismo color entre resúmenes. El slot 8
// queda reservado para "Otros"/sin categorizar, para que nunca choque con una de estas 7.
const CATEGORY_COLOR_ORDER = [
  "Alimentación", "Delivery / Restaurantes", "Transporte", "Servicios / Suscripciones",
  "Salud", "Compras / Retail", "Educación"
];

function loadHistory() {
  const stored = localStorage.getItem(STORAGE_KEYS.history);
  return stored ? JSON.parse(stored) : {};
}

function saveHistorySnapshot(entry) {
  const history = loadHistory();
  history[entry.key] = entry;
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

function loadCategories() {
  const stored = localStorage.getItem(STORAGE_KEYS.categories);
  const defaultNames = Object.keys(DEFAULT_CATEGORIES);
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.categoriesSeen, JSON.stringify(defaultNames));
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }
  const saved = JSON.parse(stored);
  // "seen" registra qué categorías default existían la última vez que se guardó algo.
  // Sirve para diferenciar una categoría default NUEVA (se agrega) de una que el
  // usuario borró a propósito (se respeta la decisión, no se resucita).
  const seen = new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.categoriesSeen) || "[]"));
  let changed = false;
  Object.entries(DEFAULT_CATEGORIES).forEach(([category, keywords]) => {
    if (category in saved) {
      // Categoría que el usuario ya tiene: sumar palabras clave nuevas que se
      // agreguen en una actualización, sin duplicar ni tocar las que agregó él.
      const existing = new Set(saved[category].map((k) => k.toLowerCase()));
      keywords.forEach((kw) => {
        if (!existing.has(kw.toLowerCase())) {
          saved[category].push(kw);
          existing.add(kw.toLowerCase());
          changed = true;
        }
      });
    } else if (!seen.has(category)) {
      saved[category] = [...keywords];
      changed = true;
    }
  });
  if (changed) localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(saved));
  localStorage.setItem(STORAGE_KEYS.categoriesSeen, JSON.stringify(defaultNames));
  return saved;
}

function saveCategories(categories) {
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
}

function loadOverrides() {
  const stored = localStorage.getItem(STORAGE_KEYS.overrides);
  return stored ? JSON.parse(stored) : {};
}

function saveOverrides(overrides) {
  localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(overrides));
}

const state = {
  categories: loadCategories(),
  overrides: loadOverrides(),
  headers: [],
  rawRows: [],
  transactions: []
};

// ---------- Parseo de archivo ----------

const fileInput = document.getElementById("file-input");
const mappingSection = document.getElementById("mapping-section");
const resultsSection = document.getElementById("results-section");

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const bytes = new Uint8Array(evt.target.result);
      // Muchos bancos exportan el "Excel" del resumen como una tabla HTML con extensión .xls,
      // no como un archivo binario real. Hay que detectarlo y parsearlo distinto.
      const prefix = new TextDecoder("utf-8").decode(bytes.slice(0, 512)).trim().toLowerCase();
      const isHtml = prefix.startsWith("<") || prefix.includes("<html") || prefix.includes("<table");
      const workbook = isHtml
        ? XLSX.read(new TextDecoder("utf-8").decode(bytes), { type: "string", cellDates: true })
        : XLSX.read(bytes, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // defval: null evita que cada fila se recorte al último valor no vacío. Sin esto,
      // si el encabezado tiene menos celdas pobladas que las filas de datos (pasa cuando
      // el archivo del banco tiene una columna intermedia sin texto de encabezado, por
      // ejemplo), los índices de columna quedan desalineados entre el encabezado y los datos.
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: null });
      if (!rows.length) {
        alert("El archivo no tiene filas.");
        return;
      }
      const headerRowIndex = findHeaderRowIndex(rows);
      const headerRow = rows[headerRowIndex] || [];
      // Array.from (no .map) para evitar "huecos" en el array cuando alguna celda
      // del encabezado viene completamente vacía en el archivo original.
      state.headers = Array.from({ length: headerRow.length }, (_, i) => String(headerRow[i] ?? "").trim());
      state.rawRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c !== undefined && c !== null && c !== ""));
      populateMapping();
      mappingSection.classList.remove("hidden");
    } catch (err) {
      alert("No se pudo leer el archivo. Verifica que sea un CSV o Excel válido exportado del banco.\n\nDetalle: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
});

// Muchos bancos agregan filas de título/titular y hasta mini-tablas de resumen
// (ej. "Monto Facturado / Pago Mínimo / Fecha de Facturación") antes de la fila
// real de encabezados de la tabla de movimientos. Exigimos que la fila tenga a
// la vez una columna de fecha Y una de descripción — la combinación que solo
// tiene la tabla de movimientos real, no esas mini-tablas de resumen.
function findHeaderRowIndex(rows) {
  const dateKeywords = ["fecha", "date"];
  const descKeywords = ["descrip", "detalle", "concepto", "comercio"];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const texts = row.map((cell) => String(cell ?? "").toLowerCase());
    const hasDate = texts.some((t) => dateKeywords.some((kw) => t.includes(kw)));
    const hasDesc = texts.some((t) => descKeywords.some((kw) => t.includes(kw)));
    if (hasDate && hasDesc) return i;
  }
  return 0;
}

function guessColumn(candidates) {
  const idx = state.headers.findIndex((h) =>
    candidates.some((c) => String(h ?? "").toLowerCase().includes(c))
  );
  return idx;
}

function looksLikeMoney(value) {
  if (value === null || value === undefined || value === "") return false;
  const str = String(value).trim();
  // Separador de miles (con o sin decimales) o al menos 3 dígitos seguidos
  if (/^-?\(?\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\)?$/.test(str)) return true;
  return /^-?\d{3,}$/.test(str.replace(/[^\d-]/g, ""));
}

// Algunos bancos dejan una columna intermedia sin texto de encabezado (o el encabezado
// del monto queda desalineado de donde realmente están los valores). Si la columna
// adivinada por el nombre del header no parece tener montos, se busca en las columnas
// siguientes la que sí tenga pinta de plata.
function refineAmountColumn(guessIdx) {
  if (guessIdx < 0 || !state.rawRows.length) return guessIdx;
  const sample = state.rawRows.slice(0, 20);
  const scoreColumn = (idx) => sample.filter((r) => looksLikeMoney(r[idx])).length;
  let bestIdx = guessIdx;
  let bestScore = scoreColumn(guessIdx);
  for (let idx = guessIdx + 1; idx <= Math.min(guessIdx + 3, state.headers.length - 1); idx++) {
    const score = scoreColumn(idx);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function populateMapping() {
  const selects = {
    "map-date": guessColumn(["fecha", "date"]),
    "map-description": guessColumn(["descrip", "detalle", "concepto", "comercio"]),
    "map-amount": refineAmountColumn(guessColumn(["importe", "monto", "amount", "valor"])),
    "map-installment": guessColumn(["cuota", "installment"])
  };
  Object.entries(selects).forEach(([selectId, guessIdx]) => {
    const select = document.getElementById(selectId);
    select.innerHTML = "";
    if (selectId === "map-installment") {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "-- No tengo esta columna --";
      select.appendChild(opt);
    }
    state.headers.forEach((h, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = h || `Columna ${i + 1}`;
      select.appendChild(opt);
    });
    if (guessIdx >= 0) select.value = guessIdx;
  });

  // Default del mes del resumen: el mes de la fecha más reciente encontrada
  const dateIdx = selects["map-date"];
  if (dateIdx >= 0) {
    const dates = state.rawRows.map((r) => parseDate(r[dateIdx])).filter(Boolean);
    if (dates.length) {
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
      document.getElementById("anchor-month").value =
        `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, "0")}`;
    }
  }
}

// ---------- Parseo de fecha y monto ----------

function parseDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return new Date(year, +m[2] - 1, +m[1]);
  }
  return null;
}

function parseAmount(value) {
  if (value === undefined || value === null || value === "") return 0;
  let str = String(value).trim();
  let negative = false;
  if (/^\(.*\)$/.test(str)) {
    negative = true;
    str = str.slice(1, -1);
  }
  str = str.replace(/[^0-9,.\-]/g, "");
  if (str.startsWith("-")) {
    negative = true;
    str = str.slice(1);
  }

  // El separador de miles/decimales varía según el banco (Chile suele usar "," como
  // separador de miles en sus exportes, sin decimales). Se decide por el separador
  // que aparece último: si le siguen 2 dígitos es decimal, si le siguen 3 son miles.
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const decimals = str.length - lastComma - 1;
    str = decimals === 2 ? str.replace(",", ".") : str.replace(/,/g, "");
  } else if (lastDot > -1) {
    const decimals = str.length - lastDot - 1;
    if (decimals === 3) str = str.replace(/\./g, "");
  }

  const num = parseFloat(str) || 0;
  return negative ? -num : num;
}

function formatMoney(amount) {
  return "$" + Math.round(amount).toLocaleString("es-CL");
}

// ---------- Detección de cuotas ----------

function detectInstallment(description, installmentColumnValue) {
  if (installmentColumnValue) {
    const m = String(installmentColumnValue).match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
    // Algunos bancos incluyen una sección aparte de "información de compras en cuotas"
    // con cuota "00/N" — no es una compra nueva que deba sumarse al total del mes,
    // por eso se acepta current === 0 pero se marca como informational más abajo.
    if (m) return { current: +m[1], total: +m[2] };
  }
  const text = String(description || "").toUpperCase();
  let m = text.match(/CUOTAS?\.?\s*N?°?\s*(\d{1,2})\s*[\/\-DE]{1,3}\s*(\d{1,2})/);
  if (!m) m = text.match(/\bC\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (!m) m = text.match(/\((\d{1,2})\s*\/\s*(\d{1,2})\)/);
  if (m) {
    const current = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    // "01/01" significa pago único (una sola cuota), no es un plan de cuotas real
    if (total > 1 && total >= current && total <= 60 && current >= 0) return { current, total };
  }
  return null;
}

// ---------- Categorización ----------

function normalizeDescription(description) {
  return String(description || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function categorize(description) {
  const normalized = normalizeDescription(description);
  if (state.overrides[normalized]) return state.overrides[normalized];
  for (const [category, keywords] of Object.entries(state.categories)) {
    if (keywords.some((kw) => kw && normalized.includes(kw.toUpperCase()))) {
      return category;
    }
  }
  return "Sin categorizar";
}

// Detecta pares de montos iguales con signo opuesto (ej. una compra y su anulación/reversa)
// para que el usuario los revise: pueden ser duplicados o cargos que se anulan entre sí.
function detectSuspicious(transactions) {
  const byAbsAmount = {};
  transactions.forEach((t) => {
    const key = Math.abs(t.amount);
    if (!key) return;
    (byAbsAmount[key] = byAbsAmount[key] || []).push(t);
  });
  const flagged = [];
  Object.values(byAbsAmount).forEach((group) => {
    if (group.length < 2) return;
    const hasPositive = group.some((t) => t.amount > 0);
    const hasNegative = group.some((t) => t.amount < 0);
    if (hasPositive && hasNegative) flagged.push(...group);
  });
  return flagged.sort((a, b) => (a.date && b.date ? a.date - b.date : 0));
}

// ---------- Procesamiento ----------

document.getElementById("process-btn").addEventListener("click", () => {
  const dateIdx = +document.getElementById("map-date").value;
  const descIdx = +document.getElementById("map-description").value;
  const amountIdx = +document.getElementById("map-amount").value;
  const installIdx = document.getElementById("map-installment").value;
  const statementType = document.getElementById("statement-type").value;

  state.transactions = state.rawRows.map((row) => {
    const description = row[descIdx];
    const amount = parseAmount(row[amountIdx]);
    const installment = detectInstallment(description, installIdx !== "" ? row[+installIdx] : null);
    // En los resúmenes de "No facturados" el monto de una compra en cuotas es el total
    // de la compra, no lo que se cobra este mes; hay que dividirlo entre las cuotas.
    // En los "Facturados" el monto que aparece ya es el valor mensual de la cuota.
    const monthlyAmount =
      statementType === "no-facturado" && installment ? amount / installment.total : amount;
    return {
      date: parseDate(row[dateIdx]),
      description: String(description || "").trim(),
      amount,
      monthlyAmount,
      installment,
      // Cuota "0/N": la compra ya se hizo pero todavía no se cobró ninguna cuota — la
      // primera se cobra recién el mes siguiente. Se excluye del gasto de este período
      // (no es un cargo de este mes), pero sí entra en la proyección de cuotas futuras.
      isInformational: !!(installment && installment.current === 0),
      category: categorize(description)
    };
  });

  // Pares de mismo monto con signo opuesto (compra + anulación/objeción/reversa): se marcan
  // como outlier para excluirlos del total y de la proyección — el usuario los revisa aparte,
  // no deben mezclarse con los gastos comunes del mes ni distorsionar sus categorías.
  const flagged = new Set(detectSuspicious(state.transactions.filter((t) => !t.isInformational)));
  state.transactions.forEach((t) => {
    t.isOutlier = flagged.has(t);
  });

  state.anchorMonth = document.getElementById("anchor-month").value;
  state.statementType = statementType;

  resultsSection.classList.remove("hidden");
  renderSuspicious();
  renderInformational();
  renderExecutiveSummary();
  renderSummary();
  renderProjection();
});

// Gastos reales del período: se excluyen los pagos de tarjeta, los cargos
// informativos "0/N" y los outliers (compras anuladas/objetadas) — lo mismo
// que se muestra en "Resumen del mes".
function computeCategoryTotals() {
  const gastos = state.transactions.filter((t) => t.category !== "Pago de Tarjeta" && !t.isInformational && !t.isOutlier);
  const byCategory = {};
  gastos.forEach((t) => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.monthlyAmount;
  });
  const total = gastos.reduce((sum, t) => sum + t.monthlyAmount, 0);
  return { byCategory, total };
}

// ---------- Cargos a revisar ----------

function renderSuspicious() {
  const container = document.getElementById("suspicious-warning");
  const flagged = state.transactions
    .filter((t) => t.isOutlier)
    .sort((a, b) => (a.date && b.date ? a.date - b.date : 0));
  if (!flagged.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }
  container.classList.remove("hidden");
  const lines = flagged
    .map((t) => `<div>${formatDate(t.date)} — ${t.description} — ${formatMoney(t.amount)}</div>`)
    .join("");
  container.innerHTML = `<strong>Excluidos del total (posible anulación/objeción/duplicado):</strong> tienen el mismo monto con signo opuesto a otro cargo del resumen, así que se sacaron del total de gastos y de sus categorías. Revísalos igual, por si alguno no correspondía excluir.${lines}`;
}

function renderInformational() {
  const container = document.getElementById("informational-note");
  const items = state.transactions.filter((t) => t.isInformational);
  if (!items.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }
  container.classList.remove("hidden");
  const total = items.reduce((sum, t) => sum + t.amount, 0);
  const lines = items
    .map((t) => `<div>${formatDate(t.date)} — ${t.description} (cuota ${t.installment.current}/${t.installment.total}) — ${formatMoney(t.amount)}</div>`)
    .join("");
  container.innerHTML = `<strong>Compras en cuotas recién hechas (cuota "0 de N"):</strong> ${items.length} cargo(s) por ${formatMoney(total)} — la compra ya se hizo pero todavía no se cobró ninguna cuota, así que no se incluyen en el gasto de este período. Sí están consideradas en la proyección de cuotas futuras, empezando el mes que viene.${lines}`;
}

// ---------- Resumen ejecutivo ----------

function previousMonthKey(anchorMonth, statementType) {
  const [year, month] = anchorMonth.split("-").map(Number);
  const prevMonthIndex = month - 1 - 1; // 0-indexado, un mes atrás
  const prevYear = year + Math.floor(prevMonthIndex / 12);
  const prevMonth = ((prevMonthIndex % 12) + 12) % 12;
  const key = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  return `${key}|${statementType}`;
}

function renderExecutiveSummary() {
  const { byCategory, total } = computeCategoryTotals();
  const anchorMonth = state.anchorMonth;
  const statementType = state.statementType;

  if (anchorMonth) {
    saveHistorySnapshot({
      key: `${anchorMonth}|${statementType}`,
      anchorMonth,
      statementType,
      total,
      byCategory,
      savedAt: Date.now()
    });
  }

  const heroEl = document.getElementById("exec-total");
  heroEl.textContent = formatMoney(total);

  const compEl = document.getElementById("exec-comparison");
  const history = loadHistory();
  const previous = anchorMonth ? history[previousMonthKey(anchorMonth, statementType)] : null;
  if (!previous) {
    compEl.textContent = "Aún no hay un mes anterior guardado para comparar — se guardó este resumen para la próxima vez.";
  } else if (previous.total > 0) {
    const delta = ((total - previous.total) / previous.total) * 100;
    const arrow = delta >= 0 ? "▲" : "▼";
    compEl.textContent =
      `${arrow} ${Math.abs(delta).toFixed(0)}% ${delta >= 0 ? "más" : "menos"} que el mes anterior ` +
      `(${formatMoney(total)} vs ${formatMoney(previous.total)})`;
  } else {
    compEl.textContent = "";
  }

  renderCategoryBarChart(byCategory, total);
}

function renderCategoryBarChart(byCategory, total) {
  const container = document.getElementById("exec-chart");
  container.innerHTML = "";
  const entries = Object.entries(byCategory).filter(([, amount]) => amount > 0);
  if (!entries.length || total <= 0) {
    container.innerHTML = "<p class=\"hint\">Todavía no hay gastos para graficar.</p>";
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);

  // Máximo 7 categorías propias en el gráfico + "Otros" agrupando el resto,
  // por el tope de la paleta categórica (nunca se generan más de 8 colores).
  const top = entries.slice(0, 7);
  const rest = entries.slice(7);
  if (rest.length) {
    const restTotal = rest.reduce((sum, [, amount]) => sum + amount, 0);
    top.push(["Otros", restTotal]);
  }

  const maxAmount = top[0][1];
  top.forEach(([category, amount]) => {
    const colorIndex = CATEGORY_COLOR_ORDER.indexOf(category);
    const colorVar = colorIndex >= 0 ? `var(--series-${colorIndex + 1})` : "var(--series-8)";
    const pct = total > 0 ? (amount / total) * 100 : 0;
    const widthPct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;

    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-label">${category}</div>
      <div class="chart-bar-track"><div class="chart-bar" style="width:${widthPct}%; background:${colorVar}"></div></div>
      <div class="chart-value">${formatMoney(amount)} <span class="chart-pct">(${pct.toFixed(0)}%)</span></div>
    `;
    container.appendChild(row);
  });
}

// ---------- Resumen del mes ----------

function renderSummary() {
  const tbody = document.querySelector("#summary-table tbody");
  tbody.innerHTML = "";

  const gastos = state.transactions.filter((t) => t.category !== "Pago de Tarjeta" && !t.isInformational && !t.isOutlier);
  const pagos = state.transactions.filter((t) => t.category === "Pago de Tarjeta");

  const byCategory = {};
  gastos.forEach((t) => {
    (byCategory[t.category] = byCategory[t.category] || []).push(t);
  });

  const totalGastos = gastos.reduce((sum, t) => sum + t.monthlyAmount, 0);
  const totalPagos = pagos.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  document.getElementById("totals-bar").textContent =
    `Total gastado: ${formatMoney(totalGastos)}` +
    (pagos.length ? ` · Pagos de tarjeta (no incluidos): ${formatMoney(totalPagos)}` : "");

  Object.entries(byCategory)
    .sort((a, b) => sumAmounts(b[1]) - sumAmounts(a[1]))
    .forEach(([category, txs]) => {
      const total = sumAmounts(txs);
      const row = document.createElement("tr");
      row.className = "category-row";
      row.innerHTML = `<td>${category}</td><td>${formatMoney(total)}</td><td>${txs.length} gasto(s) — click para ver</td>`;
      const detailRow = document.createElement("tr");
      detailRow.className = "detail-row hidden";
      const detailCell = document.createElement("td");
      detailCell.colSpan = 3;
      const inner = document.createElement("div");
      inner.className = "detail-inner";
      txs.forEach((t) => {
        const line = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = `${formatDate(t.date)} — ${t.description}${t.installment ? ` (cuota ${t.installment.current}/${t.installment.total})` : ""}`;
        const amountSpan = document.createElement("span");
        amountSpan.textContent =
          t.monthlyAmount !== t.amount
            ? `${formatMoney(t.monthlyAmount)} (compra total: ${formatMoney(t.amount)})`
            : formatMoney(t.amount);
        line.appendChild(label);
        line.appendChild(amountSpan);
        if (category === "Sin categorizar") {
          const select = document.createElement("select");
          const placeholder = document.createElement("option");
          placeholder.textContent = "Asignar categoría...";
          placeholder.value = "";
          select.appendChild(placeholder);
          Object.keys(state.categories).forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
          });
          select.addEventListener("change", () => {
            if (!select.value) return;
            state.overrides[normalizeDescription(t.description)] = select.value;
            saveOverrides(state.overrides);
            t.category = select.value;
            renderSummary();
          });
          line.appendChild(select);
        }
        inner.appendChild(line);
      });
      detailCell.appendChild(inner);
      detailRow.appendChild(detailCell);
      row.addEventListener("click", () => detailRow.classList.toggle("hidden"));
      tbody.appendChild(row);
      tbody.appendChild(detailRow);
    });
}

function sumAmounts(txs) {
  return txs.reduce((sum, t) => sum + t.monthlyAmount, 0);
}

function formatDate(date) {
  if (!date) return "?";
  return date.toLocaleDateString("es-CL");
}

// ---------- Proyección de cuotas ----------

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function renderProjection() {
  const tbody = document.querySelector("#projection-table tbody");
  tbody.innerHTML = "";

  const anchorValue = document.getElementById("anchor-month").value;
  if (!anchorValue) return;
  const [anchorYear, anchorMonth] = anchorValue.split("-").map(Number);

  // Las cuotas "0/N" sí se incluyen acá: la primera cuota se cobra el mes que viene.
  const withInstallments = state.transactions.filter((t) => t.installment && t.category !== "Pago de Tarjeta" && !t.isOutlier);

  const projection = {}; // "YYYY-MM" -> [{description, amount}]

  withInstallments.forEach((t) => {
    const remaining = t.installment.total - t.installment.current;
    for (let i = 1; i <= remaining; i++) {
      const monthIndex = (anchorMonth - 1) + i;
      const year = anchorYear + Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      (projection[key] = projection[key] || []).push({
        description: t.description,
        amount: t.monthlyAmount,
        installmentLabel: `${t.installment.current + i}/${t.installment.total}`
      });
    }
  });

  const sortedKeys = Object.keys(projection).sort();
  if (!sortedKeys.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="3">No se detectaron gastos en cuotas en este resumen.</td>`;
    tbody.appendChild(row);
    return;
  }

  sortedKeys.forEach((key) => {
    const [year, month] = key.split("-").map(Number);
    const items = projection[key];
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    const row = document.createElement("tr");
    row.className = "category-row";
    row.innerHTML = `<td>${MONTH_NAMES[month - 1]} ${year}</td><td>${formatMoney(total)}</td><td>${items.length} cuota(s) — click para ver</td>`;
    const detailRow = document.createElement("tr");
    detailRow.className = "detail-row hidden";
    const detailCell = document.createElement("td");
    detailCell.colSpan = 3;
    const inner = document.createElement("div");
    inner.className = "detail-inner";
    items.forEach((i) => {
      const line = document.createElement("div");
      line.innerHTML = `<span>${i.description} (cuota ${i.installmentLabel})</span><span>${formatMoney(i.amount)}</span>`;
      inner.appendChild(line);
    });
    detailCell.appendChild(inner);
    detailRow.appendChild(detailCell);
    row.addEventListener("click", () => detailRow.classList.toggle("hidden"));
    tbody.appendChild(row);
    tbody.appendChild(detailRow);
  });
}

document.getElementById("anchor-month").addEventListener("change", () => {
  if (state.transactions.length) renderProjection();
});

// ---------- Gestión de categorías ----------

function renderCategoryEditor() {
  const container = document.getElementById("categories-editor");
  container.innerHTML = "";
  Object.entries(state.categories).forEach(([category, keywords]) => {
    const row = document.createElement("div");
    row.className = "category-editor-row";
    row.innerHTML = `
      <strong>${category}</strong>
      <textarea>${keywords.join(", ")}</textarea>
      <button class="delete-category">Borrar</button>
    `;
    const textarea = row.querySelector("textarea");
    textarea.addEventListener("change", () => {
      state.categories[category] = textarea.value.split(",").map((k) => k.trim()).filter(Boolean);
      saveCategories(state.categories);
    });
    row.querySelector(".delete-category").addEventListener("click", () => {
      delete state.categories[category];
      saveCategories(state.categories);
      renderCategoryEditor();
    });
    container.appendChild(row);
  });
}

document.getElementById("add-category-btn").addEventListener("click", () => {
  const input = document.getElementById("new-category-name");
  const name = input.value.trim();
  if (!name || state.categories[name]) return;
  state.categories[name] = [];
  saveCategories(state.categories);
  input.value = "";
  renderCategoryEditor();
});

renderCategoryEditor();
