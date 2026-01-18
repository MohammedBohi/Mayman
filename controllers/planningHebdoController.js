const db = require('../db');
const { validateJourSemaine, validateMode, validatePlageHoraire } = require('../utils/validations');

/**
 * GET /api/planning-hebdo
 * Récupère tous les plannings hebdomadaires (7 jours)
 */
const getAllPlannings = async (req, res) => {
  try {
    const plannings = await db.query(`
      SELECT ph.*, 
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', php.id,
              'heure_debut', php.heure_debut,
              'heure_fin', php.heure_fin
            )
          ) FILTER (WHERE php.id IS NOT NULL),
          '[]'
        ) AS plages,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', phd.id,
              'code_postal', phd.code_postal,
              'nom', phd.nom
            )
          ) FILTER (WHERE phd.id IS NOT NULL),
          '[]'
        ) AS departements
      FROM planning_hebdo ph
      LEFT JOIN planning_hebdo_plage php ON php.planning_hebdo_id = ph.id
      LEFT JOIN planning_hebdo_departement phd ON phd.planning_hebdo_id = ph.id
      GROUP BY ph.id
      ORDER BY ph.jour_semaine ASC
    `);

    res.json(plannings.rows);
  } catch (error) {
    console.error('Erreur getAllPlannings :', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des plannings.' });
  }
};

/**
 * GET /api/planning-hebdo/:jour
 * Récupère le planning d'un jour de la semaine (1-7)
 */
const getPlanningByJour = async (req, res) => {
  const { jour } = req.params;

  const validation = validateJourSemaine(jour);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const planning = await db.query(`
      SELECT ph.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', php.id,
              'heure_debut', php.heure_debut,
              'heure_fin', php.heure_fin
            )
          ) FILTER (WHERE php.id IS NOT NULL),
          '[]'
        ) AS plages,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', phd.id,
              'code_postal', phd.code_postal,
              'nom', phd.nom
            )
          ) FILTER (WHERE phd.id IS NOT NULL),
          '[]'
        ) AS departements
      FROM planning_hebdo ph
      LEFT JOIN planning_hebdo_plage php ON php.planning_hebdo_id = ph.id
      LEFT JOIN planning_hebdo_departement phd ON phd.planning_hebdo_id = ph.id
      WHERE ph.jour_semaine = $1
      GROUP BY ph.id
    `, [jour]);

    if (planning.rows.length === 0) {
      return res.status(404).json({ error: 'Aucun planning trouvé pour ce jour.' });
    }

    res.json(planning.rows[0]);
  } catch (error) {
    console.error('Erreur getPlanningByJour :', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du planning.' });
  }
};

/**
 * POST /api/planning-hebdo
 * Crée un planning pour un jour de la semaine
 */
const createPlanning = async (req, res) => {
  const { jour_semaine, actif, mode } = req.body;

  // Validations
  const validationJour = validateJourSemaine(jour_semaine);
  if (!validationJour.valid) {
    return res.status(400).json({ error: validationJour.error });
  }

  const validationMode = validateMode(mode);
  if (!validationMode.valid) {
    return res.status(400).json({ error: validationMode.error });
  }

  if (typeof actif !== 'boolean') {
    return res.status(400).json({ error: 'Le champ actif doit être un booléen.' });
  }

  try {
    // Vérifier si un planning existe déjà pour ce jour
    const existing = await db.query(
      'SELECT * FROM planning_hebdo WHERE jour_semaine = $1',
      [jour_semaine]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Un planning existe déjà pour le jour ${jour_semaine}.` });
    }

    const result = await db.query(`
      INSERT INTO planning_hebdo (jour_semaine, actif, mode)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [jour_semaine, actif, mode]);

    res.status(201).json({ 
      message: 'Planning créé avec succès.', 
      planning: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur createPlanning :', error);
    res.status(500).json({ error: 'Erreur lors de la création du planning.' });
  }
};

/**
 * PUT /api/planning-hebdo/:id
 * Modifie un planning hebdomadaire
 */
const updatePlanning = async (req, res) => {
  const { id } = req.params;
  const { actif, mode } = req.body;

  // Validations
  if (mode) {
    const validationMode = validateMode(mode);
    if (!validationMode.valid) {
      return res.status(400).json({ error: validationMode.error });
    }
  }

  if (actif !== undefined && typeof actif !== 'boolean') {
    return res.status(400).json({ error: 'Le champ actif doit être un booléen.' });
  }

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (actif !== undefined) {
      updates.push(`actif = $${paramIndex++}`);
      values.push(actif);
    }

    if (mode) {
      updates.push(`mode = $${paramIndex++}`);
      values.push(mode);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await db.query(`
      UPDATE planning_hebdo
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Planning non trouvé.' });
    }

    res.json({ 
      message: 'Planning mis à jour avec succès.', 
      planning: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur updatePlanning :', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du planning.' });
  }
};

/**
 * DELETE /api/planning-hebdo/:id
 * Supprime un planning hebdomadaire
 */
const deletePlanning = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM planning_hebdo WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Planning non trouvé.' });
    }

    res.json({ message: 'Planning supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur deletePlanning :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du planning.' });
  }
};

/**
 * POST /api/planning-hebdo/:id/plages
 * Ajoute une plage horaire à un planning
 */
const addPlage = async (req, res) => {
  const { id } = req.params;
  const { heure_debut, heure_fin } = req.body;

  const validation = validatePlageHoraire(heure_debut, heure_fin);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    // Vérifier que le planning existe
    const planning = await db.query('SELECT * FROM planning_hebdo WHERE id = $1', [id]);
    if (planning.rows.length === 0) {
      return res.status(404).json({ error: 'Planning non trouvé.' });
    }

    const result = await db.query(`
      INSERT INTO planning_hebdo_plage (planning_hebdo_id, heure_debut, heure_fin)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, heure_debut, heure_fin]);

    res.status(201).json({ 
      message: 'Plage horaire ajoutée avec succès.', 
      plage: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur addPlage :', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la plage horaire.' });
  }
};

/**
 * PUT /api/planning-hebdo/plages/:plageId
 * Modifie une plage horaire
 */
const updatePlage = async (req, res) => {
  const { plageId } = req.params;
  const { heure_debut, heure_fin } = req.body;

  const validation = validatePlageHoraire(heure_debut, heure_fin);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const result = await db.query(`
      UPDATE planning_hebdo_plage
      SET heure_debut = $1, heure_fin = $2
      WHERE id = $3
      RETURNING *
    `, [heure_debut, heure_fin, plageId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Plage horaire non trouvée.' });
    }

    res.json({ 
      message: 'Plage horaire mise à jour avec succès.', 
      plage: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur updatePlage :', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la plage horaire.' });
  }
};

/**
 * DELETE /api/planning-hebdo/plages/:plageId
 * Supprime une plage horaire
 */
const deletePlage = async (req, res) => {
  const { plageId } = req.params;

  try {
    const result = await db.query('DELETE FROM planning_hebdo_plage WHERE id = $1', [plageId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Plage horaire non trouvée.' });
    }

    res.json({ message: 'Plage horaire supprimée avec succès.' });
  } catch (error) {
    console.error('Erreur deletePlage :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la plage horaire.' });
  }
};

/**
 * POST /api/planning-hebdo/:id/departements
 * Ajoute un département à un planning
 */
const addDepartement = async (req, res) => {
  const { id } = req.params;
  const { code_postal, nom } = req.body;

  if (!code_postal) {
    return res.status(400).json({ error: 'Le code postal est requis.' });
  }

  if (!nom) {
    return res.status(400).json({ error: 'Le nom du département est requis.' });
  }

  try {
    // Vérifier que le planning existe et est en mode DOMICILE
    const planning = await db.query('SELECT * FROM planning_hebdo WHERE id = $1', [id]);
    if (planning.rows.length === 0) {
      return res.status(404).json({ error: 'Planning non trouvé.' });
    }

    if (planning.rows[0].mode !== 'DOMICILE') {
      return res.status(400).json({ error: 'Les départements ne peuvent être ajoutés qu\'en mode DOMICILE.' });
    }

    const result = await db.query(`
      INSERT INTO planning_hebdo_departement (planning_hebdo_id, code_postal, nom)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, code_postal, nom]);

    res.status(201).json({ 
      message: 'Département ajouté avec succès.', 
      departement: result.rows[0] 
    });
  } catch (error) {
    if (error.code === '23505') { // Violation contrainte unicité
      return res.status(400).json({ error: 'Ce département existe déjà pour ce planning.' });
    }
    console.error('Erreur addDepartement :', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du département.' });
  }
};

/**
 * DELETE /api/planning-hebdo/departements/:deptId
 * Supprime un département d'un planning
 */
const deleteDepartement = async (req, res) => {
  const { deptId } = req.params;

  try {
    const result = await db.query('DELETE FROM planning_hebdo_departement WHERE id = $1', [deptId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Département non trouvé.' });
    }

    res.json({ message: 'Département supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur deleteDepartement :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du département.' });
  }
};

/**
 * PUT /api/planning-hebdo/departements/:deptId
 * Modifie un département (code/nom) associé à un planning DOMICILE
 */
const updateDepartement = async (req, res) => {
  const { deptId } = req.params;
  const { code_postal, nom } = req.body;

  if (!code_postal && !nom) {
    return res.status(400).json({ error: 'Au moins un champ (code_postal ou nom) est requis.' });
  }

  if (nom !== undefined && !nom) {
    return res.status(400).json({ error: 'Le nom du département est requis.' });
  }

  try {
    // Récupérer le département et vérifier le mode du planning
    const deptRow = await db.query(
      `SELECT phd.*, ph.mode
       FROM planning_hebdo_departement phd
       JOIN planning_hebdo ph ON ph.id = phd.planning_hebdo_id
       WHERE phd.id = $1`,
      [deptId]
    );

    if (deptRow.rows.length === 0) {
      return res.status(404).json({ error: 'Département non trouvé pour ce planning.' });
    }

    if (deptRow.rows[0].mode !== 'DOMICILE') {
      return res.status(400).json({ error: 'Edition des départements autorisée uniquement pour les plannings DOMICILE.' });
    }

    const result = await db.query(
      `UPDATE planning_hebdo_departement
       SET code_postal = COALESCE($1, code_postal),
           nom = COALESCE($2, nom)
       WHERE id = $3
       RETURNING *`,
      [code_postal || null, nom || null, deptId]
    );

    res.json({ message: 'Département mis à jour avec succès.', departement: result.rows[0] });
  } catch (error) {
    console.error('Erreur updateDepartement :', error);
    res.status(500).json({ error: "Erreur lors de la mise à jour du département." });
  }
};

module.exports = {
  getAllPlannings,
  getPlanningByJour,
  createPlanning,
  updatePlanning,
  deletePlanning,
  addPlage,
  updatePlage,
  deletePlage,
  addDepartement,
  deleteDepartement,
  updateDepartement
};
