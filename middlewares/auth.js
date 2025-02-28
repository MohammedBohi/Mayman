const jwt = require('jsonwebtoken');

const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: 'Authorization header missing or invalid format' });
    }

    const token = authHeader.split(' ')[1]?.trim(); // Supprime les espaces inutiles

    if (!token) {
        return res.status(401).json({ error: 'Token missing' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = user; // Ajout de l'utilisateur dans la requête
        next();
    } catch (err) {
        console.error("❌ Erreur de validation du token :", err);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authenticateUser };
