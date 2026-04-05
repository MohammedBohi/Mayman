const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");

dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    "https://maylissman.com",
    "https://www.maylissman.com",
    // Dev ports commonly used by Vue CLI
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
    "https://localhost:8080",
    "https://localhost:8081",
    "https://localhost:8082",
    // 127.0.0.1 variants
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8082",
    process.env.FRONTEND_URL
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};



app.use(cors(corsOptions));
console.log("🌍 Origines autorisées :", corsOptions.origin);

app.use(express.json());

// Rate limiting global (100 requêtes / 15 min par IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Trop de requêtes, réessayez plus tard." }
});

// Rate limiting strict pour auth (5 tentatives / 15 min par IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Trop de tentatives, réessayez dans 15 minutes." }
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/reset-password", authLimiter);

// ✅ Import des routes
const authRoutes = require('./routes/authRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const adminReservationRoutes = require('./routes/adminReservationRoutes');
const prestationRoutes = require('./routes/prestationRoutes');
const planningHebdoRoutes = require('./routes/planningHebdoRoutes');
const planningExceptionRoutes = require('./routes/planningExceptionRoutes');
const indispoRoutes = require('./routes/indisponibiliteRoutes');
const creneauRoutes = require('./routes/creneauRoutes');
const departementRoutes = require('./routes/departementRoutes');

// ✅ Montage des routes
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/admin/reservations", adminReservationRoutes);
app.use("/api/prestations", prestationRoutes);
app.use("/api/planning-hebdo", planningHebdoRoutes);
app.use("/api/planning-exception", planningExceptionRoutes);
app.use("/api/indisponibilites", indispoRoutes);
app.use("/api/creneaux", creneauRoutes);
app.use("/api/departements", departementRoutes);

// ✅ Erreur 404
app.use((req, res) => {
  res.status(404).json({ message: "❌ Route non trouvée" });
});

// ✅ Erreur globale
app.use((err, req, res, next) => {
  console.error("❌ Erreur Serveur:", err.stack);
  res.status(500).json({
    message: "🚨 Une erreur interne est survenue",
    error: err.message,
  });
});

// ✅ Lancement serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur en ligne sur http://localhost:${PORT}`);
});