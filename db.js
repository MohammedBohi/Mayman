const { Pool } = require('pg');

// Configuration du pool PostgreSQL
const pool = new Pool({
    user: 'mayman_user',        // Votre utilisateur PostgreSQL
    host: 'localhost',          // Hôte de la base de données
    database: 'mayman',         // Nom de la base de données
    password: '8573bohi',       // Mot de passe de l'utilisateur
    port: 5432,                 // Port par défaut de PostgreSQL
    max: 20,                    // Nombre maximum de connexions simultanées
    idleTimeoutMillis: 30000,   // Temps avant qu'une connexion inutilisée soit fermée (en ms)
    connectionTimeoutMillis: 2000 // Temps avant qu'une tentative de connexion échoue (en ms)
});

module.exports = pool;
