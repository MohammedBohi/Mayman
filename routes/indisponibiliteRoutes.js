const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');
const controller = require('../controllers/indisponibiliteController');

router.get('/', authenticateUser, checkRole(['Admin']), controller.getIndisposDuJour);
router.post('/', authenticateUser, checkRole(['Admin']), controller.creerIndispo);
router.delete('/:id', authenticateUser, checkRole(['Admin']), controller.supprimerIndispo);

module.exports = router;