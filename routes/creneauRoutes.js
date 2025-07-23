const express = require('express');
const router = express.Router();
const controller = require('../controllers/creneauController');
const { authenticateUser } = require('../middlewares/auth');

router.get('/', authenticateUser, controller.getCreneauxDisponibles);

module.exports = router;