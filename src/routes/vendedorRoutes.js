// vendedorRoutes.js
const express = require('express')
const router = express.Router()
const vendedorController = require('../controllers/vendedorController') // Verifique o caminho correto
const {
  authenticateToken,
  authenticateAdminToken,
} = require('../middleware/auth')
const db = require('../../db')

router.get('/:cpf', vendedorController.getVendedorByCPF)

router.get('/rotas/:idVendedor', authenticateToken, async (req, res) => {
  const { idVendedor } = req.params
  try {
    // console.log(`Buscando rotas para idVendedor: ${idVendedor}`)
    const [rows] = await db.query(
      'SELECT rotas FROM vendedores WHERE idVendedor = ?',
      [idVendedor]
    )
    // console.log(`Resultado da consulta: ${JSON.stringify(rows)}`)

    if (rows.length > 0) {
      const rotas = rows[0].rotas.split(',').map((rota) => rota.trim())
      res.status(200).json(rotas)
    } else {
      res
        .status(404)
        .json({ message: 'Nenhuma rota encontrada para o vendedor' })
    }
  } catch (error) {
    console.error('Erro ao buscar rotas:', error)
    res.status(500).json({ message: 'Erro ao buscar rotas' })
  }
})
router.post('/createEnvio', authenticateToken, vendedorController.createEnvio)

router.post('/getEnvios', authenticateToken, vendedorController.getEnvios)
router.post('/getAllEnvios', vendedorController.getAllEnvios)
router.post(
  '/insertResultados',
  authenticateAdminToken,
  vendedorController.insertResultados
)

router.get(
  '/resultados/desempenho',
  authenticateAdminToken,
  vendedorController.listarResultados
)

router.delete(
  '/resultados/:id',
  authenticateAdminToken,
  vendedorController.deleteResultadoById
)

router.patch(
  '/resultados/:id',
  authenticateAdminToken,
  vendedorController.patchResultadoById
)

router.get(
  '/equipe/dia',
  authenticateToken,
  vendedorController.acompanhamentoEquipe
)

router.get('/acompanhamentoGeral/dia', vendedorController.acompanhamentoGeral)

router.get(
  '/gerenciamento/listar',
  authenticateAdminToken,
  vendedorController.listarVendedores
)

router.post(
  '/gerenciamento/cadastrar',
  authenticateAdminToken,
  vendedorController.cadastrarVendedor
)

router.get(
  '/gerenciamento/buscarId/:idVendedor',
  authenticateAdminToken,
  vendedorController.getVendedorById
)
router.patch(
  '/gerenciamento/atualizar',
  authenticateAdminToken,
  vendedorController.atualizarVendedor
)

module.exports = router
