const express = require('express')
const router = express.Router()
const fiscalController = require('../controllers/fiscalController')
const { authenticateAdminToken } = require('../middleware/auth')

// NFe

router.post('/emitirNfe', fiscalController.emitirNfe)
router.get('/itensNfeByNumero/:numero_nf', fiscalController.getItensNfeByNumero)
router.get(
  '/nfeDetalhesByNumero/:numero_nf',
  fiscalController.getNfeDetalhesByNumero
)
router.post('/salvar-itens-nfe', fiscalController.salvarItensNfe)
router.get(
  '/ver-status/:ref',
  authenticateAdminToken,
  fiscalController.verStatusNfe
)
router.get(
  '/consultar/:ref',
  authenticateAdminToken,
  fiscalController.consultarNfe
)
router.get(
  '/nfe/listar',
  authenticateAdminToken,
  fiscalController.listarNfePaginadas
)
router.post('/cancelar/:ref', fiscalController.cancelarNfe)
router.post('/inutilizar', fiscalController.inutilizarNfe)
router.post('/email/:ref', fiscalController.enviarEmailNfe)
router.post('/carta-correcao/:ref', fiscalController.cartaCorrecaoNfe)
router.get('/download/:ref', fiscalController.downloadArquivosNfe)
router.get('/sincronizar', fiscalController.sincronizarPendentes)
router.get('/cce/download/:ref', fiscalController.baixarCartasCorrecao)
router.get('/zip/:ano/:mes', fiscalController.compactarArquivosPorMes)
router.get('/relatorio/:ano/:mes', fiscalController.relatorioMensalNfe)
router.get('/relatorio/pdf/:ano/:mes', fiscalController.gerarRelatorioPdf)
router.get(
  '/relatorio/pdf/download/:ano/:mes',
  fiscalController.gerarRelatorioPdfDownload
)
router.get('/relatorio/excel/:ano/:mes', fiscalController.gerarRelatorioExcel)
router.get(
  '/relatorio/excel/download/:ano/:mes',
  fiscalController.gerarRelatorioExcelDownload
)
router.post('/naturezas', fiscalController.adicionarNaturezaOperacao)
router.get('/naturezas', fiscalController.listarNaturezasOperacao)
router.get('/naturezas/:id', fiscalController.buscarNaturezaPorId)
router.put('/naturezas/:id', fiscalController.atualizarNaturezaOperacao)
router.get('/destinatarios', fiscalController.listarDestinatarios)
router.get('/destinatarios/buscar', fiscalController.buscarDestinatario)
router.get('/destinatarios/:id', fiscalController.buscarDestinatarioPorId)
router.get(
  '/destinatariosRetorno/:id',
  fiscalController.buscarDestinatarioRetornoPorId
)
router.post('/destinatarios', fiscalController.adicionarDestinatario)
router.put('/destinatarios/:id', fiscalController.atualizarDestinatario)
router.get('/produtos-fiscais', fiscalController.listarProdutosFiscais)
router.get(
  '/produtos-fiscais/id/:id',
  fiscalController.buscarProdutoFiscalPorId
)
router.get(
  '/produtos-fiscais/codigo/:codigo',
  fiscalController.buscarProdutoFiscalPorCodigo
)
router.get(
  '/produtos-fiscais-nfc/codigo/:codigo',
  fiscalController.buscarProdutoFiscalNfcPorCodigo
)
router.post('/produtos-fiscais', fiscalController.inserirProdutoFiscal)
router.put('/produtos-fiscais/:id', fiscalController.atualizarProdutoFiscal)
router.delete('/produtos-fiscais/:id', fiscalController.deletarProdutoFiscal)
router.get('/emitente/:cnpj', fiscalController.buscarEmitente)
router.get('/responsavelNfe/:cnpj', fiscalController.buscarResponsavel)

// NFCe

router.post('/emitirNfce', authenticateAdminToken, fiscalController.emitirNfce)
router.delete(
  '/cancelarNfce/:ref',
  authenticateAdminToken,
  fiscalController.cancelarNfce
)
router.get('/consultarNfce/:ref', fiscalController.consultarNfce)
router.get(
  '/nfce/listar',
  authenticateAdminToken,
  fiscalController.listarNfcePaginadas
)
router.get('/nfce/backup/:ano/:mes', fiscalController.gerarBackupMensalNfce)
router.post('/nfce/inutilizar', fiscalController.inutilizarNumeracaoNfce)
router.get(
  '/nfce/inutilizadas/:ano/:mes',
  authenticateAdminToken,
  fiscalController.listarInutilizacoesMensais
)
router.get(
  '/nfce/emitidas/:ano/:mes/pdf',
  fiscalController.gerarRelatorioEmitidasPDF
)
router.get(
  '/nfce/emitidas/:ano/:mes/excel',
  fiscalController.gerarRelatorioEmitidasExcel
)
router.get(
  '/nfce/canceladas/:ano/:mes/pdf',
  fiscalController.gerarRelatorioCanceladasPDF
)
router.get(
  '/nfce/canceladas/:ano/:mes/excel',
  fiscalController.gerarRelatorioCanceladasExcel
)
router.get(
  '/nfce/inutilizadas/:ano/:mes/pdf',
  fiscalController.gerarRelatorioInutilizadasPDF
)
router.get(
  '/nfce/inutilizadas/:ano/:mes/excel',
  fiscalController.gerarRelatorioInutilizadasExcel
)
router.get(
  '/nfce/relatorio-geral/:ano/:mes/pdf',
  fiscalController.gerarRelatorioGeralNfcePDF
)
router.get(
  '/nfce/relatorio-geral/:ano/:mes/excel',
  fiscalController.gerarRelatorioGeralExcel
)
router.get(
  '/nfce/relatorio-geral/:ano/:mes/zip',
  fiscalController.gerarZipRelatoriosMensais
)
router.post('/nfce/enviar-email/:ref', fiscalController.enviarNfcePorEmail)
router.get('/nfce/tributos', fiscalController.getTributosPadraoNfce)
router.put('/nfce/tributos', fiscalController.atualizarTributosPadraoNfce)
router.get(
  '/dashboardNfce',
  authenticateAdminToken,
  fiscalController.dashboardNfce
)

module.exports = router
