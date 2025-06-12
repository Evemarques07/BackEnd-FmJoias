const db = require('../../db')
const jwt = require('jsonwebtoken')

exports.registerSale = async (req, res) => {
  try {
    const { id, vencimento, valor, cliente_id } = req.body

    // Verificar se o cliente existe
    const [cliente] = await db.query(
      'SELECT id, nomeCliente, rota, idVendedor FROM clientes WHERE id = ?',
      [cliente_id]
    )
    if (cliente.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' })
    }

    const { nomeCliente, rota, idVendedor } = cliente[0]

    // Verificar se o vendedor existe
    const [vendedor] = await db.query(
      'SELECT nome FROM vendedores WHERE idVendedor = ?',
      [idVendedor]
    )
    if (vendedor.length === 0) {
      return res.status(404).json({ error: 'Vendedor não encontrado' })
    }

    const nomeVendedor = vendedor[0].nome

    // Converta a data para o formato 'YYYY-MM-DD HH:MM:SS'
    const formattedVencimento = new Date(vencimento)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')

    const vendaQuery = `
      INSERT INTO vendas (tipo, id, vencimento, atualizacao, valor, valorRecebido, cliente_id, status_venda)
      VALUES ('NF', ?, ?, NOW(), ?, 0, ?, 1)
    `

    const vendaValues = [id, formattedVencimento, valor, cliente_id]

    const clienteQuery = `
      UPDATE clientes
      SET status = 1
      WHERE id = ?
    `

    await db.query(vendaQuery, vendaValues)
    await db.query(clienteQuery, [cliente_id])

    res.status(201).json({
      message: `Venda registrada com sucesso para o cliente: ${nomeCliente} da Rota: ${rota} e Vendedor: ${nomeVendedor}`,
    })
  } catch (error) {
    console.error('Erro ao registrar venda:', error.message)
    res
      .status(500)
      .json({ error: 'Erro ao registrar venda', detalhes: error.message })
  }
}
exports.getClienteById = async (req, res) => {
  try {
    const { id } = req.params
    const [cliente] = await db.query(
      'SELECT nomeCliente FROM clientes WHERE id = ?',
      [id]
    )

    if (cliente.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' })
    }

    res.status(200).json(cliente[0])
  } catch (error) {
    console.error('Erro ao buscar cliente:', error.message)
    res.status(500).json({ error: 'Erro ao buscar cliente' })
  }
}
exports.getSalesByClientId = async (req, res) => {
  try {
    const { id } = req.params

    // Verificar se o ID foi fornecido
    if (!id) {
      return res.status(400).json({ error: 'O campo id é obrigatório' })
    }

    // SQL para buscar todas as vendas pelo ID do cliente
    const sql = `SELECT * FROM vendas WHERE id = ?`
    const [rows] = await db.query(sql, [id])

    // Verificar se alguma venda foi encontrada
    if (rows.length === 0) {
      return res
        .status(204)
        .json({ message: 'Nenhuma venda encontrada para o ID fornecido' })
    }

    // Retornar as vendas encontradas em formato JSON
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar vendas:', error)
    res.status(500).json({ error: 'Erro ao buscar vendas' })
  }
}
exports.searchClientesByNome = async (req, res) => {
  try {
    const { nome } = req.query
    const [clientes] = await db.query(
      'SELECT id, nomeCliente FROM clientes WHERE nomeCliente LIKE ?',
      [`%${nome}%`]
    )

    if (clientes.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' })
    }

    res.status(200).json(clientes)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error.message)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.createSaleAdm = async (req, res) => {
  try {
    const { id, vencimento, valor, tipo, idVendedor, kit, rota } = req.body

    if (
      !id ||
      !vencimento ||
      valor === undefined ||
      idVendedor === undefined ||
      !rota
    ) {
      return res.status(400).json({
        error:
          'Campos obrigatórios ausentes: id, vencimento, valor, idVendedor e rota são necessários.',
      })
    }

    const validTypes = ['NF', 'RESTANTE DE VENDA', 'RESTANTE NA NOVA']
    if (!validTypes.includes(tipo)) {
      return res.status(400).json({
        error:
          'Tipo inválido. Os valores permitidos são: NF, RESTANTE DE VENDA, RESTANTE NA NOVA.',
      })
    }

    const atualizacao = new Date().toISOString().split('T')[0]
    const valorRecebido = 0
    const vb = null
    const situacao = null
    const cliente_id = id
    const status_venda = 1

    const sqlInsert = `
      INSERT INTO vendas (
        tipo, kit, id, vencimento, atualizacao, valor, valorRecebido,
        vb, situacao, cliente_id, idVendedor, status_venda, rota
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    const paramsInsert = [
      tipo,
      kit,
      id,
      vencimento,
      atualizacao,
      valor,
      valorRecebido,
      vb,
      situacao,
      cliente_id,
      idVendedor,
      status_venda,
      rota,
    ]

    const [result] = await db.query(sqlInsert, paramsInsert)

    if (tipo === 'NF') {
      await db.query(`UPDATE clientes SET status = 1 WHERE id = ?`, [
        cliente_id,
      ])
    }

    res.status(201).json({
      message: 'Venda criada com sucesso!',
      venda_id: result.insertId,
    })
  } catch (error) {
    console.error('Erro ao criar venda:', error)
    res.status(500).json({ error: 'Erro ao criar venda' })
  }
}
exports.updateSaleById = async (req, res) => {
  try {
    const { venda_id } = req.params
    const {
      tipo,
      kit,
      id,
      vencimento,
      valor,
      valorRecebido,
      cliente_id,
      status_venda,
      observacao,
      atualizarDataAtual, // Recebe a informação do checkbox
      vendedorId, // Novo campo para o ID do vendedor
      idVendedor,
      vb,
    } = req.body

    const idVendedorFinal = idVendedor || vendedorId

    if (!venda_id) {
      return res.status(400).json({ error: 'O campo venda_id é obrigatório' })
    }

    const effectiveClienteId = cliente_id || id

    let sql = `UPDATE vendas SET `
    const updates = []
    const params = []

    if (tipo) {
      updates.push(`tipo = ?`)
      params.push(tipo)
    }

    if (kit !== undefined) {
      updates.push(`kit = ?`)
      params.push(kit)
    }

    if (id) {
      updates.push(`id = ?`)
      params.push(id)
    }

    if (vencimento) {
      updates.push(`vencimento = ?`)
      params.push(vencimento)
    }

    if (valor) {
      updates.push(`valor = ?`)
      params.push(valor)
    }

    if (valorRecebido !== undefined) {
      updates.push(`valorRecebido = ?`)
      params.push(valorRecebido)
    }

    if (effectiveClienteId) {
      updates.push(`cliente_id = ?`)
      params.push(effectiveClienteId)
    }

    if (status_venda !== undefined) {
      updates.push(`status_venda = ?`)
      params.push(status_venda)

      const statusVendaInt = Number(status_venda)
      if (statusVendaInt === 0) {
        console.log('🔁 status_venda é 0 — atualizando situacao = 1')
        updates.push(`situacao = ?`)
        params.push(1)
      } else if (statusVendaInt === 1) {
        console.log('🔁 status_venda é 1 — atualizando situacao = NULL')
        updates.push(`situacao = ?`)
        params.push(null)
      }
    }

    if (observacao !== undefined) {
      updates.push(`observacao = ?`)
      params.push(observacao)
    }

    if (idVendedorFinal) {
      updates.push(`idVendedor = ?`)
      params.push(idVendedorFinal)
    }

    if (req.body.hasOwnProperty('vb')) {
      if (vb === null) {
        updates.push(`vb = ?`)
        params.push(null)
      } else {
        updates.push(`vb = ?`)
        params.push(vb)
      }
    }

    if (atualizarDataAtual) {
      updates.push(`atualizacao = CURDATE()`)
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ error: 'Nenhum campo para atualizar foi fornecido' })
    }

    sql += updates.join(', ') + ' WHERE venda_id = ?'
    params.push(venda_id)

    console.log('SQL Update:', sql)
    console.log('Parâmetros:', params)

    const [result] = await db.query(sql, params)

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Venda não encontrada' })
    }

    res.status(200).json({ message: 'Venda atualizada com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar venda:', error)
    res.status(500).json({ error: 'Erro ao atualizar venda' })
  }
}
exports.getSaleById = async (req, res) => {
  try {
    const { venda_id } = req.params

    // Verifica se o ID da venda foi fornecido
    if (!venda_id) {
      return res.status(400).json({ error: 'O campo venda_id é obrigatório' })
    }

    // SQL para buscar a venda pelo venda_id
    const sql = 'SELECT * FROM vendas WHERE venda_id = ?'
    const params = [venda_id]

    const [result] = await db.query(sql, params)

    // Verifica se a venda foi encontrada
    if (result.length === 0) {
      return res.status(404).json({ message: 'Venda não encontrada' })
    }

    res.status(200).json(result[0]) // Retorna a venda encontrada
  } catch (error) {
    console.error('Erro ao buscar venda:', error)
    res.status(500).json({ error: 'Erro ao buscar venda' })
  }
}
exports.deleteSaleById = async (req, res) => {
  try {
    const { venda_id } = req.params

    // Verifica se o ID da venda foi fornecido
    if (!venda_id) {
      return res.status(400).json({ error: 'O campo venda_id é obrigatório' })
    }

    // SQL para deletar a venda pelo ID
    const sql = `DELETE FROM vendas WHERE venda_id = ?`

    // Executa a query de deleção
    const [result] = await db.query(sql, [venda_id])

    // Verifica se a venda foi encontrada e deletada
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Venda não encontrada' })
    }

    res.status(200).json({ message: 'Venda deletada com sucesso' })
  } catch (error) {
    console.error('Erro ao deletar venda:', error)
    res.status(500).json({ error: 'Erro ao deletar venda' })
  }
}
exports.listSalesByRoute = async (req, res) => {
  try {
    const { idVendedor, rota, dataInicial, dataFinal } = req.body

    // Verifica se todos os parâmetros necessários foram fornecidos
    if (!idVendedor || !rota || !dataInicial || !dataFinal) {
      return res.status(400).json({
        error:
          'Os campos idVendedor, rota, dataInicial e dataFinal são obrigatórios',
      })
    }

    // Query SQL para buscar as vendas dentro do intervalo de datas
    const sql = `
      SELECT 
          clientes.id, 
          clientes.nomeCliente, 
          clientes.idVendedor, 
          clientes.rota,
          vendas.valor,
          vendas.venda_id,
          DATE_FORMAT(vendas.vencimento, '%d/%m/%y') AS vencimento,
          EXISTS (
              SELECT 1
              FROM vendas v4
              WHERE v4.cliente_id = vendas.cliente_id
                AND v4.tipo = 'RESTANTE NA NOVA'
                AND v4.status_venda = 1
          ) AS NOVA_tipo_1
      FROM 
          clientes 
      JOIN 
          vendas 
      ON 
          vendas.cliente_id = clientes.id 
      WHERE 
          vendas.idVendedor = ? 
          AND clientes.rota = ?
          AND vendas.tipo = 'NF' 
          AND vendas.status_venda = 1 
          AND vendas.vencimento BETWEEN ? AND ? 
      ORDER BY 
          vendas.vencimento ;

    `

    // Executa a query
    const [rows] = await db.query(sql, [
      idVendedor,
      rota,
      dataInicial,
      dataFinal,
    ])

    // Retorna os resultados junto com a quantidade de registros
    res.status(200).json({
      totalRegistros: rows.length,
      vendas: rows,
    })
  } catch (error) {
    console.error('Erro ao listar vendas:', error)
    res.status(500).json({ error: 'Erro ao listar vendas' })
  }
}
exports.listSalesByTypeAndRoute = async (req, res) => {
  try {
    const { tipo, rota, idVendedor } = req.body

    // Verifica se todos os parâmetros necessários foram fornecidos
    if (!tipo || !rota || !idVendedor) {
      return res
        .status(400)
        .json({ error: 'Os campos tipo, rota e idVendedor são obrigatórios' })
    }

    // Query SQL para buscar as vendas de acordo com o tipo, rota e idVendedor
    const sql = `
      SELECT 
        c.id, 
        c.nomeCliente, 
        DATE_FORMAT(v.vencimento, '%d-%m-%Y') AS vencimento, 
        v.valor 
      FROM 
        clientes c 
      JOIN 
        vendas v 
      ON 
        c.id = v.cliente_id 
      WHERE 
        c.rota = ? 
        AND c.idVendedor = ? 
        AND v.tipo = ? 
        AND v.status_venda = 1 
        AND DATE(v.vencimento) > DATE_ADD(CURDATE(), INTERVAL 1 DAY) 
      ORDER BY 
        c.nomeCliente
    `

    // Executa a query
    const [rows] = await db.query(sql, [rota, idVendedor, tipo])

    // Retorna os resultados junto com a quantidade de registros
    res.status(200).json({
      totalRegistros: rows.length,
      vendas: rows,
    })
  } catch (error) {
    console.error('Erro ao listar vendas:', error)
    res.status(500).json({ error: 'Erro ao listar vendas' })
  }
}
exports.listSalesAndSum = async (req, res) => {
  try {
    const { rota, idVendedor, dataInicial, dataFinal } = req.body

    // Verifica se todos os parâmetros necessários foram fornecidos
    if (!rota || !idVendedor || !dataInicial || !dataFinal) {
      return res.status(400).json({
        error:
          'Os campos rota, idVendedor, dataInicial e dataFinal são obrigatórios',
      })
    }

    // Query para listar as vendas do tipo 'NF'
    const salesNFQuery = `
      SELECT 
          clientes.id, 
          clientes.nomeCliente, 
          vendas.valor, 
          vendas.valorRecebido, 
          vendas.tipo, 
          DATE_FORMAT(vendas.vencimento, '%d-%m-%Y') AS vencimento,
          DATE_FORMAT(vendas.atualizacao, '%d-%m-%Y') AS atualizacao,
          EXISTS (
              SELECT 1
              FROM vendas v3
              WHERE v3.cliente_id = vendas.cliente_id
                AND v3.tipo = 'RESTANTE DE VENDA'
                AND v3.status_venda = 1
          ) AS restante_venda_1,
          EXISTS (
              SELECT 1
              FROM vendas v4
              WHERE v4.cliente_id = vendas.cliente_id
                AND v4.tipo = 'RESTANTE NA NOVA'
                AND v4.status_venda = 1
          ) AS NOVA_tipo_1
      FROM 
          vendas
      JOIN 
          clientes 
      ON 
          vendas.cliente_id = clientes.id
      WHERE 
          vendas.tipo = 'NF'
          AND clientes.rota = ?
          AND vendas.idVendedor = ?
          AND vendas.status_venda = 0
          AND vendas.valorRecebido < 2000
          AND vendas.atualizacao BETWEEN ? AND ?
      ORDER BY 
          vendas.vencimento;
    `

    // Query para listar as vendas do tipo 'RESTANTE DE VENDA'
    const salesRestanteVendaQuery = `
      SELECT 
        clientes.id, 
        clientes.nomeCliente, 
        vendas.valor, 
        vendas.valorRecebido, 
        vendas.tipo, 
        DATE_FORMAT(vendas.atualizacao, '%d-%m-%Y') AS atualizacao
      FROM 
        vendas
      JOIN 
        clientes 
      ON 
        vendas.cliente_id = clientes.id
      WHERE 
        vendas.tipo = 'RESTANTE DE VENDA'
        AND vendas.idVendedor = ?
        AND vendas.atualizacao BETWEEN ? AND ?
        AND vendas.valorRecebido != 0
      ORDER BY 
        vendas.atualizacao;
    `

    // Query para somar os valores recebidos das vendas do tipo 'NF'
    const sumNFQuery = `
      SELECT 
        SUM(vendas.valorRecebido) AS soma_valorRecebido
      FROM 
        vendas
      JOIN 
        clientes 
      ON 
        vendas.cliente_id = clientes.id
      WHERE 
        vendas.tipo = 'NF'
        AND clientes.rota = ?
        AND vendas.idVendedor = ?
        AND vendas.atualizacao BETWEEN ? AND ?;
    `

    // Query para somar os valores recebidos das vendas do tipo 'RESTANTE DE VENDA'
    const sumRestanteVendaQuery = `
      SELECT 
        SUM(vendas.valorRecebido) AS soma_valorRecebido
      FROM 
        vendas
      JOIN 
        clientes 
      ON 
        vendas.cliente_id = clientes.id
      WHERE 
        vendas.tipo = 'RESTANTE DE VENDA'
        AND vendas.idVendedor = ?
        AND vendas.atualizacao BETWEEN ? AND ?
        AND vendas.valorRecebido != 0;
    `

    // Query para contar o total de registros para cada tipo de venda
    const countNFQuery = `
      SELECT 
        COUNT(*) AS total_registros_nf
      FROM 
        vendas
      JOIN 
        clientes 
      ON 
        vendas.cliente_id = clientes.id
      WHERE 
        vendas.tipo = 'NF'
        AND clientes.rota = ? 
        AND vendas.idVendedor = ? 
        AND vendas.status_venda = 0
        AND vendas.atualizacao BETWEEN ? AND ?
        `
    // AND vendas.valorRecebido < 2000

    const countRestanteVendaQuery = `
      SELECT 
        COUNT(*) AS total_registros_restante_de_venda
      FROM 
        vendas
      JOIN 
        clientes 
      ON 
        vendas.cliente_id = clientes.id
      WHERE 
        vendas.tipo = 'RESTANTE DE VENDA'
        AND vendas.idVendedor = ?
        AND vendas.atualizacao BETWEEN ? AND ?
        AND vendas.valorRecebido != 0;
    `

    // Executa a query para listar as vendas do tipo 'NF'
    const [salesNFRows] = await db.query(salesNFQuery, [
      rota,
      idVendedor,
      dataInicial,
      dataFinal,
    ])

    // Executa a query para listar as vendas do tipo 'RESTANTE DE VENDA'
    const [salesRestanteVendaRows] = await db.query(salesRestanteVendaQuery, [
      idVendedor,
      dataInicial,
      dataFinal,
    ])

    // Executa a query para somar os valores recebidos das vendas do tipo 'NF'
    const [sumNFRows] = await db.query(sumNFQuery, [
      rota,
      idVendedor,
      dataInicial,
      dataFinal,
    ])

    // Executa a query para somar os valores recebidos das vendas do tipo 'RESTANTE DE VENDA'
    const [sumRestanteVendaRows] = await db.query(sumRestanteVendaQuery, [
      idVendedor,
      dataInicial,
      dataFinal,
    ])

    // Executa a query para contar o total de registros de tipo 'NF'
    const [countNFRows] = await db.query(countNFQuery, [
      rota,
      idVendedor,
      dataInicial,
      dataFinal,
    ])

    // Executa a query para contar o total de registros de tipo 'RESTANTE DE VENDA'
    const [countRestanteVendaRows] = await db.query(countRestanteVendaQuery, [
      idVendedor,
      dataInicial,
      dataFinal,
    ])

    // Extrai a soma dos valores recebidos para cada tipo
    const somaValorRecebidoNF = sumNFRows[0].soma_valorRecebido || 0
    const somaValorRecebidoRestanteVenda =
      sumRestanteVendaRows[0].soma_valorRecebido || 0

    // Extrai o total de registros para cada tipo
    const totalRegistrosNF = countNFRows[0].total_registros_nf || 0
    const totalRegistrosRestanteVenda =
      countRestanteVendaRows[0].total_registros_restante_de_venda || 0

    // Calcula a média do valor recebido para registros do tipo 'NF'
    const mediaValorRecebidoNF =
      totalRegistrosNF > 0 ? somaValorRecebidoNF / totalRegistrosNF : 0

    // Retorna os resultados
    res.status(200).json({
      sales_nf: salesNFRows,
      sales_restante_de_venda: salesRestanteVendaRows,
      soma_valorRecebido_nf: somaValorRecebidoNF,
      soma_valorRecebido_restante_de_venda: somaValorRecebidoRestanteVenda,
      total_registros_nf: totalRegistrosNF,
      total_registros_restante_de_venda: totalRegistrosRestanteVenda,
      media_valorRecebido_nf: mediaValorRecebidoNF,
    })
  } catch (error) {
    console.error('Erro ao listar vendas e calcular soma:', error)
    res.status(500).json({ error: 'Erro ao listar vendas e calcular soma' })
  }
}
exports.vendasByClientId = async (req, res) => {
  const { id } = req.body // Mude para pegar o ID do corpo da requisição
  // console.log(`[INFO] Recebido pedido de vendas por clientId: ${id}`)
  try {
    const query = `
        SELECT 
        v.venda_id,
        v.kit,
        v.id,
        v.tipo,
        v.vencimento,
        v.atualizacao,
        v.valor,
        v.valorRecebido,
        v.status_venda,
        v.vb,
        v.observacao,
        vd.nome_unico,
        c.pendencia
      FROM vendas v
      INNER JOIN vendedores vd ON v.idVendedor = vd.idVendedor
      INNER JOIN clientes c ON v.cliente_id = c.id
      WHERE v.cliente_id = ?
      ORDER BY
        v.vencimento DESC;
    `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: ${id}`
    // )
    const [rows] = await db.query(query, [id])
    // console.log('[INFO] Resultados da consulta:', rows)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar vendas pelo clientId:', error)
    res.status(500).json({ error: 'Erro ao buscar vendas pelo clientId' })
  }
}
exports.createNewSale = async (req, res) => {
  const {
    tipo,
    id,
    vencimento,
    valor,
    valorRecebido,
    cliente_id,
    idVendedor,
    sku, // Novo parâmetro para o kit (SKU)
    rota, // Novo parâmetro para a rota
  } = req.body
  // console.log('[INFO] Dados recebidos para criar nova venda:', req.body)

  try {
    // Verifica se já existe uma venda com os mesmos critérios
    const checkQuery = `
      SELECT * FROM vendas 
      WHERE id = ? 
        AND vencimento = ? 
        AND valor = ? 
        AND kit = ? 
        AND cliente_id = ? 
        AND status_venda = 1
    `
    const [existingSale] = await db.query(checkQuery, [
      id,
      vencimento,
      valor,
      sku,
      cliente_id,
    ])

    if (existingSale.length > 0) {
      console.log(
        '[INFO] Venda já registrada para este cliente com os mesmos critérios.'
      )
      return res
        .status(400)
        .json({ error: 'Venda já registrada para este cliente' })
    }

    // Se não existir uma venda duplicada, insere a nova venda
    const insertQuery = `
      INSERT INTO vendas (tipo, kit, id, vencimento, atualizacao, valor, valorRecebido, cliente_id, idVendedor, status_venda, rota)
      VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
    `
    // console.log('[INFO] Executando query SQL:', insertQuery)

    const result = await db.query(insertQuery, [
      tipo,
      sku,
      id,
      vencimento,
      valor,
      valorRecebido,
      cliente_id,
      idVendedor,
      1,
      rota,
    ])
    // console.log('[INFO] Resultado da query de venda:', result)

    // Atualiza o status, rota e idVendedor do cliente
    const updateClientStatusQuery = `
      UPDATE clientes 
      SET rota = ?, idVendedor = ?, status = 1  
      WHERE id = ?
    `
    const resultStatus = await db.query(updateClientStatusQuery, [
      rota,
      idVendedor,
      id,
    ])
    // console.log(
    //   '[INFO] Resultado da atualização de status do cliente:',
    //   resultStatus
    // )
    // console.log(
    //   '[INFO] Cliente atualizado com nova rota, idVendedor e status ativo.'
    // )

    // Envia a resposta após todas as operações serem concluídas
    res
      .status(201)
      .json({ message: 'Nova venda criada e cliente atualizado com sucesso' })
  } catch (error) {
    console.error('[ERROR] Erro ao criar nova venda:', error)
    res.status(500).json({ error: 'Erro ao criar nova venda' })
  }
}
exports.verificarDuplicidade = async (req, res) => {
  const { cliente_id, vencimento, valor, sku } = req.body

  if (!cliente_id || !vencimento || !valor || !sku) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' })
  }

  try {
    const checkQuery = `
      SELECT COUNT(*) AS total FROM vendas 
      WHERE cliente_id = ? 
        AND DATE(vencimento) = DATE(?) 
        AND valor = ? 
        AND kit = ? 
        AND status_venda = 1
    `
    const [[result]] = await db.query(checkQuery, [
      cliente_id,
      vencimento,
      valor,
      sku,
    ])

    const quantidade = result.total
    const duplicada = quantidade > 0

    return res.status(200).json({ duplicada, quantidade })
  } catch (error) {
    console.error('Erro ao verificar duplicidade:', error)
    res.status(500).json({ error: 'Erro interno' })
  }
}
exports.getSpecificSaleByVendaId = async (req, res) => {
  const { vendaId } = req.params
  try {
    const query = `
      SELECT *
      FROM vendas
      WHERE venda_id = ? AND status_venda = 1
    `
    const [rows] = await db.query(query, [vendaId])
    if (rows.length === 0) {
      res.status(404).json({ message: 'Nenhuma venda encontrada.' })
    } else {
      res.status(200).json(rows[0])
    }
  } catch (error) {
    console.error('[ERROR] Erro ao buscar venda específica:', error)
    res.status(500).json({ error: 'Erro ao buscar venda específica' })
  }
}
exports.getRestanteNaNova = async (req, res) => {
  const { clientId } = req.params
  // console.log(
  //   `[INFO] Recebido pedido de RESTANTE NA NOVA para clientId: ${clientId}`
  // )
  try {
    const query = `
      SELECT venda_id, valor
      FROM vendas
      WHERE cliente_id = ?
        AND tipo = 'RESTANTE NA NOVA'
        AND valorRecebido = 0
        AND status_venda = 1
    `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: ${clientId}`
    // )
    const [rows] = await db.query(query, [clientId])
    if (rows.length > 0) {
      // console.log('[INFO] Resultados da consulta:', rows[0])
      res.status(200).json(rows[0])
    } else {
      res.status(200).json({ venda_id: null, valor: 0 })
    }
  } catch (error) {
    console.error('[ERROR] Erro ao buscar restante na nova:', error)
    res.status(500).json({ error: 'Erro ao buscar restante na nova' })
  }
}
exports.updateRestanteNaNova = async (req, res) => {
  const { venda_id, valorRecebido } = req.body
  // console.log(
  //   `[INFO] Atualizando RESTANTE NA NOVA para venda_id: ${venda_id}, valorRecebido: ${valorRecebido}`
  // )

  const valorRecebidoNum = parseFloat(valorRecebido)
  if (isNaN(valorRecebidoNum)) {
    return res.status(400).json({ message: 'Valor recebido inválido' })
  }

  try {
    const query = `
      UPDATE vendas
      SET valorRecebido = ?, status_venda = 0, atualizacao = CURRENT_DATE()
      WHERE venda_id = ? AND tipo = 'RESTANTE NA NOVA'
    `
    // console.log('[INFO] Executando consulta SQL:', query)

    const [result] = await db.query(query, [valorRecebidoNum, venda_id])
    // console.log('[INFO] Resultados da consulta:', result)

    if (result.affectedRows === 0) {
      console.warn(
        '[WARN] Nenhuma linha foi atualizada. Verifique o venda_id fornecido.'
      )
      res.status(404).json({
        message:
          'Nenhuma linha foi atualizada. Verifique o venda_id fornecido.',
      })
    } else {
      // console.log(
      //   '[INFO] Valor recebido do RESTANTE NA NOVA atualizado com sucesso'
      // )
      res.status(200).json({ message: 'Valor recebido atualizado com sucesso' })
    }
  } catch (error) {
    console.error('[ERROR] Erro ao atualizar valor recebido:', error)
    res.status(500).json({ error: 'Erro ao atualizar valor recebido' })
  }
}
exports.updateValorRecebido = async (req, res) => {
  const { venda_id, valor, valorRecebido } = req.body

  // Extraindo o token do cabeçalho
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    console.error('[ERROR] Token não fornecido')
    return res.status(401).json({ error: 'Token não fornecido' })
  }

  let idVendedor
  try {
    // Decodificando o token para obter o idVendedor
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET) // Certifique-se de definir JWT_SECRET no ambiente
    idVendedor = decodedToken.idVendedor
    // console.log(`[INFO] idVendedor obtido do token: ${idVendedor}`)
  } catch (error) {
    console.error('[ERROR] Erro ao decodificar o token:', error)
    return res.status(403).json({ error: 'Token inválido ou expirado' })
  }

  // Definindo valor baixo (vb) se valorRecebido for menor que 80
  const vb = valorRecebido < 80 ? 'VENDA BAIXA' : null

  try {
    // Atualizando a consulta SQL para incluir idVendedor
    const query = `
      UPDATE vendas
      SET valor = ?, valorRecebido = ?, status_venda = ?, atualizacao = DATE_FORMAT(NOW(), '%Y-%m-%d'),
          vb = ?, situacao = 1, idVendedor = ?
      WHERE venda_id = ?
    `
    // console.log('[INFO] Executando consulta SQL:', query)

    // Incluindo idVendedor nos valores passados para a consulta
    const [result] = await db.query(query, [
      valor,
      valorRecebido,
      0,
      vb,
      idVendedor,
      venda_id,
    ])
    // console.log('[INFO] Resultados da consulta:', result)

    if (result.affectedRows === 0) {
      console.warn(
        '[WARN] Nenhuma linha foi atualizada. Verifique o venda_id fornecido.'
      )
      res.status(404).json({
        message:
          'Nenhuma linha foi atualizada. Verifique o venda_id fornecido.',
      })
    } else {
      // console.log('[INFO] Valores atualizados com sucesso')
      res.status(200).json({ message: 'Valores atualizados com sucesso' })
    }
  } catch (error) {
    console.error('[ERROR] Erro ao atualizar valores:', error)
    res.status(500).json({ error: 'Erro ao atualizar valores' })
  }
}
exports.createSale = async (req, res) => {
  const {
    tipo,
    id,
    vencimento,
    valor,
    valorRecebido,
    cliente_id,
    idVendedor,
    status_venda,
    kit = null, // Define kit como null caso não seja fornecido
    rota,
  } = req.body

  // Validação básica para garantir que todos os campos obrigatórios foram enviados
  if (
    !tipo ||
    id === undefined ||
    !vencimento ||
    !valor ||
    cliente_id === undefined ||
    idVendedor === undefined ||
    status_venda === undefined
  ) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' })
  }

  try {
    // Verifica se o tipo é "RESTANTE DE VENDA"
    if (tipo === 'RESTANTE DE VENDA') {
      const checkQuery = `
        SELECT venda_id FROM vendas
        WHERE tipo = 'RESTANTE NA NOVA' 
          AND id = ? 
          AND vencimento = ? 
          AND valor = ? 
          AND idVendedor = ? 
          AND cliente_id = ?
      `

      const [result] = await db.query(checkQuery, [
        id,
        vencimento,
        valor,
        idVendedor,
        cliente_id,
      ])

      if (result.length > 0) {
        // Exclui o registro "RESTANTE NA NOVA" existente
        const deleteQuery = `DELETE FROM vendas WHERE venda_id = ?`
        await db.query(deleteQuery, [result[0].venda_id])
      }
    }

    // Cria a nova venda com o campo kit incluído
    const query = `
      INSERT INTO vendas (
        tipo, kit, id, vencimento, atualizacao, valor, valorRecebido, cliente_id, idVendedor, rota, status_venda
      ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
    `

    await db.query(query, [
      tipo,
      kit, // Inclui o campo kit
      id,
      vencimento,
      valor,
      valorRecebido,
      cliente_id,
      idVendedor,
      rota,
      status_venda,
    ])

    // console.log('[INFO] Nova venda criada com sucesso')
    res.status(201).json({ message: 'Nova venda criada com sucesso' })
  } catch (error) {
    console.error('[ERROR] Erro ao criar nova venda:', error)
    res.status(500).json({ error: 'Erro ao criar nova venda' })
  }
}
exports.registrarOcorrencia = async (req, res) => {
  const {
    cliente_id,
    venda_id,
    vendedor_id,
    valor,
    valorRecebido,
    restante_pendente,
  } = req.body

  // Validação básica
  if (
    cliente_id == null ||
    venda_id == null ||
    vendedor_id == null ||
    valor == null ||
    valorRecebido == null ||
    restante_pendente == null
  ) {
    return res.status(400).json({
      error: 'Todos os campos são obrigatórios para registrar a ocorrência.',
    })
  }

  try {
    const query = `
      INSERT INTO ocorrencias 
        (cliente_id, venda_id, vendedor_id, valor, valor_recebido, restante_pendente)
      VALUES (?, ?, ?, ?, ?, ?)
    `

    await db.query(query, [
      cliente_id,
      venda_id,
      vendedor_id,
      valor,
      valorRecebido,
      restante_pendente,
    ])

    res.status(201).json({ message: 'Ocorrência registrada com sucesso.' })
  } catch (error) {
    console.error('[ERRO] ao registrar ocorrência:', error)
    res.status(500).json({ error: 'Erro ao registrar ocorrência.' })
  }
}
exports.listarOcorrenciasRegistradas = async (req, res) => {
  try {
    const query = `
      SELECT 
        o.id,
        c.nomeCliente, 
        o.venda_id, 
        vd.nome_unico AS nomeVendedor, 
        v.valor, 
        v.valorRecebido, 
        o.restante_pendente, 
        o.status_ocorrencia, 
        o.data_ocorrencia
      FROM ocorrencias o
      INNER JOIN clientes c ON o.cliente_id = c.id
      INNER JOIN vendas v ON o.venda_id = v.venda_id
      INNER JOIN vendedores vd ON o.vendedor_id = vd.idVendedor
      WHERE o.status_ocorrencia = 'registrado'
      ORDER BY o.data_ocorrencia DESC
    `

    const [rows] = await db.query(query)

    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERRO] ao listar ocorrências registradas:', error)
    res.status(500).json({ error: 'Erro ao buscar ocorrências registradas.' })
  }
}
exports.marcarOcorrenciaResolvida = async (req, res) => {
  const { ocorrenciaId } = req.params

  if (!ocorrenciaId) {
    return res.status(400).json({ error: 'ID da ocorrência não fornecido.' })
  }

  try {
    const updateQuery = `
      UPDATE ocorrencias
      SET status_ocorrencia = 'resolvido'
      WHERE id = ?
    `

    const [result] = await db.query(updateQuery, [ocorrenciaId])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ocorrência não encontrada.' })
    }

    res.status(200).json({ message: 'Ocorrência marcada como resolvida.' })
  } catch (error) {
    console.error('[ERRO] ao marcar ocorrência como resolvida:', error)
    res.status(500).json({ error: 'Erro ao atualizar a ocorrência.' })
  }
}
exports.getRestandeVendaByClienteId = async (req, res) => {
  try {
    const { clientId } = req.params

    if (!clientId) {
      return res.status(400).json({ error: 'O campo clientId é obrigatório.' })
    }

    if (isNaN(clientId)) {
      return res.status(400).json({ error: 'O clientId deve ser um número.' })
    }

    const sql = `
      SELECT * 
      FROM vendas 
      WHERE tipo = 'RESTANTE DE VENDA' AND cliente_id = ?
    `
    const [result] = await db.query(sql, [clientId])

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: 'Nenhuma venda encontrada para este cliente.' })
    }

    return res.status(200).json(result)
  } catch (error) {
    console.error('Erro no getRestandeVendaByClienteId:', error)
    return res.status(500).json({ error: 'Erro interno ao buscar venda.' })
  }
}
