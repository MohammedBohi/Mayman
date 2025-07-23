const db = require('../db');

const getIndisposDuJour = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Date manquante." });

  try {
    const result = await db.query(
      'SELECT * FROM indisponibilite WHERE jour = $1 ORDER BY heure_debut',
      [date]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la récupération des indisponibilités." });
  }
};

const creerIndispo = async (req, res) => {
  const { jour, heure_debut, heure_fin, motif } = req.body;

  try {
    await db.query(`
      INSERT INTO indisponibilite (jour, heure_debut, heure_fin, motif)
      VALUES ($1, $2, $3, $4)
    `, [jour, heure_debut, heure_fin, motif || null]);

    res.json({ message: "✅ Indisponibilité ajoutée." });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la création de l’indisponibilité." });
  }
};

const supprimerIndispo = async (req, res) => {
  const id = req.params.id;
  try {
    await db.query('DELETE FROM indisponibilite WHERE id = $1', [id]);
    res.json({ message: "🗑️ Indisponibilité supprimée." });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la suppression." });
  }
};

module.exports = {
  getIndisposDuJour,
  creerIndispo,
  supprimerIndispo
};