// vendedorController.js
const Vendedor = require('../models/Vendedor')
const axios = require('axios')
const db = require('../../db')
const jwt = require('jsonwebtoken')

exports.getVendedorByCPF = async (req, res) => {
  const { cpf } = req.params
  try {
    const vendedor = await Vendedor.findByCPF(cpf)
    if (!vendedor) {
      return res.status(404).send('Vendedor não encontrado')
    }
    res.json(vendedor)
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error)
    res.status(500).send('Erro ao buscar vendedor')
  }
}
exports.createEnvio = async (req, res) => {
  const { rota, data, panos, fichas, valor } = req.body
  const { idVendedor } = req.user // idVendedor vindo do token de acesso

  try {
    // Validação dos dados recebidos
    if (!rota || !data || !panos || !fichas || !valor) {
      return res
        .status(400)
        .json({ message: 'Todos os campos são obrigatórios' })
    }

    // Query de inserção
    const queryInsert = `
      INSERT INTO envios (idVendedor, rota, data_envio, panos, fichas, valor)
      VALUES (?, ?, ?, ?, ?, ?)
    `

    // Execução da query
    const [result] = await db.query(queryInsert, [
      idVendedor,
      rota,
      data,
      panos,
      fichas,
      valor,
    ])

    // Verifica se a inserção foi bem-sucedida
    if (result.affectedRows === 1) {
      res
        .status(200)
        .json({ message: 'Envio criado com sucesso', envioId: result.insertId })
    } else {
      res.status(500).json({ message: 'Falha ao criar envio' })
    }
  } catch (error) {
    console.error('Erro ao criar envio:', error)
    res.status(500).json({ message: 'Erro ao criar envio' })
  }
}
exports.getEnvios = async (req, res) => {
  const { rota } = req.body // Rota recebida do corpo da requisição
  const { idVendedor } = req.user // idVendedor vindo do token de acesso
  const currentDate = new Date()

  // Definindo a data inicial como 35 dias antes da data atual
  const startDate = new Date()
  startDate.setDate(currentDate.getDate() - 35)

  const formattedStartDate = startDate.toISOString().split('T')[0]
  const formattedCurrentDate = currentDate.toISOString().split('T')[0]

  try {
    // Validação dos dados recebidos
    if (!rota) {
      return res.status(400).json({ message: 'A rota é obrigatória' })
    }

    // Query de seleção para listar registros
    const querySelect = `
      SELECT data_envio , panos, fichas, valor
      FROM envios
      WHERE idVendedor = ? AND rota = ? AND data_envio BETWEEN ? AND ?
      ORDER BY data_envio DESC
    `

    // Execução da query para listar registros
    const [result] = await db.query(querySelect, [
      idVendedor,
      rota,
      formattedStartDate,
      formattedCurrentDate,
    ])

    // Verifica se encontrou registros
    if (result.length > 0) {
      // Query para calcular totais
      const queryTotals = `
        SELECT SUM(panos) AS totalPanos, SUM(fichas) AS totalFichas, SUM(valor) AS totalValor
        FROM envios
        WHERE idVendedor = ? AND rota = ? AND data_envio BETWEEN ? AND ?
      `

      // Execução da query para calcular totais
      const [[totals]] = await db.query(queryTotals, [
        idVendedor,
        rota,
        formattedStartDate,
        formattedCurrentDate,
      ])

      // Monta a resposta com os registros e os totais
      res.status(200).json({
        registros: result,
        totalPanos: totals.totalPanos || 0,
        totalFichas: totals.totalFichas || 0,
        totalValor: totals.totalValor || 0.0,
      })
    } else {
      res.status(404).json({ message: 'Nenhum envio encontrado' })
    }
  } catch (error) {
    console.error('Erro ao buscar envios:', error)
    res.status(500).json({ message: 'Erro ao buscar envios' })
  }
}
exports.getAllEnvios = async (req, res) => {
  const { rota, idVendedor } = req.body // Extraindo rota e idVendedor do corpo da requisição

  try {
    // Validação dos dados recebidos
    if (!rota || !idVendedor) {
      return res
        .status(400)
        .json({ message: 'A rota e o idVendedor são obrigatórios' })
    }

    // Query de seleção para listar registros
    const querySelect = `
      SELECT *
      FROM envios
      WHERE idVendedor = ? AND rota = ?
      ORDER BY data_envio DESC
    `

    // Execução da query para listar registros
    const [result] = await db.query(querySelect, [idVendedor, rota])

    // Retornando os resultados encontrados
    res.status(200).json({
      registros: result.length ? result : 'Nenhum registro encontrado.',
    })

    console.log(result)
  } catch (error) {
    console.error('Erro ao buscar envios:', error)
    res.status(500).json({ message: 'Erro ao buscar envios' })
  }
}
exports.insertResultados = async (req, res) => {
  const { idVendedor, rota, dataRota, valor, cobrancas } = req.body

  try {
    if (!idVendedor || !rota || !dataRota || !valor || !cobrancas) {
      return res
        .status(400)
        .json({ message: 'Todos os campos são obrigatórios' })
    }

    // Verificação de duplicidade
    const queryCheck = `
      SELECT 1 FROM resultados
      WHERE idVendedor = ? AND rota = ? AND data = ?
      LIMIT 1
    `

    const [rows] = await db.query(queryCheck, [idVendedor, rota, dataRota])

    if (rows.length > 0) {
      return res.status(409).json({
        message: 'Resultado já registrado para esta data, rota e vendedor.',
      })
    }

    // Cálculo da média
    const media = cobrancas !== 0 ? Math.floor(valor / cobrancas) : 0

    // Inserção do resultado
    const queryInsert = `
      INSERT INTO resultados (idVendedor, rota, data, valor, cobrancas, media)
      VALUES (?, ?, ?, ?, ?, ?)
    `

    const [result] = await db.query(queryInsert, [
      idVendedor,
      rota,
      dataRota,
      valor,
      cobrancas,
      media,
    ])

    if (result.affectedRows === 1) {
      res.status(200).json({ message: 'Resultados inseridos com sucesso' })
    } else {
      res.status(500).json({ message: 'Falha ao inserir resultados' })
    }
  } catch (error) {
    console.error('Erro ao inserir resultados:', error)
    res.status(500).json({ message: 'Erro ao inserir resultados' })
  }
}
exports.listarResultados = async (req, res) => {
  try {
    const {
      dataInicial,
      dataFinal,
      rota,
      idVendedor,
      pagina = 1,
      limite = 10,
    } = req.query

    const offset = (pagina - 1) * limite

    const condicoes = []
    const valores = []

    if (dataInicial) {
      condicoes.push('data >= ?')
      valores.push(dataInicial)
    }

    if (dataFinal) {
      condicoes.push('data <= ?')
      valores.push(dataFinal)
    }

    if (rota) {
      condicoes.push('rota = ?')
      valores.push(rota)
    }

    if (idVendedor) {
      condicoes.push('idVendedor = ?')
      valores.push(idVendedor)
    }

    const whereClause =
      condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : ''

    const query = `
      SELECT * FROM resultados
      ${whereClause}
      ORDER BY data DESC
      LIMIT ? OFFSET ?
    `

    valores.push(parseInt(limite), parseInt(offset))

    // 🔍 LOG da consulta principal
    // console.log('\n📥 Parâmetros recebidos:', req.query)
    // console.log('🔍 SQL principal:\n', query)
    // console.log('🔢 Valores usados:', valores)

    const [rows] = await db.query(query, valores)

    if (rows.length === 0) {
      console.log('⚠️ Nenhum resultado encontrado para os filtros aplicados.')
      return res.status(404).json({ message: 'Nenhum resultado encontrado' })
    }

    const queryTotal = `
      SELECT COUNT(*) AS total FROM resultados
      ${whereClause}
    `

    // console.log('\n📊 SQL total:\n', queryTotal)
    // console.log('🔢 Valores do total:', valores.slice(0, -2))

    const [countResult] = await db.query(queryTotal, valores.slice(0, -2))

    res.json({
      pagina: parseInt(pagina),
      limite: parseInt(limite),
      total: countResult[0].total,
      resultados: rows,
    })
  } catch (error) {
    console.error('❌ Erro ao listar resultados:', error)
    res.status(500).json({ message: 'Erro ao buscar resultados' })
  }
}
exports.deleteResultadoById = async (req, res) => {
  const { id } = req.params

  try {
    const [result] = await db.query('DELETE FROM resultados WHERE id = ?', [id])

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Resultado não encontrado' })
    }

    res.status(200).json({ message: 'Resultado deletado com sucesso' })
  } catch (error) {
    console.error('Erro ao deletar resultado:', error)
    res.status(500).json({ message: 'Erro ao deletar resultado' })
  }
}
exports.patchResultadoById = async (req, res) => {
  const { id } = req.params
  const { rota, data, valor, cobrancas } = req.body

  // Monta a query dinamicamente
  const campos = []
  const valores = []

  if (rota) {
    campos.push('rota = ?')
    valores.push(rota)
  }

  if (data) {
    campos.push('data = ?')
    valores.push(data)
  }

  if (valor) {
    campos.push('valor = ?')
    valores.push(valor)
  }

  if (cobrancas) {
    campos.push('cobrancas = ?')
    valores.push(cobrancas)
  }

  if (valor && cobrancas) {
    const media = Math.floor(valor / cobrancas)
    campos.push('media = ?')
    valores.push(media)
  }

  if (campos.length === 0) {
    return res
      .status(400)
      .json({ message: 'Nenhum campo fornecido para atualização' })
  }

  try {
    const query = `UPDATE resultados SET ${campos.join(', ')} WHERE id = ?`
    valores.push(id)

    const [result] = await db.query(query, valores)

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Resultado não encontrado' })
    }

    res.status(200).json({ message: 'Resultado atualizado com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar resultado:', error)
    res.status(500).json({ message: 'Erro ao atualizar resultado' })
  }
}
exports.acompanhamentoEquipe = async (req, res) => {
  try {
    const { idVendedor } = req.user
    const agora = new Date()

    const dataHoje = agora
      .toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      })
      .split('/')
      .reverse()
      .join('-')
    // const dataHoje = '2025-05-21' // Para testes

    // 1. Buscar equipe
    const [equipes] = await db.query(
      'SELECT ids FROM equipe WHERE idVendedor = ?',
      [idVendedor]
    )

    if (!equipes.length) {
      return res.status(403).json({ error: 'Você não lidera nenhuma equipe.' })
    }

    let equipeIds = Array.isArray(equipes[0].ids)
      ? equipes[0].ids
      : JSON.parse(equipes[0].ids)

    if (!equipeIds.includes(idVendedor)) {
      equipeIds.unshift(idVendedor) // Adiciona no início
    }

    // 2. Processar cada vendedor da equipe
    const resultados = await Promise.all(
      equipeIds.map(async (vendedorId) => {
        // Nome único do vendedor
        const [vendInfo] = await db.query(
          'SELECT nome_unico FROM vendedores WHERE idVendedor = ?',
          [vendedorId]
        )
        const nome_unico = vendInfo.length
          ? vendInfo[0].nome_unico
          : `Vendedor ${vendedorId}`

        // Vendas atendidas
        const [atendidas] = await db.query(
          `SELECT v.vencimento, v.valor, v.valorRecebido, v.vb, c.id AS cliente_id, c.nomeCliente, c.cidade, c.endereco, c.pontoRef, c.latitude, c.longitude
           FROM vendas v
           INNER JOIN clientes c ON v.cliente_id = c.id
           WHERE v.idVendedor = ? AND v.tipo = 'NF' AND v.situacao = 1 AND v.atualizacao = ?`,
          [vendedorId, dataHoje]
        )

        // Adicionar baixaDoDia e vb
        const atendidasComBaixa = await Promise.all(
          atendidas.map(async (venda) => {
            const [pendencias] = await db.query(
              `SELECT COUNT(*) AS pendentes
               FROM vendas 
               WHERE cliente_id = ? AND tipo = 'NF' AND situacao IS NULL AND status_venda = 1 AND vencimento >= ?`,
              [venda.cliente_id, dataHoje]
            )
            const isBaixa = pendencias[0].pendentes === 0
            return {
              ...venda,
              baixaDoDia: isBaixa,
            }
          })
        )

        // Vendas próximas
        const [proximas] = await db.query(
          `SELECT v.vencimento, c.id, c.nomeCliente, c.cidade, c.endereco, c.pontoRef, c.latitude, c.longitude
           FROM vendas v
           INNER JOIN clientes c ON v.cliente_id = c.id
           WHERE v.idVendedor = ? AND v.tipo = 'NF' AND v.situacao IS NULL AND v.atualizacao = ?`,
          [vendedorId, dataHoje]
        )

        // Clientes cadastrados no dia
        const [clientesNovos] = await db.query(
          `SELECT id AS cliente_id, nomeCliente, cidade, endereco, pontoRef, latitude, longitude, status, data_cadastro
           FROM clientes
           WHERE idVendedor = ? AND data_cadastro = ?`,
          [vendedorId, dataHoje]
        )

        // Adicionar baixaDoDia e vb para novos clientes
        const clientesNovosComBaixa = await Promise.all(
          clientesNovos.map(async (cliente) => {
            const [pendencias] = await db.query(
              `SELECT COUNT(*) AS pendentes
               FROM vendas 
               WHERE cliente_id = ? AND tipo = 'NF' AND situacao IS NULL AND status_venda = 1 AND vencimento >= ?`,
              [cliente.cliente_id, dataHoje]
            )
            const isBaixa = pendencias[0].pendentes === 0
            return {
              ...cliente,
              baixaDoDia: isBaixa,
            }
          })
        )

        // Total recebido do dia por tipo (NF e RESTANTE DE VENDA)
        const [somaValores] = await db.query(
          `SELECT 
             SUM(CASE WHEN tipo = 'NF' THEN valorRecebido ELSE 0 END) AS totalRecebidoNF,
             SUM(CASE WHEN tipo = 'RESTANTE DE VENDA' THEN valorRecebido ELSE 0 END) AS totalRecebidoRestante
           FROM vendas
           WHERE idVendedor = ? 
             AND atualizacao = ? 
             AND situacao = 1 
             AND tipo IN ('NF', 'RESTANTE DE VENDA')`,
          [vendedorId, dataHoje]
        )

        const totalRecebidoNF = somaValores[0].totalRecebidoNF || 0
        const totalRecebidoRestante = somaValores[0].totalRecebidoRestante || 0

        return {
          idVendedor: vendedorId,
          nome_unico,
          atendidas: atendidasComBaixa,
          totalAtendidas: atendidas.length,
          proximas,
          totalProximas: proximas.length,
          clientesNovos: clientesNovosComBaixa,
          totalClientesNovos: clientesNovos.length,
          totalRecebidoNF,
          totalRecebidoRestante,
        }
      })
    )

    res.status(200).json(resultados)
  } catch (err) {
    console.error('Erro no acompanhamentoEquipe:', err)
    res.status(500).json({ error: 'Erro ao gerar acompanhamento' })
  }
}
exports.acompanhamentoGeral = async (req, res) => {
  try {
    const agora = new Date()

    const dataHoje = agora
      .toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      })
      .split('/')
      .reverse()
      .join('-')

    const horaBrasilia = agora.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })

    // console.log(`📅 Data ajustada para Brasília: ${dataHoje}`)
    // console.log(`⏰ Hora ajustada para Brasília: ${horaBrasilia}`)

    // const dataHoje = '2025-05-21' // Para testes

    // 1. Buscar todos os vendedores ativos
    const [vendedores] = await db.query(
      'SELECT idVendedor, nome_unico FROM vendedores WHERE status = 1'
    )

    if (!vendedores.length) {
      return res
        .status(404)
        .json({ error: 'Nenhum vendedor ativo encontrado.' })
    }

    // 2. Processar cada vendedor
    const resultados = await Promise.all(
      vendedores.map(async ({ idVendedor, nome_unico }) => {
        // Vendas atendidas
        const [atendidas] = await db.query(
          `SELECT v.vencimento, v.valor, v.valorRecebido, v.vb, c.id AS cliente_id, c.nomeCliente, c.cidade, c.endereco, c.pontoRef, c.latitude, c.longitude
           FROM vendas v
           INNER JOIN clientes c ON v.cliente_id = c.id
           WHERE v.idVendedor = ? AND v.tipo = 'NF' AND v.situacao = 1 AND v.atualizacao = ?`,
          [idVendedor, dataHoje]
        )

        const atendidasComBaixa = await Promise.all(
          atendidas.map(async (venda) => {
            const [pendencias] = await db.query(
              `SELECT COUNT(*) AS pendentes
       FROM vendas 
       WHERE cliente_id = ? AND tipo = 'NF' AND situacao IS NULL AND status_venda = 1 AND vencimento >= ?`,
              [venda.cliente_id, dataHoje]
            )
            const isBaixa = pendencias[0].pendentes === 0
            return {
              ...venda,
              baixaDoDia: isBaixa,
            }
          })
        )

        // Vendas próximas
        const [proximas] = await db.query(
          `SELECT v.vencimento, c.id, c.nomeCliente, c.cidade, c.endereco, c.pontoRef, c.latitude, c.longitude
           FROM vendas v
           INNER JOIN clientes c ON v.cliente_id = c.id
           WHERE v.idVendedor = ? AND v.tipo = 'NF' AND v.situacao IS NULL AND v.atualizacao = ?`,
          [idVendedor, dataHoje]
        )

        // Clientes novos no dia
        const [clientesNovos] = await db.query(
          `SELECT id AS cliente_id, nomeCliente, cidade, endereco, pontoRef, latitude, longitude, status, data_cadastro
           FROM clientes
           WHERE idVendedor = ? AND data_cadastro = ?`,
          [idVendedor, dataHoje]
        )

        const clientesNovosComBaixa = await Promise.all(
          clientesNovos.map(async (cliente) => {
            const [pendencias] = await db.query(
              `SELECT COUNT(*) AS pendentes
               FROM vendas 
               WHERE cliente_id = ? AND tipo = 'NF' AND situacao IS NULL AND status_venda = 1 AND vencimento >= ?`,
              [cliente.cliente_id, dataHoje]
            )
            const isBaixa = pendencias[0].pendentes === 0
            return {
              ...cliente,
              baixaDoDia: isBaixa,
            }
          })
        )

        // Totais recebidos do dia
        const [somaValores] = await db.query(
          `SELECT 
             SUM(CASE WHEN tipo = 'NF' THEN valorRecebido ELSE 0 END) AS totalRecebidoNF,
             SUM(CASE WHEN tipo = 'RESTANTE DE VENDA' THEN valorRecebido ELSE 0 END) AS totalRecebidoRestante
           FROM vendas
           WHERE idVendedor = ? 
             AND atualizacao = ? 
             AND situacao = 1 
             AND tipo IN ('NF', 'RESTANTE DE VENDA')`,
          [idVendedor, dataHoje]
        )

        const totalRecebidoNF = somaValores[0].totalRecebidoNF || 0
        const totalRecebidoRestante = somaValores[0].totalRecebidoRestante || 0

        return {
          idVendedor,
          nome_unico,
          atendidas: atendidasComBaixa,
          totalAtendidas: atendidas.length,
          proximas,
          totalProximas: proximas.length,
          clientesNovos: clientesNovosComBaixa,
          totalClientesNovos: clientesNovos.length,
          totalRecebidoNF,
          totalRecebidoRestante,
        }
      })
    )

    // Calcular totais gerais
    const totalBaixas = resultados.reduce((total, vendedor) => {
      const baixasAtendidas = vendedor.atendidas.filter(
        (c) => c.baixaDoDia
      ).length
      const baixasNovos = vendedor.clientesNovos.filter(
        (c) => c.baixaDoDia
      ).length
      return total + baixasAtendidas + baixasNovos
    }, 0)

    const totalClientesNovosDia = resultados.reduce(
      (total, vendedor) => total + vendedor.totalClientesNovos,
      0
    )

    const totalAtendidasDia = resultados.reduce(
      (total, vendedor) => total + vendedor.totalAtendidas,
      0
    )

    res.status(200).json({
      resumo: {
        totalBaixasDoDia: totalBaixas,
        totalClientesNovosDoDia: totalClientesNovosDia,
        totalAtendidasDoDia: totalAtendidasDia,
      },
      resultados,
    })
  } catch (err) {
    console.error('Erro no acompanhamentoGeral:', err)
    res.status(500).json({ error: 'Erro ao gerar acompanhamento geral' })
  }
}
exports.listarVendedores = async (req, res) => {
  const { status } = req.query // pega o parâmetro ?status=1 ou ?status=0

  try {
    let sql =
      'SELECT idVendedor, nome, nome_unico, cpf, rotas, status FROM vendedores'
    let params = []

    if (status === '1' || status === '0') {
      sql += ' WHERE status = ?'
      params.push(status)
    }

    const [vendedores] = await db.query(sql, params)

    if (vendedores.length === 0) {
      return res.status(404).json({ message: 'Nenhum vendedor encontrado.' })
    }

    res.status(200).json(vendedores)
  } catch (error) {
    console.error('Erro ao buscar vendedores:', error)
    res.status(500).json({ message: 'Erro interno ao buscar vendedores.' })
  }
}

exports.cadastrarVendedor = async (req, res) => {
  const { nome, nome_unico, cpf, rotas } = req.body

  if (!nome || !cpf || !rotas) {
    return res
      .status(400)
      .json({ error: 'Campos obrigatórios estão faltando.' })
  }

  try {
    const [existing] = await db.query(
      'SELECT * FROM vendedores WHERE cpf = ?',
      [cpf]
    )
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Vendedor com este CPF já existe.' })
    }

    await db.query(
      'INSERT INTO vendedores (nome, nome_unico, cpf, rotas, status) VALUES (?, ?, ?, ?, 1)',
      [nome, nome_unico || null, cpf, rotas]
    )

    res.status(201).json({ message: 'Vendedor cadastrado com sucesso.' })
  } catch (error) {
    console.error('Erro ao cadastrar vendedor:', error)
    res.status(500).json({ error: 'Erro interno ao cadastrar vendedor.' })
  }
}
exports.getVendedorById = async (req, res) => {
  const { idVendedor } = req.params

  try {
    const [vendedor] = await db.query(
      'SELECT * FROM vendedores WHERE idVendedor = ?',
      [idVendedor]
    )
    if (vendedor.length === 0) {
      return res.status(404).json({ error: 'Vendedor não encontrado.' })
    }
    res.status(200).json(vendedor[0])
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error)
    res.status(500).json({ error: 'Erro interno ao buscar vendedor.' })
  }
}
exports.atualizarVendedor = async (req, res) => {
  const { idVendedor, nome, nome_unico, rotas, status } = req.body

  if (!idVendedor) {
    return res.status(400).json({ error: 'idVendedor é obrigatório.' })
  }

  try {
    const [vendedor] = await db.query(
      'SELECT * FROM vendedores WHERE idVendedor = ?',
      [idVendedor]
    )
    if (vendedor.length === 0) {
      return res.status(404).json({ error: 'Vendedor não encontrado.' })
    }

    await db.query(
      `UPDATE vendedores SET
        nome = COALESCE(?, nome),
        nome_unico = COALESCE(?, nome_unico),
        rotas = COALESCE(?, rotas),
        status = COALESCE(?, status)
      WHERE idVendedor = ?`,
      [nome, nome_unico, rotas, status, idVendedor]
    )

    res.status(200).json({ message: 'Vendedor atualizado com sucesso.' })
  } catch (error) {
    console.error('Erro ao atualizar vendedor:', error)
    res.status(500).json({ error: 'Erro interno ao atualizar vendedor.' })
  }
}
