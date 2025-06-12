const express = require('express')
const { body } = require('express-validator')
const db = require('../../db')
const router = express.Router()
const vendasController = require('../controllers/vendasController')
const {
  authenticateToken,
  authenticateAdminToken,
} = require('../middleware/auth')

router.post('/register', vendasController.registerSale)
router.get('/clientes/:id', vendasController.getClienteById)
router.get('/clientes/search', vendasController.searchClientesByNome)
router.post('/createSaleAdm', vendasController.createSaleAdm)
router.post('/salesByClientId', vendasController.vendasByClientId)
// router.get('/salesByClientId/:id', vendasController.getSalesByClientId)
router.get('/getSaleById/:venda_id', vendasController.getSaleById)
router.patch('/updateSaleById/:venda_id', vendasController.updateSaleById)
router.delete('/deleteSaleById/:venda_id', vendasController.deleteSaleById)
router.post('/listSalesByRoute', vendasController.listSalesByRoute)
router.get(
  '/salesByClientId/:id',
  authenticateToken,
  vendasController.getSalesByClientId
)
router.post(
  '/listSalesByTypeAndRoute',
  vendasController.listSalesByTypeAndRoute
)
router.post('/list-sales-and-sum', vendasController.listSalesAndSum)
router.post('/createNewSale', authenticateToken, vendasController.createNewSale)
router.post('/verificarDuplicidade', vendasController.verificarDuplicidade)
router.get(
  '/specificSaleByVendaId/:vendaId',
  vendasController.getSpecificSaleByVendaId
)
router.get(
  '/RestanteNaNova/:clientId',
  authenticateToken,
  vendasController.getRestanteNaNova
)
router.patch(
  '/updateRestanteNaNova',
  body('venda_id').notEmpty().withMessage('ID da venda é obrigatório'),
  body('valorRecebido').notEmpty().withMessage('Valor recebido é obrigatório'),
  authenticateToken,
  vendasController.updateRestanteNaNova
)
router.patch(
  '/updateValorRecebido',
  authenticateToken,
  vendasController.updateValorRecebido
)
router.post('/createSale', authenticateToken, vendasController.createSale)

router.post(
  '/registrarOcorrencia',
  authenticateToken,
  vendasController.registrarOcorrencia
)

router.get(
  '/ocorrencias',
  authenticateAdminToken,
  vendasController.listarOcorrenciasRegistradas
)
router.patch(
  '/ocorrencias/:ocorrenciaId',
  vendasController.marcarOcorrenciaResolvida
)

router.get(
  '/restanteVendaCliente/:clientId',
  authenticateToken,
  vendasController.getRestandeVendaByClienteId
)

module.exports = router
