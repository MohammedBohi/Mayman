const express = require('express');
const router = express.Router();
const prestationController = require('../controllers/prestationController');
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');

// 📌 Routes publiques ou pour affichage client
router.get('/', prestationController.getAllPrestations);

// 🛠️ Routes protégées pour admin
router.post('/', authenticateUser, checkRole(['Admin']), prestationController.createPrestation);
router.put('/:id', authenticateUser, checkRole(['Admin']), prestationController.updatePrestation);
router.delete('/:id', authenticateUser, checkRole(['Admin']), prestationController.deletePrestation);

module.exports = router;