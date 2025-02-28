const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const routes = require("./routes/routes"); // Assurez-vous que le chemin est correct

// Charger les variables d'environnement
dotenv.config();



// Création de l'application Express
const app = express();

// ✅ Configuration dynamique de CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:8081", // Utilise la variable d'env ou localhost
  credentials: true, // Permet l'envoi des cookies & tokens d'authentification
  optionsSuccessStatus: 200, // Corrige certains problèmes CORS
};

app.use(cors(corsOptions)); // Active CORS avec les bonnes options
app.use(express.json()); // Permet le traitement des JSON

// ✅ Définition des routes API
app.use("/api", routes);

// ✅ Gestion des erreurs 404 (route inexistante)
app.use((req, res) => {
  res.status(404).json({ message: "❌ Route non trouvée" });
});

// ✅ Gestion des erreurs globales (protection du serveur)
app.use((err, req, res, next) => {
  console.error("❌ Erreur Serveur:", err.stack);
  res.status(500).json({
    message: "🚨 Une erreur interne est survenue",
    error: err.message,
  });
});

// ✅ Démarrage du serveur sur le bon port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur en ligne sur http://localhost:${PORT}`);
});


