// Reglas por defecto: categoría -> lista de palabras clave (case-insensitive, substring match)
// Se cargan una sola vez en localStorage; después el usuario las puede editar desde la UI.
const DEFAULT_CATEGORIES = {
  "Alimentación": [
    "supermercado", "carrefour", "coto", "dia ", "disco", "jumbo", "vea", "almacen", "verduleria", "carniceria", "changomas",
    "lider", "tottus", "unimarc", "santa isabel", "ekono", "mayorista10", "alvi", "oxxo", "supermercado 10"
  ],
  "Delivery / Restaurantes": [
    "pedidosya", "rappi", "mcdonalds", "burger", "starbucks", "cafe", "restaurant", "resto", "glovo", "grill",
    "uber eats", "ubereats", "telepizza", "dominos", "kfc", "subway", "doggis", "juan valdez", "tavelli"
  ],
  "Transporte": [
    "sube", "uber", "cabify", "ypf", "shell", "axion", "puma energy", "peaje", "estacionamiento", "subte", "didi",
    "copec", "petrobras", "terpel", "beat", "red movilidad", "metro de santiago", "tag", "autopista", "costanera norte"
  ],
  "Servicios / Suscripciones": [
    "netflix", "spotify", "disney", "hbo", "youtube premium", "icloud", "google one", "claro", "movistar", "personal", "directv", "cablevision", "fibertel", "flow",
    "entel", "wom", "vtr", "mundo pacifico", "amazon prime", "gpay", "apple.com/bill"
  ],
  "Salud": [
    "farmacia", "farmacity", "osde", "swiss medical", "medife", "laboratorio", "medicina",
    "cruz verde", "salcobrand", "farmacias ahumada", "doctor simi", "integramedica", "clinica"
  ],
  "Compras / Retail": [
    "mercadolibre", "falabella", "garbarino", "fravega", "musimundo", "amazon", "shein", "zara", "tienda", "ikea", "ML *",
    "paris", "ripley", "sodimac", "easy", "hites", "la polar", "pc factory", "mercado libre"
  ],
  "Educación": ["udemy", "coursera", "platzi", "universidad", "instituto"],
  "Entretenimiento": [
    "cine", "cinemark", "hoyts", "cinepolis", "teatro", "steam", "playstation",
    "ticketmaster", "puntoticket"
  ],
  "Pago de Tarjeta": ["pago tarjeta", "pago su factura", "pago recibido", "pago minimo", "pago total", "abono tarjeta", "monto cancelado"],
  "Mantención Tarjeta": ["comision administracion", "comision de mantencion", "mantencion tarjeta", "intereses rotativos"],
  "Otros": []
};
