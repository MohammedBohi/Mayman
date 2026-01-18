const db = require('../db');

// 📋 GET /api/departements - Récupérer tous les départements de la table master
const getAllDepartements = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, nom, code_postal, mode, adresse, actif
      FROM departement
      WHERE actif = TRUE
      ORDER BY nom ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur getAllDepartements:', error);
    res.status(500).json({ error: "Erreur lors de la récupération des départements." });
  }
};

// 🆕 POST /api/departements - Créer un nouveau département
const createDepartement = async (req, res) => {
  const { nom, code_postal, mode = 'DOMICILE', adresse } = req.body;

  if (!nom || !code_postal) {
    return res.status(400).json({ error: "Les champs nom et code_postal sont requis." });
  }

  if (!['SALON', 'DOMICILE'].includes(mode)) {
    return res.status(400).json({ error: "Le mode doit être SALON ou DOMICILE." });
  }

  try {
    const result = await db.query(`
      INSERT INTO departement (nom, code_postal, mode, adresse, actif)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING *
    `, [nom, code_postal, mode, adresse || null]);

    res.status(201).json({ 
      message: 'Département créé avec succès.', 
      departement: result.rows[0] 
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ce département existe déjà.' });
    }
    console.error('Erreur createDepartement:', error);
    res.status(500).json({ error: "Erreur lors de la création du département." });
  }
};

// ✏️ PUT /api/departements/:id - Modifier un département
const updateDepartement = async (req, res) => {
  const { id } = req.params;
  const { nom, code_postal, mode, adresse, actif } = req.body;

  try {
    const result = await db.query(`
      UPDATE departement
      SET 
        nom = COALESCE($1, nom),
        code_postal = COALESCE($2, code_postal),
        mode = COALESCE($3, mode),
        adresse = COALESCE($4, adresse),
        actif = COALESCE($5, actif)
      WHERE id = $6
      RETURNING *
    `, [nom || null, code_postal || null, mode || null, adresse || null, actif, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Département non trouvé.' });
    }

    res.json({ 
      message: 'Département mis à jour avec succès.', 
      departement: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur updateDepartement:', error);
    res.status(500).json({ error: "Erreur lors de la mise à jour du département." });
  }
};

// 🗑️ DELETE /api/departements/:id - Supprimer un département
const deleteDepartement = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM departement WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Département non trouvé.' });
    }

    res.json({ message: 'Département supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur deleteDepartement:', error);
    res.status(500).json({ error: "Erreur lors de la suppression du département." });
  }
};

module.exports = {
  getAllDepartements,
  createDepartement,
  updateDepartement,
  deleteDepartement
};
