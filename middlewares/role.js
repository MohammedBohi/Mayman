const checkRole = (roles) => {
    return (req, res, next) => {

        // Vérifier que req.user existe et que le typeUtilisateur est bien défini
        if (!req.user || !req.user.typeUtilisateur) {
            return res.status(403).json({ error: "Accès interdit : Utilisateur non valide." });
        }

      
        // Vérifier si l'utilisateur a un rôle autorisé
        if (!roles.includes(req.user.typeUtilisateur)) {
            return res.status(403).json({ error: "Accès interdit pour ce rôle." });
        }

        next();
    };
};

module.exports = { checkRole };