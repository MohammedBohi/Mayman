const db = require('../db');

// Récupérer toutes les prestations
const getAllPrestations = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM prestation ORDER BY nom ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur getAllPrestations :', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des prestations.' });
  }
};

// Créer une nouvelle prestation
const createPrestation = async (req, res) => {
  const { nom, duree_minutes, prix, soin_disponible, disponible_salon, disponible_domicile } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO prestation (nom, duree_minutes, prix, soin_disponible, disponible_salon, disponible_domicile)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nom, duree_minutes, prix, soin_disponible ?? false, disponible_salon ?? true, disponible_domicile ?? true]
    );
    res.status(201).json({ message: '✅ Prestation créée.', prestation: result.rows[0] });
  } catch (error) {
    console.error('Erreur createPrestation :', error);
    res.status(500).json({ error: 'Erreur lors de la création de la prestation.' });
  }
};

// Modifier une prestation existante
const updatePrestation = async (req, res) => {
  const id = req.params.id;
  const { nom, duree_minutes, prix, soin_disponible, disponible_salon, disponible_domicile } = req.body;
  try {
    // COALESCE : on ne met à jour que les champs réellement fournis, pour ne pas
    // écraser soin_disponible / la disponibilité par mode quand le formulaire ne les envoie pas
    const result = await db.query(
      `UPDATE prestation
       SET nom = COALESCE($1, nom),
           duree_minutes = COALESCE($2, duree_minutes),
           prix = COALESCE($3, prix),
           soin_disponible = COALESCE($4, soin_disponible),
           disponible_salon = COALESCE($5, disponible_salon),
           disponible_domicile = COALESCE($6, disponible_domicile)
       WHERE id = $7 RETURNING *`,
      [nom ?? null, duree_minutes ?? null, prix ?? null, soin_disponible ?? null, disponible_salon ?? null, disponible_domicile ?? null, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Prestation non trouvée.' });
    }
    res.json({ message: '✏️ Prestation mise à jour.', prestation: result.rows[0] });
  } catch (error) {
    console.error('Erreur updatePrestation :', error);
    res.status(500).json({ error: 'Erreur lors de la modification de la prestation.' });
  }
};

// Supprimer une prestation
const deletePrestation = async (req, res) => {
  const id = req.params.id;
  try {
    await db.query('DELETE FROM prestation WHERE id = $1', [id]);
    res.json({ message: '🗑️ Prestation supprimée.' });
  } catch (error) {
    console.error('Erreur deletePrestation :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la prestation.' });
  }
};

module.exports = {
  getAllPrestations,
  createPrestation,
  updatePrestation,
  deletePrestation,
};