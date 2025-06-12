// apiAdmController.js
// const db = require('../../db')
const { pool } = require('../../db')
const axios = require('axios')
const { cidades } = require('../data/cidades')
const { formatarCPF } = require('../utils/formatarCpfCnpj')
const netrinToken = process.env.NETRIN

exports.listClients = async (req, res) => {
  try {
    // Obtem os parâmetros de query com valores padrão
    const page = parseInt(req.query.page) || 1 // Página atual
    const limit = parseInt(req.query.limit) || 20 // Quantidade por página

    const offset = (page - 1) * limit

    // Total de registros (opcional, se quiser retornar também)
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM clientes`
    )

    // Query com paginação
    const sql = `SELECT * FROM clientes ORDER BY id DESC LIMIT ? OFFSET ?`
    const [rows] = await pool.query(sql, [limit, offset])

    res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows,
    })
  } catch (error) {
    console.error('Erro ao listar clientes:', error)
    res.status(500).json({ error: 'Erro ao listar clientes' })
  }
}

exports.listNewClients = async (req, res) => {
  try {
    const { rota, idVendedor } = req.body

    if (!rota || !idVendedor) {
      return res
        .status(400)
        .json({ message: 'Parâmetros idVendedor e rota são necessários' })
    }

    const sql = `SELECT 
    c.*, 
    v.tipo, 
    v.vencimento
FROM 
    clientes c
LEFT JOIN 
    vendas v ON c.id = v.cliente_id AND v.status_venda = 1
WHERE 
    c.idVendedor = ? 
    AND c.rota = ? 
    AND c.data_cadastro > CURDATE() - INTERVAL 40 DAY
ORDER BY 
    c.id DESC;
`
    const [rows] = await pool.query(sql, [idVendedor, rota])

    // Contar o número de registros
    const count = rows.length

    if (count === 0) {
      return res.status(404).json({ message: 'Nenhum cliente encontrado' })
    }

    res.status(200).json({ count, clients: rows })
  } catch (error) {
    console.error('Erro ao listar clientes:', error)
    res.status(500).json({ error: 'Erro ao listar clientes' })
  }
}
exports.registerClient = async (req, res) => {
  try {
    const {
      nomeCliente,
      cpf,
      endTipo,
      endereco,
      numero,
      bairro,
      pontoRef,
      estado,
      cidade,
      telefone,
      nomeMae,
      dataNascimento,
      rota,
      idVendedor,
      status = 'inativa',
    } = req.body

    const cpfFormatado = formatarCPF(cpf)

    const statusValue = status === 'ativa' ? 1 : 0

    const sql = `
      INSERT INTO clientes (
        nomeCliente, cpf, endTipo, endereco, numero, bairro, pontoRef, estado, cidade, telefone,
        nomeMae, dataNascimento, rota, idVendedor, status, data_cadastro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    const dataCadastro = new Date().toISOString().split('T')[0] // Define a data de cadastro como a data atual

    const [result] = await pool.query(sql, [
      nomeCliente,
      cpfFormatado,
      endTipo,
      endereco,
      numero,
      bairro,
      pontoRef,
      estado,
      cidade,
      telefone,
      nomeMae,
      dataNascimento,
      rota,
      idVendedor,
      statusValue,
      dataCadastro,
    ])

    res.status(201).json({
      message: 'Cliente cadastrado com sucesso!',
      id: result.insertId,
      nomeCliente,
    })
  } catch (error) {
    console.error('Erro ao registrar o cliente:', error)
    res.status(500).json({ error: 'Erro ao registrar o cliente' })
  }
}
exports.searchClients = async (req, res) => {
  try {
    const { nomeCliente, cpf } = req.body

    // Construa a query dinamicamente com base nos parâmetros fornecidos
    let sql = `SELECT c.*, v.nome_unico
      FROM clientes c
      INNER JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE 1=1`
    const params = []

    if (nomeCliente) {
      sql += ` AND nomeCliente LIKE ?`
      params.push(`%${nomeCliente}%`) // Usando LIKE para busca parcial por nome
    }

    if (cpf) {
      sql += ` AND cpf = ?`
      params.push(cpf)
    }

    const [rows] = await pool.query(sql, params)

    // Retorna a resposta com os clientes encontrados, mesmo que a lista esteja vazia
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.patchClient = async (req, res) => {
  try {
    const { id } = req.params
    const {
      nomeCliente,
      cpf,
      endTipo,
      endereco,
      numero,
      bairro,
      pontoRef,
      estado,
      cidade,
      telefone,
      nomeMae,
      dataNascimento,
      rota,
      data_cadastro,
      idVendedor,
      status,
      pendencia,
    } = req.body

    // Validar se o ID foi fornecido
    if (!id) {
      return res.status(400).json({ error: 'ID do cliente é necessário' })
    }

    // Cria uma lista de atualizações dinamicamente com base nos campos fornecidos
    let sql = 'UPDATE clientes SET'
    const params = []

    const getValueOrNull = (value) =>
      value === undefined || value === '' ? null : value

    if (nomeCliente !== undefined) {
      sql += ' nomeCliente = ?,'
      params.push(getValueOrNull(nomeCliente))
    }
    if (cpf !== undefined) {
      sql += ' cpf = ?,'
      params.push(getValueOrNull(cpf))
    }
    if (endTipo !== undefined) {
      sql += ' endTipo = ?,'
      params.push(getValueOrNull(endTipo))
    }
    if (endereco !== undefined) {
      sql += ' endereco = ?,'
      params.push(getValueOrNull(endereco))
    }
    if (numero !== undefined) {
      sql += ' numero = ?,'
      params.push(getValueOrNull(numero))
    }
    if (bairro !== undefined) {
      sql += ' bairro = ?,'
      params.push(getValueOrNull(bairro))
    }
    if (pontoRef !== undefined) {
      sql += ' pontoRef = ?,'
      params.push(getValueOrNull(pontoRef))
    }
    if (estado !== undefined) {
      sql += ' estado = ?,'
      params.push(getValueOrNull(estado))
    }
    if (cidade !== undefined) {
      sql += ' cidade = ?,'
      params.push(getValueOrNull(cidade))
    }
    if (telefone !== undefined) {
      sql += ' telefone = ?,'
      params.push(getValueOrNull(telefone))
    }
    if (nomeMae !== undefined) {
      sql += ' nomeMae = ?,'
      params.push(getValueOrNull(nomeMae))
    }
    if (dataNascimento !== undefined) {
      sql += ' dataNascimento = ?,'
      params.push(getValueOrNull(dataNascimento))
    }
    if (rota !== undefined) {
      sql += ' rota = ?,'
      params.push(getValueOrNull(rota))
    }
    if (data_cadastro !== undefined) {
      sql += ' data_cadastro = ?,'
      params.push(getValueOrNull(data_cadastro))
    }
    if (idVendedor !== undefined) {
      sql += ' idVendedor = ?,'
      params.push(getValueOrNull(idVendedor))
    }
    if (status !== undefined) {
      sql += ' status = ?,'
      params.push(getValueOrNull(parseInt(status)))
    }
    if (pendencia !== undefined) {
      sql += ' pendencia = ?,'
      params.push(getValueOrNull(pendencia))
    }

    // Remove a última vírgula
    sql = sql.slice(0, -1)
    sql += ' WHERE id = ?'
    params.push(id)

    const [result] = await pool.query(sql, params)

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' })
    }

    res.status(200).json({ message: 'Cliente atualizado com sucesso!' })
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error)
    res.status(500).json({ error: 'Erro ao atualizar cliente' })
  }
}
exports.getClientById = async (req, res) => {
  try {
    // Extraindo o ID do cliente do parâmetro da rota
    const { id } = req.params

    // Verifica se o ID foi fornecido
    if (!id) {
      return res.status(400).json({ error: 'O campo id é obrigatório' })
    }

    // Query SQL para buscar o cliente pelo ID
    const sql = `SELECT c.*, v.nome_unico
      FROM clientes c
      INNER JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE c.id = ?`

    // Executa a query
    const [rows] = await pool.query(sql, [id])

    // Retorna o cliente encontrado
    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar cliente:', error)
    res.status(500).json({ error: 'Erro ao buscar cliente' })
  }
}
exports.deleteClientById = async (req, res) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: 'O campo id é obrigatório' })
    }

    await pool.query('DELETE FROM clientes_nome_historico WHERE cliente_id = ?', [
      id,
    ])

    await pool.query('DELETE FROM vendas WHERE cliente_id = ?', [id])

    const [clienteResult] = await pool.query(
      'DELETE FROM clientes WHERE id = ?',
      [id]
    )

    if (clienteResult.affectedRows > 0) {
      return res.status(200).json({ message: 'Cliente deletado com sucesso' })
    } else {
      return res.status(404).json({ error: 'Cliente não encontrado' })
    }
  } catch (error) {
    console.error('Erro ao deletar cliente:', error)
    res.status(500).json({ error: 'Erro ao deletar cliente' })
  }
}
exports.listSalesByType = async (req, res) => {
  try {
    // Extrai parâmetros do corpo da requisição
    const { idVendedor, rota, limit = 50, offset = 0 } = req.body

    // Log dos parâmetros recebidos
    // console.log('Parâmetros recebidos:', { idVendedor, rota, limit, offset })

    // Verifica se todos os parâmetros necessários foram fornecidos
    if (!idVendedor || !rota) {
      // console.log('Parâmetros inválidos:', { idVendedor, rota })
      return res
        .status(400)
        .json({ error: 'Os campos idVendedor e rota são obrigatórios' })
    }

    // Converte limit e offset para números inteiros
    const limitValue = parseInt(limit, 10)
    const offsetValue = parseInt(offset, 10)

    // Verifica se limit e offset são números válidos
    if (isNaN(limitValue) || isNaN(offsetValue)) {
      // console.log('Valores inválidos:', { limit, offset })
      return res.status(400).json({
        error: 'Os valores de limit e offset devem ser números válidos',
      })
    }

    // Log dos valores convertidos
    // console.log('Valores convertidos:', { limitValue, offsetValue })

    // Query SQL para buscar vendas e checar se existe pelo menos uma venda com status_venda = 1
    const sql = `
      SELECT v.*, 
       c.nomeCliente,
       c.endereco,
       c.numero,
       c.bairro,
       c.cidade,
       c.pontoRef,
       c.rota,
       EXISTS (
         SELECT 1
         FROM vendas v2
         WHERE v2.cliente_id = v.cliente_id
           AND v2.tipo = 'NF'
           AND v2.status_venda = 1
       ) AS NF_tipo_1,
       EXISTS (
         SELECT 1
         FROM vendas v3
         WHERE v3.cliente_id = v.cliente_id
           AND v3.tipo = 'RESTANTE DE VENDA'
           AND v3.status_venda = 1
       ) AS restante_venda_1,
       EXISTS (
         SELECT 1
         FROM vendas v4
         WHERE v4.cliente_id = v.cliente_id
           AND v4.tipo = 'RESTANTE NA NOVA'
           AND v4.status_venda = 1
       ) AS NOVA_tipo_1
FROM vendas v
JOIN clientes c ON v.cliente_id = c.id
WHERE v.tipo = 'NF'
  AND v.status_venda = 0
  AND c.idVendedor = ?
  AND c.rota = ?
ORDER BY v.vencimento DESC
LIMIT ? OFFSET ?
    `

    // Log da query SQL e dos parâmetros
    // console.log('Query SQL:', sql)
    // console.log('Parâmetros da query:', [
    //   idVendedor,
    //   rota,
    //   limitValue,
    //   offsetValue,
    // ])

    // Executa a query
    const [rows] = await pool.query(sql, [
      idVendedor,
      rota,
      limitValue,
      offsetValue,
    ])

    // Log dos resultados
    // console.log('Resultados encontrados:', rows)

    // Retorna os resultados
    res.status(200).json({
      sales: rows,
      limit: limitValue,
      offset: offsetValue,
    })
  } catch (error) {
    // console.error('Erro ao listar vendas por tipo:', error)
    res.status(500).json({ error: 'Erro ao listar vendas por tipo' })
  }
}
exports.createKit = async (req, res) => {
  try {
    const { sku, valor, produtos } = req.body

    // Verifica se os campos obrigatórios foram fornecidos
    if (!sku || valor === undefined || !produtos) {
      return res
        .status(400)
        .json({ error: 'Os campos sku, valor e produtos são obrigatórios' })
    }

    // Verifica se o campo produtos é um JSON válido
    if (typeof produtos !== 'object' || !Array.isArray(produtos)) {
      return res
        .status(400)
        .json({ error: 'O campo produtos deve ser um array de objetos' })
    }

    const sql = 'INSERT INTO kits (sku, valor, produtos) VALUES (?, ?, ?)'
    const params = [sku, valor, JSON.stringify(produtos)]

    const [result] = await pool.query(sql, params)
    res.status(201).json({ message: 'Kit criado com sucesso!', sku })
  } catch (error) {
    console.error('Erro ao criar kit:', error)
    res.status(500).json({ error: 'Erro ao criar kit' })
  }
}
exports.listKits = async (req, res) => {
  try {
    const sql = 'SELECT * FROM kits'
    const [rows] = await pool.query(sql)
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao listar kits:', error)
    res.status(500).json({ error: 'Erro ao listar kits' })
  }
}
exports.getKitBySku = async (req, res) => {
  try {
    const { sku } = req.params

    const sql = 'SELECT * FROM kits WHERE sku = ?'
    const [rows] = await pool.query(sql, [sku])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Kit não encontrado' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar kit:', error)
    res.status(500).json({ error: 'Erro ao buscar kit' })
  }
}
exports.updateKit = async (req, res) => {
  try {
    const { sku } = req.params
    const { valor, produtos } = req.body

    if (valor === undefined) {
      return res.status(400).json({ error: 'O campo valor é obrigatório' })
    }

    if (!Array.isArray(produtos) || produtos.length === 0) {
      return res
        .status(400)
        .json({ error: 'O campo produtos é obrigatório e deve ser um array' })
    }

    // Converte o array de produtos para JSON para armazenamento
    const produtosJSON = JSON.stringify(produtos)

    const sql = 'UPDATE kits SET valor = ?, produtos = ? WHERE sku = ?'
    const [result] = await pool.query(sql, [valor, produtosJSON, sku])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Kit não encontrado' })
    }

    res.status(200).json({ message: 'Kit atualizado com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar kit:', error)
    res.status(500).json({ error: 'Erro ao atualizar kit' })
  }
}
exports.deleteKit = async (req, res) => {
  try {
    const { sku } = req.params

    const sql = 'DELETE FROM kits WHERE sku = ?'
    const [result] = await pool.query(sql, [sku])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Kit não encontrado' })
    }

    res.status(200).json({ message: 'Kit deletado com sucesso' })
  } catch (error) {
    console.error('Erro ao deletar kit:', error)
    res.status(500).json({ error: 'Erro ao deletar kit' })
  }
}
exports.listFrases = async (req, res) => {
  try {
    const sql = 'SELECT * FROM frases'

    const [rows] = await pool.query(sql)

    // Contar o número de registros
    const count = rows.length

    if (count === 0) {
      return res.status(404).json({ message: 'Nenhuma frase encontrada' })
    }

    res.status(200).json({ count, frases: rows })
  } catch (error) {
    console.error('Erro ao listar frases:', error)
    res.status(500).json({ error: 'Erro ao listar frases' })
  }
}
exports.getActiveVendors = async (req, res) => {
  try {
    // console.log('Iniciando busca por vendedores ativos')
    const sql =
      'SELECT nome_unico, rotas, idVendedor FROM vendedores WHERE status = ?'
    const params = [1]

    const [result] = await pool.query(sql, params)
    // console.log(`Resultado da consulta: ${JSON.stringify(result)}`)

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: 'Nenhum vendedor ativo encontrado' })
    }

    res.status(200).json(result)
  } catch (error) {
    console.error('Erro ao buscar vendedores ativos:', error)
    res.status(500).json({ error: 'Erro ao buscar vendedores ativos' })
  }
}
exports.getLocationClient = async (req, res) => {
  try {
    // console.log('Iniciando busca da localização da cliente')

    // Verifica se o corpo da requisição contém o ID
    const clientId = req.body.id
    if (!clientId) {
      return res.status(400).json({ message: 'ID do cliente é obrigatório.' })
    }

    const sql =
      'SELECT nomeCliente, endereco, bairro, numero, cidade, latitude, longitude FROM clientes WHERE id = ?'
    const params = [clientId]

    // Executa a consulta no banco de dados
    const [result] = await pool.query(sql, params)
    // console.log(`Resultado da consulta: ${JSON.stringify(result)}`)

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: 'Nenhuma localização encontrada para o cliente.' })
    }

    // Retorna a localização do cliente
    res.status(200).json(result)
  } catch (error) {
    console.error('Erro ao buscar localização:', error)
    res.status(500).json({ error: 'Erro ao buscar localização' })
  }
}
exports.patchClientLocation = async (req, res) => {
  try {
    console.log('Iniciando atualização da localização do cliente')

    const { id, latitude, longitude } = req.body

    // Verifica se o ID, latitude e longitude foram fornecidos
    if (!id || latitude === undefined || longitude === undefined) {
      return res
        .status(400)
        .json({ message: 'ID, latitude e longitude são obrigatórios.' })
    }

    const sql = 'UPDATE clientes SET latitude = ?, longitude = ? WHERE id = ?'
    const params = [latitude, longitude, id]

    // Executa a atualização no banco de dados
    const [result] = await pool.query(sql, params)

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: 'Cliente não encontrado para atualização.' })
    }

    // console.log(`Localização do cliente com ID ${id} atualizada com sucesso.`)
    res
      .status(200)
      .json({ message: 'Localização do cliente atualizada com sucesso.' })
  } catch (error) {
    console.error('Erro ao atualizar localização:', error)
    res.status(500).json({ error: 'Erro ao atualizar localização' })
  }
}
exports.updateClientCoordinates = async (req, res) => {
  try {
    const { id, latitude, longitude } = req.body

    // Validação básica dos dados
    if (!id || latitude === undefined || longitude === undefined) {
      return res
        .status(400)
        .json({ error: 'ID, latitude e longitude são obrigatórios.' })
    }

    // Converte latitude e longitude para números
    const lat = parseFloat(latitude)
    const lon = parseFloat(longitude)

    if (isNaN(lat) || isNaN(lon)) {
      return res
        .status(400)
        .json({ error: 'Latitude e longitude devem ser números válidos.' })
    }

    // Consulta SQL para atualizar a localização do cliente
    const sql = `UPDATE clientes SET latitude = ?, longitude = ? WHERE id = ?`
    const params = [lat, lon, id]

    // Executa a consulta
    const [result] = await pool.query(sql, params)

    // Verifica se a atualização foi bem-sucedida
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado.' })
    }

    // Responde com sucesso
    res
      .status(200)
      .json({ message: 'Coordenadas do cliente atualizadas com sucesso.' })
  } catch (error) {
    // Trata erros e envia resposta de erro
    console.error('Erro ao atualizar coordenadas do cliente:', error)
    res.status(500).json({ error: 'Erro ao atualizar coordenadas do cliente.' })
  }
}
exports.createProduct = async (req, res) => {
  try {
    const { sku, descricao, valor, estoque } = req.body

    // Verifica se os campos obrigatórios foram fornecidos
    if (!sku) {
      return res.status(400).json({ error: 'O campo sku é obrigatório' })
    }

    const sql =
      'INSERT INTO produtos (sku, descricao, valor, estoque) VALUES (?, ?, ?, ?)'
    const params = [sku, descricao || null, valor || null, estoque || null]

    const [result] = await pool.query(sql, params)
    res.status(201).json({ message: 'Produto criado com sucesso!', sku })
  } catch (error) {
    console.error('Erro ao criar produto:', error)
    res.status(500).json({ error: 'Erro ao criar produto' })
  }
}
exports.listProduct = async (req, res) => {
  try {
    const sql = 'SELECT * FROM produtos'
    const [rows] = await pool.query(sql)
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao listar produtos:', error)
    res.status(500).json({ error: 'Erro ao listar produtos' })
  }
}
exports.getProductBySku = async (req, res) => {
  try {
    const { sku } = req.params

    const sql = 'SELECT * FROM produtos WHERE sku = ?'
    const [rows] = await pool.query(sql, [sku])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar produto:', error)
    res.status(500).json({ error: 'Erro ao buscar produto' })
  }
}
exports.searchProductByDescription = async (req, res) => {
  try {
    const { descricao } = req.query

    // console.log('Parâmetro recebido:', descricao)

    if (!descricao) {
      return res.status(400).json({ error: 'O campo descricao é obrigatório' })
    }

    const sql = 'SELECT * FROM produtos WHERE descricao LIKE ?'
    const searchPattern = `%${descricao}%`
    // console.log('Query SQL:', sql, 'Parâmetro:', searchPattern)

    const [rows] = await pool.query(sql, [searchPattern])

    // console.log('Resultado da consulta:', rows)

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' })
    }

    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar produtos:', error)
    res.status(500).json({ error: 'Erro ao buscar produtos' })
  }
}
exports.updateProdutos = async (req, res) => {
  try {
    const { sku } = req.params
    const { descricao, valor, estoque } = req.body

    if (
      descricao === undefined ||
      valor === undefined ||
      estoque === undefined
    ) {
      return res
        .status(400)
        .json({ error: 'O campo descrição, valor e estoque são obrigatórios' })
    }

    const sql =
      'UPDATE produtos SET descricao = ?, valor = ?, estoque = ? WHERE sku = ?'
    const [result] = await pool.query(sql, [descricao, valor, estoque, sku])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' })
    }

    res.status(200).json({ message: 'Produto atualizado com sucesso' })
  } catch (error) {
    console.error('Erro ao atualizar produto:', error)
    res.status(500).json({ error: 'Erro ao atualizar produto' })
  }
}
exports.deleteProduct = async (req, res) => {
  try {
    const { sku } = req.params

    const sql = 'DELETE FROM produtos WHERE sku = ?'
    const [result] = await pool.query(sql, [sku])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' })
    }

    res.status(200).json({ message: 'Produto deletado com sucesso' })
  } catch (error) {
    console.error('Erro ao deletar produto:', error)
    res.status(500).json({ error: 'Erro ao deletar produto' })
  }
}
exports.listClientsByCity = async (req, res) => {
  try {
    const { idVendedor, dataInicio, dataFim } = req.body

    if (!idVendedor || !dataInicio || !dataFim) {
      return res.status(400).json({
        message: 'Parâmetros idVendedor, dataInicio e dataFim são necessários',
      })
    }

    // Garante que idVendedor seja uma lista de IDs
    const vendedores = Array.isArray(idVendedor) ? idVendedor : [idVendedor]

    const sql = `
    SELECT 
    clientes.cidade, 
    COUNT(*) AS total 
    FROM 
    clientes 
    JOIN 
        vendas ON vendas.cliente_id = clientes.id 
        WHERE 
        clientes.idVendedor IN (?) 
        AND vendas.tipo = 'NF' 
        AND vendas.status_venda = 1 
        AND vendas.vencimento BETWEEN ? AND ? 
        GROUP BY 
        clientes.cidade 
        HAVING 
        total > 1 
        ORDER BY 
        total;
        `

    const [rows] = await pool.query(sql, [vendedores, dataInicio, dataFim])

    // Obter nomes das cidades do Ceará
    const cidadesCE = cidades.CE.map((cidade) => cidade.nome)

    // Filtrar apenas as cidades do Ceará
    // Mostra as cidades que foram filtradas
    const cidadesFiltradas = rows.filter((row) => {
      if (!cidadesCE.includes(row.cidade)) {
        // console.log(`Cidade excluída: ${row.cidade}`)
      }
      return cidadesCE.includes(row.cidade)
    })

    // Contar o número de registros filtrados
    const count = cidadesFiltradas.length

    if (count === 0) {
      return res
        .status(404)
        .json({ message: 'Nenhum cliente encontrado em cidades do Ceará' })
    }

    res.status(200).json({ count, cities: cidadesFiltradas })
  } catch (error) {
    console.error('Erro ao listar clientes por cidade:', error)
    res.status(500).json({ error: 'Erro ao listar clientes por cidade' })
  }
}
exports.getInfosDashboard = async (req, res) => {
  try {
    // Consulta para total de clientes
    const totalClientesQuery =
      'SELECT COUNT(*) AS total_clientes FROM clientes;'
    const totalClientesResult = await pool.query(totalClientesQuery)
    const totalClientes = totalClientesResult[0][0].total_clientes || 0

    // Consulta para quantidade de clientes ativos (status = 1)
    const statusClientesQuery = `
          SELECT
              COUNT(*) AS quantidade  
          FROM
              clientes
          WHERE 
              status = 1;
      `
    const statusClientesResult = await pool.query(statusClientesQuery)
    const quantidade = statusClientesResult[0][0].quantidade || 0

    // Consulta para novos clientes no mês atual
    const novosClientesMesQuery = `
          SELECT
              COUNT(*) AS novos_clientes_mes
          FROM
              clientes
          WHERE
              MONTH(data_cadastro) = MONTH(CURRENT_DATE())
              AND YEAR(data_cadastro) = YEAR(CURRENT_DATE());
      `
    const novosClientesMesResult = await pool.query(novosClientesMesQuery)
    const novosClientesMes =
      novosClientesMesResult[0][0].novos_clientes_mes || 0

    // Consulta para quantidade de vendas do tipo NF com status_venda = 1
    const statusVendasQuery = `
          SELECT
              COUNT(*) AS quantidade_vendas
          FROM
              vendas
          WHERE
              tipo = 'NF'
          AND
              status_venda = 1;
      `
    const statusVendasResult = await pool.query(statusVendasQuery)
    const quantidade_vendas = statusVendasResult[0][0].quantidade_vendas || 0

    // Consulta para total de valor recebido no mês atual
    const totalValorRecebidoQuery = `
          SELECT 
              SUM(valorRecebido) AS total_valor_recebido
          FROM 
              vendas
          WHERE 
              tipo IN ('NF', 'RESTANTE DE VENDA')
              AND MONTH(atualizacao) = MONTH(CURDATE())
              AND YEAR(atualizacao) = YEAR(CURDATE())
              AND status_venda = 0;

      `
    const totalValorRecebidoResult = await pool.query(totalValorRecebidoQuery)
    const total_valor_recebido =
      totalValorRecebidoResult[0][0].total_valor_recebido || 0

    // Consulta para total de registros no mês atual
    const totalRegistrosQuery = `
          SELECT 
              COUNT(*) AS total_registros
          FROM 
              vendas
          WHERE 
              tipo IN ('NF', 'RESTANTE DE VENDA')
              AND MONTH(atualizacao) = MONTH(CURDATE())
              AND YEAR(atualizacao) = YEAR(CURDATE())
              AND status_venda = 0;
      `
    const totalRegistrosResult = await pool.query(totalRegistrosQuery)
    const total_registros = totalRegistrosResult[0][0].total_registros || 0

    // Consulta para total de registros faltando no mês atual
    const totalRegistrosFaltandoQuery = `
          SELECT 
              COUNT(*) AS total_registros_faltando
          FROM 
              vendas
          WHERE 
              tipo = 'NF'
              AND MONTH(vencimento) = MONTH(CURDATE())
              AND YEAR(vencimento) = YEAR(CURDATE())
              AND status_venda = 1;
      `
    const totalRegistrosFaltandoResult = await pool.query(
      totalRegistrosFaltandoQuery
    )
    const total_registros_faltando =
      totalRegistrosFaltandoResult[0][0].total_registros_faltando || 0

    // Consulta para média de valor recebido no mês atual
    const mediaValorRecebidoQuery = `
          SELECT 
              AVG(valorRecebido) AS media_valorRecebido
          FROM 
              vendas
          WHERE 
              tipo = "NF"
              AND MONTH(atualizacao) = MONTH(CURDATE())
              AND YEAR(atualizacao) = YEAR(CURDATE())
              AND status_venda = 0;
      `
    const mediaValorRecebidoResult = await pool.query(mediaValorRecebidoQuery)
    const media_valor_recebido =
      mediaValorRecebidoResult[0][0].media_valorRecebido || 0

    // Consulta para ranking de clientes novatos
    const rankingNovatosQuery = `
        WITH ranked_vendedores AS ( 
            SELECT 
                idVendedor,
                COUNT(*) AS total_clientes,
                DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_vendedor
            FROM 
                clientes
            WHERE 
                YEAR(data_cadastro) = YEAR(CURDATE()) AND 
                MONTH(data_cadastro) = MONTH(CURDATE())
            GROUP BY 
                idVendedor
        )
        SELECT 
            idVendedor,
            total_clientes,
            rank_vendedor
        FROM 
            ranked_vendedores;
      `
    const rankingNovatosResult = await pool.query(rankingNovatosQuery)
    const rankingNovatos = rankingNovatosResult[0].map((row) => ({
      idVendedor: row.idVendedor,
      total_clientes: row.total_clientes,
      rank_vendedor: row.rank_vendedor,
    }))

    // Consulta para ranking de média de valorRecebido no mês atual
    const rankingAtualQuery = `
          SELECT 
              idVendedor,
              AVG(valorRecebido) AS media_valorRecebido,
              DENSE_RANK() OVER (ORDER BY AVG(valorRecebido) DESC) AS ranking
          FROM 
              vendas
          WHERE 
              tipo = 'NF'
              AND status_venda = 0
              AND MONTH(atualizacao) = MONTH(CURRENT_DATE())
              AND YEAR(atualizacao) = YEAR(CURRENT_DATE())
          GROUP BY 
              idVendedor
          ORDER BY 
              ranking;
      `
    const rankingAtualResult = await pool.query(rankingAtualQuery)
    const rankingAtual = rankingAtualResult[0].map((row) => ({
      idVendedor: row.idVendedor,
      media_valorRecebido: row.media_valorRecebido,
      ranking: row.ranking,
    }))

    // Consulta para ranking de média de valorRecebido no mês anterior
    const rankingAnteriorQuery = `
          SELECT 
              idVendedor,
              AVG(valorRecebido) AS media_valorRecebido,
              DENSE_RANK() OVER (ORDER BY AVG(valorRecebido) DESC) AS ranking
          FROM 
              vendas
          WHERE 
              tipo = 'NF'
              AND status_venda = 0
              AND MONTH(atualizacao) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
              AND YEAR(atualizacao) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
          GROUP BY 
              idVendedor
          ORDER BY 
              ranking;
      `
    const rankingAnteriorResult = await pool.query(rankingAnteriorQuery)
    const rankingAnterior = rankingAnteriorResult[0].map((row) => ({
      idVendedor: row.idVendedor,
      media_valorRecebido: row.media_valorRecebido,
      ranking: row.ranking,
    }))

    // Retorno dos dados simplificados
    res.json({
      total_clientes: totalClientes,
      quantidade,
      novos_clientes_mes: novosClientesMes,
      quantidade_vendas,
      total_valor_recebido,
      total_registros,
      total_registros_faltando,
      media_valor_recebido,
      ranking_novatas: rankingNovatos,
      ranking_atual: rankingAtual,
      ranking_anterior: rankingAnterior,
    })
  } catch (error) {
    console.error('Erro ao buscar informações do dashboard:', error)
    res.status(500).json({ error: 'Erro ao buscar informações do dashboard' })
  }
}
exports.getDetailedDashboardInfo = async (req, res) => {
  try {
    // Consulta para valor recebido por dia
    const valorPorDiaQuery = `
      SELECT 
          DATE(atualizacao) AS dia,
          SUM(valorRecebido) AS total_valor_recebido
      FROM 
          vendas
      WHERE 
          tipo IN ('NF', 'RESTANTE DE VENDA') 
          AND MONTH(atualizacao) = MONTH(CURDATE())
          AND YEAR(atualizacao) = YEAR(CURDATE())
          AND status_venda = 0
      GROUP BY 
          DATE(atualizacao)
      ORDER BY 
          dia;
    `
    const valorPorDiaResult = await pool.query(valorPorDiaQuery)
    const valorPorDia = valorPorDiaResult[0]

    // Consulta para novos clientes por dia
    const novosClientesQuery = `
      SELECT 
          DATE(data_cadastro) AS dia,
          COUNT(*) AS novos_clientes
      FROM 
          clientes
      WHERE 
          MONTH(data_cadastro) = MONTH(CURRENT_DATE())
          AND YEAR(data_cadastro) = YEAR(CURRENT_DATE())
      GROUP BY 
          DATE(data_cadastro)
      ORDER BY 
          dia;
    `
    const novosClientesResult = await pool.query(novosClientesQuery)
    const novosClientes = novosClientesResult[0]

    // Consulta para novos clientes por dia e vendedor
    const novosClientesPorDiaQuery = `
      SELECT 
          DATE(data_cadastro) AS dia,
          idVendedor,
          COUNT(*) AS novos_clientes
      FROM 
          clientes
      WHERE 
          MONTH(data_cadastro) = MONTH(CURRENT_DATE())
          AND YEAR(data_cadastro) = YEAR(CURRENT_DATE())
      GROUP BY 
          idVendedor, DATE(data_cadastro)
      ORDER BY 
          DATE(data_cadastro), idVendedor;
    `
    const novosClientesPorDiaResult = await pool.query(novosClientesPorDiaQuery)
    const novosClientesPorDia = novosClientesPorDiaResult[0]

    // Consulta para total de registros do tipo 'NF' por dia
    const registrosNFPorDiaQuery = `
      SELECT
          DATE(atualizacao) AS dia,
          COUNT(*) AS total_registros
      FROM
          vendas
      WHERE
          tipo = 'NF'
          AND MONTH(atualizacao) = MONTH(CURDATE())
          AND YEAR(atualizacao) = YEAR(CURDATE())
          AND status_venda = 0
      GROUP BY
          DATE(atualizacao)
      ORDER BY
          DATE(atualizacao);
    `
    const registrosNFPorDiaResult = await pool.query(registrosNFPorDiaQuery)
    const registrosNFPorDia = registrosNFPorDiaResult[0]

    // Consulta para total de registros do tipo 'RESTANTE DE VENDA' por dia
    const registrosRestantePorDiaQuery = `
      SELECT
          DATE(atualizacao) AS dia,
          COUNT(*) AS total_registros
      FROM
          vendas
      WHERE
          tipo = 'RESTANTE DE VENDA' 
          AND MONTH(atualizacao) = MONTH(CURDATE())
          AND YEAR(atualizacao) = YEAR(CURDATE())
          AND status_venda = 0
      GROUP BY
          DATE(atualizacao)
      ORDER BY
          DATE(atualizacao);
    `
    const registrosRestantePorDiaResult = await pool.query(
      registrosRestantePorDiaQuery
    )
    const registrosRestantePorDia = registrosRestantePorDiaResult[0]

    // Consulta para "RestantesVendasGerados"
    const restantesVendasGeradosQuery = `
      SELECT
          DATE(atualizacao) AS dia,
          COUNT(*) AS total_registros
      FROM
          vendas AS v
      WHERE
          v.tipo = 'RESTANTE DE VENDA'
          AND MONTH(v.atualizacao) = MONTH(CURDATE())
          AND YEAR(v.atualizacao) = YEAR(CURDATE())
          AND v.status_venda = 1
          AND v.valorRecebido = 0
          AND v.vencimento > v.atualizacao
          AND NOT EXISTS (
              SELECT 1
              FROM vendas AS v_anterior
              WHERE v_anterior.cliente_id = v.cliente_id
                AND v_anterior.venda_id < v.venda_id
                AND v_anterior.tipo = 'RESTANTE DE VENDA'
              ORDER BY v_anterior.venda_id DESC
              LIMIT 1
          )
          AND EXISTS (
              SELECT 1
              FROM vendas AS v_anterior_nf
              WHERE v_anterior_nf.cliente_id = v.cliente_id
                AND v_anterior_nf.venda_id < v.venda_id
                AND v_anterior_nf.tipo = 'NF'
              ORDER BY v_anterior_nf.venda_id DESC
              LIMIT 1
          )
      GROUP BY
          DATE(atualizacao)
      ORDER BY
          DATE(atualizacao);
    `
    const restantesVendasGeradosResult = await pool.query(
      restantesVendasGeradosQuery
    )
    const restantesVendasGerados = restantesVendasGeradosResult[0]

    // Retorno consolidado
    res.json({
      valor_por_dia: valorPorDia,
      novos_clientes: novosClientes,
      novos_clientes_por_dia: novosClientesPorDia,
      registros_nf_por_dia: registrosNFPorDia,
      registros_restante_por_dia: registrosRestantePorDia,
      restantes_vendas_gerados: restantesVendasGerados,
    })
  } catch (error) {
    console.error('Erro ao buscar informações detalhadas do dashboard:', error)
    res
      .status(500)
      .json({ error: 'Erro ao buscar informações detalhadas do dashboard' })
  }
}
exports.getEnviosAdm = async (req, res) => {
  const { idVendedor, rota } = req.body

  try {
    let querySelect = `SELECT * FROM envios`
    const queryParams = []

    let whereClause = ''
    if (idVendedor) {
      whereClause += `idVendedor = ?`
      queryParams.push(idVendedor)
    }
    if (rota) {
      if (whereClause.length > 0) {
        whereClause += ' AND '
      }
      whereClause += `rota = ?`
      queryParams.push(rota)
    }

    if (whereClause.length > 0) {
      querySelect += ` WHERE ${whereClause}`
    }

    querySelect += ` ORDER BY data_envio DESC`

    const [result] = await pool.query(querySelect, queryParams)

    if (result.length > 0) {
      res.status(200).json({ registros: result })
    } else {
      res.status(404).json({ message: 'Nenhum envio encontrado' })
    }
  } catch (error) {
    console.error('Erro ao buscar envios:', error)
    res.status(500).json({ message: 'Erro ao buscar envios' })
  }
}
exports.getAllEnvios = async (req, res) => {
  try {
    // Query de seleção para listar todos os registros
    const querySelect = `
      SELECT *
      FROM envios
      ORDER BY data_envio DESC, id DESC
    `

    // Execução da query
    const [result] = await pool.query(querySelect)

    // Verifica se encontrou registros
    if (result.length > 0) {
      res.status(200).json({ registros: result })
    } else {
      res.status(404).json({ message: 'Nenhum envio encontrado' })
    }
  } catch (error) {
    console.error('Erro ao buscar todos os envios:', error)
    res.status(500).json({ message: 'Erro ao buscar envios' })
  }
}
exports.deleteEnvios = async (req, res) => {
  try {
    const { ids } = req.body

    // Validação: Verifica se os IDs foram fornecidos
    if (!ids) {
      return res.status(400).json({ message: 'A lista de IDs é obrigatória' })
    }

    // Validação: Verifica se ids é um array ou um único ID
    const idArray = Array.isArray(ids) ? ids : [ids]

    // Validação: Verifica se o array de IDs não está vazio
    if (idArray.length === 0) {
      return res
        .status(400)
        .json({ message: 'A lista de IDs não pode estar vazia' })
    }

    // Proteção contra SQL Injection:  Utilizando prepared statement.  **Essencial para segurança!**
    const placeholders = idArray.map(() => '?').join(',')
    const queryDelete = `DELETE FROM envios WHERE id IN (${placeholders})`

    // Execução da query com os IDs como parâmetros
    const [result] = await pool.query(queryDelete, idArray)

    // Verifica o número de linhas afetadas
    if (result.affectedRows > 0) {
      res.status(200).json({
        message: `${result.affectedRows} envio(s) deletado(s) com sucesso`,
      })
    } else {
      res
        .status(404)
        .json({ message: 'Nenhum envio encontrado para os IDs fornecidos' })
    }
  } catch (error) {
    console.error('Erro ao deletar envios:', error)
    res.status(500).json({ message: 'Erro ao deletar envios' })
  }
}
exports.getRotaAtual = async (req, res) => {
  try {
    // console.log('Iniciando busca por rotas com mais atualizações por vendedor')

    const sql = `
      WITH RankedRota AS (
          SELECT
              c.idVendedor,
              c.rota,
              COUNT(*) AS total_atualizacoes,
              ROW_NUMBER() OVER (PARTITION BY c.idVendedor ORDER BY COUNT(*) DESC) AS rn
          FROM
              vendas v
          JOIN
              clientes c ON v.cliente_id = c.id
          WHERE
              v.atualizacao IN (CURDATE(), CURDATE() - INTERVAL 1 DAY)
          GROUP BY
              c.idVendedor, c.rota
      )
      SELECT
          idVendedor,
          rota,
          total_atualizacoes
      FROM
          RankedRota
      WHERE
          rn = 1
      ORDER BY
          idVendedor;
    `

    const [result] = await pool.query(sql)
    // console.log(`Resultado da consulta: ${JSON.stringify(result)}`)

    if (result.length === 0) {
      return res.status(404).json({ message: 'Nenhuma rota encontrada' })
    }

    res.status(200).json(result)
  } catch (error) {
    console.error(
      'Erro ao buscar rotas com mais atualizações por vendedor:',
      error
    )
    res.status(500).json({
      error: 'Erro ao buscar rotas com mais atualizações por vendedor',
    })
  }
}
exports.listNextRoutes = async (req, res) => {
  try {
    const { idVendedor, rota } = req.body

    if (!idVendedor || !rota) {
      return res.status(400).json({
        message: 'Parâmetros idVendedor e rota são necessários',
      })
    }

    const sql = `
    SELECT
      c.id,
      c.nomeCliente,
      c.endTipo,
      c.endereco,
      c.numero,
      c.bairro,
      c.pontoRef,
      c.cidade,
      c.estado,
      c.rota,
      v.vencimento,
      v.atualizacao,
      v.valor,
      v.situacao
    FROM
      vendas v
    INNER JOIN
      clientes c ON v.cliente_id = c.id
    WHERE
      v.idVendedor = ?
      AND c.rota = ?
      AND v.vencimento > CURDATE() + INTERVAL 40 DAY
      AND v.status_venda = 1
      AND v.tipo = "NF";
    `

    const [rows] = await pool.query(sql, [idVendedor, rota])

    if (rows.length === 0) {
      return res.status(404).json({
        message:
          'Nenhum cliente encontrado para o vendedor e rota especificados',
      })
    }

    res.status(200).json({ count: rows.length, clients: rows })
  } catch (error) {
    console.error('Erro ao listar clientes por rota:', error)
    res.status(500).json({ error: 'Erro ao listar clientes por rota' })
  }
}
exports.listBeforeRoutes = async (req, res) => {
  try {
    const { idVendedor, rota } = req.body

    if (!idVendedor || !rota) {
      return res.status(400).json({
        message: 'Parâmetros idVendedor e rota são necessários',
      })
    }

    const sql = `
    SELECT
      c.id,
      c.nomeCliente,
      c.endTipo,
      c.endereco,
      c.numero,
      c.bairro,
      c.pontoRef,
      c.cidade,
      c.estado,
      c.rota,
      v.vencimento,
      v.atualizacao,
      v.valor,
      v.valorRecebido,
      v.situacao
    FROM
      vendas v
    INNER JOIN
      clientes c ON v.cliente_id = c.id
    WHERE
      v.idVendedor = ?
      AND c.rota = ?
      AND v.vencimento BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 20 DAY
      AND v.status_venda = 0
      AND v.tipo = "NF"
      AND v.situacao = 1;
    `

    const [rows] = await pool.query(sql, [idVendedor, rota])

    if (rows.length === 0) {
      return res.status(404).json({
        message:
          'Nenhum cliente encontrado para o vendedor e rota especificados',
      })
    }

    res.status(200).json({ count: rows.length, clients: rows })
  } catch (error) {
    console.error('Erro ao listar clientes por rota:', error)
    res.status(500).json({ error: 'Erro ao listar clientes por rota' })
  }
}
// exports.listNextRoutesWithComparison = async (req, res) => {
//   try {
//     const { idVendedor, rota } = req.body

//     if (!idVendedor || !rota) {
//       return res.status(400).json({
//         message: 'Parâmetros idVendedor e rota são necessários',
//       })
//     }

//     // Consultar clientes de listNextRoutes
//     const sqlNext = `
//     SELECT
//       c.id,
//       c.nomeCliente,
//       c.endTipo,
//       c.endereco,
//       c.numero,
//       c.bairro,
//       c.pontoRef,
//       c.cidade,
//       c.estado,
//       c.rota,
//       v.vencimento,
//       v.atualizacao,
//       v.valor,
//       v.situacao
//     FROM
//       vendas v
//     INNER JOIN
//       clientes c ON v.cliente_id = c.id
//     WHERE
//       v.idVendedor = ?
//       AND c.rota = ?
//       AND v.vencimento > CURDATE() + INTERVAL 40 DAY
//       AND v.status_venda = 1
//       AND v.tipo = "NF";
//     `

//     const [rowsNext] = await pool.query(sqlNext, [idVendedor, rota])

//     if (rowsNext.length === 0) {
//       return res.status(404).json({
//         message: 'Nenhum cliente encontrado em listNextRoutes',
//       })
//     }

//     // Consultar clientes de listBeforeRoutes
//     const sqlBefore = `
//     SELECT
//       c.id,
//       c.nomeCliente,
//       c.endTipo,
//       c.endereco,
//       c.numero,
//       c.bairro,
//       c.pontoRef,
//       c.cidade,
//       c.estado,
//       c.rota,
//       v.vencimento,
//       v.atualizacao,
//       v.valor,
//       v.valorRecebido,
//       v.situacao
//     FROM
//       vendas v
//     INNER JOIN
//       clientes c ON v.cliente_id = c.id
//     WHERE
//       v.idVendedor = ?
//       AND c.rota = ?
//       AND v.vencimento BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 20 DAY
//       AND v.status_venda = 0
//       AND v.tipo = "NF"
//       AND v.situacao = 1;
//     `

//     const [rowsBefore] = await pool.query(sqlBefore, [idVendedor, rota])

//     // Filtrar clientes que estão em listNextRoutes mas não em listBeforeRoutes
//     const clientsNotInBefore = rowsNext.filter(
//       (nextClient) =>
//         !rowsBefore.some((beforeClient) => beforeClient.id === nextClient.id)
//     )

//     // Caso não haja resultados em nenhum dos casos
//     if (rowsNext.length === 0 && rowsBefore.length === 0) {
//       return res.status(404).json({
//         message: 'Nenhum cliente encontrado nas rotas especificadas',
//       })
//     }

//     // Retornar a resposta com os dados dos três conjuntos:
//     res.status(200).json({
//       nextRoutes: {
//         count: rowsNext.length,
//         clients: rowsNext,
//       },
//       beforeRoutes: {
//         count: rowsBefore.length,
//         clients: rowsBefore,
//       },
//       clientsNotInBefore: {
//         count: clientsNotInBefore.length,
//         clients: clientsNotInBefore,
//       },
//     })
//   } catch (error) {
//     console.error('Erro ao listar clientes de rotas:', error)
//     res.status(500).json({ error: 'Erro ao listar clientes de rotas' })
//   }
// }
exports.listNextRoutesWithComparison = async (req, res) => {
  try {
    const { idVendedor, rota } = req.body

    if (!idVendedor || !rota) {
      return res.status(400).json({
        message: 'Parâmetros idVendedor e rota são necessários',
      })
    }

    const sqlNext = `
    SELECT 
      c.id,
      c.nomeCliente, 
      c.endTipo, 
      c.endereco, 
      c.numero, 
      c.bairro, 
      c.pontoRef, 
      c.cidade, 
      c.estado, 
      c.rota, 
      c.data_cadastro,
      CASE 
        WHEN c.data_cadastro >= CURDATE() - INTERVAL 30 DAY THEN 'novata'
        ELSE 'antiga'
      END AS statusCliente,
      v.venda_id,
      v.vencimento, 
      v.atualizacao, 
      v.valor, 
      v.situacao,
      v.vb
    FROM 
      vendas v 
    INNER JOIN 
      clientes c ON v.cliente_id = c.id 
    WHERE 
      v.idVendedor = ? 
      AND c.rota = ? 
      AND v.vencimento > CURDATE() + INTERVAL 40 DAY 
      AND v.status_venda = 1 
      AND v.tipo = "NF";
    `

    const [rowsNext] = await pool.query(sqlNext, [idVendedor, rota])

    if (rowsNext.length === 0) {
      return res.status(404).json({
        message: 'Nenhum cliente encontrado em NextRoutes',
      })
    }

    // Consultar clientes de BeforeRoutes (rotas anteriores)
    const sqlBefore = `
    SELECT 
      c.id,
      v.venda_id
    FROM 
      vendas v 
    INNER JOIN 
      clientes c ON v.cliente_id = c.id 
    WHERE 
      v.idVendedor = ? 
      AND c.rota = ? 
      AND v.vencimento BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 20 DAY
      AND v.status_venda = 0 
      AND v.tipo = "NF"
      AND v.situacao = 1;
    `

    const [rowsBefore] = await pool.query(sqlBefore, [idVendedor, rota])

    // Extrair apenas os IDs de clientes de BeforeRoutes para comparação
    const beforeClientIds = rowsBefore.map((client) => client.id)

    // Filtrar clientes que estão em NextRoutes, mas não em BeforeRoutes
    const clientsNotInBefore = rowsNext.filter(
      (nextClient) => !beforeClientIds.includes(nextClient.id)
    )

    // LOG PARA DEPURAR
    console.log('--- DEBUG: rowsNext ---')
    console.log(JSON.stringify(rowsNext, null, 2)) // Mostra o array completo
    console.log('--- DEBUG: clientsNotInBefore ---')
    console.log(JSON.stringify(clientsNotInBefore, null, 2)) // Mostra o array filtrado

    // Retornar apenas NextRoutes e clientes que não estão em BeforeRoutes
    res.status(200).json({
      nextRoutes: {
        count: rowsNext.length,
        clients: rowsNext,
      },
      clientsNotInBefore: {
        count: clientsNotInBefore.length,
        clients: clientsNotInBefore,
      },
    })
  } catch (error) {
    console.error('Erro ao listar clientes de rotas:', error)
    res.status(500).json({ error: 'Erro ao listar clientes de rotas' })
  }
}
exports.getNextRoutesWithVendaId = async (req, res) => {
  const { idVendedor, rota } = req.body

  if (!idVendedor || !rota) {
    return res.status(400).json({ error: 'idVendedor e rota são obrigatórios' })
  }

  try {
    const [[{ proximaData }]] = await pool.query(
      `SELECT MIN(v.vencimento) as proximaData
       FROM vendas v
       INNER JOIN clientes c ON v.cliente_id = c.id
       WHERE v.idVendedor = ? AND v.tipo = 'NF' AND c.rota = ? AND v.status_venda = 1
         AND v.vencimento >= CURDATE()`,
      [idVendedor, rota]
    )

    if (!proximaData) {
      return res.status(200).json({
        nextRoutes: { count: 0, clients: [] },
        clientsNotInBefore: { count: 0, clients: [] },
      })
    }

    const [[{ dataAnterior }]] = await pool.query(
      `SELECT MAX(v.vencimento) as dataAnterior
       FROM vendas v
       INNER JOIN clientes c ON v.cliente_id = c.id
       WHERE v.idVendedor = ? AND v.tipo = 'NF' AND c.rota = ? AND v.status_venda = 1
         AND v.vencimento < ?`,
      [idVendedor, rota, proximaData]
    )

    const [nextRoutes] = await pool.query(
      `SELECT v.venda_id, v.valor, v.vencimento, v.atualizacao, v.vb, v.situacao,
              c.id, c.nomeCliente, c.endTipo, c.endereco, c.numero, c.bairro, c.pontoRef,
              c.cidade, c.estado, c.rota, c.data_cadastro, c.status AS statusCliente
       FROM vendas v
       INNER JOIN clientes c ON v.cliente_id = c.id
       WHERE v.idVendedor = ? AND v.tipo = 'NF' AND c.rota = ? AND v.status_venda = 1
         AND v.vencimento = ?`,
      [idVendedor, rota, proximaData]
    )

    const [vendasAnteriores] = await pool.query(
      `SELECT DISTINCT v.cliente_id
       FROM vendas v
       INNER JOIN clientes c ON v.cliente_id = c.id
       WHERE v.idVendedor = ? AND v.tipo = 'NF' AND c.rota = ? AND v.status_venda = 1
         AND v.vencimento = ?`,
      [idVendedor, rota, dataAnterior]
    )

    const clientesAnterioresIds = vendasAnteriores.map((v) => v.cliente_id)

    const clientsNotInBefore = nextRoutes.filter(
      (v) => !clientesAnterioresIds.includes(v.id)
    )

    res.status(200).json({
      nextRoutes: {
        count: nextRoutes.length,
        clients: nextRoutes,
      },
      clientsNotInBefore: {
        count: clientsNotInBefore.length,
        clients: clientsNotInBefore,
      },
    })
  } catch (error) {
    console.error('Erro ao buscar próximas rotas:', error)
    res.status(500).json({ error: 'Erro ao buscar próximas rotas' })
  }
}
exports.buscarCpfNetrin = async (req, res) => {
  try {
    const { cpf } = req.body // Recebe o CPF sem formatação

    // Busca o token da Netrin no banco de dados
    // const query = "SELECT token FROM netrin LIMIT 1";
    // const [rows] = await pool.query(query);
    // const netrinToken = rows[0]?.token;

    if (!netrinToken) {
      return res.status(500).json({
        error: true,
        message: 'Token da Netrin não encontrado',
      })
    }

    // Monta a URL da requisição
    const url = `https://regularidade-cpf.netrin.com.br/v1/?token=${netrinToken}&cpf=${cpf}&comprovante-sincrono=true`
    const response = await axios.get(url)
    const { status, data } = response

    // Retorna as mensagens conforme o status
    switch (status) {
      case 206:
        return res.status(206).json({ message: 'Retorno parcial', data })
      case 408:
        return res
          .status(408)
          .json({ message: 'Tempo limite - Tente novamente mais tarde' })
      case 401:
        return res
          .status(401)
          .json({ message: 'Token inválido ou expirado. Verifique o token.' })
      case 403:
        return res.status(403).json({
          message: 'Usuário não possui permissão para acessar este recurso',
        })
      case 404:
        return res.status(404).json({
          message: 'Parâmetros inválidos. Verifique o serviço solicitado.',
        })
      case 502:
        return res
          .status(502)
          .json({ message: 'Falha na chamada. Contate o suporte.' })
      default:
        return res.status(200).json(data)
    }
  } catch (error) {
    console.error('Erro completo:', error)

    if (error.response) {
      return res.status(error.response.status).json({
        error: true,
        message:
          error.response.data.message || 'Erro ao conectar com a API da Netrin',
      })
    }

    return res.status(500).json({
      error: true,
      message: 'Erro inesperado. Por favor, tente novamente.',
    })
  }
}
exports.getNovosClientes = async (req, res) => {
  try {
    const idVendedor = req.user?.idVendedor || req.body.idVendedor

    if (!idVendedor) {
      return res.status(400).json({ message: 'idVendedor é obrigatório' })
    }

    const queryCountVend = `
      SELECT COUNT(*) AS cobrancas 
      FROM vendas 
      WHERE tipo = "NF" 
      AND idVendedor = ? 
      AND status_venda = 0
      AND MONTH(atualizacao) = MONTH(CURRENT_DATE()) 
      AND YEAR(atualizacao) = YEAR(CURRENT_DATE());
    `
    const queryMedia = `
      SELECT AVG(valorRecebido) AS media 
      FROM vendas WHERE tipo = "NF" 
      AND status_venda = 0
      AND idVendedor = ? 
      AND MONTH(atualizacao) = MONTH(CURRENT_DATE()) 
      AND YEAR(atualizacao) = YEAR(CURRENT_DATE());
    `
    const queryMediaAnt = `
      SELECT AVG(valorRecebido) AS media 
      FROM vendas WHERE tipo = "NF" 
      AND status_venda = 0
      AND idVendedor = ? 
      AND MONTH(atualizacao) = MONTH(CURRENT_DATE() - INTERVAL 1 MONTH) 
      AND YEAR(atualizacao) = YEAR(CURRENT_DATE() - INTERVAL 1 MONTH);
    `
    const queryCount = `
      SELECT COUNT(*) AS novos_clientes
      FROM clientes
      WHERE idVendedor = ?
      AND MONTH(data_cadastro) = MONTH(CURRENT_DATE())
      AND YEAR(data_cadastro) = YEAR(CURRENT_DATE())
    `
    const queryList = `
      SELECT id, nomeCliente, endereco, bairro, cidade, rota, longitude, latitude, data_cadastro, cpf, telefone
      FROM clientes
      WHERE idVendedor = ?
      AND MONTH(data_cadastro) = MONTH(CURRENT_DATE())
      AND YEAR(data_cadastro) = YEAR(CURRENT_DATE())
      ORDER BY data_cadastro DESC;
    `

    const queryRankingClientes = `
      WITH ranked_vendedores AS (
          SELECT
              v.idVendedor,
              v.nome_unico,
              COUNT(*) AS total_clientes,
              DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_vendedor
          FROM
              clientes c
          INNER JOIN
              vendedores v
          ON
              c.idVendedor = v.idVendedor
          WHERE
              YEAR(c.data_cadastro) = YEAR(CURDATE()) 
              AND MONTH(c.data_cadastro) = MONTH(CURDATE())
          GROUP BY
              v.idVendedor, v.nome_unico
      )
      SELECT
          idVendedor,
          nome_unico,
          total_clientes,
          rank_vendedor
      FROM
          ranked_vendedores;
    `

    const queryRankingVendas = `
      SELECT 
          v.idVendedor,
          vd.nome_unico,
          AVG(v.valorRecebido) AS media_valorRecebido,
          DENSE_RANK() OVER (ORDER BY AVG(v.valorRecebido) DESC) AS ranking
      FROM 
          vendas v
      INNER JOIN 
          vendedores vd
      ON
          v.idVendedor = vd.idVendedor
      WHERE 
          v.tipo = 'NF'
          AND v.status_venda = 0
          AND MONTH(v.atualizacao) = MONTH(CURRENT_DATE())
          AND YEAR(v.atualizacao) = YEAR(CURRENT_DATE())
      GROUP BY 
          idVendedor
      ORDER BY 
          ranking;
    `

    const [[countResultVend]] = await pool.query(queryCountVend, [idVendedor])
    const [[countResultMedia]] = await pool.query(queryMedia, [idVendedor])
    const [[countResultMediaAnt]] = await pool.query(queryMediaAnt, [idVendedor])
    const [[countResult]] = await pool.query(queryCount, [idVendedor])
    const [listResult] = await pool.query(queryList, [idVendedor])
    const [rankingClientesResult] = await pool.query(queryRankingClientes)
    const [rankingVendasResult] = await pool.query(queryRankingVendas)

    res.status(200).json({
      vendasMes: countResultVend.cobrancas || 0,
      mediaMes: countResultMedia.media || 0,
      mediaMesAnt: countResultMediaAnt.media || 0,
      novos_clientes: countResult.novos_clientes || 0,
      clientes: listResult.length ? listResult : [],
      ranking: rankingClientesResult.length ? rankingClientesResult : [],
      ranking_media: rankingVendasResult.length ? rankingVendasResult : [],
    })
  } catch (error) {
    console.error('Erro ao buscar dados:', error)
    res.status(500).json({ message: 'Erro ao buscar dados' })
  }
}
exports.updateClientStatus = async (req, res) => {
  try {
    const { id, status } = req.body

    // Validação básica dos dados
    if (!id || status === undefined) {
      return res.status(400).json({ error: 'ID e status são obrigatórios.' })
    }

    // Converte o status para um número (se necessário)
    const statusNumber = parseInt(status)
    if (isNaN(statusNumber)) {
      return res
        .status(400)
        .json({ error: 'Status deve ser um número válido.' })
    }

    // Consulta SQL para atualizar o status do cliente
    const sql = `UPDATE clientes SET status = ? WHERE id = ?`
    const params = [statusNumber, id]

    // Executa a consulta
    const [result] = await pool.query(sql, params)

    // Verifica se a atualização foi bem-sucedida
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado.' })
    }

    // Responde com sucesso
    res
      .status(200)
      .json({ message: 'Status do cliente atualizado com sucesso.' })
  } catch (error) {
    // Trata erros e envia resposta de erro
    console.error('Erro ao atualizar status do cliente:', error)
    res.status(500).json({ error: 'Erro ao atualizar status do cliente.' })
  }
}
exports.getClientStatus = async (req, res) => {
  try {
    const { id } = req.params

    // Validação básica dos dados
    if (!id) {
      return res.status(400).json({ error: 'O ID do cliente é obrigatório.' })
    }

    // Consulta SQL para buscar o status do cliente
    const sql = `SELECT status FROM clientes WHERE id = ?`
    const params = [id]

    // Executa a consulta
    const [rows] = await pool.query(sql, params)

    // Verifica se o cliente foi encontrado
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado.' })
    }

    // Extrai o status do resultado
    const status = rows[0].status

    // Responde com o status do cliente
    res.status(200).json({ status: status })
  } catch (error) {
    // Trata erros e envia resposta de erro
    console.error('Erro ao buscar status do cliente:', error)
    res.status(500).json({ error: 'Erro ao buscar status do cliente.' })
  }
}
exports.buscarClienteCpf = async (req, res) => {
  try {
    const { cpf } = req.body

    if (!cpf || typeof cpf !== 'string') {
      return res
        .status(400)
        .json({ error: 'CPF é obrigatório e deve ser uma string.' })
    }

    // Remove qualquer formatação antes da busca
    const cpfDigitsOnly = cpf.replace(/\D/g, '')

    if (cpfDigitsOnly.length < 3) {
      return res
        .status(400)
        .json({ error: 'Informe ao menos 3 dígitos para buscar por CPF.' })
    }

    // Busca no banco considerando apenas os números do CPF armazenado
    const sql = `
      SELECT c.*, v.nome_unico
      FROM clientes c
      INNER JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE REPLACE(REPLACE(REPLACE(c.cpf, '.', ''), '-', ''), ' ', '') LIKE ?
    `
    const params = [`%${cpfDigitsOnly}%`] // permite buscar parte do CPF, ex: "456"

    const [rows] = await pool.query(sql, params)

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado.' })
    }

    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar cliente pelo CPF:', error)
    res.status(500).json({ error: 'Erro ao buscar cliente pelo CPF.' })
  }
}
exports.getResumoMensalPorVendedor = async (req, res) => {
  try {
    const sql = `
      SELECT 
        vd.idVendedor, 
        vd.nome_unico AS vendedor,
        COUNT(v.id) AS total_registros
      FROM 
        vendas v 
        INNER JOIN vendedores vd ON v.idVendedor = vd.idVendedor 
        INNER JOIN clientes c ON v.cliente_id = c.id
      WHERE 
        tipo = 'NF'
        AND MONTH(v.vencimento) = MONTH(CURDATE())
        AND YEAR(v.vencimento) = YEAR(CURDATE())
        AND status_venda = 1
      GROUP BY 
        vd.nome_unico
      ORDER BY 
        vd.nome_unico
    `

    const [rows] = await pool.query(sql)

    res.status(200).json({ resultado: rows })
  } catch (error) {
    console.error('Erro ao buscar resumo mensal por vendedor:', error)
    res
      .status(500)
      .json({ error: 'Erro ao buscar resumo mensal por vendedor.' })
  }
}
exports.getResumoMensalPorRota = async (req, res) => {
  try {
    const { idVendedor } = req.body

    // Validação
    if (!idVendedor || isNaN(Number(idVendedor))) {
      return res
        .status(400)
        .json({ error: 'O ID do vendedor é obrigatório e deve ser numérico.' })
    }

    const sql = `
      SELECT
        c.rota, 
        COUNT(v.id) AS total_por_rota
      FROM
        vendas v
        INNER JOIN vendedores vd ON v.idVendedor = vd.idVendedor
        INNER JOIN clientes c ON v.cliente_id = c.id
      WHERE
        v.idVendedor = ?
        AND tipo = 'NF'
        AND MONTH(v.vencimento) = MONTH(CURDATE())
        AND YEAR(v.vencimento) = YEAR(CURDATE())
        AND status_venda = 1
      GROUP BY
        c.rota
      ORDER BY
        c.rota
    `

    const [rows] = await pool.query(sql, [idVendedor])

    res.status(200).json({ resultado: rows })
  } catch (error) {
    console.error('Erro ao buscar resumo mensal por rota:', error)
    res.status(500).json({ error: 'Erro ao buscar resumo mensal por rota.' })
  }
}
exports.getClientesPorRotaEVendedor = async (req, res) => {
  try {
    const { idVendedor, rota } = req.body

    // Validação básica
    if (!idVendedor || isNaN(Number(idVendedor))) {
      return res
        .status(400)
        .json({ error: 'O ID do vendedor é obrigatório e deve ser numérico.' })
    }
    if (!rota || typeof rota !== 'string') {
      return res
        .status(400)
        .json({ error: 'A rota é obrigatória e deve ser uma string.' })
    }

    const sql = `
      SELECT
        c.id,
        c.nomeCliente,
        c.cidade,
        v.vencimento
      FROM
        vendas v
        INNER JOIN vendedores vd ON v.idVendedor = vd.idVendedor
        INNER JOIN clientes c ON v.cliente_id = c.id
      WHERE
        v.idVendedor = ?
        AND v.tipo = 'NF'
        AND c.rota = ?
        AND MONTH(v.vencimento) = MONTH(CURDATE())
        AND YEAR(v.vencimento) = YEAR(CURDATE())
        AND v.status_venda = 1
      ORDER BY
        c.rota
    `

    const [rows] = await pool.query(sql, [idVendedor, rota])

    res.status(200).json({ resultado: rows })
  } catch (error) {
    console.error('Erro ao buscar clientes por rota e vendedor:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes.' })
  }
}
exports.getClientesAtivosPorVendedor = async (req, res) => {
  try {
    const sql = `
      SELECT 
        vd.idVendedor, 
        vd.nome_unico AS vendedor,
        COUNT(*) AS total_registros
      FROM 
        clientes c 
        INNER JOIN vendedores vd ON c.idVendedor = vd.idVendedor 
      WHERE 
        c.status = 1
      GROUP BY 
        vd.nome_unico
      ORDER BY 
        vd.nome_unico
    `

    const [rows] = await pool.query(sql)

    res.status(200).json({ resultado: rows })
  } catch (error) {
    console.error('Erro ao buscar clientes ativos por vendedor:', error)
    res
      .status(500)
      .json({ error: 'Erro ao buscar clientes ativos por vendedor.' })
  }
}
exports.getClientesPorRota = async (req, res) => {
  try {
    const { idVendedor } = req.body

    if (!idVendedor) {
      return res
        .status(400)
        .json({ error: 'O campo idVendedor é obrigatório.' })
    }

    const sql = `
      SELECT
        rota, 
        COUNT(id) AS total_por_rota
      FROM
        clientes
      WHERE
        idVendedor = ?
        AND status = 1
      GROUP BY
        rota
    `

    const [rows] = await pool.query(sql, [idVendedor])

    res.status(200).json({ resultado: rows })
  } catch (error) {
    console.error('Erro ao buscar clientes por rota:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes por rota.' })
  }
}
exports.getClientesComVendasNF = async (req, res) => {
  try {
    const { idVendedor, rota } = req.body

    if (!idVendedor || !rota) {
      return res
        .status(400)
        .json({ error: 'Campos idVendedor e rota são obrigatórios.' })
    }

    const sql = `
      SELECT 
        c.id AS idCliente,
        c.nomeCliente,
        c.cidade,
        c.rota,
        COUNT(v.venda_id) AS total_vendas
      FROM 
        clientes c
      INNER JOIN 
        vendas v ON c.id = v.cliente_id
      WHERE 
        c.idVendedor = ?
        AND c.rota = ?
        AND c.status = 1
        AND v.tipo = 'NF'
        AND v.status_venda = 1
      GROUP BY 
        c.id, c.nomeCliente, c.cidade, c.rota
      ORDER BY 
        total_vendas DESC
    `

    const [rows] = await pool.query(sql, [idVendedor, rota])

    res.status(200).json({ resultado: rows })
  } catch (error) {
    console.error('Erro ao buscar clientes com vendas NF:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes com vendas NF.' })
  }
}
exports.getKitWithDescriptions = async (req, res) => {
  try {
    const { sku } = req.params

    const sql = `
      SELECT 
        k.sku AS sku_kit,
        k.valor AS valor_kit,
        p.sku,
        p.descricao,
        kp.ordem,
        kp.quantidade,
        ROUND(kp.valorTotal, 2) AS valorTotal
      FROM kits k
      JOIN JSON_TABLE(
        k.produtos,
        '$[*]' COLUMNS (
          sku VARCHAR(20) PATH '$.sku',
          ordem INT PATH '$.ordem',
          quantidade INT PATH '$.quantidade',
          valorTotal DECIMAL(10,2) PATH '$.valorTotal'
        )
      ) AS kp
      ON 1 = 1
      JOIN produtos p ON p.sku COLLATE utf8mb4_unicode_ci = kp.sku
      WHERE k.sku = ?
      ORDER BY kp.ordem
    `

    const [rows] = await pool.query(sql, [sku])

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: 'Kit não encontrado ou produtos ausentes' })
    }

    // Monta a estrutura final
    const kitInfo = {
      sku: rows[0].sku_kit,
      valor: rows[0].valor_kit,
      produtos: rows.map((item) => ({
        sku: item.sku,
        descricao: item.descricao,
        ordem: item.ordem,
        quantidade: item.quantidade,
        valorTotal: parseFloat(item.valorTotal), // para garantir número decimal
      })),
    }

    res.status(200).json(kitInfo)
  } catch (error) {
    console.error('Erro ao buscar descrição dos produtos do kit:', error)
    res
      .status(500)
      .json({ error: 'Erro ao buscar dados do kit com descrição dos produtos' })
  }
}
exports.getAmbiente = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT ambiente FROM ambiente_app WHERE id = 1'
    )
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Ambiente não configurado.' })
    }
    res.status(200).json({ ambiente: rows[0].ambiente })
  } catch (error) {
    console.error('[ERRO] getAmbiente:', error)
    res.status(500).json({ message: 'Erro ao buscar ambiente.' })
  }
}

exports.updateAmbiente = async (req, res) => {
  try {
    const { ambiente } = req.body

    if (!ambiente || !['producao', 'desenvolvimento'].includes(ambiente)) {
      return res.status(400).json({ message: 'Valor inválido para ambiente.' })
    }

    await pool.query('UPDATE ambiente_app SET ambiente = ? WHERE id = 1', [
      ambiente,
    ])
    res.status(200).json({ message: 'Ambiente atualizado com sucesso.' })
  } catch (error) {
    console.error('[ERRO] updateAmbiente:', error)
    res.status(500).json({ message: 'Erro ao atualizar ambiente.' })
  }
}
