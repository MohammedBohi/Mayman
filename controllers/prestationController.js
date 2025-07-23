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
  const { nom, duree_minutes, prix, soin_disponible } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO prestation (nom, duree_minutes, prix, soin_disponible)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nom, duree_minutes, prix, soin_disponible]
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
  const { nom, duree_minutes, prix, soin_disponible } = req.body;
  try {
    const result = await db.query(
      `UPDATE prestation
       SET nom = $1, duree_minutes = $2, prix = $3, soin_disponible = $4
       WHERE id = $5 RETURNING *`,
      [nom, duree_minutes, prix, soin_disponible, id]
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