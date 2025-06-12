// clientRoutes.js
const express = require('express')
const { body } = require('express-validator')
const db = require('../../db')
const router = express.Router()
const clientController = require('../controllers/clientControllers')
const { authenticateToken } = require('../middleware/auth')

router.get(
  '/search/:cpf',
  authenticateToken,
  clientController.buscarRegularidadeCpf
)

router.post(
  '/register',
  body('nomeCliente').notEmpty().withMessage('Nome do cliente é obrigatório'),
  body('cpf').notEmpty().withMessage('CPF é obrigatório'),
  authenticateToken,
  clientController.register
)
router.post(
  '/register2adm',
  body('nomeCliente').notEmpty().withMessage('Nome do cliente é obrigatório'),
  body('cpf').notEmpty().withMessage('CPF é obrigatório'),
  clientController.register2
)
router.get('/cpf/:cpf', clientController.getClientByCpf)

router.delete('/deleteClientById/:id', clientController.deleteClientById)

router.patch(
  '/update/:id',
  body('endTipo').notEmpty().withMessage('Tipo de endereço é obrigatório'),
  body('endereco').notEmpty().withMessage('Endereço é obrigatório'),
  body('numero').notEmpty().withMessage('Número é obrigatório'),
  body('bairro').notEmpty().withMessage('Bairro é obrigatório'),
  body('pontoRef').notEmpty().withMessage('Ponto de referência é obrigatório'),
  body('cidade').notEmpty().withMessage('Cidade é obrigatória'),
  body('estado').notEmpty().withMessage('Estado é obrigatório'),
  body('telefone').notEmpty().withMessage('Telefone é obrigatório'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude inválida'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude inválida'),
  authenticateToken,
  clientController.update
)

router.patch(
  '/updatePartial/:id',
  authenticateToken,
  clientController.updatePartial
)
router.get(
  '/clients/:idVendedor',
  authenticateToken,
  clientController.getClientsByVendedor
)
router.get(
  '/clients-with-coordinates',
  clientController.getAllClientsWithCoordinates
)
router.get(
  '/buscarLocalizacaoCliente/:id',
  clientController.buscarLocalizacaoClienteIndiviual
)
router.get(' ', clientController.getAllClientsWithCoordinatesSimple)

router.get(
  '/restantes/:idVendedor',
  authenticateToken,
  clientController.getRestantesByVendedor
)

// Rota para obter todos os clientes do vendedor
router.get(
  '/clientsList/:idVendedor',
  authenticateToken,
  clientController.getClientsByVendedorList
)

router.get(
  '/clientsListPaginated',
  authenticateToken,
  clientController.getClientsByVendedorPaginated
)

router.get(
  '/clientsListPaginado',
  authenticateToken,
  clientController.getClientesBuscaPaginated
)

// Rota para obter um cliente por ID
router.get('/client/:id', authenticateToken, clientController.getClientById)

router.get(
  '/vendedor/stats',
  authenticateToken,
  clientController.getVendedorStats
)

// Rota para buscar clientes por nome ou CPF
router.get(
  '/searchByNameOrCpf/:searchQuery',
  authenticateToken,
  clientController.searchByNameOrCpf
)
router.get(
  '/searchByNameOrCpf_st/:searchQuery',
  clientController.searchByNameOrCpf_st
)
router.get('/searchByNameOrCpfKey', clientController.searchByNameOrCpfKey)

// Rota para buscar clientes por nome
router.get(
  '/searchByName/:name',
  authenticateToken,
  clientController.searchByName
)
// Rota para buscar vendas pelo clientId
router.get(
  '/salesByClientId/:clientId',
  authenticateToken,
  clientController.getSalesByClientId
)
router.get(
  '/salesByClientId_st/:clientId',
  clientController.getSalesByClientId_st
)
router.get(
  '/specificSaleByClientId/:clientId',
  authenticateToken,
  clientController.getSpecificSaleByClientId
)

router.post(
  '/receivePayment',
  authenticateToken,
  clientController.receivePayment
)
router.get(
  '/clientsByRouteWithSales/:routeName',
  authenticateToken,
  clientController.getClientsByRouteWithSales
)
router.get(
  '/clientsByRouteWithSalesFixo/:routeName',
  authenticateToken,
  clientController.getClientsByRouteWithSalesFixo
)
router.get(
  '/nextRouteWithSales/:routeName',
  authenticateToken,
  clientController.getNextRouteWithSales
)
router.get(
  '/nextRouteWithSalesTeam/:routeName',
  clientController.getNextRouteWithSalesTeam
)

router.post('/report/route', authenticateToken, clientController.getRouteReport)
router.post('/report/routeTeam', clientController.getRouteReportTeam)

router.post(
  '/report/routeDay',
  authenticateToken,
  clientController.getRouteReportDay
)
router.post('/report/routeDayTeam', clientController.getRouteReportDayTeam)
router.get('/clientsByRoute/:rota', authenticateToken, async (req, res) => {
  const { rota } = req.params
  try {
    const query = `
            SELECT id, nomeCliente, latitude, longitude, endereco, numero, bairro, cpf, telefone, nomeMae, rota, cidade, estado, status
            FROM clientes
            WHERE rota = ? AND status = 1
        `
    const [rows] = await db.query(query, [rota])
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ message: 'Erro ao buscar clientes' })
  }
})

router.get(
  '/checkVendorInTeam/:idVendedor',
  authenticateToken,
  clientController.getcheckVendorInTeam
)

router.patch(
  '/updateClientStatus/:cliente_id',
  clientController.updateClientStatus
)
router.get('/ClientsDay', clientController.getClientsDay)

router.post('/vendasAlteracoes', clientController.getVendaAlteracoesByClienteId)
router.post('/clientesAlteracoes', clientController.getClienteAlteracoesById)
router.get('/todasAlteracoes', clientController.getTodasAlteracoesPaginadas)
router.post(
  '/localizacaoAlteracoes',
  clientController.getAlteracoesLocalizacaoCliente
)

router.post(
  '/registrarVisitaRestante',
  authenticateToken,
  clientController.registrarVisitaRestante
)

router.get('/listarVisitaRestante', clientController.listarVisitasRestantes)

router.post(
  '/visitas-restantes/deletar',
  clientController.deletarVisitasRestantes
)

module.exports = router
