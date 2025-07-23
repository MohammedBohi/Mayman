const db = require('../db');

// ✅ Récupérer plage horaire pour un jour
const getPlageHoraireDuJour = async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date requise (format YYYY-MM-DD)" });

    try {
        const result = await db.query(
            'SELECT * FROM plage_horaire WHERE date = $1',
            [date]
        );

        if (result.rows.length === 0) {
            // Si aucune plage personnalisée → retourner plage par défaut
            return res.json({
                date,
                heure_ouverture: '09:00',
                heure_fermeture: '21:00',
                par_defaut: true
            });
        }

        res.json({ ...result.rows[0], par_defaut: false });
    } catch (error) {
        console.error('Erreur récupération plage horaire :', error);
        res.status(500).json({ error: "Erreur serveur." });
    }
};

// ✅ Créer ou mettre à jour la plage horaire pour une date
const creerOuModifierPlage = async (req, res) => {
    const { date, heure_ouverture, heure_fermeture } = req.body;
    if (!date || !heure_ouverture || !heure_fermeture) {
        return res.status(400).json({ error: "Champs requis : date, heure_ouverture, heure_fermeture" });
    }

    try {
        const existing = await db.query('SELECT * FROM plage_horaire WHERE date = $1', [date]);

        if (existing.rows.length > 0) {
            await db.query(
                'UPDATE plage_horaire SET heure_ouverture = $1, heure_fermeture = $2 WHERE date = $3',
                [heure_ouverture, heure_fermeture, date]
            );
        } else {
            await db.query(
                'INSERT INTO plage_horaire (date, heure_ouverture, heure_fermeture) VALUES ($1, $2, $3)',
                [date, heure_ouverture, heure_fermeture]
            );
        }

        res.json({ message: "Plage horaire enregistrée pour " + date });
    } catch (error) {
        console.error('Erreur enregistrement plage horaire :', error);
        res.status(500).json({ error: "Erreur serveur." });
    }
};

// ✅ Supprimer une plage personnalisée (revenir à défaut)
const supprimerPlage = async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date requise." });

    try {
        await db.query('DELETE FROM plage_horaire WHERE date = $1', [date]);
        res.json({ message: "Plage horaire supprimée pour " + date });
    } catch (error) {
        console.error('Erreur suppression plage :', error);
        res.status(500).json({ error: "Erreur serveur." });
    }
};

module.exports = {
    getPlageHoraireDuJour,
    creerOuModifierPlage,
    supprimerPlage
};