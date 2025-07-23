const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    "https://maylissman.com",
    "https://www.maylissman.com",
    process.env.FRONTEND_URL || "http://localhost:8081"
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Import des routes
const authRoutes = require('./routes/authRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const adminReservationRoutes = require('./routes/adminReservationRoutes');
const prestationRoutes = require('./routes/prestationRoutes');
const plageHoraireRoutes = require('./routes/plageHoraireRoutes');
const indispoRoutes = require('./routes/indisponibiliteRoutes');
const creneauRoutes = require('./routes/creneauRoutes');

// ✅ Montage des routes
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/admin/reservations", adminReservationRoutes);
app.use("/api/prestations", prestationRoutes);
app.use("/api/plages-horaires", plageHoraireRoutes);
app.use("/api/indisponibilites", indispoRoutes);
app.use("/api/creneaux", creneauRoutes);

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