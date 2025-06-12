// fiscalController.js
const axios = require('axios')
const PDFDocument = require('pdfkit')
const ExcelJS = require('exceljs')
const puppeteer = require('puppeteer')
const db = require('../../db')
require('dotenv').config()
const path = require('path')
const fs = require('fs')
const archiver = require('archiver')
const baseUrl = 'https://api.focusnfe.com.br' // URL de produção
// const baseUrl = 'https://homologacao.focusnfe.com.br' // URL de homologação
const tokenFocus = '3SGyk24Wsb24cbFefzz7kVDCfPCRBTdr' // Token de produção
// const tokenFocus = 'SXItHQff6pHSXINsHE03qmheLnXgXWZe' // Token de homologação
const {
  enviarParaDrive,
  obterIdArquivo,
  gerarLinkDrive,
  removerDoDrive,
} = require('../utils/rclone')

// NFe

exports.emitirNfe = async (req, res) => {
  const ref = `nfe_${Date.now()}`
  const nfe = req.body.nfeData || req.body // usa o antigo se vier direto
  const itensBrutos = req.body.itensBrutos || [] // vazio se não vier

  try {
    const url = `${baseUrl}/v2/nfe?ref=${ref}`

    const response = await axios.post(url, nfe, {
      auth: {
        username: tokenFocus,
        password: '',
      },
    })

    const data = response.data

    // Salvar no banco imediatamente
    const insertQuery = `
      INSERT INTO nfe_historico (
        nome_destinatario, ref, status, status_sefaz, mensagem_sefaz, chave_nfe,
        numero, serie, cnpj_emitente, caminho_xml_nota_fiscal,
        caminho_danfe, caminho_xml_cancelamento, caminho_xml_carta_correcao,
        caminho_pdf_carta_correcao, numero_carta_correcao, data_emissao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    await db.query(insertQuery, [
      nfe.nome_destinatario || null,
      ref,
      data.status || null,
      data.status_sefaz || null,
      data.mensagem_sefaz || null,
      data.chave_nfe || null,
      data.numero || null,
      data.serie || null,
      data.cnpj_emitente || null,
      data.caminho_xml_nota_fiscal || null,
      data.caminho_danfe || null,
      data.caminho_xml_cancelamento || null,
      data.caminho_xml_carta_correcao || null,
      data.caminho_pdf_carta_correcao || null,
      data.numero_carta_correcao || null,
      nfe.data_emissao || null,
    ])

    // Enviar resposta imediata
    res.status(response.status).json({
      message: 'NFe enviada com sucesso',
      ref,
      dados: data,
    })

    // Consulta em segundo plano
    let tentativas = 0
    const maxTentativas = 4

    const consultarENProcessar = async () => {
      tentativas++

      try {
        const consultaUrl = `${baseUrl}/v2/nfe/${ref}?completa=1`
        const consultaResponse = await axios.get(consultaUrl, {
          auth: {
            username: tokenFocus,
            password: '',
          },
        })

        const dadosConsulta = consultaResponse.data

        await db.query(
          `UPDATE nfe_historico SET
            status = ?, status_sefaz = ?, mensagem_sefaz = ?,
            chave_nfe = ?, numero = ?, serie = ?, cnpj_emitente = ?,
            caminho_xml_nota_fiscal = ?, caminho_danfe = ?,
            caminho_xml_cancelamento = ?, caminho_xml_carta_correcao = ?,
            caminho_pdf_carta_correcao = ?, numero_carta_correcao = ?
          WHERE ref = ?`,
          [
            dadosConsulta.status || null,
            dadosConsulta.status_sefaz || null,
            dadosConsulta.mensagem_sefaz || null,
            dadosConsulta.chave_nfe || null,
            dadosConsulta.numero || null,
            dadosConsulta.serie || null,
            dadosConsulta.cnpj_emitente || null,
            dadosConsulta.caminho_xml_nota_fiscal || null,
            dadosConsulta.caminho_danfe || null,
            dadosConsulta.caminho_xml_cancelamento || null,
            dadosConsulta.caminho_xml_carta_correcao || null,
            dadosConsulta.caminho_pdf_carta_correcao || null,
            dadosConsulta.numero_carta_correcao || null,
            ref,
          ]
        )

        if (
          dadosConsulta.status === 'autorizado' &&
          dadosConsulta.caminho_xml_nota_fiscal &&
          dadosConsulta.caminho_danfe
        ) {
          const ano = new Date(nfe.data_emissao).getFullYear()
          const mes = String(
            new Date(nfe.data_emissao).getMonth() + 1
          ).padStart(2, '0')
          const numeroFormatado = String(dadosConsulta.numero).padStart(8, '0')

          const pastaXml = path.join(
            __dirname,
            '..',
            '..',
            'arquivos_nfe',
            'xml',
            ano.toString(),
            mes
          )
          const pastaPdf = path.join(
            __dirname,
            '..',
            '..',
            'arquivos_nfe',
            'pdf',
            ano.toString(),
            mes
          )

          if (!fs.existsSync(pastaXml))
            fs.mkdirSync(pastaXml, { recursive: true })
          if (!fs.existsSync(pastaPdf))
            fs.mkdirSync(pastaPdf, { recursive: true })

          const baixar = async (urlParcial, destino) => {
            const fullUrl = `${baseUrl}${urlParcial}`
            const response = await axios.get(fullUrl, {
              responseType: 'stream',
            })
            const writer = fs.createWriteStream(destino)
            response.data.pipe(writer)
            return new Promise((resolve, reject) => {
              writer.on('finish', resolve)
              writer.on('error', reject)
            })
          }

          const xmlLocal = path.join(pastaXml, `nfe_${numeroFormatado}.xml`)
          const pdfLocal = path.join(pastaPdf, `nfe_${numeroFormatado}.pdf`)

          await baixar(dadosConsulta.caminho_xml_nota_fiscal, xmlLocal)
          await baixar(dadosConsulta.caminho_danfe, pdfLocal)

          await enviarParaDrive(
            xmlLocal,
            `NFe/xml/${ano}/${mes}/nfe_${numeroFormatado}.xml`
          )
          await enviarParaDrive(
            pdfLocal,
            `NFe/pdf/${ano}/${mes}/nfe_${numeroFormatado}.pdf`
          )

          const id = await obterIdArquivo(
            `gdrive:NFe/pdf/${ano}/${mes}`,
            `nfe_${numeroFormatado}.pdf`
          )
          const link = gerarLinkDrive(id)

          await db.query(
            `UPDATE nfe_historico SET link_danfe_drive = ? WHERE ref = ?`,
            [link, ref]
          )

          if (itensBrutos && itensBrutos.length > 0 && dadosConsulta.numero) {
            try {
              await db.query(
                `INSERT INTO nfe_itens (numero_nf, itens) VALUES (?, ?)`,
                [String(dadosConsulta.numero), JSON.stringify(itensBrutos)]
              )
              console.log(
                `Itens da NF ${dadosConsulta.numero} salvos na tabela nfe_itens com sucesso.`
              )
              await db.query(
                'INSERT INTO nfe_detalhes (numero_nf, chave_acesso, nfe_data) VALUES (?, ?, ?)',
                [
                  String(dadosConsulta.numero),
                  dadosConsulta.chave_nfe?.startsWith('NFe')
                    ? dadosConsulta.chave_nfe.substring(3) // remove o prefixo 'NFe'
                    : dadosConsulta.chave_nfe,
                  JSON.stringify(nfe),
                ]
              )

              console.log(
                `Itens e detalhes da NF ${dadosConsulta.numero} salvos com sucesso.`
              )
            } catch (err) {
              console.error(
                `Erro ao salvar itens/detalhes da NF ${dadosConsulta.numero}:`,
                err.message
              )
            }
          }
        } else if (tentativas < maxTentativas) {
          setTimeout(consultarENProcessar, 10000)
        }
      } catch (err) {
        console.error(`[EMITIR] Tentativa ${tentativas} falhou:`, err.message)
        if (tentativas < maxTentativas) setTimeout(consultarENProcessar, 10000)
      }
    }

    setTimeout(consultarENProcessar, 10000)
  } catch (error) {
    console.error('Erro ao emitir NFe:', error?.response?.data || error.message)

    const erroMsg = error.response?.data?.mensagem || 'Erro ao emitir NFe'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.getItensNfeByNumero = async (req, res) => {
  const { numero_nf } = req.params

  if (!numero_nf) {
    return res
      .status(400)
      .json({ error: 'O número da nota (numero_nf) é obrigatório.' })
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM nfe_itens WHERE numero_nf = ?',
      [numero_nf]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: `Nenhum item encontrado para a NF ${numero_nf}.` })
    }

    // Como o campo itens é JSON, vamos parsear antes de devolver
    const resultado = rows.map((row) => ({
      id: row.id,
      numero_nf: row.numero_nf,
      criado_em: row.criado_em,
      itens: typeof row.itens === 'string' ? JSON.parse(row.itens) : row.itens,
    }))

    res.status(200).json(resultado)
  } catch (error) {
    console.error(`Erro ao buscar itens da NF ${numero_nf}:`, error.message)
    res.status(500).json({ error: 'Erro interno ao buscar itens da NF.' })
  }
}
exports.getNfeDetalhesByNumero = async (req, res) => {
  const { numero_nf } = req.params

  if (!numero_nf) {
    return res
      .status(400)
      .json({ error: 'O número da nota (numero_nf) é obrigatório.' })
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM nfe_detalhes WHERE numero_nf = ?',
      [numero_nf]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: `Nenhum detalhe encontrado para a NF ${numero_nf}.` })
    }

    const resultado = rows.map((row) => ({
      id: row.id,
      numero_nf: row.numero_nf,
      chave_acesso: row.chave_acesso,
      criado_em: row.criado_em,
      nfe_data:
        typeof row.nfe_data === 'string'
          ? JSON.parse(row.nfe_data)
          : row.nfe_data, // já é objeto, não parseia
    }))

    res.status(200).json(resultado)
  } catch (error) {
    console.error(`Erro ao buscar detalhes da NF ${numero_nf}:`, error.message)
    res.status(500).json({ error: 'Erro interno ao buscar detalhes da NF.' })
  }
}
exports.salvarItensNfe = async (req, res) => {
  const { numero_nf, itens } = req.body

  if (!numero_nf || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({
      error: true,
      message: 'Número da NF e lista de itens são obrigatórios.',
    })
  }

  try {
    const insertQuery = `
          INSERT INTO nfe_itens (numero_nf, itens)
          VALUES (?, ?)
      `

    await db.query(insertQuery, [numero_nf, JSON.stringify(itens)])

    res.status(201).json({
      message: 'Itens da NFe salvos com sucesso.',
      numero_nf,
    })
  } catch (error) {
    console.error('Erro ao salvar itens da NFe:', error.message)
    res.status(500).json({
      error: true,
      message: 'Erro ao salvar itens da NFe.',
    })
  }
}
exports.verStatusNfe = async (req, res) => {
  const { ref } = req.params

  if (!ref) {
    return res.status(400).json({
      error: true,
      message: 'Referência (ref) não fornecida.',
    })
  }

  try {
    const url = `${baseUrl}/v2/nfe/${ref}?completa=1`

    const response = await axios.get(url, {
      auth: {
        username: tokenFocus,
        password: '',
      },
    })

    const data = response.data

    return res.status(200).json({
      message: 'Consulta simples realizada com sucesso.',
      status: data.status,
      status_sefaz: data.status_sefaz,
      mensagem_sefaz: data.mensagem_sefaz,
      numero: data.numero,
      serie: data.serie,
      chave_nfe: data.chave_nfe,
    })
  } catch (error) {
    console.error('[verStatusNfe] Erro ao consultar NFe:', error.message)
    return res.status(error?.response?.status || 500).json({
      error: true,
      message:
        error?.response?.data?.mensagem || 'Erro ao consultar status da NF-e',
    })
  }
}
exports.consultarNfe = async (req, res) => {
  const { ref } = req.params

  try {
    const url = `${baseUrl}/v2/nfe/${ref}?completa=1`

    const response = await axios.get(url, {
      auth: {
        username: tokenFocus,
        password: '',
      },
    })

    const data = response.data

    // Calcular ano, mês e número formatado
    const dataEmissao =
      data?.requisicao_nota_fiscal?.data_emissao ||
      data?.requisicao_nota_fiscal?.data_entrada_saida ||
      new Date().toISOString()

    const ano = new Date(dataEmissao).getFullYear()
    const mes = String(new Date(dataEmissao).getMonth() + 1).padStart(2, '0')
    const numeroFormatado = String(data.numero).padStart(8, '0')

    // Atualizar histórico no banco
    const updateQuery = `
      UPDATE nfe_historico
      SET
        status = ?,
        status_sefaz = ?,
        mensagem_sefaz = ?,
        chave_nfe = ?,
        numero = ?,
        serie = ?,
        cnpj_emitente = ?,
        caminho_xml_nota_fiscal = ?,
        caminho_danfe = ?,
        caminho_xml_cancelamento = ?,
        caminho_xml_carta_correcao = ?,
        caminho_pdf_carta_correcao = ?,
        numero_carta_correcao = ?,
        link_danfe_drive = ?
      WHERE ref = ?`

    let linkDanfeDrive = null

    const baixar = async (urlParcial, destino) => {
      const url = `${baseUrl}${urlParcial}`
      console.log(`[CONSULTA] Baixando: ${url}`)
      const response = await axios.get(url, { responseType: 'stream' })
      const writer = fs.createWriteStream(destino)
      response.data.pipe(writer)
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`[CONSULTA] Salvo: ${destino}`)
          resolve()
        })
        writer.on('error', reject)
      })
    }

    // XML + PDF principais
    if (
      data.status === 'autorizado' &&
      data.caminho_xml_nota_fiscal &&
      data.caminho_danfe
    ) {
      console.log(
        '[CONSULTA] Nota autorizada. Iniciando download de XML e PDF...'
      )

      const pastaXml = path.join(
        __dirname,
        '..',
        '..',
        'arquivos_nfe',
        'xml',
        ano.toString(),
        mes
      )
      const pastaPdf = path.join(
        __dirname,
        '..',
        '..',
        'arquivos_nfe',
        'pdf',
        ano.toString(),
        mes
      )

      if (!fs.existsSync(pastaXml)) fs.mkdirSync(pastaXml, { recursive: true })
      if (!fs.existsSync(pastaPdf)) fs.mkdirSync(pastaPdf, { recursive: true })

      const nomeXml = `nfe_${numeroFormatado}.xml`
      const nomePdf = `nfe_${numeroFormatado}.pdf`

      const localXml = path.join(pastaXml, nomeXml)
      const localPdf = path.join(pastaPdf, nomePdf)

      await baixar(data.caminho_xml_nota_fiscal, localXml)
      await baixar(data.caminho_danfe, localPdf)

      await enviarParaDrive(localXml, `NFe/xml/${ano}/${mes}/${nomeXml}`)
      await enviarParaDrive(localPdf, `NFe/pdf/${ano}/${mes}/${nomePdf}`)

      try {
        const idArquivo = await obterIdArquivo(
          `gdrive:NFe/pdf/${ano}/${mes}`,
          nomePdf
        )
        linkDanfeDrive = gerarLinkDrive(idArquivo)
        console.log(`[CONSULTA] Link DANFe no Drive: ${linkDanfeDrive}`)
      } catch (err) {
        console.warn(
          '[CONSULTA] Não foi possível gerar link público do PDF:',
          err.message
        )
      }
    } else {
      console.log(
        '[CONSULTA] NFe não autorizada ou sem arquivos principais disponíveis.'
      )
    }

    // XML de cancelamento
    if (data.caminho_xml_cancelamento) {
      const pastaCancel = path.join(
        __dirname,
        '..',
        '..',
        'arquivos_nfe',
        'xmls_cancelamento',
        ano.toString(),
        mes
      )
      if (!fs.existsSync(pastaCancel))
        fs.mkdirSync(pastaCancel, { recursive: true })

      const nomeCancelXml = `nfe_${numeroFormatado}-cancel.xml`
      const localCancel = path.join(pastaCancel, nomeCancelXml)

      try {
        await baixar(data.caminho_xml_cancelamento, localCancel)
        await enviarParaDrive(
          localCancel,
          `NFe/xmls_cancelamento/${ano}/${mes}/${nomeCancelXml}`
        )
        console.log(
          `✅ XML de Cancelamento enviado ao Drive: NFe/xmls_cancelamento/${ano}/${mes}/${nomeCancelXml}`
        )
      } catch (err) {
        console.error(
          '❌ Erro ao baixar/enviar XML de cancelamento:',
          err.message
        )
      }
    }

    await db.query(updateQuery, [
      data.status || null,
      data.status_sefaz || null,
      data.mensagem_sefaz || null,
      data.chave_nfe || null,
      data.numero || null,
      data.serie || null,
      data.cnpj_emitente || null,
      data.caminho_xml_nota_fiscal || null,
      data.caminho_danfe || null,
      data.caminho_xml_cancelamento || null,
      data.caminho_xml_carta_correcao || null,
      data.caminho_pdf_carta_correcao || null,
      data.numero_carta_correcao || null,
      linkDanfeDrive || null,
      ref,
    ])

    // Verificar se já existe detalhe da nota na tabela nfe_detalhes
    const [detalhesExistentes] = await db.query(
      'SELECT id FROM nfe_detalhes WHERE numero_nf = ? LIMIT 1',
      [data.numero]
    )

    if (detalhesExistentes.length === 0) {
      const numeroNF = String(data.numero)
      const chave = data.chave_nfe?.startsWith('NFe')
        ? data.chave_nfe.substring(3)
        : data.chave_nfe

      const corpoOriginal = data.requisicao_nota_fiscal || {}
      const itensEssenciais = (corpoOriginal.itens || []).map((item) => ({
        cfop: item.cfop,
        descricao: item.descricao,
        codigo_ncm: item.codigo_ncm,
        icms_origem: item.icms_origem,
        numero_item: item.numero_item,
        valor_bruto: item.valor_bruto,
        codigo_produto: item.codigo_produto,
        inclui_no_total: item.inclui_no_total,
        unidade_comercial: item.unidade_comercial,
        unidade_tributavel: item.unidade_tributavel,
        quantidade_comercial: item.quantidade_comercial,
        quantidade_tributavel: item.quantidade_tributavel,
        codigo_barras_comercial: item.codigo_barras_comercial,
        pis_situacao_tributaria: item.pis_situacao_tributaria,
        codigo_barras_tributavel: item.codigo_barras_tributavel,
        icms_situacao_tributaria: item.icms_situacao_tributaria,
        valor_unitario_comercial: item.valor_unitario_comercial,
        valor_unitario_tributavel: item.valor_unitario_tributavel,
        cofins_situacao_tributaria: item.cofins_situacao_tributaria,
      }))

      const nfeData = {
        itens: itensEssenciais,
        uf_emitente: corpoOriginal.uf_emitente,
        cep_emitente: corpoOriginal.cep_emitente,
        data_emissao: corpoOriginal.data_emissao,
        cnpj_emitente: corpoOriginal.cnpj_emitente,
        local_destino: corpoOriginal.local_destino,
        nome_emitente: corpoOriginal.nome_emitente,
        tipo_documento: corpoOriginal.tipo_documento,
        bairro_emitente: corpoOriginal.bairro_emitente,
        numero_emitente: corpoOriginal.numero_emitente,
        uf_destinatario: corpoOriginal.uf_destinatario,
        cep_destinatario: corpoOriginal.cep_destinatario,
        consumidor_final: corpoOriginal.consumidor_final,
        formas_pagamento: corpoOriginal.formas_pagamento,
        modalidade_frete: corpoOriginal.modalidade_frete,
        cnpj_destinatario: corpoOriginal.cnpj_destinatario,
        natureza_operacao: corpoOriginal.natureza_operacao,
        nome_destinatario: corpoOriginal.nome_destinatario,
        pais_destinatario: corpoOriginal.pais_destinatario,
        telefone_emitente: corpoOriginal.telefone_emitente,
        data_entrada_saida: corpoOriginal.data_entrada_saida,
        email_destinatario: corpoOriginal.email_destinatario,
        finalidade_emissao: corpoOriginal.finalidade_emissao,
        municipio_emitente: corpoOriginal.municipio_emitente,
        presenca_comprador: corpoOriginal.presenca_comprador,
        bairro_destinatario: corpoOriginal.bairro_destinatario,
        logradouro_emitente: corpoOriginal.logradouro_emitente,
        numero_destinatario: corpoOriginal.numero_destinatario,
        complemento_emitente: corpoOriginal.complemento_emitente,
        telefone_destinatario: corpoOriginal.telefone_destinatario,
        municipio_destinatario: corpoOriginal.municipio_destinatario,
        nome_fantasia_emitente: corpoOriginal.nome_fantasia_emitente,
        logradouro_destinatario: corpoOriginal.logradouro_destinatario,
        cnpj_responsavel_tecnico: corpoOriginal.cnpj_responsavel_tecnico,
        codigo_municipio_emitente: corpoOriginal.codigo_municipio_emitente,
        email_responsavel_tecnico: corpoOriginal.email_responsavel_tecnico,
        regime_tributario_emitente: corpoOriginal.regime_tributario_emitente,
        contato_responsavel_tecnico: corpoOriginal.contato_responsavel_tecnico,
        inscricao_estadual_emitente: corpoOriginal.inscricao_estadual_emitente,
        telefone_responsavel_tecnico:
          corpoOriginal.telefone_responsavel_tecnico,
        codigo_municipio_destinatario:
          corpoOriginal.codigo_municipio_destinatario,
        inscricao_estadual_destinatario:
          corpoOriginal.inscricao_estadual_destinatario,
        informacoes_adicionais_contribuinte:
          corpoOriginal.informacoes_adicionais_contribuinte,
        indicador_inscricao_estadual_destinatario:
          corpoOriginal.indicador_inscricao_estadual_destinatario,
      }

      await db.query(
        `INSERT INTO nfe_detalhes (numero_nf, chave_acesso, nfe_data) VALUES (?, ?, ?)`,
        [numeroNF, chave, JSON.stringify(nfeData)]
      )

      console.log(
        `[CONSULTA] Detalhes da NF ${numeroNF} (formato limpo) inseridos com sucesso`
      )
    } else {
      console.log(`[CONSULTA] NF ${data.numero} já possui detalhes salvos`)
    }

    return res.status(response.status).json({
      message: 'Consulta realizada com sucesso',
      dados: data,
    })
  } catch (error) {
    console.error(
      'Erro ao consultar NFe:',
      error?.response?.data || error.message
    )

    const erroMsg = error.response?.data?.mensagem || 'Erro ao consultar NFe'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.listarNfePaginadas = async (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1
  const limite = 50
  const offset = (pagina - 1) * limite

  const { status, cnpj, numero, ref, chave, dataInicio, dataFim } = req.query

  const filtros = []
  const valores = []

  // 📌 Filtros opcionais
  if (status) {
    filtros.push('status = ?')
    valores.push(status)
  }

  if (cnpj) {
    filtros.push('cnpj_emitente LIKE ?')
    valores.push(`%${cnpj}%`)
  }

  if (numero) {
    filtros.push('numero = ?')
    valores.push(numero)
  }

  if (ref) {
    filtros.push('ref = ?')
    valores.push(ref)
  }

  if (chave) {
    filtros.push('chave_nfe LIKE ?')
    valores.push(`%${chave}%`)
  }

  if (dataInicio && dataFim) {
    filtros.push('DATE(data_emissao) BETWEEN ? AND ?')
    valores.push(dataInicio, dataFim)
  } else if (dataInicio) {
    filtros.push('DATE(data_emissao) >= ?')
    valores.push(dataInicio)
  } else if (dataFim) {
    filtros.push('DATE(data_emissao) <= ?')
    valores.push(dataFim)
  }

  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : ''

  try {
    // 🔎 Consulta principal
    const [result] = await db.query(
      `SELECT * FROM nfe_historico ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...valores, limite, offset]
    )

    // 📊 Total para paginação
    const [totalResult] = await db.query(
      `SELECT COUNT(*) as total FROM nfe_historico ${whereClause}`,
      valores
    )

    const total = totalResult[0].total
    const totalPaginas = Math.ceil(total / limite)

    return res.status(200).json({
      paginaAtual: pagina,
      totalPaginas,
      totalRegistros: total,
      notas: result,
    })
  } catch (error) {
    console.error('❌ Erro ao listar NFe paginadas:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao buscar as NF-e',
    })
  }
}
exports.cancelarNfe = async (req, res) => {
  const tokenFocus = process.env.FOCUS_TOKEN
  const { ref } = req.params
  const { justificativa } = req.body

  if (
    !justificativa ||
    justificativa.length < 15 ||
    justificativa.length > 255
  ) {
    return res.status(400).json({
      error: true,
      message: 'A justificativa deve ter entre 15 e 255 caracteres.',
    })
  }

  try {
    const url = `${baseUrl}/v2/nfe/${ref}`

    const response = await axios.delete(url, {
      auth: {
        username: tokenFocus,
        password: '',
      },
      data: { justificativa },
    })

    const data = response.data

    const dataAtual = new Date()
    const ano = dataAtual.getFullYear().toString()
    const mes = String(dataAtual.getMonth() + 1).padStart(2, '0')

    // Buscar número real da nota no banco
    const [[nfeInfo]] = await db.query(
      'SELECT numero FROM nfe_historico WHERE ref = ? LIMIT 1',
      [ref]
    )

    const numeroNota = nfeInfo?.numero || '0'
    const numeroFormatado = String(numeroNota).padStart(8, '0')
    const nomeXmlCancel = `nfe_${numeroFormatado}-cancel.xml`
    const nomePdfCancel = `nfe_${numeroFormatado}.pdf`

    const pastaCancel = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'xmls_cancelamento',
      ano,
      mes
    )
    const pastaPdf = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'pdf',
      ano,
      mes
    )

    if (!fs.existsSync(pastaCancel))
      fs.mkdirSync(pastaCancel, { recursive: true })
    if (!fs.existsSync(pastaPdf)) fs.mkdirSync(pastaPdf, { recursive: true })

    const localXml = path.join(pastaCancel, nomeXmlCancel)
    const localPdf = path.join(pastaPdf, nomePdfCancel)

    const baixar = async (urlParcial, destino) => {
      const url = `${baseUrl}${urlParcial}`
      const response = await axios.get(url, { responseType: 'stream' })
      const writer = fs.createWriteStream(destino)
      response.data.pipe(writer)
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
    }

    let linkPublicoPdf = null

    try {
      if (data.caminho_xml_cancelamento) {
        await baixar(data.caminho_xml_cancelamento, localXml)
        await enviarParaDrive(
          localXml,
          `NFe/xmls_cancelamento/${ano}/${mes}/${nomeXmlCancel}`
        )
      }

      if (data.caminho_danfe) {
        await baixar(data.caminho_danfe, localPdf)
        await enviarParaDrive(
          localPdf,
          `NFe/pdf/${ano}/${mes}/${nomePdfCancel}`
        )

        const id = await obterIdArquivo(
          `gdrive:NFe/pdf/${ano}/${mes}`,
          nomePdfCancel
        )
        linkPublicoPdf = gerarLinkDrive(id)
      }

      console.log('✅ Arquivos de cancelamento enviados ao Drive.')
    } catch (err) {
      console.error(
        '❌ Erro ao baixar/enviar arquivos de cancelamento:',
        err.message
      )
    }

    // Atualizar histórico
    const updateQuery = `
      UPDATE nfe_historico
      SET
        status = ?,
        status_sefaz = ?,
        mensagem_sefaz = ?,
        caminho_xml_cancelamento = ?,
        link_danfe_drive = ?
      WHERE ref = ?`

    await db.query(updateQuery, [
      data.status || 'cancelado',
      data.status_sefaz || null,
      data.mensagem_sefaz || null,
      data.caminho_xml_cancelamento || null,
      linkPublicoPdf,
      ref,
    ])

    return res.status(response.status).json({
      message: 'Nota cancelada com sucesso',
      dados: data,
    })
  } catch (error) {
    console.error(
      'Erro ao cancelar NFe:',
      error?.response?.data || error.message
    )

    const erroMsg = error.response?.data?.mensagem || 'Erro ao cancelar NFe'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.inutilizarNfe = async (req, res) => {
  const tokenFocus = process.env.FOCUS_TOKEN
  const { cnpj, serie, numero_inicial, numero_final, justificativa } = req.body

  if (!cnpj || !serie || !numero_inicial || !numero_final || !justificativa) {
    return res.status(400).json({
      error: true,
      message: 'Todos os campos são obrigatórios.',
    })
  }

  if (justificativa.length < 15 || justificativa.length > 255) {
    return res.status(400).json({
      error: true,
      message: 'A justificativa deve ter entre 15 e 255 caracteres.',
    })
  }

  const ref = `inutil_${Date.now()}`

  try {
    const url = `${baseUrl}/v2/nfe/inutilizacao`

    const response = await axios.post(
      url,
      {
        cnpj,
        serie,
        numero_inicial,
        numero_final,
        justificativa,
      },
      {
        auth: {
          username: tokenFocus,
          password: '',
        },
      }
    )

    const data = response.data

    // Salvar no banco
    const insertQuery = `
        INSERT INTO nfe_inutilizadas (
          ref, serie, numero_inicial, numero_final, justificativa,
          status, status_sefaz, mensagem_sefaz, chave_autorizacao, cnpj_emitente
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

    await db.query(insertQuery, [
      ref,
      serie,
      numero_inicial,
      numero_final,
      justificativa,
      data.status || null,
      data.status_sefaz || null,
      data.mensagem_sefaz || null,
      data.chave_autorizacao || null,
      cnpj,
    ])

    return res.status(response.status).json({
      message: 'Faixa inutilizada com sucesso',
      dados: data,
    })
  } catch (error) {
    console.error(
      'Erro ao inutilizar faixa de NFe:',
      error?.response?.data || error.message
    )

    const erroMsg = error.response?.data?.mensagem || 'Erro ao inutilizar faixa'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.enviarEmailNfe = async (req, res) => {
  const tokenFocus = process.env.FOCUS_TOKEN
  const { ref } = req.params
  const { emails } = req.body

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({
      error: true,
      message: 'Informe ao menos um e-mail em formato de array.',
    })
  }

  try {
    const url = `${baseUrl}/v2/nfe/${ref}/email`

    const response = await axios.post(
      url,
      { emails },
      {
        auth: {
          username: tokenFocus,
          password: '',
        },
      }
    )

    return res.status(response.status).json({
      message: 'E-mail(s) enviado(s) com sucesso',
      dados: response.data,
    })
  } catch (error) {
    console.error(
      'Erro ao enviar NFe por e-mail:',
      error?.response?.data || error.message
    )

    const erroMsg =
      error.response?.data?.mensagem || 'Erro ao enviar por e-mail'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.cartaCorrecaoNfe = async (req, res) => {
  // const tokenFocus = process.env.FOCUS_TOKEN
  const { ref } = req.params
  const { correcao } = req.body

  if (!correcao || correcao.length < 15 || correcao.length > 1000) {
    return res.status(400).json({
      error: true,
      message: 'A correção deve ter entre 15 e 1000 caracteres.',
    })
  }

  try {
    const url = `${baseUrl}/v2/nfe/${ref}/carta_correcao`

    const response = await axios.post(
      url,
      { correcao },
      { auth: { username: tokenFocus, password: '' } }
    )

    const data = response.data

    const [[nfeInfo]] = await db.query(
      'SELECT numero FROM nfe_historico WHERE ref = ? LIMIT 1',
      [ref]
    )

    const numeroNota = nfeInfo?.numero || '0'
    const numeroFormatado = String(numeroNota).padStart(8, '0')
    const numeroCce = data.numero_carta_correcao || 1
    const ano = new Date().getFullYear()
    const mes = String(new Date().getMonth() + 1).padStart(2, '0')

    const nomeXml = `nfe_${numeroFormatado}-cce-${numeroCce}.xml`
    const nomePdf = `nfe_${numeroFormatado}-cce-${numeroCce}.pdf`

    const pastaXml = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'cce',
      'xml',
      `${ano}`,
      `${mes}`
    )
    const pastaPdf = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'cce',
      'pdf',
      `${ano}`,
      `${mes}`
    )

    if (!fs.existsSync(pastaXml)) fs.mkdirSync(pastaXml, { recursive: true })
    if (!fs.existsSync(pastaPdf)) fs.mkdirSync(pastaPdf, { recursive: true })

    const localXml = path.join(pastaXml, nomeXml)
    const localPdf = path.join(pastaPdf, nomePdf)

    const baixar = async (urlParcial, destino) => {
      const url = `${baseUrl}${urlParcial}`
      const response = await axios.get(url, { responseType: 'stream' })
      const writer = fs.createWriteStream(destino)
      response.data.pipe(writer)
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
    }

    let linkPdfDrive = null

    try {
      if (data.caminho_xml_carta_correcao) {
        await baixar(data.caminho_xml_carta_correcao, localXml)
        await enviarParaDrive(localXml, `NFe/cce/xml/${ano}/${mes}/${nomeXml}`)
      }

      if (data.caminho_pdf_carta_correcao) {
        await baixar(data.caminho_pdf_carta_correcao, localPdf)
        await enviarParaDrive(localPdf, `NFe/cce/pdf/${ano}/${mes}/${nomePdf}`)

        const id = await obterIdArquivo(
          `gdrive:NFe/cce/pdf/${ano}/${mes}`,
          nomePdf
        )
        linkPdfDrive = gerarLinkDrive(id)
      }

      console.log('✅ Arquivos da CCe enviados ao Drive.')
    } catch (err) {
      console.error('❌ Erro ao baixar/enviar arquivos da CCe:', err.message)
    }

    // Atualizar histórico
    const updateQuery = `
      UPDATE nfe_historico
      SET
        caminho_xml_carta_correcao = ?,
        caminho_pdf_carta_correcao = ?,
        numero_carta_correcao = ?,
        link_carta_correcao_drive = ?
      WHERE ref = ?`

    await db.query(updateQuery, [
      data.caminho_xml_carta_correcao || null,
      data.caminho_pdf_carta_correcao || null,
      numeroCce,
      linkPdfDrive,
      ref,
    ])

    return res.status(response.status).json({
      message: 'Carta de correção emitida com sucesso',
      dados: data,
    })
  } catch (error) {
    console.error('Erro ao emitir CCe:', error?.response?.data || error.message)
    const erroMsg =
      error.response?.data?.mensagem || 'Erro ao emitir carta de correção'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({ error: true, message: erroMsg })
  }
}
exports.downloadArquivosNfe = async (req, res) => {
  const { ref } = req.params

  try {
    const [result] = await db.query(
      'SELECT caminho_xml_nota_fiscal, caminho_danfe, numero, data_emissao FROM nfe_historico WHERE ref = ?',
      [ref]
    )

    if (result.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'NFe não encontrada' })
    }

    const { caminho_xml_nota_fiscal, caminho_danfe, numero, data_emissao } =
      result[0]

    if (!caminho_xml_nota_fiscal || !caminho_danfe) {
      return res.status(400).json({
        error: true,
        message: 'Caminhos de arquivos não encontrados para esta NFe',
      })
    }

    const ambiente = baseUrl
    const ano = new Date(data_emissao).getFullYear()
    const mes = String(new Date(data_emissao).getMonth() + 1).padStart(2, '0')
    const numeroFormatado = String(numero).padStart(8, '0')

    const pastaXml = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'xml',
      `${ano}`,
      `${mes}`
    )
    const pastaPdf = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'pdf',
      `${ano}`,
      `${mes}`
    )

    if (!fs.existsSync(pastaXml)) fs.mkdirSync(pastaXml, { recursive: true })
    if (!fs.existsSync(pastaPdf)) fs.mkdirSync(pastaPdf, { recursive: true })

    const baixar = async (urlParcial, destino) => {
      const url = `${ambiente}${urlParcial}`
      const response = await axios.get(url, { responseType: 'stream' })
      const writer = fs.createWriteStream(destino)
      response.data.pipe(writer)
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
    }

    const arquivoXml = path.join(pastaXml, `nfe_${numeroFormatado}.xml`)
    const arquivoPdf = path.join(pastaPdf, `nfe_${numeroFormatado}.pdf`)

    await baixar(caminho_xml_nota_fiscal, arquivoXml)
    await baixar(caminho_danfe, arquivoPdf)

    return res.status(200).json({
      message: 'Arquivos baixados com sucesso',
      arquivos: {
        xml: arquivoXml,
        pdf: arquivoPdf,
      },
    })
  } catch (error) {
    console.error('Erro ao baixar arquivos da NFe:', error.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao baixar arquivos' })
  }
}
exports.sincronizarPendentes = async (req, res) => {
  const tokenFocus = process.env.FOCUS_TOKEN

  try {
    const [notasPendentes] = await db.query(`
        SELECT ref
        FROM nfe_historico
        WHERE status = 'processando_autorizacao'
        `)

    if (notasPendentes.length === 0) {
      return res
        .status(200)
        .json({ message: 'Nenhuma NFe pendente de autorização.' })
    }

    const ambiente = `${baseUrl}`

    for (const { ref } of notasPendentes) {
      console.log(`⏳ Verificando NFe ${ref}...`)

      const url = `${ambiente}/v2/nfe/${ref}?completa=1`

      try {
        const response = await axios.get(url, {
          auth: { username: tokenFocus, password: '' },
        })

        const data = response.data

        if (
          data.status === 'autorizado' &&
          data.caminho_xml_nota_fiscal &&
          data.caminho_danfe
        ) {
          console.log(`✅ ${ref} autorizada. Salvando arquivos...`)

          const dataEmissao =
            data?.requisicao_nota_fiscal?.data_emissao ||
            data?.requisicao_nota_fiscal?.data_entrada_saida ||
            new Date().toISOString()

          const ano = new Date(dataEmissao).getFullYear()
          const mes = String(new Date(dataEmissao).getMonth() + 1).padStart(
            2,
            '0'
          )
          const numeroFormatado = String(data.numero).padStart(8, '0')

          const pastaXml = path.join(
            __dirname,
            '..',
            '..',
            'arquivos_nfe',
            'xml',
            `${ano}`,
            `${mes}`
          )
          const pastaPdf = path.join(
            __dirname,
            '..',
            '..',
            'arquivos_nfe',
            'pdf',
            `${ano}`,
            `${mes}`
          )

          if (!fs.existsSync(pastaXml))
            fs.mkdirSync(pastaXml, { recursive: true })
          if (!fs.existsSync(pastaPdf))
            fs.mkdirSync(pastaPdf, { recursive: true })

          const baixar = async (urlParcial, destino) => {
            const fullUrl = `${ambiente}${urlParcial}`
            const response = await axios.get(fullUrl, {
              responseType: 'stream',
            })
            const writer = fs.createWriteStream(destino)
            response.data.pipe(writer)
            return new Promise((resolve, reject) => {
              writer.on('finish', resolve)
              writer.on('error', reject)
            })
          }

          await baixar(
            data.caminho_xml_nota_fiscal,
            path.join(pastaXml, `nfe_${numeroFormatado}.xml`)
          )
          await baixar(
            data.caminho_danfe,
            path.join(pastaPdf, `nfe_${numeroFormatado}.pdf`)
          )

          await db.query(
            `
            UPDATE nfe_historico
              SET status = ?, status_sefaz = ?, mensagem_sefaz = ?, numero = ?, serie = ?, chave_nfe = ?,
              caminho_xml_nota_fiscal = ?, caminho_danfe = ?
              WHERE ref = ?
            `,
            [
              data.status,
              data.status_sefaz || null,
              data.mensagem_sefaz || null,
              data.numero || null,
              data.serie || null,
              data.chave_nfe || null,
              data.caminho_xml_nota_fiscal || null,
              data.caminho_danfe || null,
              ref,
            ]
          )
        } else {
          console.log(`🔄 ${ref} ainda em processamento.`)
        }
      } catch (err) {
        console.warn(
          `❌ Erro ao consultar ${ref}:`,
          err?.response?.data?.mensagem || err.message
        )
      }
    }

    return res.status(200).json({
      message: 'Processo de verificação concluído',
      notas_verificadas: notasPendentes.length,
    })
  } catch (error) {
    console.error('Erro geral na sincronização:', error)
    return res.status(500).json({
      error: true,
      message: 'Erro ao sincronizar NFes pendentes',
    })
  }
}
exports.baixarCartasCorrecao = async (req, res) => {
  const tokenFocus = process.env.FOCUS_TOKEN
  const { ref } = req.params

  try {
    const [result] = await db.query(
      'SELECT numero, data_emissao, caminho_pdf_carta_correcao, caminho_xml_carta_correcao, numero_carta_correcao FROM nfe_historico WHERE ref = ?',
      [ref]
    )

    if (result.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nota não encontrada no histórico' })
    }

    const {
      numero,
      data_emissao,
      caminho_pdf_carta_correcao,
      caminho_xml_carta_correcao,
      numero_carta_correcao,
    } = result[0]

    if (
      !numero_carta_correcao ||
      !caminho_pdf_carta_correcao ||
      !caminho_xml_carta_correcao
    ) {
      return res.status(400).json({
        error: true,
        message: 'Nenhuma carta de correção encontrada para esta NFe',
      })
    }

    const ambiente = baseUrl
    const ano = new Date(data_emissao).getFullYear()
    const mes = String(new Date(data_emissao).getMonth() + 1).padStart(2, '0')
    const numeroFormatado = String(numero).padStart(8, '0')

    const pastaPdf = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'cce',
      'pdf',
      ano.toString(),
      mes
    )
    const pastaXml = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'cce',
      'xml',
      ano.toString(),
      mes
    )

    if (!fs.existsSync(pastaPdf)) fs.mkdirSync(pastaPdf, { recursive: true })
    if (!fs.existsSync(pastaXml)) fs.mkdirSync(pastaXml, { recursive: true })

    const baixar = async (urlParcial, destino) => {
      const fullUrl = `${ambiente}${urlParcial}`
      const response = await axios.get(fullUrl, { responseType: 'stream' })
      const writer = fs.createWriteStream(destino)
      response.data.pipe(writer)
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
    }

    // Baixar todas as versões
    const downloads = []
    for (let i = 1; i <= numero_carta_correcao; i++) {
      const xmlPath = caminho_xml_carta_correcao.replace(
        /cce-\d+\.xml/,
        `cce-${i.toString().padStart(2, '0')}.xml`
      )
      const pdfPath = caminho_pdf_carta_correcao.replace(
        /\/\d+\.pdf/,
        `/${i}.pdf`
      )

      const destinoXml = path.join(
        pastaXml,
        `nfe_${numeroFormatado}_cce${i}.xml`
      )
      const destinoPdf = path.join(
        pastaPdf,
        `nfe_${numeroFormatado}_cce${i}.pdf`
      )

      downloads.push(baixar(xmlPath, destinoXml))
      downloads.push(baixar(pdfPath, destinoPdf))
    }

    await Promise.all(downloads)

    return res.status(200).json({
      message: `Cartas de correção (${numero_carta_correcao}) salvas com sucesso`,
      arquivos: {
        xml: pastaXml,
        pdf: pastaPdf,
      },
    })
  } catch (error) {
    console.error('Erro ao baixar cartas de correção:', error.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao baixar cartas de correção' })
  }
}
exports.compactarArquivosPorMes = async (req, res) => {
  const { ano, mes } = req.params

  try {
    const anoStr = String(ano)
    const mesStr = String(mes).padStart(2, '0')

    const pastaXml = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'xml',
      anoStr,
      mesStr
    )
    const pastaPdf = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'pdf',
      anoStr,
      mesStr
    )
    const pastaZip = path.join(__dirname, '..', '..', 'arquivos_nfe', 'zip')

    if (!fs.existsSync(pastaZip)) fs.mkdirSync(pastaZip, { recursive: true })

    const caminhoZip = path.join(pastaZip, `nfe_${anoStr}_${mesStr}.zip`)
    const output = fs.createWriteStream(caminhoZip)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(
        `[ZIP] Arquivo gerado: ${caminhoZip} (${archive.pointer()} bytes)`
      )
      return res.status(200).json({
        message: 'Zip criado com sucesso',
        arquivo: caminhoZip,
      })
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(output)

    if (fs.existsSync(pastaXml)) archive.directory(pastaXml, `xml`)
    if (fs.existsSync(pastaPdf)) archive.directory(pastaPdf, `pdf`)

    await archive.finalize()
  } catch (error) {
    console.error('Erro ao gerar zip:', error.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao compactar arquivos' })
  }
}
exports.relatorioMensalNfe = async (req, res) => {
  const { ano, mes } = req.params
  const anoStr = String(ano)
  const mesStr = String(mes).padStart(2, '0')

  try {
    const inicio = `${anoStr}-${mesStr}-01`
    const proximoMes =
      mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${anoStr}-${String(Number(mes) + 1).padStart(2, '0')}-01`

    // Emitidas (autorizadas/canceladas/rejeitadas)
    const [emitidas] = await db.query(
      `
        SELECT numero, ref, status, status_sefaz, mensagem_sefaz
        FROM nfe_historico
        WHERE data_emissao >= ? AND data_emissao < ?
      `,
      [inicio, proximoMes]
    )

    // Inutilizadas
    const [inutilizadas] = await db.query(
      `
        SELECT numero_inicial, numero_final
        FROM nfe_inutilizadas
        WHERE data_inutilizacao >= ? AND data_inutilizacao < ?
      `,
      [inicio, proximoMes]
    )

    // Agrupar todas as numerações utilizadas
    const usados = emitidas
      .map((n) => Number(n.numero))
      .filter((n) => !isNaN(n))
    inutilizadas.forEach(({ numero_inicial, numero_final }) => {
      for (let i = numero_inicial; i <= numero_final; i++) usados.push(i)
    })

    const usadosSet = new Set(usados)
    const minNum = Math.min(...usados)
    const maxNum = Math.max(...usados)

    const faltantes = []
    for (let i = minNum; i <= maxNum; i++) {
      if (!usadosSet.has(i)) faltantes.push(i)
    }

    return res.status(200).json({
      periodo: `${mesStr}/${anoStr}`,
      emitidas,
      inutilizadas,
      faltantes,
      totais: {
        emitidas: emitidas.length,
        inutilizadas: inutilizadas.length,
        faltantes: faltantes.length,
      },
    })
  } catch (error) {
    console.error('Erro ao gerar relatório:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao gerar relatório de NFes',
    })
  }
}
exports.gerarRelatorioPdf = async (req, res) => {
  const { ano, mes } = req.params
  const anoStr = String(ano)
  const mesStr = String(mes).padStart(2, '0')

  try {
    const inicio = `${anoStr}-${mesStr}-01`
    const fim =
      mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${anoStr}-${String(Number(mes) + 1).padStart(2, '0')}-01`

    const [emitidas] = await db.query(
      `
        SELECT numero, ref, status, status_sefaz, mensagem_sefaz
        FROM nfe_historico
        WHERE data_emissao >= ? AND data_emissao < ?
      `,
      [inicio, fim]
    )

    const [inutilizadas] = await db.query(
      `
        SELECT numero_inicial, numero_final, justificativa
        FROM nfe_inutilizadas
        WHERE data_inutilizacao >= ? AND data_inutilizacao < ?
      `,
      [inicio, fim]
    )

    const usados = emitidas
      .map((n) => Number(n.numero))
      .filter((n) => !isNaN(n))
    inutilizadas.forEach(({ numero_inicial, numero_final }) => {
      for (let i = numero_inicial; i <= numero_final; i++) usados.push(i)
    })

    const usadosSet = new Set(usados)
    const minNum = Math.min(...usados)
    const maxNum = Math.max(...usados)
    const faltantes = []
    for (let i = minNum; i <= maxNum; i++) {
      if (!usadosSet.has(i)) faltantes.push(i)
    }

    const pastaRelatorios = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'relatorios',
      'pdf'
    )
    if (!fs.existsSync(pastaRelatorios))
      fs.mkdirSync(pastaRelatorios, { recursive: true })

    const caminhoArquivo = path.join(
      pastaRelatorios,
      `relatorio_nfe_${anoStr}_${mesStr}.pdf`
    )
    const doc = new PDFDocument()

    doc.pipe(fs.createWriteStream(caminhoArquivo))

    doc
      .fontSize(18)
      .text(`Relatório de NF-e - ${mesStr}/${anoStr}`, { align: 'center' })
      .moveDown(1.5)

    // Emitidas
    doc.fontSize(14).text('Notas Emitidas:', { underline: true }).moveDown(0.5)
    emitidas.forEach((nota) => {
      doc
        .fontSize(10)
        .text(
          `Nº ${nota.numero} - ${nota.status} (${nota.status_sefaz}): ${nota.mensagem_sefaz}`
        )
    })
    doc.moveDown(1)

    // Inutilizadas
    doc
      .fontSize(14)
      .text('Faixas Inutilizadas:', { underline: true })
      .moveDown(0.5)
    inutilizadas.forEach((item) => {
      doc
        .fontSize(10)
        .text(
          `De ${item.numero_inicial} a ${item.numero_final} - Justificativa: ${item.justificativa}`
        )
    })
    doc.moveDown(1)

    // Faltantes
    doc.fontSize(14).text('Notas Faltantes:', { underline: true }).moveDown(0.5)
    if (faltantes.length) {
      doc.fontSize(10).text(faltantes.join(', '))
    } else {
      doc.fontSize(10).text('Nenhuma nota faltante.')
    }

    // Totais
    doc.moveDown(2)
    doc.fontSize(12).text(`Totais:`)
    doc
      .fontSize(10)
      .list([
        `Emitidas: ${emitidas.length}`,
        `Inutilizadas: ${inutilizadas.length}`,
        `Faltantes: ${faltantes.length}`,
      ])

    doc.end()

    return res.status(200).json({
      message: 'Relatório PDF gerado com sucesso',
      caminho: caminhoArquivo,
    })
  } catch (error) {
    console.error('Erro ao gerar relatório PDF:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao gerar PDF',
    })
  }
}
exports.gerarRelatorioPdfDownload = async (req, res) => {
  const { ano, mes } = req.params
  const anoStr = String(ano)
  const mesStr = String(mes).padStart(2, '0')

  try {
    const inicio = `${anoStr}-${mesStr}-01`
    const fim =
      mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${anoStr}-${String(Number(mes) + 1).padStart(2, '0')}-01`

    const [emitidas] = await db.query(
      `
        SELECT numero, ref, status, status_sefaz, mensagem_sefaz
        FROM nfe_historico
        WHERE data_emissao >= ? AND data_emissao < ?
      `,
      [inicio, fim]
    )

    const [inutilizadas] = await db.query(
      `
        SELECT numero_inicial, numero_final, justificativa
        FROM nfe_inutilizadas
        WHERE data_inutilizacao >= ? AND data_inutilizacao < ?
      `,
      [inicio, fim]
    )

    const usados = emitidas
      .map((n) => Number(n.numero))
      .filter((n) => !isNaN(n))
    inutilizadas.forEach(({ numero_inicial, numero_final }) => {
      for (let i = numero_inicial; i <= numero_final; i++) usados.push(i)
    })

    const usadosSet = new Set(usados)
    const minNum = Math.min(...usados)
    const maxNum = Math.max(...usados)
    const faltantes = []
    for (let i = minNum; i <= maxNum; i++) {
      if (!usadosSet.has(i)) faltantes.push(i)
    }

    const nomeArquivo = `relatorio_nfe_${anoStr}_${mesStr}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeArquivo}"`
    )

    const doc = new PDFDocument()
    doc.pipe(res)

    doc
      .fontSize(18)
      .text(`Relatório de NF-e - ${mesStr}/${anoStr}`, { align: 'center' })
      .moveDown(1.5)

    doc.fontSize(14).text('Notas Emitidas:', { underline: true }).moveDown(0.5)
    emitidas.forEach((nota) => {
      doc
        .fontSize(10)
        .text(
          `Nº ${nota.numero} - ${nota.status} (${nota.status_sefaz}): ${nota.mensagem_sefaz}`
        )
    })
    doc.moveDown(1)

    doc
      .fontSize(14)
      .text('Faixas Inutilizadas:', { underline: true })
      .moveDown(0.5)
    inutilizadas.forEach((i) => {
      doc
        .fontSize(10)
        .text(
          `De ${i.numero_inicial} a ${i.numero_final} - Justificativa: ${i.justificativa}`
        )
    })
    doc.moveDown(1)

    doc.fontSize(14).text('Notas Faltantes:', { underline: true }).moveDown(0.5)
    doc.fontSize(10).text(faltantes.length ? faltantes.join(', ') : 'Nenhuma.')

    doc.moveDown(2)
    doc.fontSize(12).text(`Totais:`)
    doc
      .fontSize(10)
      .list([
        `Emitidas: ${emitidas.length}`,
        `Inutilizadas: ${inutilizadas.length}`,
        `Faltantes: ${faltantes.length}`,
      ])

    doc.end()
  } catch (error) {
    console.error('Erro ao gerar PDF download:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao gerar PDF para download',
    })
  }
}
exports.gerarRelatorioExcel = async (req, res) => {
  const { ano, mes } = req.params
  const anoStr = String(ano)
  const mesStr = String(mes).padStart(2, '0')

  try {
    const inicio = `${anoStr}-${mesStr}-01`
    const fim =
      mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${anoStr}-${String(Number(mes) + 1).padStart(2, '0')}-01`

    const [emitidas] = await db.query(
      `
        SELECT numero, ref, status, status_sefaz, mensagem_sefaz
        FROM nfe_historico
        WHERE data_emissao >= ? AND data_emissao < ?
      `,
      [inicio, fim]
    )

    const [inutilizadas] = await db.query(
      `
        SELECT numero_inicial, numero_final, justificativa
        FROM nfe_inutilizadas
        WHERE data_inutilizacao >= ? AND data_inutilizacao < ?
      `,
      [inicio, fim]
    )

    const usados = emitidas
      .map((n) => Number(n.numero))
      .filter((n) => !isNaN(n))
    inutilizadas.forEach(({ numero_inicial, numero_final }) => {
      for (let i = numero_inicial; i <= numero_final; i++) usados.push(i)
    })

    const usadosSet = new Set(usados)
    const minNum = Math.min(...usados)
    const maxNum = Math.max(...usados)
    const faltantes = []
    for (let i = minNum; i <= maxNum; i++) {
      if (!usadosSet.has(i)) faltantes.push(i)
    }

    const pastaExcel = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfe',
      'relatorios',
      'excel'
    )
    if (!fs.existsSync(pastaExcel))
      fs.mkdirSync(pastaExcel, { recursive: true })

    const caminhoArquivo = path.join(
      pastaExcel,
      `relatorio_nfe_${anoStr}_${mesStr}.xlsx`
    )
    const workbook = new ExcelJS.Workbook()

    // Aba 1 – Emitidas
    const abaEmitidas = workbook.addWorksheet('Emitidas')
    abaEmitidas.columns = [
      { header: 'Número', key: 'numero', width: 10 },
      { header: 'Referência', key: 'ref', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Status SEFAZ', key: 'status_sefaz', width: 15 },
      { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 50 },
    ]
    emitidas.forEach((nota) => abaEmitidas.addRow(nota))

    // Aba 2 – Inutilizadas
    const abaInutilizadas = workbook.addWorksheet('Inutilizadas')
    abaInutilizadas.columns = [
      { header: 'Número Inicial', key: 'numero_inicial', width: 15 },
      { header: 'Número Final', key: 'numero_final', width: 15 },
      { header: 'Justificativa', key: 'justificativa', width: 60 },
    ]
    inutilizadas.forEach((i) => abaInutilizadas.addRow(i))

    // Aba 3 – Faltantes
    const abaFaltantes = workbook.addWorksheet('Faltantes')
    abaFaltantes.columns = [
      { header: 'Número Faltante', key: 'num', width: 15 },
    ]
    faltantes.forEach((n) => abaFaltantes.addRow({ num: n }))

    await workbook.xlsx.writeFile(caminhoArquivo)

    return res.status(200).json({
      message: 'Relatório Excel gerado com sucesso',
      caminho: caminhoArquivo,
    })
  } catch (error) {
    console.error('Erro ao gerar Excel:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao gerar relatório em Excel',
    })
  }
}
exports.gerarRelatorioExcelDownload = async (req, res) => {
  const { ano, mes } = req.params
  const anoStr = String(ano)
  const mesStr = String(mes).padStart(2, '0')

  try {
    const inicio = `${anoStr}-${mesStr}-01`
    const fim =
      mes === '12'
        ? `${Number(ano) + 1}-01-01`
        : `${anoStr}-${String(Number(mes) + 1).padStart(2, '0')}-01`

    const [emitidas] = await db.query(
      `
        SELECT numero, ref, status, status_sefaz, mensagem_sefaz
        FROM nfe_historico
        WHERE data_emissao >= ? AND data_emissao < ?
      `,
      [inicio, fim]
    )

    const [inutilizadas] = await db.query(
      `
        SELECT numero_inicial, numero_final, justificativa
        FROM nfe_inutilizadas
        WHERE data_inutilizacao >= ? AND data_inutilizacao < ?
      `,
      [inicio, fim]
    )

    const usados = emitidas
      .map((n) => Number(n.numero))
      .filter((n) => !isNaN(n))
    inutilizadas.forEach(({ numero_inicial, numero_final }) => {
      for (let i = numero_inicial; i <= numero_final; i++) usados.push(i)
    })

    const usadosSet = new Set(usados)
    const minNum = Math.min(...usados)
    const maxNum = Math.max(...usados)
    const faltantes = []
    for (let i = minNum; i <= maxNum; i++) {
      if (!usadosSet.has(i)) faltantes.push(i)
    }

    const workbook = new ExcelJS.Workbook()

    // Aba Emitidas
    const abaEmitidas = workbook.addWorksheet('Emitidas')
    abaEmitidas.columns = [
      { header: 'Número', key: 'numero', width: 10 },
      { header: 'Referência', key: 'ref', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Status SEFAZ', key: 'status_sefaz', width: 15 },
      { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 50 },
    ]
    emitidas.forEach((nota) => abaEmitidas.addRow(nota))

    // Aba Inutilizadas
    const abaInutilizadas = workbook.addWorksheet('Inutilizadas')
    abaInutilizadas.columns = [
      { header: 'Número Inicial', key: 'numero_inicial', width: 15 },
      { header: 'Número Final', key: 'numero_final', width: 15 },
      { header: 'Justificativa', key: 'justificativa', width: 60 },
    ]
    inutilizadas.forEach((i) => abaInutilizadas.addRow(i))

    // Aba Faltantes
    const abaFaltantes = workbook.addWorksheet('Faltantes')
    abaFaltantes.columns = [
      { header: 'Número Faltante', key: 'num', width: 15 },
    ]
    faltantes.forEach((n) => abaFaltantes.addRow({ num: n }))

    const nomeArquivo = `relatorio_nfe_${anoStr}_${mesStr}.xlsx`

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeArquivo}"`
    )

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Erro ao gerar download do Excel:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao gerar relatório Excel para download',
    })
  }
}
exports.adicionarNaturezaOperacao = async (req, res) => {
  const {
    descricao,
    natureza_operacao,
    cfop,
    tipo_documento,
    finalidade_emissao,
    local_destino,
    presenca_comprador,
  } = req.body

  if (!descricao || !natureza_operacao || !cfop || !tipo_documento) {
    return res.status(400).json({
      error: true,
      message:
        'Campos obrigatórios: descricao, natureza_operacao, cfop, tipo_documento',
    })
  }

  try {
    const insertQuery = `
      INSERT INTO naturezas_operacao (
        descricao, natureza_operacao, cfop, tipo_documento,
        finalidade_emissao, local_destino, presenca_comprador
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `

    await db.query(insertQuery, [
      descricao,
      natureza_operacao,
      cfop,
      tipo_documento,
      finalidade_emissao || '1',
      local_destino || '1',
      presenca_comprador || '9',
    ])

    res
      .status(201)
      .json({ message: 'Natureza de operação cadastrada com sucesso' })
  } catch (error) {
    console.error('Erro ao adicionar natureza de operação:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao adicionar natureza de operação' })
  }
}
exports.listarNaturezasOperacao = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM naturezas_operacao ORDER BY id DESC'
    )
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao listar naturezas de operação:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao listar naturezas de operação' })
  }
}
exports.buscarNaturezaPorId = async (req, res) => {
  const { id } = req.params

  try {
    const [rows] = await db.query(
      'SELECT * FROM naturezas_operacao WHERE id = ?',
      [id]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Natureza de operação não encontrada' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar natureza:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar natureza de operação' })
  }
}
exports.atualizarNaturezaOperacao = async (req, res) => {
  const { id } = req.params
  const {
    descricao,
    natureza_operacao,
    cfop,
    tipo_documento,
    finalidade_emissao,
    local_destino,
    presenca_comprador,
  } = req.body

  if (!descricao || !natureza_operacao || !cfop || !tipo_documento) {
    return res.status(400).json({
      error: true,
      message:
        'Campos obrigatórios ausentes: descricao, natureza_operacao, cfop, tipo_documento',
    })
  }

  try {
    const updateQuery = `
      UPDATE naturezas_operacao
      SET descricao = ?, natureza_operacao = ?, cfop = ?, tipo_documento = ?,
          finalidade_emissao = ?, local_destino = ?, presenca_comprador = ?
      WHERE id = ?
    `

    const [result] = await db.query(updateQuery, [
      descricao,
      natureza_operacao,
      cfop,
      tipo_documento,
      finalidade_emissao || '1',
      local_destino || '1',
      presenca_comprador || '9',
      id,
    ])

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Natureza de operação não encontrada' })
    }

    res
      .status(200)
      .json({ message: 'Natureza de operação atualizada com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar natureza de operação:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao atualizar natureza de operação' })
  }
}
exports.listarDestinatarios = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM destinatarios')
    res.json(rows)
  } catch (error) {
    console.error('Erro ao listar destinatários:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao listar destinatários' })
  }
}
exports.buscarDestinatarioPorId = async (req, res) => {
  const { id } = req.params
  console.log('[BUSCA DESTINATÁRIO POR ID]', { id })

  try {
    const [rows] = await db.query('SELECT * FROM destinatarios WHERE id = ?', [
      id,
    ])

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Destinatário não encontrado' })
    }

    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar destinatário por ID:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar destinatário' })
  }
}
exports.buscarDestinatarioRetornoPorId = async (req, res) => {
  const { id } = req.params
  console.log('[BUSCA DESTINATÁRIO POR ID]', { id })

  try {
    const [rows] = await db.query(
      'SELECT * FROM destinatarios_retorno WHERE id = ?',
      [id]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Destinatário não encontrado' })
    }

    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar destinatário por ID:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar destinatário' })
  }
}
exports.buscarDestinatario = async (req, res) => {
  const { cpf, cnpj } = req.query

  if (!cpf && !cnpj) {
    return res.status(400).json({
      error: true,
      message: 'Informe o CPF ou CNPJ para busca',
    })
  }

  try {
    const campo = cpf ? 'cpf' : 'cnpj'
    const valor = (cpf || cnpj).replace(/\D/g, '')

    console.log('[BUSCA DESTINATÁRIO]', { campo, valor })

    const [rows] = await db.query(
      `SELECT * FROM destinatarios WHERE ${campo} = ?`,
      [valor]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Destinatário não encontrado' })
    }

    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar destinatário:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar destinatário' })
  }
}
exports.adicionarDestinatario = async (req, res) => {
  const {
    cpf,
    cnpj,
    nome,
    logradouro,
    numero,
    bairro,
    municipio,
    uf,
    cep,
    telefone,
    indicador_ie,
    inscricao_estadual,
    email,
  } = req.body

  if (!nome) {
    return res
      .status(400)
      .json({ error: true, message: 'O campo nome é obrigatório' })
  }

  try {
    const insertQuery = `
      INSERT INTO destinatarios (
        cpf, cnpj, nome, logradouro, numero, bairro,
        municipio, uf, cep, telefone, indicador_ie,
        inscricao_estadual, email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    await db.query(insertQuery, [
      cpf || null,
      cnpj || null,
      nome,
      logradouro || null,
      numero || null,
      bairro || null,
      municipio || null,
      uf || null,
      cep || null,
      telefone || null,
      indicador_ie || null,
      inscricao_estadual || null,
      email || null,
    ])

    res.status(201).json({ message: 'Destinatário cadastrado com sucesso' })
  } catch (error) {
    console.error('Erro ao cadastrar destinatário:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao cadastrar destinatário' })
  }
}
exports.atualizarDestinatario = async (req, res) => {
  const { id } = req.params
  const {
    cpf,
    cnpj,
    nome,
    logradouro,
    numero,
    bairro,
    municipio,
    uf,
    cep,
    telefone,
    indicador_ie,
    inscricao_estadual,
    email,
  } = req.body

  try {
    const updateQuery = `
      UPDATE destinatarios SET
        cpf = ?, cnpj = ?, nome = ?, logradouro = ?, numero = ?, bairro = ?,
        municipio = ?, uf = ?, cep = ?, telefone = ?, indicador_ie = ?,
        inscricao_estadual = ?, email = ?
      WHERE id = ?
    `

    await db.query(updateQuery, [
      cpf || null,
      cnpj || null,
      nome,
      logradouro || null,
      numero || null,
      bairro || null,
      municipio || null,
      uf || null,
      cep || null,
      telefone || null,
      indicador_ie || null,
      inscricao_estadual || null,
      email || null,
      id,
    ])

    res.json({ message: 'Destinatário atualizado com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar destinatário:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao atualizar destinatário' })
  }
}
exports.listarProdutosFiscais = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM produtos_fiscais')
    res.json(rows)
  } catch (error) {
    console.error('Erro ao listar produtos fiscais:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao listar produtos fiscais' })
  }
}
exports.buscarProdutoFiscalPorId = async (req, res) => {
  const { id } = req.params
  try {
    const [rows] = await db.query(
      'SELECT * FROM produtos_fiscais WHERE id = ?',
      [id]
    )
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Produto fiscal não encontrado' })
    }
    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar produto fiscal por ID:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar produto fiscal' })
  }
}
exports.buscarProdutoFiscalPorCodigo = async (req, res) => {
  const { codigo } = req.params
  try {
    const [rows] = await db.query(
      'SELECT * FROM produtos_fiscais WHERE codigo_produto = ?',
      [codigo]
    )
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Produto fiscal não encontrado' })
    }
    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar produto fiscal por código:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar produto fiscal' })
  }
}
exports.buscarProdutoFiscalNfcPorCodigo = async (req, res) => {
  const { codigo } = req.params
  try {
    const [rows] = await db.query(
      'SELECT * FROM produtos_fiscais_nfc WHERE codigo_produto = ?',
      [codigo]
    )
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Produto fiscal não encontrado' })
    }
    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar produto fiscal por código:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar produto fiscal' })
  }
}
exports.inserirProdutoFiscal = async (req, res) => {
  const produto = req.body
  try {
    const insertQuery = `
      INSERT INTO produtos_fiscais (
        codigo_produto, descricao, codigo_ncm, cfop,
        unidade_comercial, icms_origem, icms_situacao_tributaria,
        pis_situacao_tributaria, cofins_situacao_tributaria,
        valor_unitario, possui_gtin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const values = [
      produto.codigo_produto,
      produto.descricao,
      produto.codigo_ncm,
      produto.cfop,
      produto.unidade_comercial,
      produto.icms_origem,
      produto.icms_situacao_tributaria,
      produto.pis_situacao_tributaria,
      produto.cofins_situacao_tributaria,
      produto.valor_unitario,
      produto.possui_gtin || false,
    ]
    await db.query(insertQuery, values)
    res.status(201).json({ message: 'Produto fiscal inserido com sucesso' })
  } catch (error) {
    console.error('Erro ao inserir produto fiscal:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao inserir produto fiscal' })
  }
}
exports.atualizarProdutoFiscal = async (req, res) => {
  const { id } = req.params
  const produto = req.body
  try {
    const updateQuery = `
      UPDATE produtos_fiscais SET
        codigo_produto = ?, descricao = ?, codigo_ncm = ?, cfop = ?,
        unidade_comercial = ?, icms_origem = ?, icms_situacao_tributaria = ?,
        pis_situacao_tributaria = ?, cofins_situacao_tributaria = ?,
        valor_unitario = ?, possui_gtin = ?
      WHERE id = ?
    `
    const values = [
      produto.codigo_produto,
      produto.descricao,
      produto.codigo_ncm,
      produto.cfop,
      produto.unidade_comercial,
      produto.icms_origem,
      produto.icms_situacao_tributaria,
      produto.pis_situacao_tributaria,
      produto.cofins_situacao_tributaria,
      produto.valor_unitario,
      produto.possui_gtin || false,
      id,
    ]
    await db.query(updateQuery, values)
    res.json({ message: 'Produto fiscal atualizado com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar produto fiscal:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao atualizar produto fiscal' })
  }
}
exports.deletarProdutoFiscal = async (req, res) => {
  const { id } = req.params
  try {
    await db.query('DELETE FROM produtos_fiscais WHERE id = ?', [id])
    res.json({ message: 'Produto fiscal deletado com sucesso' })
  } catch (error) {
    console.error('Erro ao deletar produto fiscal:', error)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao deletar produto fiscal' })
  }
}
exports.buscarEmitente = async (req, res) => {
  const { cnpj } = req.params
  try {
    const [rows] = await db.query(
      'SELECT * FROM nfe_emitente WHERE cnpj_emitente = ?',
      [cnpj]
    )
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Emitente não encontrado' })
    }
    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar emitente:', error)
    res.status(500).json({
      error: true,
      message: 'Erro ao buscar emitente',
    })
  }
}
exports.buscarResponsavel = async (req, res) => {
  const { cnpj } = req.params
  try {
    const [rows] = await db.query(
      'SELECT * FROM responsaveis_tecnicos WHERE cnpj_responsavel_tecnico = ?',
      [cnpj]
    )
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Responsável não encontrado' })
    }
    res.json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar responsável:', error)
    res.status(500).json({
      error: true,
      message: 'Erro ao buscar responsável',
    })
  }
}

// NFCe

exports.emitirNfce = async (req, res) => {
  const ref = `nfce_${Date.now()}`

  try {
    const nfce = req.body
    const url = `${baseUrl}/v2/nfce?ref=${ref}`

    const response = await axios.post(url, nfce, {
      auth: { username: tokenFocus, password: '' },
    })

    const data = response.data
    console.log('🔎 Resposta completa da Focus:', JSON.stringify(data, null, 2))

    const dataEmissao = new Date(nfce.data_emissao || Date.now())
    const ano = String(dataEmissao.getFullYear())
    const mes = String(dataEmissao.getMonth() + 1).padStart(2, '0')
    // Soma os valores dos pagamentos recebidos no body
    const valorTotal = nfce.formas_pagamento
      ? nfce.formas_pagamento.reduce(
          (total, p) => total + parseFloat(p.valor_pagamento || 0),
          0
        )
      : 0

    // Resposta imediata ao cliente
    res.status(response.status).json({
      message: 'NFCe enviada com sucesso',
      ref,
      dados: data,
    })

    // Processamento em background (salvamento + envio)
    setImmediate(async () => {
      // Inserir no banco sem link ainda
      const insertQuery = `
      INSERT INTO nfce_historico (
        ref, status, status_sefaz, mensagem_sefaz, chave_nfe,
        numero, serie, cnpj_emitente, nome_destinatario, cpf_destinatario, valor_total,
        caminho_xml_nota_fiscal, caminho_danfe, link_danfe_drive, caminho_xml_cancelamento, motivo_cancelamento, numero_protocolo,
        data_emissao, contingencia_offline, contingencia_efetivada
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      console.log('🛠 Query preparada:', insertQuery)
      console.log('🛠 Valores:', [
        ref,
        data.status || null,
        data.status_sefaz || null,
        data.mensagem_sefaz || null,
        data.chave_nfe || null,
        data.numero || null,
        data.serie || null,
        data.cnpj_emitente || null,
        nfce.nome_destinatario || null,
        nfce.cpf_destinatario || null,
        valorTotal || 0,
        data.caminho_xml_nota_fiscal || null,
        data.caminho_danfe || null,
        null, // link_danfe_drive
        null, // caminho_xml_cancelamento
        null, // motivo_cancelamento
        data.protocolo,
        nfce.data_emissao || null,
        data.contingencia_offline || false,
        data.contingencia_offline_efetivada || false,
      ])

      await db.query(insertQuery, [
        ref,
        data.status || null,
        data.status_sefaz || null,
        data.mensagem_sefaz || null,
        data.chave_nfe || null,
        data.numero || null,
        data.serie || null,
        data.cnpj_emitente || null,
        nfce.nome_destinatario || null,
        nfce.cpf_destinatario || null,
        valorTotal || 0,
        data.caminho_xml_nota_fiscal || null,
        data.caminho_danfe || null,
        null, // link_danfe_drive
        null, // caminho_xml_cancelamento
        null, // motivo_cancelamento
        data.protocolo || null, // ✅ correto agora!
        nfce.data_emissao || null,
        data.contingencia_offline || false,
        data.contingencia_offline_efetivada || false,
      ])

      // 🔽 XML
      if (data.caminho_xml_nota_fiscal) {
        const nomeXML = `${ref}.xml`
        const caminhoLocalXML = path.join(
          __dirname,
          '..',
          '..',
          'arquivos_nfce',
          'xml',
          ano,
          mes,
          nomeXML
        )
        const urlXML = `${baseUrl}${data.caminho_xml_nota_fiscal}`

        try {
          const download = await axios.get(urlXML, {
            auth: { username: tokenFocus, password: '' },
            responseType: 'stream',
          })

          fs.mkdirSync(path.dirname(caminhoLocalXML), { recursive: true })
          const writer = fs.createWriteStream(caminhoLocalXML)
          download.data.pipe(writer)

          writer.on('finish', () => {
            console.log(`✅ XML salvo: ${caminhoLocalXML}`)
            enviarParaDrive(
              caminhoLocalXML,
              `NFCe/xml/${ano}/${mes}/${nomeXML}`
            )
              .then(() => console.log('☁️ XML enviado ao Drive'))
              .catch((err) =>
                console.error('❌ Falha ao enviar XML:', err.message)
              )
          })

          writer.on('error', (err) =>
            console.error('❌ Erro ao salvar XML:', err)
          )
        } catch (err) {
          console.error('❌ Erro ao baixar XML:', err.message)
        }
      }

      // 🧾 PDF
      if (data.caminho_danfe) {
        const nomePDF = `${ref}.pdf`
        const caminhoLocalPDF = path.join(
          __dirname,
          '..',
          '..',
          'arquivos_nfce',
          'pdf',
          ano,
          mes,
          nomePDF
        )
        const danfeUrl = `${baseUrl}${data.caminho_danfe}`
        caminhoLocalPDF
        try {
          fs.mkdirSync(path.dirname(caminhoLocalPDF), { recursive: true })

          const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          })

          const page = await browser.newPage()

          await page.setViewport({ width: 794, height: 1123 }) // opcional
          await page.goto(danfeUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000,
          })
          await page.emulateMediaType('screen')
          await page.evaluate(() => {
            document.body.style.zoom = '96%' // ou 85%
          })

          await page.pdf({
            path: caminhoLocalPDF,
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
            scale: 1,
          })

          await browser.close()

          console.log(`✅ PDF salvo: ${caminhoLocalPDF}`)

          const destinoDrive = `NFCe/pdf/${ano}/${mes}/${nomePDF}`
          await enviarParaDrive(caminhoLocalPDF, destinoDrive)

          const idArquivo = await obterIdArquivo(
            `gdrive:NFCe/pdf/${ano}/${mes}`,
            nomePDF
          )
          const linkPublico = gerarLinkDrive(idArquivo)

          // Atualiza o link no banco
          await db.query(
            `UPDATE nfce_historico SET link_danfe_drive = ? WHERE ref = ?`,
            [linkPublico, ref]
          )

          console.log(`🔗 Link público salvo no banco: ${linkPublico}`)
        } catch (err) {
          console.error('❌ Erro no processamento do PDF/DANFe:', err.message)
        }
      }
    })
  } catch (error) {
    console.error(
      '❌ Erro ao emitir NFCe:',
      error?.response?.data || error.message
    )
    const erroMsg = error.response?.data?.mensagem || 'Erro ao emitir NFCe'
    const erroStatus = error.response?.status || 500
    res.status(erroStatus).json({ error: true, message: erroMsg })
  }
}
exports.cancelarNfce = async (req, res) => {
  const tokenFocus = process.env.FOCUS_TOKEN
  const ref = req.params.ref
  const { justificativa } = req.body

  if (!justificativa || justificativa.length < 15) {
    return res.status(400).json({
      error: true,
      message: 'A justificativa deve ter entre 15 e 255 caracteres.',
    })
  }

  try {
    const url = `${baseUrl}/v2/nfce/${ref}`

    const response = await axios.delete(url, {
      auth: {
        username: tokenFocus,
        password: '',
      },
      data: { justificativa },
    })

    const data = response.data

    // Atualizar no banco
    const updateQuery = `
      UPDATE nfce_historico
      SET status = ?, status_sefaz = ?, mensagem_sefaz = ?, 
          caminho_xml_cancelamento = ?, numero_protocolo = ?, motivo_cancelamento = ?,
          link_danfe_drive = NULL
      WHERE ref = ?
    `
    await db.query(updateQuery, [
      data.status || null,
      data.status_sefaz || null,
      data.mensagem_sefaz || null,
      data.caminho_xml_cancelamento || null,
      data.numero_protocolo || null,
      justificativa,
      ref,
    ])

    const dataAtual = new Date()
    const ano = String(dataAtual.getFullYear())
    const mes = String(dataAtual.getMonth() + 1).padStart(2, '0')

    // Baixar XML de cancelamento e enviar ao Drive
    if (data.caminho_xml_cancelamento) {
      const downloadUrl = `${baseUrl}${data.caminho_xml_cancelamento}`
      const nomeArquivo = `${ref}.xml`
      const destino = path.join(
        __dirname,
        '..',
        '..',
        'arquivos_nfce',
        'xmls_cancelamento',
        ano,
        mes,
        nomeArquivo
      )

      if (!fs.existsSync(path.dirname(destino))) {
        fs.mkdirSync(path.dirname(destino), { recursive: true })
      }

      try {
        const download = await axios.get(downloadUrl, {
          auth: {
            username: tokenFocus,
            password: '',
          },
          responseType: 'stream',
        })

        const writer = fs.createWriteStream(destino)
        download.data.pipe(writer)

        writer.on('finish', async () => {
          console.log(`✅ XML de cancelamento salvo: ${destino}`)

          try {
            await enviarParaDrive(
              destino,
              `NFCe/xmls_cancelamento/${ano}/${mes}/${nomeArquivo}`
            )
            console.log(
              `✅ Enviado para o Drive: NFCe/xmls_cancelamento/${ano}/${mes}/${nomeArquivo}`
            )

            const nomePdf = `${ref}.pdf`
            const caminhoRemotoPdf = `NFCe/pdf/${ano}/${mes}/${nomePdf}`

            await removerDoDrive(caminhoRemotoPdf)
            console.log(`🗑️ PDF removido do Drive: ${caminhoRemotoPdf}`)
          } catch (err) {
            console.error(
              '❌ Erro ao enviar XML ou remover PDF do Drive:',
              err.message
            )
          }
        })

        writer.on('error', (err) => {
          console.error('❌ Erro ao salvar XML de cancelamento:', err)
        })
      } catch (err) {
        console.error('❌ Erro ao baixar XML de cancelamento:', err.message)
      }
    } else {
      // Mesmo se não houver XML, ainda tentamos remover o PDF
      const nomePdf = `${ref}.pdf`
      const caminhoRemotoPdf = `NFCe/pdf/${ano}/${mes}/${nomePdf}`

      removerDoDrive(caminhoRemotoPdf)
        .then(() => {
          console.log(`🗑️ PDF removido do Drive: ${caminhoRemotoPdf}`)
        })
        .catch((err) => {
          console.error('❌ Erro ao remover PDF do Drive:', err.message)
        })
    }

    return res.status(200).json({
      message: 'NFCe cancelada com sucesso',
      ref,
      dados: data,
    })
  } catch (error) {
    console.error(
      'Erro ao cancelar NFCe:',
      error?.response?.data || error.message
    )

    const erroMsg = error.response?.data?.mensagem || 'Erro ao cancelar NFCe'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.consultarNfce = async (req, res) => {
  const { ref } = req.params

  try {
    const url = `${baseUrl}/v2/nfce/${ref}?completa=1`

    const response = await axios.get(url, {
      auth: {
        username: tokenFocus,
        password: '',
      },
    })

    const data = response.data

    await db.query(
      `UPDATE nfce_historico SET 
        status = ?, 
        status_sefaz = ?, 
        mensagem_sefaz = ?, 
        numero_protocolo = COALESCE(?, numero_protocolo), 
        caminho_xml_cancelamento = ?
      WHERE ref = ?`,
      [
        data.status || null,
        data.status_sefaz || null,
        data.mensagem_sefaz || null,
        data.protocolo_nota_fiscal?.numero_protocolo || null, // ✅ usa do bloco correto
        data.caminho_xml_cancelamento || null,
        ref,
      ]
    )

    return res.status(200).json({
      message: 'Consulta realizada com sucesso',
      ref,
      dados: data,
    })
  } catch (error) {
    console.error(
      'Erro ao consultar NFCe:',
      error?.response?.data || error.message
    )

    const erroMsg = error.response?.data?.mensagem || 'Erro ao consultar NFCe'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.listarNfcePaginadas = async (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1
  const limite = 50
  const offset = (pagina - 1) * limite

  const { status, cpf, numero, dataInicio, dataFim } = req.query

  const filtros = []
  const valores = []

  // 🔍 Filtros dinâmicos
  if (status) {
    filtros.push('status = ?')
    valores.push(status)
  }

  if (cpf) {
    filtros.push('cpf_destinatario LIKE ?')
    valores.push(`%${cpf}%`)
  }

  if (numero) {
    filtros.push('numero = ?')
    valores.push(numero)
  }

  if (dataInicio && dataFim) {
    filtros.push('DATE(data_emissao) BETWEEN ? AND ?')
    valores.push(dataInicio, dataFim)
  } else if (dataInicio) {
    filtros.push('DATE(data_emissao) >= ?')
    valores.push(dataInicio)
  } else if (dataFim) {
    filtros.push('DATE(data_emissao) <= ?')
    valores.push(dataFim)
  }

  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : ''

  try {
    // 🔢 Consulta paginada
    const [result] = await db.query(
      `SELECT * FROM nfce_historico ${whereClause} ORDER BY data_emissao DESC LIMIT ? OFFSET ?`,
      [...valores, limite, offset]
    )

    // 📊 Total de registros com filtro
    const [totalResult] = await db.query(
      `SELECT COUNT(*) as total FROM nfce_historico ${whereClause}`,
      valores
    )

    const total = totalResult[0].total
    const totalPaginas = Math.ceil(total / limite)

    return res.status(200).json({
      paginaAtual: pagina,
      totalPaginas,
      totalRegistros: total,
      notas: result,
    })
  } catch (error) {
    console.error('❌ Erro ao listar NFC-e paginadas:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao buscar as NFC-e',
    })
  }
}
exports.gerarBackupMensalNfce = async (req, res) => {
  const { ano, mes } = req.params

  if (!ano || !mes) {
    return res.status(400).json({ error: true, message: 'Informe ano e mês' })
  }

  const mesPadded = mes.padStart(2, '0')
  const destinoZip = path.join(
    __dirname,
    '..',
    '..',
    'arquivos_nfce',
    'zip',
    ano,
    mesPadded
  )

  const nomeZip = `backup_nfce_${ano}-${mesPadded}.zip`
  const caminhoZip = path.join(destinoZip, nomeZip)

  try {
    // Verificar se pastas xml e pdf existem
    const pastaXml = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfce',
      'xml',
      ano,
      mesPadded
    )
    const pastaPdf = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfce',
      'pdf',
      ano,
      mesPadded
    )

    const existeXml = fs.existsSync(pastaXml)
    const existePdf = fs.existsSync(pastaPdf)

    if (!existeXml && !existePdf) {
      return res.status(404).json({
        error: true,
        message: 'Nenhum arquivo encontrado para este mês e ano.',
      })
    }

    // Garantir que a pasta onde o .zip será salvo exista
    if (!fs.existsSync(destinoZip)) {
      fs.mkdirSync(destinoZip, { recursive: true })
    }

    // Criar o arquivo ZIP
    const saida = fs.createWriteStream(caminhoZip)
    const archive = archiver('zip', { zlib: { level: 9 } })

    saida.on('close', () => {
      console.log(
        `✅ Arquivo ZIP criado: ${caminhoZip} (${archive.pointer()} bytes)`
      )
      return res.status(200).json({
        message: 'Backup gerado com sucesso',
        caminho: caminhoZip,
        tamanho: archive.pointer(),
      })
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(saida)

    // Adiciona arquivos XML
    if (existeXml) {
      archive.directory(pastaXml, 'xml')
    }

    // Adiciona arquivos PDF
    if (existePdf) {
      archive.directory(pastaPdf, 'pdf')
    }

    await archive.finalize()
  } catch (err) {
    console.error('Erro ao gerar backup:', err.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao gerar backup' })
  }
}
exports.inutilizarNumeracaoNfce = async (req, res) => {
  const { cnpj, serie, numero_inicial, numero_final, justificativa } = req.body

  if (!cnpj || !serie || !numero_inicial || !numero_final || !justificativa) {
    return res.status(400).json({
      error: true,
      message: 'Todos os campos são obrigatórios.',
    })
  }

  if (justificativa.length < 15) {
    return res.status(400).json({
      error: true,
      message: 'A justificativa deve ter no mínimo 15 caracteres.',
    })
  }

  const url = `${baseUrl}/v2/nfce/inutilizacao`

  const payload = {
    cnpj,
    serie,
    numero_inicial,
    numero_final,
    justificativa,
  }

  try {
    const response = await axios.post(url, payload, {
      auth: {
        username: tokenFocus,
        password: '',
      },
    })

    const data = response.data

    // Baixar XML de inutilização, se vier
    if (data.status === 'autorizado' && data.caminho_xml) {
      const dataAtual = new Date()
      const ano = String(dataAtual.getFullYear())
      const mes = String(dataAtual.getMonth() + 1).padStart(2, '0')

      const downloadUrl = `${baseUrl}${data.caminho_xml}`
      const pastaDestino = path.join(
        __dirname,
        '..',
        '..',
        'arquivos_nfce',
        'xmls_cancelamento',
        ano,
        mes
      )

      if (!fs.existsSync(pastaDestino)) {
        fs.mkdirSync(pastaDestino, { recursive: true })
      }

      const nomeArquivo = `inutilizacao_${serie}_${numero_inicial}-${numero_final}.xml`
      const destino = path.join(pastaDestino, nomeArquivo)

      try {
        const download = await axios.get(downloadUrl, {
          auth: {
            username: tokenFocus,
            password: '',
          },
          responseType: 'stream',
        })

        const writer = fs.createWriteStream(destino)
        download.data.pipe(writer)

        writer.on('finish', () => {
          console.log(`✅ XML de inutilização salvo: ${destino}`)
        })

        writer.on('error', (err) => {
          console.error('❌ Erro ao salvar XML de inutilização:', err)
        })
      } catch (err) {
        console.error('❌ Erro ao baixar XML de inutilização:', err.message)
      }
    }

    // Inserir no banco de dados
    const insertQuery = `
      INSERT INTO nfce_inutilizadas (
        cnpj, modelo, serie, numero_inicial, numero_final,
        protocolo_sefaz, status, status_sefaz, mensagem_sefaz, caminho_xml, data_inutilizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `

    await db.query(insertQuery, [
      data.cnpj || cnpj,
      data.modelo || '65',
      data.serie || serie,
      data.numero_inicial || numero_inicial,
      data.numero_final || numero_final,
      data.protocolo_sefaz || null,
      data.status || null,
      data.status_sefaz || null,
      data.mensagem_sefaz || null,
      data.caminho_xml || null,
    ])

    return res.status(200).json({
      message: 'Faixa inutilizada com sucesso',
      dados: data,
    })
  } catch (error) {
    console.error(
      'Erro na inutilização:',
      error?.response?.data || error.message
    )

    const erroMsg =
      error.response?.data?.mensagem || 'Erro ao inutilizar numeração'
    const erroStatus = error.response?.status || 500

    return res.status(erroStatus).json({
      error: true,
      message: erroMsg,
    })
  }
}
exports.listarInutilizacoesMensais = async (req, res) => {
  const { ano, mes } = req.params

  if (!ano || !mes) {
    return res.status(400).json({
      error: true,
      message: 'Informe ano e mês',
    })
  }

  const mesPadded = mes.padStart(2, '0')
  const dataInicio = `${ano}-${mesPadded}-01`
  const dataFim = `${ano}-${mesPadded}-31`

  try {
    const query = `
  SELECT id, cnpj, modelo, serie, numero_inicial, numero_final,
         protocolo_sefaz, status, status_sefaz, mensagem_sefaz,
         caminho_xml, criado_em
  FROM nfce_inutilizadas
  WHERE YEAR(criado_em) = ? AND MONTH(criado_em) = ?
  ORDER BY criado_em DESC
`
    const [rows] = await db.query(query, [ano, mesPadded])

    return res.status(200).json({
      total: rows.length,
      inutilizacoes: rows,
    })
  } catch (error) {
    console.error('Erro ao listar inutilizações:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao buscar inutilizações',
    })
  }
}
exports.gerarRelatorioEmitidasPDF = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    const [rows] = await db.query(
      `SELECT * FROM nfce_historico WHERE YEAR(data_emissao) = ? AND MONTH(data_emissao) = ? ORDER BY data_emissao DESC`,
      [ano, mesPadded]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nenhuma NFCe emitida encontrada.' })
    }

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; font-size: 11px; }
            th { background-color: #f0f0f0; }
          </style>
        </head>
        <body>
          <h1>Relatório de NFCe Emitidas - ${mesPadded}/${ano}</h1>
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Série</th>
                <th>Chave</th>
                <th>CNPJ Emitente</th>
                <th>Destinatário</th>
                <th>Status</th>
                <th>Mensagem</th>
                <th>Data Emissão</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  <td>${row.numero}</td>
                  <td>${row.serie}</td>
                  <td>${row.chave_nfe}</td>
                  <td>${row.cnpj_emitente}</td>
                  <td>${row.nome_destinatario || '-'}<br>${row.cpf_destinatario || '-'}</td>
                  <td>${row.status}</td>
                  <td>${row.mensagem_sefaz || '-'}</td>
                  <td>${new Date(row.data_emissao).toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 0 })

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    await browser.close()

    // 📁 Salvar localmente
    const pastaLocal = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfce',
      'pdfs_relatorios',
      ano,
      mesPadded
    )
    if (!fs.existsSync(pastaLocal)) {
      fs.mkdirSync(pastaLocal, { recursive: true })
    }

    const nomePDF = `relatorio_emitidas_${ano}-${mesPadded}.pdf`
    const caminhoLocal = path.join(pastaLocal, nomePDF)

    fs.writeFileSync(caminhoLocal, pdfBuffer)

    // ☁️ Enviar para o Drive
    await enviarParaDrive(
      caminhoLocal,
      `NFCe/relatorios/${ano}/${mesPadded}/${nomePDF}`
    )

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=${nomePDF}`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.end(pdfBuffer)
  } catch (err) {
    console.error('❌ Erro ao gerar PDF de NFCe emitidas:', err.message)
    return res.status(500).json({ error: true, message: 'Erro ao gerar PDF' })
  }
}
exports.gerarRelatorioEmitidasExcel = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    const [rows] = await db.query(
      `SELECT * FROM nfce_historico WHERE YEAR(data_emissao) = ? AND MONTH(data_emissao) = ? ORDER BY data_emissao DESC`,
      [ano, mesPadded]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nenhuma NFCe emitida encontrada.' })
    }

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(`Emitidas_${ano}_${mesPadded}`)

    worksheet.columns = [
      { header: 'Número', key: 'numero', width: 10 },
      { header: 'Série', key: 'serie', width: 8 },
      { header: 'Chave', key: 'chave_nfe', width: 48 },
      { header: 'CNPJ Emitente', key: 'cnpj_emitente', width: 20 },
      { header: 'Destinatário', key: 'nome_destinatario', width: 25 },
      { header: 'CPF Destinatário', key: 'cpf_destinatario', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 40 },
      { header: 'Data Emissão', key: 'data_emissao', width: 22 },
    ]

    rows.forEach((row) => {
      worksheet.addRow({
        numero: row.numero,
        serie: row.serie,
        chave_nfe: row.chave_nfe,
        cnpj_emitente: row.cnpj_emitente,
        nome_destinatario: row.nome_destinatario || '-',
        cpf_destinatario: row.cpf_destinatario || '-',
        status: row.status,
        mensagem_sefaz: row.mensagem_sefaz || '-',
        data_emissao: row.data_emissao
          ? new Date(row.data_emissao).toLocaleString()
          : '-',
      })
    })

    // 📁 Salvar localmente
    const pastaLocal = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfce',
      'excel_relatorios',
      ano,
      mesPadded
    )
    if (!fs.existsSync(pastaLocal)) {
      fs.mkdirSync(pastaLocal, { recursive: true })
    }

    const nomeExcel = `relatorio_emitidas_${ano}-${mesPadded}.xlsx`
    const caminhoLocal = path.join(pastaLocal, nomeExcel)

    await workbook.xlsx.writeFile(caminhoLocal)

    // ☁️ Enviar para Google Drive
    await enviarParaDrive(
      caminhoLocal,
      `NFCe/relatorios_excel/${ano}/${mesPadded}/${nomeExcel}`
    )

    // 🔽 Retornar o arquivo para download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader('Content-Disposition', `attachment; filename=${nomeExcel}`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('❌ Erro ao gerar Excel de emissões:', err.message)
    return res.status(500).json({ error: true, message: 'Erro ao gerar Excel' })
  }
}
exports.gerarRelatorioCanceladasPDF = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    const [rows] = await db.query(
      `SELECT * FROM nfce_historico WHERE status = 'cancelado' AND YEAR(data_emissao) = ? AND MONTH(data_emissao) = ? ORDER BY data_emissao DESC`,
      [ano, mesPadded]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nenhuma NFCe cancelada encontrada.' })
    }

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; font-size: 11px; }
            th { background-color: #f0f0f0; }
          </style>
        </head>
        <body>
          <h1>Relatório de NFCe Canceladas - ${mesPadded}/${ano}</h1>
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Série</th>
                <th>Chave</th>
                <th>CNPJ Emitente</th>
                <th>Destinatário</th>
                <th>Status</th>
                <th>Mensagem</th>
                <th>Data Emissão</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  <td>${row.numero}</td>
                  <td>${row.serie}</td>
                  <td>${row.chave_nfe}</td>
                  <td>${row.cnpj_emitente}</td>
                  <td>${row.nome_destinatario || '-'}<br>${row.cpf_destinatario || '-'}</td>
                  <td>${row.status}</td>
                  <td>${row.mensagem_sefaz || '-'}</td>
                  <td>${new Date(row.data_emissao).toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 0 })

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    await browser.close()

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=relatorio_canceladas_${ano}-${mesPadded}.pdf`
    )
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.end(pdfBuffer)
  } catch (err) {
    console.error('❌ Erro ao gerar PDF de canceladas:', err.message)
    return res.status(500).json({ error: true, message: 'Erro ao gerar PDF' })
  }
}
exports.gerarRelatorioCanceladasExcel = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    const [rows] = await db.query(
      `SELECT * FROM nfce_historico WHERE status = 'cancelado' AND YEAR(data_emissao) = ? AND MONTH(data_emissao) = ? ORDER BY data_emissao DESC`,
      [ano, mesPadded]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nenhuma NFCe cancelada encontrada.' })
    }

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(`Canceladas_${ano}_${mesPadded}`)

    worksheet.columns = [
      { header: 'Número', key: 'numero', width: 10 },
      { header: 'Série', key: 'serie', width: 8 },
      { header: 'Chave', key: 'chave_nfe', width: 48 },
      { header: 'CNPJ Emitente', key: 'cnpj_emitente', width: 20 },
      { header: 'Destinatário', key: 'nome_destinatario', width: 25 },
      { header: 'CPF Destinatário', key: 'cpf_destinatario', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 40 },
      { header: 'Data Emissão', key: 'data_emissao', width: 22 },
    ]

    rows.forEach((row) => {
      worksheet.addRow({
        numero: row.numero,
        serie: row.serie,
        chave_nfe: row.chave_nfe,
        cnpj_emitente: row.cnpj_emitente,
        nome_destinatario: row.nome_destinatario || '-',
        cpf_destinatario: row.cpf_destinatario || '-',
        status: row.status,
        mensagem_sefaz: row.mensagem_sefaz || '-',
        data_emissao: row.data_emissao
          ? new Date(row.data_emissao).toLocaleString()
          : '-',
      })
    })

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=relatorio_canceladas_${ano}-${mesPadded}.xlsx`
    )

    await workbook.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('❌ Erro ao gerar Excel de canceladas:', err.message)
    return res.status(500).json({ error: true, message: 'Erro ao gerar Excel' })
  }
}
exports.gerarRelatorioInutilizadasPDF = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    const [rows] = await db.query(
      `SELECT * FROM nfce_inutilizadas WHERE YEAR(criado_em) = ? AND MONTH(criado_em) = ? ORDER BY criado_em DESC`,
      [ano, mesPadded]
    )

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nenhum dado encontrado.' })
    }

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Relatório de Inutilizações - ${mesPadded}/${ano}</h1>
          <table>
            <thead>
              <tr>
                <th>CNPJ</th>
                <th>Série</th>
                <th>Nº Inicial</th>
                <th>Nº Final</th>
                <th>Status</th>
                <th>Protocolo</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  <td>${row.cnpj}</td>
                  <td>${row.serie}</td>
                  <td>${row.numero_inicial}</td>
                  <td>${row.numero_final}</td>
                  <td>${row.status}</td>
                  <td>${row.protocolo_sefaz || '-'}</td>
                  <td>${new Date(row.criado_em).toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 0 })
    await page.emulateMediaType('screen')

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    })

    await browser.close()

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=relatorio_inutilizadas_${ano}-${mesPadded}.pdf`
    )
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.end(pdfBuffer) // ← essa é a forma mais segura
  } catch (err) {
    console.error('❌ Erro ao gerar PDF:', err.message)
    return res.status(500).json({ error: true, message: 'Erro ao gerar PDF' })
  }
}
exports.gerarRelatorioInutilizadasExcel = async (req, res) => {
  const { ano, mes } = req.params

  const mesPadded = mes.padStart(2, '0')
  const [rows] = await db.query(
    `SELECT * FROM nfce_inutilizadas WHERE YEAR(criado_em) = ? AND MONTH(criado_em) = ? ORDER BY criado_em DESC`,
    [ano, mesPadded]
  )

  if (rows.length === 0) {
    return res
      .status(404)
      .json({ error: true, message: 'Nenhum dado encontrado.' })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`Inutil_${ano}_${mesPadded}`)

  sheet.columns = [
    { header: 'CNPJ', key: 'cnpj', width: 20 },
    { header: 'Modelo', key: 'modelo', width: 10 },
    { header: 'Série', key: 'serie', width: 10 },
    { header: 'Nº Inicial', key: 'numero_inicial', width: 15 },
    { header: 'Nº Final', key: 'numero_final', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Protocolo', key: 'protocolo_sefaz', width: 25 },
    { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 40 },
    { header: 'Criado em', key: 'criado_em', width: 25 },
  ]

  rows.forEach((row) => {
    sheet.addRow({
      ...row,
      criado_em: new Date(row.criado_em).toLocaleString(),
    })
  })

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="relatorio_inutilizadas_${ano}-${mesPadded}.xlsx"`
  )

  await workbook.xlsx.write(res)
  res.end()
}
exports.gerarRelatorioGeralNfcePDF = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    // Consultar emitidas
    const [emitidas] = await db.query(
      `SELECT * FROM nfce_historico WHERE status = 'autorizado' AND YEAR(data_emissao) = ? AND MONTH(data_emissao) = ? ORDER BY data_emissao DESC`,
      [ano, mesPadded]
    )

    // Consultar canceladas
    const [canceladas] = await db.query(
      `SELECT * FROM nfce_historico WHERE status = 'cancelado' AND YEAR(data_emissao) = ? AND MONTH(data_emissao) = ? ORDER BY data_emissao DESC`,
      [ano, mesPadded]
    )

    // Consultar inutilizadas
    const [inutilizadas] = await db.query(
      `SELECT * FROM nfce_inutilizadas WHERE YEAR(data_inutilizacao) = ? AND MONTH(data_inutilizacao) = ? ORDER BY data_inutilizacao DESC`,
      [ano, mesPadded]
    )

    // Logo
    const logoBase64 = fs.readFileSync(
      path.join(__dirname, '..', '..', 'public', 'images', 'logoapp21.jpg'),
      { encoding: 'base64' }
    )

    const dataGerada = new Date().toLocaleString()

    const html = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; }
            h1, h2 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px; }
            th, td { border: 1px solid #ccc; padding: 6px; font-size: 10px; }
            th { background: #eee; }
            img.logo { width: 120px; display: block; margin: auto; }
            .section-title { margin-top: 40px; font-size: 18px; border-bottom: 1px solid #000; }
            .footer { margin-top: 50px; text-align: right; font-size: 10px; }
          </style>
        </head>
        <body>
          <img class="logo" src="data:image/png;base64,${logoBase64}" alt="Logo" />
          <h1>Relatório Geral NFC-e</h1>
          <h2>${mesPadded}/${ano}</h2>

          <div class="section-title">✅ NFC-e Emitidas</div>
          <table>
            <thead>
              <tr>
                <th>Número</th><th>Série</th><th>Chave</th><th>Emitente</th>
                <th>Destinatário</th><th>CPF</th><th>Status</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${emitidas
                .map(
                  (e) => `
                <tr>
                  <td>${e.numero}</td>
                  <td>${e.serie}</td>
                  <td>${e.chave_nfe}</td>
                  <td>${e.cnpj_emitente}</td>
                  <td>${e.nome_destinatario || '-'}</td>
                  <td>${e.cpf_destinatario || '-'}</td>
                  <td>${e.status}</td>
                  <td>${new Date(e.data_emissao).toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div class="section-title">❌ NFC-e Canceladas</div>
          <table>
            <thead>
              <tr>
                <th>Número</th><th>Série</th><th>Chave</th><th>Emitente</th>
                <th>Destinatário</th><th>Status</th><th>Mensagem</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${canceladas
                .map(
                  (e) => `
                <tr>
                  <td>${e.numero}</td>
                  <td>${e.serie}</td>
                  <td>${e.chave_nfe}</td>
                  <td>${e.cnpj_emitente}</td>
                  <td>${e.nome_destinatario || '-'}</td>
                  <td>${e.status}</td>
                  <td>${e.mensagem_sefaz || '-'}</td>
                  <td>${new Date(e.data_emissao).toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div class="section-title">🚫 NFC-e Inutilizadas</div>
          <table>
            <thead>
              <tr>
                <th>CNPJ</th><th>Série</th><th>De</th><th>Até</th>
                <th>Status</th><th>Mensagem</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${inutilizadas
                .map(
                  (i) => `
                <tr>
                  <td>${i.cnpj}</td>
                  <td>${i.serie}</td>
                  <td>${i.numero_inicial}</td>
                  <td>${i.numero_final}</td>
                  <td>${i.status}</td>
                  <td>${i.mensagem_sefaz}</td>
                  <td>${new Date(i.data_inutilizacao).toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div class="footer">Relatório gerado em: ${dataGerada}</div>
        </body>
      </html>
    `

    // Gerar PDF com Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 0 })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    await browser.close()

    // 🔽 Salvar PDF fisicamente
    const pastaSalvar = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfce',
      'pdfs_relatorios',
      ano,
      mesPadded
    )
    if (!fs.existsSync(pastaSalvar)) {
      fs.mkdirSync(pastaSalvar, { recursive: true })
    }

    const nomeArquivo = `relatorio_geral_nfce_${ano}-${mesPadded}.pdf`
    const caminhoFinal = path.join(pastaSalvar, nomeArquivo)
    fs.writeFileSync(caminhoFinal, pdfBuffer)
    console.log(`✅ PDF geral salvo em: ${caminhoFinal}`)

    // Retornar como download
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.end(pdfBuffer)
  } catch (err) {
    console.error('❌ Erro ao gerar relatório geral PDF:', err.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao gerar PDF geral' })
  }
}
exports.gerarRelatorioGeralExcel = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  try {
    // Consultar dados
    const [emitidas] = await db.query(
      `SELECT numero, serie, chave_nfe, nome_destinatario, cpf_destinatario, data_emissao, status_sefaz, mensagem_sefaz
       FROM nfce_historico
       WHERE YEAR(data_emissao) = ? AND MONTH(data_emissao) = ?
       ORDER BY data_emissao ASC`,
      [ano, mes]
    )

    const [canceladas] = await db.query(
      `SELECT numero, serie, chave_nfe, nome_destinatario, cpf_destinatario, data_emissao, status_sefaz, mensagem_sefaz
       FROM nfce_historico
       WHERE status = 'cancelado' AND YEAR(data_emissao) = ? AND MONTH(data_emissao) = ?
       ORDER BY data_emissao ASC`,
      [ano, mes]
    )

    const [inutilizadas] = await db.query(
      `SELECT serie, numero_inicial, numero_final, protocolo_sefaz, mensagem_sefaz, data_inutilizacao
       FROM nfce_inutilizadas
       WHERE YEAR(data_inutilizacao) = ? AND MONTH(data_inutilizacao) = ?
       ORDER BY data_inutilizacao ASC`,
      [ano, mes]
    )

    // Criar planilha
    const workbook = new ExcelJS.Workbook()

    // Emitidas
    const abaEmitidas = workbook.addWorksheet(`Emitidas_${ano}-${mesPadded}`)
    abaEmitidas.columns = [
      { header: 'Número', key: 'numero' },
      { header: 'Série', key: 'serie' },
      { header: 'Chave NFe', key: 'chave_nfe', width: 45 },
      { header: 'Destinatário', key: 'nome_destinatario' },
      { header: 'CPF', key: 'cpf_destinatario' },
      { header: 'Data de Emissão', key: 'data_emissao', width: 20 },
      { header: 'Status SEFAZ', key: 'status_sefaz' },
      { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 30 },
    ]
    abaEmitidas.addRows(emitidas)

    // Canceladas
    const abaCanceladas = workbook.addWorksheet(
      `Canceladas_${ano}-${mesPadded}`
    )
    abaCanceladas.columns = abaEmitidas.columns
    abaCanceladas.addRows(canceladas)

    // Inutilizadas
    const abaInutilizadas = workbook.addWorksheet(
      `Inutilizadas_${ano}-${mesPadded}`
    )
    abaInutilizadas.columns = [
      { header: 'Série', key: 'serie' },
      { header: 'Número Inicial', key: 'numero_inicial' },
      { header: 'Número Final', key: 'numero_final' },
      { header: 'Protocolo SEFAZ', key: 'protocolo_sefaz', width: 25 },
      { header: 'Mensagem SEFAZ', key: 'mensagem_sefaz', width: 30 },
      { header: 'Data Inutilização', key: 'data_inutilizacao', width: 20 },
    ]
    abaInutilizadas.addRows(inutilizadas)

    // Criar diretório de destino
    const destinoDir = path.join(
      __dirname,
      '..',
      '..',
      'arquivos_nfce',
      'excel',
      ano,
      mesPadded
    )
    if (!fs.existsSync(destinoDir)) {
      fs.mkdirSync(destinoDir, { recursive: true })
    }

    const nomeArquivo = `relatorio_geral_nfce_${ano}-${mesPadded}.xlsx`
    const caminhoCompleto = path.join(destinoDir, nomeArquivo)

    await workbook.xlsx.writeFile(caminhoCompleto)
    console.log(`✅ Relatório geral Excel salvo: ${caminhoCompleto}`)

    // Enviar como download
    res.download(caminhoCompleto, nomeArquivo)
  } catch (err) {
    console.error('❌ Erro ao gerar relatório geral Excel:', err.message)
    res.status(500).json({ error: true, message: 'Erro ao gerar Excel geral' })
  }
}
exports.gerarZipRelatoriosMensais = async (req, res) => {
  const { ano, mes } = req.params
  const mesPadded = mes.padStart(2, '0')

  const pastaBase = path.join(__dirname, '..', '..', 'arquivos_nfce')
  const destinoZip = path.join(pastaBase, 'zip', ano, mesPadded)

  const nomeZip = `relatorios_nfce_${ano}-${mesPadded}.zip`
  const caminhoZip = path.join(destinoZip, nomeZip)

  // Pastas onde os relatórios são gerados
  const pastaPdf = path.join(pastaBase, 'pdfs_relatorios', ano, mesPadded)
  const pastaExcel = path.join(pastaBase, 'excel', ano, mesPadded)

  // Verificar se há relatórios
  const existePdf = fs.existsSync(pastaPdf)
  const existeExcel = fs.existsSync(pastaExcel)

  if (!existePdf && !existeExcel) {
    return res.status(404).json({
      error: true,
      message: 'Nenhum relatório PDF ou Excel encontrado para esse mês.',
    })
  }

  try {
    if (!fs.existsSync(destinoZip)) {
      fs.mkdirSync(destinoZip, { recursive: true })
    }

    const output = fs.createWriteStream(caminhoZip)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(
        `✅ ZIP com relatórios salvo: ${caminhoZip} (${archive.pointer()} bytes)`
      )
      res.download(caminhoZip, nomeZip)
    })

    archive.on('error', (err) => {
      throw err
    })

    archive.pipe(output)

    if (existePdf) archive.directory(pastaPdf, 'pdfs')
    if (existeExcel) archive.directory(pastaExcel, 'excel')

    await archive.finalize()
  } catch (err) {
    console.error('❌ Erro ao gerar ZIP de relatórios:', err.message)
    res
      .status(500)
      .json({ error: true, message: 'Erro ao gerar ZIP de relatórios' })
  }
}
exports.enviarNfcePorEmail = async (req, res) => {
  const { ref } = req.params
  const { emails } = req.body

  if (!ref || !emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({
      error: true,
      message:
        'Informe a referência da nota e ao menos um e-mail no corpo da requisição.',
    })
  }

  const url = `${baseUrl}/v2/nfce/${ref}/email`

  try {
    const response = await axios.post(
      url,
      { emails },
      {
        auth: {
          username: tokenFocus,
          password: '',
        },
      }
    )

    return res.status(200).json({
      message: 'E-mail(s) enviado(s) com sucesso!',
      resposta: response.data,
    })
  } catch (error) {
    console.error(
      '❌ Erro ao enviar e-mail da NFC-e:',
      error?.response?.data || error.message
    )

    return res.status(error?.response?.status || 500).json({
      error: true,
      message:
        error?.response?.data?.mensagem || 'Erro ao enviar e-mail da NFC-e.',
    })
  }
}
exports.getTributosPadraoNfce = async (req, res) => {
  try {
    const [result] = await db.query('SELECT * FROM nfce_tributos LIMIT 1')
    if (result.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: 'Nenhum dado de tributo encontrado' })
    }

    return res.status(200).json(result[0])
  } catch (error) {
    console.error('Erro ao buscar tributos:', error.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao buscar tributos' })
  }
}
exports.atualizarTributosPadraoNfce = async (req, res) => {
  const {
    modalidade_frete,
    local_destino,
    presenca_comprador,
    codigo_ncm,
    cfop,
    icms_origem,
    icms_situacao_tributaria,
  } = req.body

  try {
    const [result] = await db.query('SELECT id FROM nfce_tributos LIMIT 1')

    if (result.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'Tributo padrão não encontrado para atualizar',
      })
    }

    const id = result[0].id

    await db.query(
      `UPDATE nfce_tributos SET
        modalidade_frete = ?,
        local_destino = ?,
        presenca_comprador = ?,
        codigo_ncm = ?,
        cfop = ?,
        icms_origem = ?,
        icms_situacao_tributaria = ?
      WHERE id = ?`,
      [
        modalidade_frete,
        local_destino,
        presenca_comprador,
        codigo_ncm,
        cfop,
        icms_origem,
        icms_situacao_tributaria,
        id,
      ]
    )

    return res.status(200).json({ message: 'Tributos atualizados com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar tributos:', error.message)
    return res
      .status(500)
      .json({ error: true, message: 'Erro ao atualizar tributos' })
  }
}
exports.dashboardNfce = async (req, res) => {
  try {
    const valorTotalNoMesAtual = await db.query(
      `SELECT 
          SUM(valor_total)
      FROM
          nfce_historico
      WHERE
          status = 'autorizado'
              AND MONTH(data_emissao) = MONTH(CURRENT_DATE())
              AND YEAR(data_emissao) = YEAR(CURRENT_DATE())
      ;`
    )
    const valorTotalNoMesAtualFormatado =
      valorTotalNoMesAtual[0][0]['SUM(valor_total)'] || 0

    const valorTotalPorDiaDentroDoMes = await db.query(
      `SELECT 
            DATE(data_emissao) AS dia, SUM(valor_total) AS total_por_dia
        FROM
            nfce_historico
        WHERE
            status = 'autorizado'
                AND MONTH(data_emissao) = MONTH(CURRENT_DATE())
                AND YEAR(data_emissao) = YEAR(CURRENT_DATE())
        GROUP BY dia;`
    )
    const valorTotalPorDiaDentroDoMesFormatado =
      valorTotalPorDiaDentroDoMes[0].map((row) => ({
        dia: row.dia,
        total_por_dia: row.total_por_dia,
      }))

    const quantidadeTotalPorStatus = await db.query(
      `SELECT 
          status, COUNT(*) AS quantidade
      FROM
          nfce_historico
      GROUP BY status;`
    )
    const quantidadePorStatusFormatado = quantidadeTotalPorStatus[0].map(
      (row) => ({
        status: row.status,
        quantidade: row.quantidade,
      })
    )
    const quantidadeAutorizadoPorMesEAno = await db.query(
      `SELECT YEAR(data_emissao) AS ano, MONTH(data_emissao) AS mes, COUNT(*) AS quantidade
      FROM nfce_historico
      WHERE status = "autorizado"
      GROUP BY ano, mes
      ORDER BY ano DESC, mes DESC;`
    )
    const quantidadeAutorizadoPorMesEAnoFormatado =
      quantidadeAutorizadoPorMesEAno[0].map((row) => ({
        ano: row.ano,
        mes: row.mes,
        quantidade: row.quantidade,
      }))
    const ultimasDezErroAutorizacao = await db.query(
      `SELECT 
          id, ref, mensagem_sefaz, data_emissao
      FROM
          nfce_historico
      WHERE
          status = 'erro_autorizacao'
      ORDER BY data_emissao DESC
      LIMIT 10;`
    )
    const ultimasDezErroAutorizacaoFormatado = ultimasDezErroAutorizacao[0].map(
      (row) => ({
        id: row.id,
        ref: row.ref,
        mensagem_sefaz: row.mensagem_sefaz,
        data_emissao: new Date(row.data_emissao).toLocaleString(),
      })
    )

    res.json({
      valorTotalNoMesAtual: valorTotalNoMesAtualFormatado,
      valorTotalPorDiaDentroDoMes: valorTotalPorDiaDentroDoMesFormatado,
      quantidadePorStatus: quantidadePorStatusFormatado,
      quantidadeAutorizadoPorMesEAno: quantidadeAutorizadoPorMesEAnoFormatado,
      ultimasDezErroAutorizacao: ultimasDezErroAutorizacaoFormatado,
    })
  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error.message)
    return res.status(500).json({
      error: true,
      message: 'Erro ao buscar dados do dashboard',
    })
  }
}
