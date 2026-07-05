// Reglas por defecto: categoría -> lista de palabras clave (case-insensitive, substring match)
// Se cargan una sola vez en localStorage; después el usuario las puede editar desde la UI.
const DEFAULT_CATEGORIES = {
  "Alimentación": ["supermercado", "carrefour", "coto", "dia ", "disco", "jumbo", "vea", "almacen", "verduleria", "carniceria", "changomas"],
  "Delivery / Restaurantes": ["pedidosya", "rappi", "mcdonalds", "burger", "starbucks", "cafe", "restaurant", "resto", "glovo", "grill"],
  "Transporte": ["sube", "uber", "cabify", "ypf", "shell", "axion", "puma energy", "peaje", "estacionamiento", "subte", "didi"],
  "Servicios / Suscripciones": ["netflix", "spotify", "disney", "hbo", "youtube premium", "icloud", "google one", "claro", "movistar", "personal", "directv", "cablevision", "fibertel", "flow"],
  "Salud": ["farmacia", "farmacity", "osde", "swiss medical", "medife", "laboratorio", "medicina"],
  "Compras / Retail": ["mercadolibre", "falabella", "garbarino", "fravega", "musimundo", "amazon", "shein", "zara", "tienda", "ikea", "ML *"],
  "Educación": ["udemy", "coursera", "platzi", "universidad", "instituto"],
  "Entretenimiento": ["cine", "cinemark", "hoyts", "cinepolis", "teatro", "steam", "playstation"],
  "Pago de Tarjeta": ["pago tarjeta", "pago su factura", "pago recibido", "pago minimo", "pago total", "abono tarjeta", "monto cancelado"],
  "Otros": []
};
