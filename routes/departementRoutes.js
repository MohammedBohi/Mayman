const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');
const controller = require('../controllers/departementController');

// 📋 GET /api/departements - Tous les départements actifs (public ou authentifié)
router.get('/', controller.getAllDepartements);

// 🆕 POST /api/departements - Créer un département (Admin uniquement)
router.post('/', authenticateUser, checkRole(['Admin']), controller.createDepartement);

// ✏️ PUT /api/departements/:id - Modifier un département (Admin uniquement)
router.put('/:id', authenticateUser, checkRole(['Admin']), controller.updateDepartement);

// 🗑️ DELETE /api/departements/:id - Supprimer un département (Admin uniquement)
router.delete('/:id', authenticateUser, checkRole(['Admin']), controller.deleteDepartement);

module.exports = router;
