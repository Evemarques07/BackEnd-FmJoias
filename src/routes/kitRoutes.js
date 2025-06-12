const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../middleware/auth')
const kitController = require('../controllers/kitController')

router.get('/kits/:sku', authenticateToken, kitController.getKitBySKU)

module.exports = router
