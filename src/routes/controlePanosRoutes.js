const express = require('express')
const router = express.Router()
const controlePanosController = require('../controllers/controlePanosController')
const {
  authenticateAdminToken,
  authenticateToken,
} = require('../middleware/auth')

// Enviar panos para nova rota
router.post(
  '/registrar-envio',
  authenticateAdminToken,
  controlePanosController.registrarEnvioPanos
)

// Registrar retorno com vendas, panos velhos e dinheiro
router.post(
  '/registrar-retorno',
  authenticateAdminToken,
  controlePanosController.registrarRetornoRota
)

// Listar registros por vendedor
router.get(
  '/listar',
  authenticateAdminToken,
  controlePanosController.listarRegistros
)

router.post(
  '/resumo',
  authenticateAdminToken,
  controlePanosController.resumoPorRotaEData
)

router.delete(
  '/:idControle',
  authenticateAdminToken,
  controlePanosController.deletarRegistroPorId
)

router.patch(
  '/:idControle',
  authenticateAdminToken,
  controlePanosController.atualizarRegistroParcial
)

router.get(
  '/saldo-atual',
  authenticateToken,
  controlePanosController.getSaldoAtualPorVendedor
)

router.get(
  '/:idControle',
  authenticateAdminToken,
  controlePanosController.getRegistroPorId
)

router.get(
  '/visualizar/logs',
  authenticateAdminToken,
  controlePanosController.listarLogsControlePanos
)

module.exports = router
