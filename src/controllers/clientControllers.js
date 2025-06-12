// clientControllers.js
require('dotenv').config()
const Client = require('../models/Client')
const axios = require('axios')
const db = require('../../db')
const jwt = require('jsonwebtoken')
const formatToMySQLDatetime = require('../utils/formatDate')

exports.buscarRegularidadeCpf = async (req, res) => {
  const { cpf } = req.params
  const authHeader = req.headers['authorization']
  const tokenJwt = authHeader && authHeader.split(' ')[1]

  if (!tokenJwt) {
    return res.status(401).json({ error: true, message: 'Token JWT ausente' })
  }

  try {
    const decodedToken = jwt.decode(tokenJwt)
    const idVendedor = decodedToken?.idVendedor

    if (!idVendedor) {
      return res.status(401).json({
        error: true,
        message: 'ID do vendedor não encontrado no token JWT',
      })
    }

    function formatarCpf(cpf) {
      return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    }

    const cpfFormatado = formatarCpf(cpf)
    const clienteQuery = 'SELECT id, nomeCliente FROM clientes WHERE cpf = ?'
    const [clienteRows] = await db.query(clienteQuery, [cpfFormatado])

    if (clienteRows.length > 0) {
      const { id, nomeCliente } = clienteRows[0]
      return res.status(200).json({
        message: `Cliente já cadastrado: ${nomeCliente} (ID: ${id})`,
      })
    }

    const query = 'SELECT token FROM netrin LIMIT 1'
    const [rows] = await db.query(query)
    const netrinToken = rows[0]?.token

    if (!netrinToken) {
      return res.status(500).json({
        error: true,
        message: 'Token da Netrin não encontrado',
      })
    }

    const url = `https://regularidade-cpf.netrin.com.br/v1/?token=${netrinToken}&cpf=${cpf}&comprovante-sincrono=true`

    // console.log('CPF enviado para consulta:', cpf)
    // console.log('Enviando requisição para:', url)

    const response = await axios.get(url)
    const { status, data } = response

    let statusPesquisa = 'Sucesso'
    let nomeRetornado = data?.regularidadeCpf?.nome || 'Nome não disponível'

    switch (status) {
      case 206:
        statusPesquisa = 'Retorno parcial'
        res.status(206).json({ message: 'Retorno parcial', data })
        break
      case 408:
        statusPesquisa = 'Timeout'
        res.status(408).json({
          message: 'Tempo limite - Tente novamente mais tarde',
        })
        break
      case 401:
        statusPesquisa = 'Token inválido ou expirado'
        res.status(401).json({
          message: 'Token inválido ou expirado. Verifique o token.',
        })
        break
      case 403:
        statusPesquisa = 'Permissão negada'
        res.status(403).json({
          message: 'Usuário não possui permissão para acessar este recurso',
        })
        break
      case 404:
        statusPesquisa = 'Parâmetros inválidos'
        res.status(404).json({
          message: 'Parâmetros inválidos. Verifique o serviço solicitado.',
        })
        break
      case 502:
        statusPesquisa = 'Falha na chamada'
        res.status(502).json({
          message: 'Falha na chamada. Contate o suporte.',
        })
        break
      default:
        res.status(200).json(data)
    }

    const insertQuery = `
      INSERT INTO netrin_historico (idVendedor, cpf, nomeRetornado, data, status)
      VALUES (?, ?, ?, NOW(), ?)
    `
    await db.query(insertQuery, [
      idVendedor,
      cpf,
      nomeRetornado,
      statusPesquisa,
    ])
  } catch (error) {
    console.error('Erro completo:', error)

    if (error.response) {
      const { status, data } = error.response
      return res.status(status).json({
        error: true,
        message: data.message || 'Erro ao conectar com a API da Netrin',
      })
    }

    return res.status(500).json({
      error: true,
      message: 'Erro inesperado. Por favor, tente novamente.',
    })
  }
}
exports.deleteClientById = async (req, res) => {
  try {
    const { id } = req.params

    // Verifica se o ID do cliente foi fornecido
    if (!id) {
      return res.status(400).json({ error: 'O campo id é obrigatório' })
    }

    // SQL para deletar o cliente pelo ID
    const sql = `DELETE FROM clientes WHERE id = ?`

    // Executa a query de deleção
    const [result] = await db.query(sql, [id])

    // Verifica se o cliente foi encontrado e deletado
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' })
    }

    res.status(200).json({ message: 'Cliente deletado com sucesso' })
  } catch (error) {
    console.error('Erro ao deletar cliente:', error)
    res.status(500).json({ error: 'Erro ao deletar cliente' })
  }
}
exports.register = async (req, res) => {
  try {
    const clientData = {
      nomeCliente: req.body.nomeCliente,
      endTipo: req.body.endTipo,
      endereco: req.body.endereco,
      numero: req.body.numero,
      bairro: req.body.bairro,
      pontoRef: req.body.pontoRef,
      cidade: req.body.cidade,
      estado: req.body.estado,
      telefone: req.body.telefone,
      cpf: req.body.cpf,
      nomeMae: req.body.nomeMae,
      dataNascimento: req.body.dataNascimento,
      rota: req.body.rota,
      idVendedor: req.body.idVendedor,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      status: req.body.status === 'ativa' ? 1 : 0,
    }

    const existingClient = await Client.findOne({
      nomeCliente: clientData.nomeCliente,
      dataNascimento: clientData.dataNascimento,
      endTipo: clientData.endTipo,
      endereco: clientData.endereco,
      numero: clientData.numero,
      bairro: clientData.bairro,
      pontoRef: clientData.pontoRef,
      cidade: clientData.cidade,
      estado: clientData.estado,
      rota: clientData.rota,
      idVendedor: clientData.idVendedor,
    })

    if (existingClient) {
      return res.status(400).json({
        message: 'Cliente já cadastrada!',
        id: existingClient.id,
      })
    }

    const client = new Client(clientData)
    await client.save()

    res.status(201).json({
      message: 'Cliente cadastrado com sucesso!',
      id: client.id,
      nomeCliente: client.nomeCliente,
    })
  } catch (error) {
    console.error('Erro ao registrar o cliente:', error)
    res.status(500).json({ error: 'Erro ao registrar o cliente' })
  }
}
exports.register2 = async (req, res) => {
  try {
    const clientData = {
      nomeCliente: req.body.nomeCliente,
      endTipo: req.body.endTipo,
      endereco: req.body.endereco,
      numero: req.body.numero,
      bairro: req.body.bairro,
      pontoRef: req.body.pontoRef,
      cidade: req.body.cidade,
      estado: req.body.estado,
      telefone: req.body.telefone,
      cpf: req.body.cpf,
      nomeMae: req.body.nomeMae,
      rota: req.body.rota,
      idVendedor: req.body.idVendedor,
      latitude: req.body.latitude || null,
      longitude: req.body.longitude || null,
      status: req.body.status === 'ativa' ? 1 : 0, // Convertendo 'ativa' para 1 e 'inativa' para 0, padrão 0
    }

    const client = new Client(clientData)
    await client.save()

    res.status(201).json({
      message: 'Cliente cadastrado com sucesso!',
      id: client.id, // Usando o ID do cliente gerado automaticamente
      nomeCliente: client.nomeCliente,
    })
  } catch (error) {
    console.error('Erro ao registrar o cliente:', error)
    res.status(500).json({ error: 'Erro ao registrar o cliente' })
  }
}
exports.getClientByCpf = async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '') // Removendo caracteres não numéricos

    const sql = `SELECT id, nomeCliente, cidade FROM clientes WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ? LIMIT 1`
    const [rows] = await db.query(sql, [cpf])

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' })
    }

    const client = rows[0]
    res.status(200).json({
      id: client.id,
      nomeCliente: client.nomeCliente,
      cidade: client.cidade,
    })
  } catch (error) {
    console.error('Erro ao buscar cliente pelo CPF:', error)
    res.status(500).json({ error: 'Erro ao buscar cliente pelo CPF' })
  }
}
exports.update = async (req, res) => {
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
      cidade,
      estado,
      telefone,
      latitude,
      longitude,
      nomeMae,
    } = req.body

    const { idVendedor } = req.user // Obtém o idVendedor do token decodificado

    // console.log(
    //   '[INFO] Requisição recebida para atualização de cliente:',
    //   req.body
    // )

    // Obtenha o status do banco de dados para garantir que ele não seja alterado
    // const [client] = await db.query(
    //   'SELECT status FROM clientes WHERE id = ?',
    //   [id]
    // )

    const query = `
  UPDATE clientes
  SET nomeCliente = ?, cpf = ?, endTipo = ?, endereco = ?, numero = ?, bairro = ?, pontoRef = ?, cidade = ?, estado = ?, telefone = ?, latitude = ?, longitude = ?, nomeMae = ?, idVendedor = ?
  WHERE id = ?
`
    const values = [
      nomeCliente,
      cpf,
      endTipo,
      endereco,
      numero,
      bairro,
      pontoRef,
      cidade,
      estado,
      telefone,
      latitude,
      longitude,
      nomeMae || '',
      idVendedor,
      id,
    ]

    // console.log('[INFO] Query:', query)
    // console.log('[INFO] Values:', values)

    await db.query(query, values)
    res.status(200).json({ message: 'Cliente atualizado com sucesso!' })
  } catch (error) {
    console.error('Erro ao atualizar o cliente:', error)
    res.status(500).json({ error: 'Erro ao atualizar o cliente' })
  }
}
exports.updatePartial = async (req, res) => {
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
      cidade,
      estado,
      telefone,
      latitude,
      longitude,
      nomeMae,
      rota,
      dataNascimento, // Inclui o campo `dataNascimento`
      fromPostSaleUpdate,
    } = req.body

    const [client] = await db.query(
      'SELECT idVendedor, status FROM clientes WHERE id = ?',
      [id]
    )
    const idVendedor = client[0]?.idVendedor || null

    const updateFields = []
    const values = []

    if (nomeCliente !== undefined) {
      updateFields.push('nomeCliente = ?')
      values.push(nomeCliente)
    }
    if (cpf !== undefined) {
      updateFields.push('cpf = ?')
      values.push(cpf)
    }
    if (endTipo !== undefined) {
      updateFields.push('endTipo = ?')
      values.push(endTipo)
    }
    if (endereco !== undefined) {
      updateFields.push('endereco = ?')
      values.push(endereco)
    }
    if (numero !== undefined) {
      updateFields.push('numero = ?')
      values.push(numero)
    }
    if (bairro !== undefined) {
      updateFields.push('bairro = ?')
      values.push(bairro)
    }
    if (pontoRef !== undefined) {
      updateFields.push('pontoRef = ?')
      values.push(pontoRef)
    }
    if (cidade !== undefined) {
      updateFields.push('cidade = ?')
      values.push(cidade)
    }
    if (estado !== undefined) {
      updateFields.push('estado = ?')
      values.push(estado)
    }
    if (telefone !== undefined) {
      updateFields.push('telefone = ?')
      values.push(telefone)
    }
    if (latitude !== undefined) {
      updateFields.push('latitude = ?')
      values.push(latitude)
    }
    if (longitude !== undefined) {
      updateFields.push('longitude = ?')
      values.push(longitude)
    }
    if (rota !== undefined) {
      updateFields.push('rota = ?')
      values.push(rota)
    }
    if (nomeMae !== undefined) {
      updateFields.push('nomeMae = ?')
      values.push(nomeMae || '')
    }
    if (dataNascimento !== undefined) {
      updateFields.push('dataNascimento = ?')
      values.push(dataNascimento)
    }

    updateFields.push('idVendedor = ?')
    values.push(idVendedor)

    const status = fromPostSaleUpdate ? 1 : client[0]?.status || 0
    updateFields.push('status = ?')
    values.push(status)

    values.push(id)

    const query = `
      UPDATE clientes
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `

    // console.log('[INFO] Query:', query)
    // console.log('[INFO] Values:', values)

    await db.query(query, values)
    res.status(200).json({ message: 'Cliente atualizado com sucesso!' })
  } catch (error) {
    console.error('Erro ao atualizar o cliente:', error)
    res.status(500).json({ error: 'Erro ao atualizar o cliente' })
  }
}
exports.getClientsByVendedor = async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Authorization header missing' })
    }

    const token = req.headers.authorization.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const idVendedor = decoded.idVendedor

    if (!idVendedor) {
      return res.status(400).json({ error: 'idVendedor not found in token' })
    }

    const query = `
            SELECT id, nomeCliente, latitude, longitude, endereco, numero, bairro, cpf, telefone, nomeMae, rota, cidade, estado, status
            FROM clientes
            WHERE idVendedor = ?
            AND latitude IS NOT NULL
            AND longitude IS NOT NULL
        `
    // console.log('Buscando clientes para o vendedor ID:', idVendedor)
    // console.log('SQL Query:', query)

    const [rows] = await db.query(query, [idVendedor])

    const clients = rows.map((client) => ({
      ...client,
      status: client.status === 1 ? 'ativa' : 'inativa', // Mapear 1 para 'ativa' e 0 para 'inativa'
    }))

    // console.log('Clientes encontrados:', clients.length)
    // console.log('Dados dos clientes:', clients)

    res.json(clients)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.getAllClientsWithCoordinates = async (req, res) => {
  // console.log('Requisição recebida para /client/clients-with-coordinates')
  try {
    const query = `
      SELECT c.id, c.nomeCliente, c.latitude, c.longitude, c.endereco, c.numero, c.bairro, c.cpf, c.telefone, c.nomeMae, c.rota, c.cidade, c.estado, c.status, c.idVendedor, v.nome_unico AS nomeVendedor
      FROM clientes c
      LEFT JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE c.status = 1
    `

    // console.log('Executando query:', query)
    const [rows] = await db.query(query)

    const clients = rows.map((client) => ({
      ...client,
      latitude: parseFloat(client.latitude), // Converte latitude para float
      longitude: parseFloat(client.longitude), // Converte longitude para float
      status: client.status === 1 ? 'ativa' : 'inativa', // Mapear 1 para 'ativa' e 0 para 'inativa'
    }))

    // console.log('Clientes encontrados:', clients.length)
    res.json(clients)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.buscarLocalizacaoClienteIndiviual = async (req, res) => {
  try {
    const { id } = req.params

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    const query = `
      SELECT c.id, c.nomeCliente, c.latitude, c.longitude, c.endereco, c.numero,
             c.bairro, c.pontoRef, c.cpf, c.telefone, c.nomeMae, c.rota, c.cidade, c.estado,
             c.status, c.idVendedor, v.nome_unico AS nomeVendedor
      FROM clientes c
      INNER JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE c.id = ?
    `

    const [rows] = await db.query(query, [id])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' })
    }

    const client = {
      ...rows[0],
      latitude: parseFloat(rows[0].latitude),
      longitude: parseFloat(rows[0].longitude),
    }

    res.json(client)
  } catch (error) {
    console.error('Erro ao buscar cliente individual:', error)
    res.status(500).json({ error: 'Erro ao buscar cliente' })
  }
}
exports.getAllClientsWithCoordinatesSimple = async (req, res) => {
  try {
    const query = `
      SELECT latitude, longitude
      FROM clientes
      WHERE status = 1
    `

    const [clients] = await db.query(query)

    res.json(
      clients.map((client) => ({
        latitude: parseFloat(client.latitude), // Converte latitude para float
        longitude: parseFloat(client.longitude), // Converte longitude para float
      }))
    )
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.getClientsByVendedorList = async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Authorization header missing' })
    }

    const token = req.headers.authorization.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const idVendedor = decoded.idVendedor

    if (!idVendedor) {
      return res.status(400).json({ error: 'idVendedor not found in token' })
    }

    const query = `
    SELECT id, nomeCliente, endereco, numero, bairro, cpf, telefone, nomeMae, rota, cidade, estado, latitude, longitude, status
    FROM clientes
    WHERE idVendedor = ?
    ORDER BY id DESC
`

    // console.log('Buscando clientes para o vendedor ID:', idVendedor)
    // console.log('SQL Query:', query)

    const [rows] = await db.query(query, [idVendedor])

    const clients = rows.map((client) => ({
      ...client,
      status: client.status === 1 ? 'ativa' : 'inativa', // Mapear 1 para 'ativa' e 0 para 'inativa'
    }))

    // console.log('Clientes encontrados:', clients.length)
    // console.log('Dados dos clientes:', clients)

    res.json(clients)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.getClientsByVendedorPaginated = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const idVendedor = decoded.idVendedor
    if (!idVendedor) {
      return res.status(400).json({ error: 'idVendedor não encontrado' })
    }

    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 50
    const offset = (page - 1) * pageSize

    const nomeCliente = req.query.nomeCliente || ''
    const cidade = req.query.cidade || ''

    // Filtros opcionais
    const whereClause = `
      WHERE idVendedor = ?
      AND nomeCliente LIKE ?
      AND cidade LIKE ?
    `

    const [totalResult] = await db.query(
      `SELECT COUNT(*) as total FROM clientes ${whereClause}`,
      [idVendedor, `%${nomeCliente}%`, `%${cidade}%`]
    )
    const totalCount = totalResult[0].total

    const [rows] = await db.query(
      `
      SELECT id, nomeCliente, endereco, numero, bairro, cpf, telefone, nomeMae, rota, cidade, estado, latitude, longitude, status
      FROM clientes
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `,
      [idVendedor, `%${nomeCliente}%`, `%${cidade}%`, pageSize, offset]
    )

    const clients = rows.map((client) => ({
      ...client,
      status: client.status === 1 ? 'ativa' : 'inativa',
    }))

    res.json({
      data: clients,
      total: totalCount,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Erro ao buscar clientes paginados:', error)
    res.status(500).json({ error: 'Erro interno ao buscar clientes' })
  }
}
exports.getClientesBuscaPaginated = async (req, res) => {
  try {
    const idVendedor = req.user?.idVendedor
    if (!idVendedor) {
      return res
        .status(401)
        .json({ error: 'Token inválido ou vendedor não encontrado' })
    }

    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 50
    const offset = (page - 1) * pageSize

    const id = req.query.id || ''
    const nomeCliente = req.query.nomeCliente || ''
    const cidade = req.query.cidade || ''

    // WHERE dinâmico com filtro do vendedor
    let whereClause = 'WHERE idVendedor = ?'
    const params = [idVendedor]

    if (id) {
      whereClause += ' AND id = ?'
      params.push(id)
    }
    if (nomeCliente) {
      whereClause += ' AND nomeCliente LIKE ?'
      params.push(`%${nomeCliente}%`)
    }
    if (cidade) {
      whereClause += ' AND cidade LIKE ?'
      params.push(`%${cidade}%`)
    }

    // Total de resultados
    const [totalResult] = await db.query(
      `SELECT COUNT(*) AS total FROM clientes ${whereClause}`,
      params
    )
    const totalCount = totalResult[0].total

    // Resultados paginados
    const [rows] = await db.query(
      `
      SELECT id, nomeCliente, endereco, numero, bairro, cpf, telefone, nomeMae, rota, cidade, estado, latitude, longitude, status
      FROM clientes
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, pageSize, offset]
    )

    const clients = rows.map((client) => ({
      ...client,
      status: client.status === 1 ? 'ativa' : 'inativa',
    }))

    res.json({
      data: clients,
      total: totalCount,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Erro ao buscar clientes filtrados paginados:', error)
    res.status(500).json({ error: 'Erro interno ao buscar clientes' })
  }
}

exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params
    const query = `
            SELECT id, nomeCliente, cpf, endTipo, endereco, numero, bairro, pontoRef, cidade, estado, telefone, nomeMae, rota, idVendedor, latitude, longitude, status
            FROM clientes
            WHERE id = ?
        `
    const [rows] = await db.query(query, [id])
    if (rows.length > 0) {
      res.status(200).json(rows[0])
    } else {
      res.status(404).json({ error: 'Cliente não encontrado' })
    }
  } catch (error) {
    console.error('Erro ao buscar cliente por ID:', error)
    res.status(500).json({ error: 'Erro ao buscar cliente por ID' })
  }
}
exports.getVendedorStats = async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Authorization header missing' })
    }

    const token = req.headers.authorization.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const userId = decoded.id

    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in token' })
    }

    // Consulta para obter o idVendedor a partir do CPF do usuário logado
    const [vendedorRows] = await db.query(
      'SELECT idVendedor, rotas FROM vendedores WHERE cpf = (SELECT cpf FROM users WHERE id = ?)',
      [userId]
    )

    if (vendedorRows.length === 0) {
      return res
        .status(404)
        .json({ error: 'Vendedor não encontrado para o usuário logado' })
    }

    const idVendedor = vendedorRows[0].idVendedor
    const rotas = vendedorRows[0].rotas.split(',').map((rota) => rota.trim())

    // Consulta para obter o total de clientes
    const totalClientsQuery = `
            SELECT COUNT(*) as totalClientes
            FROM clientes c
            WHERE c.idVendedor = ?
        `
    const [totalClientsRows] = await db.query(totalClientsQuery, [idVendedor])
    const totalClientes = totalClientsRows[0].totalClientes

    // Consulta para obter o total de clientes ativos
    const totalActiveClientsQuery = `
            SELECT COUNT(*) as totalClientesAtivos
            FROM clientes c
            WHERE c.idVendedor = ?
              AND c.status = 1
        `
    const [totalActiveClientsRows] = await db.query(totalActiveClientsQuery, [
      idVendedor,
    ])
    const totalClientesAtivos = totalActiveClientsRows[0].totalClientesAtivos

    // Consulta para obter o total de rotas
    const totalRotasQuery = `
            SELECT LENGTH(rotas) - LENGTH(REPLACE(rotas, ',', '')) + 1 AS totalRotas
            FROM vendedores v
            WHERE v.idVendedor = ?
        `
    const [totalRotasRows] = await db.query(totalRotasQuery, [idVendedor])
    const totalRotas = totalRotasRows[0].totalRotas

    // Consulta para obter o total de clientes ativos por rota
    const activeClientsByRouteQuery = `
            SELECT TRIM(c.rota) AS rota, COUNT(*) as totalClientesAtivos
            FROM clientes c
            WHERE c.idVendedor = ?
              AND c.status = 1
            GROUP BY TRIM(c.rota)
        `
    const [activeClientsByRouteRows] = await db.query(
      activeClientsByRouteQuery,
      [idVendedor]
    )

    // Encontre a cidade com mais clientes
    const topCityQuery = `
            SELECT c.cidade, COUNT(c.id) AS clientesPorCidade
            FROM clientes c
            WHERE c.idVendedor = ?
            GROUP BY c.cidade
            ORDER BY clientesPorCidade DESC
            LIMIT 1
        `
    const [topCityRows] = await db.query(topCityQuery, [idVendedor])
    const topCity =
      topCityRows.length > 0
        ? topCityRows[0]
        : { cidade: '', clientesPorCidade: 0 }

    // Consulta para obter o total de clientes com localização
    const totalClientsWithLocationQuery = `
            SELECT COUNT(*) AS total_clientes_com_localizacao
            FROM clientes
            WHERE idVendedor = ?
              AND status = 1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL;
        `
    const [totalClientsWithLocationRows] = await db.query(
      totalClientsWithLocationQuery,
      [idVendedor]
    )
    const totalClientesComLocalizacao =
      totalClientsWithLocationRows[0].total_clientes_com_localizacao

    res.json({
      totalClientes,
      totalClientesAtivos,
      totalRotas,
      activeClientsByRoute: activeClientsByRouteRows,
      topCity,
      totalClientesComLocalizacao, // Adicionando a nova informação
    })
  } catch (error) {
    console.error('Erro ao buscar estatísticas do vendedor:', error)
    res.status(500).json({ error: 'Erro ao buscar estatísticas do vendedor' })
  }
}
exports.searchByName = async (req, res) => {
  let { name } = req.params
  name = name.trim()
  // console.log(`[INFO] Recebido pedido de busca por nome: ${name}`)
  try {
    const query = `
            SELECT c.id, c.nomeCliente, c.cidade, v.nome AS nomeVendedor, c.pendencia
            FROM clientes c
            JOIN vendedores v ON c.idVendedor = v.idVendedor
            WHERE c.nomeCliente LIKE ?
        `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: %${name}%`
    // )
    const [rows] = await db.query(query, [`%${name}%`])
    // console.log('[INFO] Resultados da consulta:', rows)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar clientes pelo nome:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes pelo nome' })
  }
}
exports.getSalesByClientId = async (req, res) => {
  const { clientId } = req.params
  // console.log(`[INFO] Recebido pedido de vendas por clientId: ${clientId}`)
  try {
    const query = `
      SELECT v.venda_id, v.tipo, v.vencimento, v.valor, v.valorRecebido, v.status_venda, v.vb, c.pendencia
      FROM vendas v
      INNER JOIN clientes c ON v.cliente_id = c.id
      WHERE cliente_id = ?
      ORDER BY
        DATE_FORMAT(v.vencimento, '%Y-%m'),
        CASE
          WHEN v.tipo = 'NF' THEN 1
          WHEN v.tipo = 'RESTANTE NA NOVA' THEN 2
          WHEN v.tipo = 'RESTANTE DE VENDA' THEN 3
          ELSE 4
        END,
        v.vencimento ASC
    `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: ${clientId}`
    // )
    const [rows] = await db.query(query, [clientId])
    // console.log('[INFO] Resultados da consulta:', rows)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar vendas pelo clientId:', error)
    res.status(500).json({ error: 'Erro ao buscar vendas pelo clientId' })
  }
}
exports.getSalesByClientId_st = async (req, res) => {
  const { clientId } = req.params
  // console.log(`[INFO] Recebido pedido de vendas por clientId: ${clientId}`)
  try {
    const query = `
            SELECT venda_id, tipo, vencimento, valor, valorRecebido, vb
            FROM vendas
            WHERE cliente_id = ?
            ORDER BY 
                DATE_FORMAT(vencimento, '%Y-%m'), 
                CASE 
                    WHEN tipo = 'NF' THEN 1
                    WHEN tipo = 'RESTANTE NA NOVA' THEN 2
                    WHEN tipo = 'RESTANTE DE VENDA' THEN 3
                    ELSE 4
                END, 
                vencimento ASC
        `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: ${clientId}`
    // )
    const [rows] = await db.query(query, [clientId])
    // console.log('[INFO] Resultados da consulta:', rows)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar vendas pelo clientId:', error)
    res.status(500).json({ error: 'Erro ao buscar vendas pelo clientId' })
  }
}
exports.searchByNameOrCpf = async (req, res) => {
  let { searchQuery } = req.params
  searchQuery = searchQuery.trim()
  // console.log(`[INFO] Recebido pedido de busca por nome ou CPF: ${searchQuery}`)

  try {
    const query = `
      SELECT c.id, c.nomeCliente, c.cidade, v.nome_unico AS nomeVendedor, c.pendencia, 
        CASE 
          WHEN EXISTS (SELECT 1 FROM vendas WHERE cliente_id = c.id AND tipo = 'NF' AND status_venda = 1) 
          THEN 1 
          ELSE 0 
        END AS vendendo
      FROM clientes c
      JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE c.nomeCliente LIKE ? OR c.cpf LIKE ? ORDER BY nomeCliente
    `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: %${searchQuery}%`
    // )
    const [rows] = await db.query(query, [
      `%${searchQuery}%`,
      `%${searchQuery}%`,
    ])
    // console.log('[INFO] Resultados da consulta:', rows)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar clientes pelo nome ou CPF:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes pelo nome ou CPF' })
  }
}
exports.searchByNameOrCpfKey = async (req, res) => {
  let { nome, cpf, id } = req.query

  try {
    const conditions = []
    const values = []

    if (nome) {
      conditions.push('c.nomeCliente LIKE ?')
      values.push(`%${nome.trim()}%`)
    }
    if (cpf) {
      const cpfLimpo = cpf.replace(/[^\d]/g, '') // remove tudo que não for número
      conditions.push('REGEXP_REPLACE(c.cpf, "[^0-9]", "") LIKE ?')
      values.push(`%${cpfLimpo}%`)
    }
    if (id) {
      conditions.push('c.id = ?')
      values.push(id.trim()) // Para id, pode ser uma busca exata
    }

    if (conditions.length === 0) {
      return res
        .status(400)
        .json({ error: 'Pelo menos um parâmetro deve ser fornecido' })
    }

    const query = `
      SELECT c.id AS clientId, c.cidade, c.endereco, c.nomeCliente AS clienteName, 
             c.rota, v.nome_unico, c.status
      FROM clientes c
      JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE ${conditions.join(' OR ')}
      ORDER BY c.nomeCliente
    `

    const [rows] = await db.query(query, values)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar clientes:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes' })
  }
}
exports.searchByNameOrCpf_st = async (req, res) => {
  let { searchQuery } = req.params
  searchQuery = searchQuery.trim()
  // console.log(`[INFO] Recebido pedido de busca por nome ou CPF: ${searchQuery}`)

  try {
    const query = `
      SELECT c.id, c.nomeCliente, c.cidade, v.nome AS nomeVendedor, c.pendencia, 
        CASE 
          WHEN EXISTS (SELECT 1 FROM vendas WHERE cliente_id = c.id AND tipo = 'NF' AND status_venda = 1) 
          THEN 1 
          ELSE 0 
        END AS vendendo
      FROM clientes c
      JOIN vendedores v ON c.idVendedor = v.idVendedor
      WHERE c.nomeCliente LIKE ? OR c.cpf LIKE ?
    `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com o parâmetro: %${searchQuery}%`
    // )
    const [rows] = await db.query(query, [
      `%${searchQuery}%`,
      `%${searchQuery}%`,
    ])
    // console.log('[INFO] Resultados da consulta:', rows)
    res.status(200).json(rows)
  } catch (error) {
    console.error('[ERROR] Erro ao buscar clientes pelo nome ou CPF:', error)
    res.status(500).json({ error: 'Erro ao buscar clientes pelo nome ou CPF' })
  }
}
exports.getSpecificSaleByClientId = async (req, res) => {
  const { clientId } = req.params
  const currentDate = new Date()
  const startDate = new Date(currentDate)
  startDate.setDate(startDate.getDate() - 10)
  const endDate = new Date(currentDate)
  endDate.setDate(endDate.getDate() + 90)

  const formattedStartDate = startDate.toISOString().split('T')[0]
  const formattedEndDate = endDate.toISOString().split('T')[0]

  // console.log(
  //   `[INFO] Recebido pedido específico de vendas por clientId: ${clientId}`
  // )
  try {
    const query = `
            SELECT venda_id, tipo, vencimento, valor, valorRecebido
            FROM vendas
            WHERE cliente_id = ? AND tipo = 'NF' AND vencimento BETWEEN ? AND ?
            ORDER BY vencimento ASC
        `
    // console.log(
    //   '[INFO] Executando consulta SQL:',
    //   query,
    //   `com os parâmetros: ${clientId}, ${formattedStartDate}, ${formattedEndDate}`
    // )
    const [rows] = await db.query(query, [
      clientId,
      formattedStartDate,
      formattedEndDate,
    ])
    // console.log('[INFO] Resultados da consulta:', rows)

    if (rows.length > 1) {
      console.warn('[WARN] Mais de um registro encontrado:', rows)
    }

    res.status(200).json(rows[0] || {})
  } catch (error) {
    console.error(
      '[ERROR] Erro ao buscar venda específica pelo clientId:',
      error
    )
    res
      .status(500)
      .json({ error: 'Erro ao buscar venda específica pelo clientId' })
  }
}
// exports.getSpecificSaleByVendaId = async (req, res) => {
//   const { vendaId } = req.params
//   try {
//     const query = `
//       SELECT *
//       FROM vendas
//       WHERE venda_id = ? AND status_venda = 1
//     `
//     const [rows] = await db.query(query, [vendaId])
//     if (rows.length === 0) {
//       res.status(404).json({ message: 'Nenhuma venda encontrada.' })
//     } else {
//       res.status(200).json(rows[0])
//     }
//   } catch (error) {
//     console.error('[ERROR] Erro ao buscar venda específica:', error)
//     res.status(500).json({ error: 'Erro ao buscar venda específica' })
//   }
// }
// exports.updateValorRecebido = async (req, res) => {
//   const { venda_id, valor, valorRecebido } = req.body
//   console.log(
//     `[INFO] Atualizando valores para venda_id: ${venda_id}, valor: ${valor}, valorRecebido: ${valorRecebido}`
//   )

//   const vb = valorRecebido < 80 ? 'VENDA BAIXA' : null

//   try {
//     const query = `
//       UPDATE vendas
//       SET valor = ?, valorRecebido = ?, status_venda = ?, atualizacao = DATE_FORMAT(NOW(), '%Y-%m-%d'),
//           vb = ?, situacao = 1
//       WHERE venda_id = ?
//     `
//     console.log('[INFO] Executando consulta SQL:', query)

//     const [result] = await db.query(query, [
//       valor,
//       valorRecebido,
//       0,
//       vb,
//       venda_id,
//     ])
//     console.log('[INFO] Resultados da consulta:', result)

//     if (result.affectedRows === 0) {
//       console.warn(
//         '[WARN] Nenhuma linha foi atualizada. Verifique o venda_id fornecido.'
//       )
//       res.status(404).json({
//         message:
//           'Nenhuma linha foi atualizada. Verifique o venda_id fornecido.',
//       })
//     } else {
//       console.log('[INFO] Valores atualizados com sucesso')
//       res.status(200).json({ message: 'Valores atualizados com sucesso' })
//     }
//   } catch (error) {
//     console.error('[ERROR] Erro ao atualizar valores:', error)
//     res.status(500).json({ error: 'Erro ao atualizar valores' })
//   }
// }
// exports.createSale = async (req, res) => {
//   const {
//     tipo,
//     id,
//     vencimento,
//     valor,
//     valorRecebido,
//     cliente_id,
//     idVendedor,
//     status_venda,
//   } = req.body

//   // Validação básica para garantir que todos os campos obrigatórios foram enviados
//   if (
//     !tipo ||
//     id === undefined ||
//     !vencimento ||
//     !valor ||
//     cliente_id === undefined ||
//     idVendedor === undefined ||
//     status_venda === undefined
//   ) {
//     return res.status(400).json({ error: 'Campos obrigatórios faltando' })
//   }

//   try {
//     const query = `
//       INSERT INTO vendas (
//         tipo, id, vencimento, atualizacao, valor, valorRecebido, cliente_id, idVendedor, status_venda
//       ) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)
//     `

//     await db.query(query, [
//       tipo,
//       id,
//       vencimento,
//       valor,
//       valorRecebido,
//       cliente_id,
//       idVendedor,
//       status_venda,
//     ])

//     console.log('[INFO] Nova venda criada com sucesso')
//     res.status(201).json({ message: 'Nova venda criada com sucesso' })
//   } catch (error) {
//     console.error('[ERROR] Erro ao criar nova venda:', error)
//     res.status(500).json({ error: 'Erro ao criar nova venda' })
//   }
// }
exports.getClientsByRouteWithSales = async (req, res) => {
  const { routeName } = req.params
  const { idVendedor } = req.user
  const currentDate = new Date()
  const startDate = new Date()
  startDate.setDate(currentDate.getDate() - 25)
  const endDate = new Date()
  endDate.setDate(currentDate.getDate() + 25)

  const formattedStartDate = startDate.toISOString().split('T')[0]
  const formattedEndDate = endDate.toISOString().split('T')[0]

  try {
    // console.log(
    //   `Buscando clientes na rota: ${routeName} para vendedor: ${idVendedor}`
    // )

    const queryClients = `
      SELECT DISTINCT c.id, c.nomeCliente, c.endTipo, c.endereco, c.numero, c.bairro, c.cidade, c.estado, c.pontoRef, c.latitude, c.longitude, v.permissao
      FROM clientes c
      JOIN vendas v ON c.id = v.cliente_id
      WHERE c.rota = ? AND c.status = 1 AND c.idVendedor = ? AND v.tipo = 'NF' AND v.status_venda = 1
        AND DATE(v.vencimento) BETWEEN ? AND ?
    `
    // console.log('Executing query:', queryClients)
    const [clients] = await db.query(queryClients, [
      routeName,
      idVendedor,
      formattedStartDate,
      formattedEndDate,
    ])

    // console.log('Clients:', JSON.stringify(clients, null, 2))

    const clientsWithSales = await Promise.all(
      clients.map(async (client) => {
        const querySales = `
          SELECT venda_id, vencimento, valor
          FROM vendas
          WHERE cliente_id = ? AND tipo = 'NF' AND status_venda = 1 AND DATE(vencimento) BETWEEN ? AND ?
          ORDER BY vencimento ASC
        `
        // console.log('Executing sales query:', querySales)
        const [sales] = await db.query(querySales, [
          client.id,
          formattedStartDate,
          formattedEndDate,
        ])
        // console.log(
        //   `Sales for client ${client.id} :`,
        //   JSON.stringify(sales, null, 2)
        // )
        return {
          ...client,
          vendas: sales,
        }
      })
    )

    // Ordena os clientes com base no vencimento da primeira venda
    clientsWithSales.sort((a, b) => {
      const aVencimento =
        a.vendas.length > 0 ? new Date(a.vendas[0].vencimento) : new Date()
      const bVencimento =
        b.vendas.length > 0 ? new Date(b.vendas[0].vencimento) : new Date()
      return aVencimento - bVencimento
    })

    // console.log(
    //   'Clients with sales:',
    //   JSON.stringify(clientsWithSales, null, 2)
    // )
    res.status(200).json(clientsWithSales)
  } catch (error) {
    console.error('Erro ao buscar clientes com vendas:', error)
    res.status(500).json({ message: 'Erro ao buscar clientes com vendas' })
  }
}
exports.getClientsByRouteWithSalesFixo = async (req, res) => {
  const { routeName } = req.params
  const { idVendedor } = req.user // Pegando idVendedor do token JWT
  const currentDate = new Date()
  const startDate = new Date()
  startDate.setDate(currentDate.getDate() - 30)
  const endDate = new Date()
  endDate.setDate(currentDate.getDate() + 30)

  const formattedStartDate = startDate.toISOString().split('T')[0]
  const formattedEndDate = endDate.toISOString().split('T')[0]

  try {
    // console.log(
    //   `Buscando clientes na rota: ${routeName} para vendedor: ${idVendedor}`
    // )

    // Consulta de clientes com vendas
    const queryClients = `
      SELECT DISTINCT c.id, c.nomeCliente
      FROM clientes c
      JOIN vendas v ON c.id = v.cliente_id
      WHERE c.rota = ? AND c.idVendedor = ? AND v.tipo = 'NF'
        AND DATE(v.vencimento) BETWEEN ? AND ?

    `
    // console.log('Executing query:', queryClients)
    const [clients] = await db.query(queryClients, [
      routeName,
      idVendedor,
      formattedStartDate,
      formattedEndDate,
    ])

    // console.log('Clients:', JSON.stringify(clients, null, 2))

    // Variável para contar o total de vendas
    let totalVendas = 0

    const clientsWithSales = await Promise.all(
      clients.map(async (client) => {
        const querySales = `
          SELECT venda_id, vencimento, valor
          FROM vendas
          WHERE cliente_id = ? AND tipo = 'NF' AND DATE(vencimento) BETWEEN ? AND ?
          ORDER BY vencimento ASC
        `
        // console.log('Executing sales query:', querySales)
        const [sales] = await db.query(querySales, [
          client.id,
          formattedStartDate,
          formattedEndDate,
        ])
        // console.log(
        //   `Sales for client ${client.id} :`,
        //   JSON.stringify(sales, null, 2)
        // )

        // Atualiza o total de vendas
        totalVendas += sales.length

        return {
          ...client,
          vendas: sales,
        }
      })
    )

    // Ordena os clientes com base no vencimento da primeira venda
    clientsWithSales.sort((a, b) => {
      const aVencimento =
        a.vendas.length > 0 ? new Date(a.vendas[0].vencimento) : new Date()
      const bVencimento =
        b.vendas.length > 0 ? new Date(b.vendas[0].vencimento) : new Date()
      return aVencimento - bVencimento
    })

    // console.log(
    //   'Clients with sales:',
    //   JSON.stringify(clientsWithSales, null, 2)
    // )

    // Resposta com o total de vendas e a lista de clientes com vendas
    res.status(200).json({
      totalClients: clientsWithSales.length, // Número de clientes com vendas
      totalSales: totalVendas, // Número total de registros de vendas
      clients: clientsWithSales, // Lista de clientes com suas vendas
    })
  } catch (error) {
    console.error('Erro ao buscar clientes com vendas:', error)
    res.status(500).json({ message: 'Erro ao buscar clientes com vendas' })
  }
}
exports.getNextRouteWithSales = async (req, res) => {
  const { routeName } = req.params
  const { idVendedor } = req.user // Pegando idVendedor do token JWT
  const currentDate = new Date()
  const targetDate = new Date()
  targetDate.setDate(currentDate.getDate() + 40) // Ajustando para pegar vendas com vencimento 40 dias após a data atual

  const formattedTargetDate = targetDate.toISOString().split('T')[0]

  try {
    // console.log(
    //   `Buscando clientes na rota: ${routeName} para vendedor: ${idVendedor}`
    // )

    const queryClients = `
      SELECT DISTINCT c.id, c.nomeCliente, c.endTipo, c.endereco, c.numero, c.bairro, c.cidade, c.estado, c.pontoRef, c.data_cadastro
      FROM clientes c
      JOIN vendas v ON c.id = v.cliente_id
      WHERE c.rota = ? AND c.status = 1 AND c.idVendedor = ? AND v.tipo = 'NF' AND v.status_venda = 1
        AND DATE(v.vencimento) > ?
      ORDER BY c.nomeCliente;
    `
    // console.log('Executing query:', queryClients)
    const [clients] = await db.query(queryClients, [
      routeName,
      idVendedor,
      formattedTargetDate,
    ])

    // Iterando sobre os clientes e adicionando verificação de novata
    const clientsWithSales = await Promise.all(
      clients.map(async (client) => {
        const querySales = `
          SELECT venda_id, vencimento, valor
          FROM vendas
          WHERE cliente_id = ? AND tipo = 'NF' AND status_venda = 1 AND DATE(vencimento) > ?
          ORDER BY vencimento ASC;
        `
        const [sales] = await db.query(querySales, [
          client.id,
          formattedTargetDate,
        ])

        // Verifica se o cliente é novato (data_cadastro até 50 dias antes da data atual)
        const cadastroDate = new Date(client.data_cadastro)
        const diffDays = Math.floor(
          (currentDate - cadastroDate) / (1000 * 60 * 60 * 24)
        )
        const isNovata = diffDays <= 50

        return {
          ...client,
          vendas: sales,
          novata: isNovata, // Adiciona flag de novata
        }
      })
    )

    // Ordena os clientes com base no vencimento da primeira venda
    clientsWithSales.sort((a, b) => {
      const aVencimento =
        a.vendas.length > 0 ? new Date(a.vendas[0].vencimento) : new Date()
      const bVencimento =
        b.vendas.length > 0 ? new Date(b.vendas[0].vencimento) : new Date()
      return aVencimento - bVencimento
    })

    res.status(200).json(clientsWithSales)
  } catch (error) {
    console.error('Erro ao buscar clientes com vendas:', error)
    res.status(500).json({ message: 'Erro ao buscar clientes com vendas' })
  }
}
exports.getNextRouteWithSalesTeam = async (req, res) => {
  const { routeName } = req.params
  const { idVendedor } = req.query // Buscar idVendedor dos parâmetros de consulta (query)
  const currentDate = new Date()
  const targetDate = new Date()
  targetDate.setDate(currentDate.getDate() + 40) // Ajustando para pegar vendas com vencimento 40 dias após a data atual

  const formattedTargetDate = targetDate.toISOString().split('T')[0]

  try {
    // console.log(
    //   `Buscando clientes na rota: ${routeName} para vendedor: ${idVendedor}`
    // )

    const queryClients = `
      SELECT DISTINCT c.id, c.nomeCliente, c.endTipo, c.endereco, c.numero, c.bairro, c.cidade, c.estado, c.pontoRef, c.data_cadastro
      FROM clientes c
      JOIN vendas v ON c.id = v.cliente_id
      WHERE c.rota = ? AND c.status = 1 AND c.idVendedor = ? AND v.tipo = 'NF' AND v.status_venda = 1
        AND DATE(v.vencimento) > ?
      ORDER BY c.nomeCliente;
    `
    // console.log('Executing query:', queryClients)
    const [clients] = await db.query(queryClients, [
      routeName,
      idVendedor,
      formattedTargetDate,
    ])

    // Iterando sobre os clientes e adicionando verificação de novata
    const clientsWithSales = await Promise.all(
      clients.map(async (client) => {
        const querySales = `
          SELECT venda_id, vencimento, valor
          FROM vendas
          WHERE cliente_id = ? AND tipo = 'NF' AND status_venda = 1 AND DATE(vencimento) > ?
          ORDER BY vencimento ASC;
        `
        const [sales] = await db.query(querySales, [
          client.id,
          formattedTargetDate,
        ])

        // Verifica se o cliente é novato (data_cadastro até 50 dias antes da data atual)
        const cadastroDate = new Date(client.data_cadastro)
        const diffDays = Math.floor(
          (currentDate - cadastroDate) / (1000 * 60 * 60 * 24)
        )
        const isNovata = diffDays <= 50

        return {
          ...client,
          vendas: sales,
          novata: isNovata, // Adiciona flag de novata
        }
      })
    )

    // Ordena os clientes com base no vencimento da primeira venda
    clientsWithSales.sort((a, b) => {
      const aVencimento =
        a.vendas.length > 0 ? new Date(a.vendas[0].vencimento) : new Date()
      const bVencimento =
        b.vendas.length > 0 ? new Date(b.vendas[0].vencimento) : new Date()
      return aVencimento - bVencimento
    })

    res.status(200).json(clientsWithSales)
  } catch (error) {
    console.error('Erro ao buscar clientes com vendas:', error)
    res.status(500).json({ message: 'Erro ao buscar clientes com vendas' })
  }
}
// exports.createNewSale = async (req, res) => {
//   const { tipo, id, vencimento, valor, valorRecebido, cliente_id, idVendedor } =
//     req.body
//   console.log('[INFO] Dados recebidos para criar nova venda:', req.body)

//   try {
//     // Verifica se já existe uma venda com os mesmos critérios
//     const checkQuery = `
//       SELECT * FROM vendas
//       WHERE id = ?
//         AND vencimento = ?
//         AND valor = ?
//         AND cliente_id = ?
//         AND status_venda = 1
//     `
//     const [existingSale] = await db.query(checkQuery, [
//       id,
//       vencimento,
//       valor,
//       cliente_id,
//     ])

//     if (existingSale.length > 0) {
//       console.log(
//         '[INFO] Venda já registrada para este cliente com os mesmos critérios.'
//       )
//       return res
//         .status(400)
//         .json({ error: 'Venda já registrada para este cliente' })
//     }

//     // Se não existir uma venda duplicada, insere a nova venda
//     const insertQuery = `
//       INSERT INTO vendas (tipo, id, vencimento, atualizacao, valor, valorRecebido, cliente_id, idVendedor, status_venda)
//       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)
//     `
//     console.log('[INFO] Executando query SQL:', insertQuery)

//     const result = await db.query(insertQuery, [
//       tipo,
//       id,
//       vencimento,
//       valor,
//       valorRecebido,
//       cliente_id,
//       idVendedor,
//       1,
//     ])
//     console.log('[INFO] Resultado da query:', result)

//     console.log('[INFO] Nova venda criada com sucesso')
//     res.status(201).json({ message: 'Nova venda criada com sucesso' })
//   } catch (error) {
//     console.error('[ERROR] Erro ao criar nova venda:', error)
//     res.status(500).json({ error: 'Erro ao criar nova venda' })
//   }
// }
// exports.getKitBySKU = async (req, res) => {
//   const { sku } = req.params
//   try {
//     const [rows] = await db.query('SELECT valor FROM kits WHERE sku = ?', [sku])
//     if (rows.length === 0) {
//       return res.status(404).json({ error: 'Kit não encontrado' })
//     }
//     res.status(200).json(rows[0])
//   } catch (error) {
//     console.error('Erro ao buscar valor do kit:', error)
//     res.status(500).json({ error: 'Erro ao buscar valor do kit' })
//   }
// }
exports.getRestantesByVendedor = async (req, res) => {
  try {
    const idVendedor = req.user.idVendedor

    if (!idVendedor) {
      return res
        .status(400)
        .json({ error: 'idVendedor not found in user data' })
    }

    const query = `
      SELECT 
        v.venda_id, v.tipo, v.valor, 
        c.nomeCliente, c.endereco, c.numero, c.bairro, c.cidade, c.estado, v.rota,
        v.cliente_id
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      WHERE v.tipo = 'RESTANTE DE VENDA' 
        AND v.valorRecebido = 0
        AND c.idVendedor = ?
        AND v. status_venda = 1
        AND (c.pendencia IS NULL OR c.pendencia NOT IN ('SERASA', 'SERASA1'))
    `

    // console.log('Buscando restantes para o vendedor ID:', idVendedor)
    // console.log('SQL Query:', query)

    const [rows] = await db.query(query, [idVendedor])

    // console.log('Registros encontrados:', rows.length)
    // console.log('Dados dos registros:', rows)

    res.json(rows)
  } catch (error) {
    console.error('Erro ao buscar registros de restantes:', error)
    res.status(500).json({ error: 'Erro ao buscar registros de restantes' })
  }
}
exports.receivePayment = async (req, res) => {
  const { venda_id, valorRecebido, valorPendente, cliente_id, rota } = req.body
  const currentDate = new Date().toISOString().split('T')[0]

  // Calcular a data de vencimento 60 dias após a data atual
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 60)
  const formattedDueDate = dueDate.toISOString().split('T')[0]

  // Extrair idVendedor do token
  const idVendedor = req.user.idVendedor // Certifique-se de que o middleware do token adicione o idVendedor no objeto req.user

  // console.log(
  //   `[INFO] Recebendo pagamento para venda_id: ${venda_id}, valorRecebido: ${valorRecebido}, valorPendente: ${valorPendente}, cliente_id: ${cliente_id}, idVendedor: ${idVendedor}`
  // )

  const connection = await db.getConnection() // Utilizando conexão de transação

  try {
    await connection.beginTransaction()

    // Atualizar registro atual
    const updateQuery = `
          UPDATE vendas
          SET valorRecebido = ?, vencimento = ?, id = ?, situacao = 1,status_venda = ?, atualizacao = DATE_FORMAT(NOW(), '%Y-%m-%d'), idVendedor = ?
          WHERE venda_id = ?
        `
    const [updateResult] = await connection.query(updateQuery, [
      valorRecebido,
      currentDate,
      cliente_id,
      valorRecebido > 0 ? 0 : 1, // Define status_venda como 0 se valorRecebido for diferente de 0
      idVendedor,
      venda_id,
    ])

    if (updateResult.affectedRows === 0) {
      await connection.rollback()
      console.warn(
        '[WARN] Nenhuma linha foi atualizada. Verifique o venda_id fornecido.'
      )
      return res.status(404).json({
        message:
          'Nenhuma linha foi atualizada. Verifique o venda_id fornecido.',
      })
    }

    if (valorPendente > 0) {
      // Criar novo registro de restante de venda
      const insertQuery = `
        INSERT INTO vendas (tipo, valor, valorRecebido, vencimento, atualizacao, cliente_id, id, status_venda, idVendedor, rota)
        VALUES ('RESTANTE DE VENDA', ?, 0, ?, NOW(), ?, ?, 1, ?, ?)
      `
      const [insertResult] = await connection.query(insertQuery, [
        valorPendente,
        formattedDueDate,
        cliente_id,
        cliente_id,
        idVendedor,
        rota,
      ])

      if (insertResult.affectedRows === 0) {
        await connection.rollback()
        console.error(
          '[ERROR] Nenhuma linha foi inserida para o restante de venda.'
        )
        return res
          .status(500)
          .json({ error: 'Erro ao criar restante de venda.' })
      }
    }

    await connection.commit()
    // console.log('[INFO] Pagamento registrado com sucesso')
    res.status(200).json({ message: 'Pagamento registrado com sucesso' })
  } catch (error) {
    await connection.rollback()
    console.error('[ERROR] Erro ao registrar pagamento:', error)
    res.status(500).json({ error: 'Erro ao registrar pagamento' })
  } finally {
    connection.release()
  }
}
exports.getRouteReport = async (req, res) => {
  const { routeName, startDate, endDate } = req.body
  const { idVendedor } = req.user // Supondo que você tenha o idVendedor decodificado do token e adicionado a req.user

  // console.log('Iniciando getRouteReport')
  // console.log(
  //   `routeName: ${routeName}, startDate: ${startDate}, endDate: ${endDate}, idVendedor: ${idVendedor}`
  // )

  try {
    // Busca o valor total vendido na rota específica no período selecionado
    const [totalVendido] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'NF' AND vendas.atualizacao BETWEEN ? AND ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [startDate, endDate, routeName, idVendedor]
    )
    // console.log('totalVendido:', totalVendido)

    // Busca o valor total recebido na rota específica no período selecionado
    const [totalRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'NF' AND vendas.atualizacao BETWEEN ? AND ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [startDate, endDate, routeName, idVendedor]
    )
    // console.log('totalRecebido:', totalRecebido)

    // Contar quantas vendas tipo 'NF' foram feitas na rota e período
    const [quantidadeNF] = await db.query(
      `SELECT COUNT(vendas.venda_id) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'NF'
        AND vendas.status_venda = 0
        AND vendas.atualizacao BETWEEN ? AND ?
        AND clientes.rota = ?
        AND vendas.idVendedor = ?`,
      [startDate, endDate, routeName, idVendedor]
    )

    // Busca o total de registros "RESTANTE DE VENDA" anteriores que estejam ativos
    const [restantesAnterior] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'RESTANTE DE VENDA' AND vendas.status_venda = 1 AND vendas.idVendedor = ?`,
      [idVendedor]
    )
    // console.log('restantesAnterior:', restantesAnterior)

    // Busca o total recebido para registros "RESTANTE DE VENDA" de qualquer rota no período selecionado
    const [restantesRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'RESTANTE DE VENDA' AND vendas.valorRecebido > 0 AND vendas.atualizacao BETWEEN ? AND ? AND vendas.idVendedor = ?`,
      [startDate, endDate, idVendedor]
    )
    // console.log('restantesRecebido:', restantesRecebido)

    // Soma os totais recebidos da rota e dos restantes
    const totalRota =
      (Number(totalRecebido[0].total) || 0) +
      (Number(restantesRecebido[0].total) || 0)
    // console.log('totalRota:', totalRota)

    // Busca os clientes e vendas relacionadas, filtrando pela rota e período
    const [clients] = await db.query(
      `SELECT 
          clientes.id,
          clientes.nomeCliente, 
          clientes.endereco, 
          clientes.numero, 
          clientes.bairro, 
          clientes.cidade, 
          clientes.estado, 
          vendas.tipo, 
          vendas.valor, 
          vendas.valorRecebido, 
          vendas.vb
        FROM vendas
        JOIN clientes ON vendas.cliente_id = clientes.id
        WHERE 
          (clientes.rota = ? OR vendas.tipo != 'NF') 
          AND vendas.idVendedor = ? 
          AND (
            (vendas.tipo = 'NF' 
              AND vendas.atualizacao BETWEEN ? AND ? 
              AND valor < 2000) 
            OR 
            (vendas.tipo = 'RESTANTE DE VENDA' 
              AND vendas.atualizacao BETWEEN ? AND ? 
              AND valorRecebido != 0)
          )
        ORDER BY vendas.atualizacao DESC
      `,
      [routeName, idVendedor, startDate, endDate, startDate, endDate]
    )
    // console.log('clients:', clients)

    res.status(200).json({
      valorTotalVendido: totalVendido[0].total || 0,
      valorTotalRecebido: totalRecebido[0].total || 0,
      restantesTotalAnterior: restantesAnterior[0].total || 0,
      restantesTotalRecebido: restantesRecebido[0].total || 0,
      totalRota,
      totalNF: quantidadeNF[0].total || 0,
      clients,
    })
  } catch (error) {
    console.error('Erro ao buscar dados do relatório:', error)
    res.status(500).json({ error: 'Erro ao buscar dados do relatório.' })
  }
}
exports.getRouteReportTeam = async (req, res) => {
  // Extraia os parâmetros do corpo da requisição
  const { routeName, startDate, endDate, idVendedor } = req.body

  // console.log('Iniciando getRouteReport')
  // console.log(
  //   `routeName: ${routeName}, startDate: ${startDate}, endDate: ${endDate}, idVendedor: ${idVendedor}`
  // )

  try {
    // Obtenha o total vendido
    const [totalVendido] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'NF' AND vendas.atualizacao BETWEEN ? AND ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [startDate, endDate, routeName, idVendedor]
    )
    // console.log('totalVendido:', totalVendido)

    // Obtenha o total recebido
    const [totalRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'NF' AND vendas.atualizacao BETWEEN ? AND ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [startDate, endDate, routeName, idVendedor]
    )
    // console.log('totalRecebido:', totalRecebido)

    // Obtenha os restantes do total anterior
    const [restantesAnterior] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'RESTANTE DE VENDA' AND vendas.status_venda = 1 AND vendas.idVendedor = ?`,
      [idVendedor]
    )
    // console.log('restantesAnterior:', restantesAnterior)

    // Obtenha os restantes do total recebido
    const [restantesRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
       JOIN clientes ON vendas.cliente_id = clientes.id
       WHERE vendas.tipo = 'RESTANTE DE VENDA' AND vendas.valorRecebido > 0 AND vendas.atualizacao BETWEEN ? AND ? AND vendas.idVendedor = ?`,
      [startDate, endDate, idVendedor]
    )
    // console.log('restantesRecebido:', restantesRecebido)

    // Calcule o total da rota
    const totalRota =
      (Number(totalRecebido[0].total) || 0) +
      (Number(restantesRecebido[0].total) || 0)

    // console.log('totalRota:', totalRota)

    // Obtenha a lista de clientes
    const [clients] = await db.query(
      `SELECT 
          clientes.id, 
          clientes.nomeCliente, 
          clientes.endereco, 
          clientes.numero, 
          clientes.bairro, 
          clientes.cidade, 
          clientes.estado, 
          vendas.tipo, 
          vendas.valor, 
          vendas.valorRecebido, 
          vendas.vb
        FROM vendas
        JOIN clientes ON vendas.cliente_id = clientes.id
        WHERE 
          (clientes.rota = ? OR vendas.tipo != 'NF') 
          AND vendas.idVendedor = ? 
          AND (
            (vendas.tipo = 'NF' 
              AND vendas.atualizacao BETWEEN ? AND ? 
              AND valor < 2000) 
            OR 
            (vendas.tipo = 'RESTANTE DE VENDA' 
              AND vendas.atualizacao BETWEEN ? AND ? 
              AND valorRecebido != 0)
          )
        ORDER BY vendas.atualizacao DESC
      `,
      [routeName, idVendedor, startDate, endDate, startDate, endDate]
    )
    // console.log('clients:', clients)

    // Retorne os dados no formato esperado
    res.status(200).json({
      valorTotalVendido: totalVendido[0].total || 0,
      valorTotalRecebido: totalRecebido[0].total || 0,
      restantesTotalAnterior: restantesAnterior[0].total || 0,
      restantesTotalRecebido: restantesRecebido[0].total || 0,
      totalRota,
      clients,
    })
  } catch (error) {
    console.error('Erro ao buscar dados do relatório:', error)
    res.status(500).json({ error: 'Erro ao buscar dados do relatório.' })
  }
}
exports.getRouteReportDay = async (req, res) => {
  const { routeName, selectedDate } = req.body
  const { idVendedor } = req.user

  // console.log('Iniciando getRouteReportDay')
  // console.log(
  //   `routeName: ${routeName}, selectedDate: ${selectedDate}, idVendedor: ${idVendedor}`
  // )

  try {
    const [totalVendido] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'NF' AND vendas.atualizacao = ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [selectedDate, routeName, idVendedor]
    )

    const [totalRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'NF' AND vendas.atualizacao = ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [selectedDate, routeName, idVendedor]
    )

    const [restantesAnterior] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'RESTANTE DE VENDA' AND vendas.status_venda = 1 AND vendas.idVendedor = ?`,
      [idVendedor]
    )

    const [restantesRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'RESTANTE DE VENDA'
        AND vendas.valorRecebido > 0
        AND vendas.atualizacao = ?
        AND vendas.idVendedor = ?`,
      [selectedDate, idVendedor]
    )

    const totalRota =
      (Number(totalRecebido[0].total) || 0) +
      (Number(restantesRecebido[0].total) || 0)

    const [clients] = await db.query(
      `SELECT clientes.id, clientes.nomeCliente, clientes.endereco, clientes.numero, clientes.bairro, clientes.cidade, clientes.estado, vendas.tipo, vendas.valor, vendas.valorRecebido, vendas.vb
        FROM vendas
        JOIN clientes ON vendas.cliente_id = clientes.id
        WHERE 
                (clientes.rota = ? OR vendas.tipo != 'NF') 
                AND vendas.idVendedor = ? 
                AND (
                  (vendas.tipo = 'NF' 
                    AND vendas.atualizacao = ? 
                    AND valor < 2000) 
                  OR 
                  (vendas.tipo = 'RESTANTE DE VENDA' 
                    AND vendas.atualizacao = ? 
                    AND valorRecebido != 0)
                )
              ORDER BY vendas.atualizacao DESC`,
      [routeName, idVendedor, selectedDate, selectedDate]
    )

    res.status(200).json({
      valorTotalVendido: totalVendido[0].total || 0,
      valorTotalRecebido: totalRecebido[0].total || 0,
      restantesTotalAnterior: restantesAnterior[0].total || 0,
      restantesTotalRecebido: restantesRecebido[0].total || 0,
      totalRota,
      clients,
    })
  } catch (error) {
    console.error('Erro ao buscar dados do relatório:', error)
    res.status(500).json({ error: 'Erro ao buscar dados do relatório.' })
  }
}
exports.getRouteReportDayTeam = async (req, res) => {
  // Utilize idVendedor do corpo da requisição
  const { idVendedor, routeName, selectedDate } = req.body

  // console.log('Iniciando getRouteReportDay')
  console.log('Parametros recebidos:', { idVendedor, routeName, selectedDate })

  try {
    // Execução das consultas usando o idVendedor do req.body
    const [totalVendido] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'NF' AND vendas.atualizacao = ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [selectedDate, routeName, idVendedor]
    )

    const [totalRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'NF' AND vendas.atualizacao = ? AND clientes.rota = ? AND vendas.idVendedor = ?`,
      [selectedDate, routeName, idVendedor]
    )

    const [restantesAnterior] = await db.query(
      `SELECT SUM(valor) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'RESTANTE DE VENDA' AND vendas.status_venda = 1 AND vendas.idVendedor = ?`,
      [idVendedor]
    )

    const [restantesRecebido] = await db.query(
      `SELECT SUM(valorRecebido) as total FROM vendas
      JOIN clientes ON vendas.cliente_id = clientes.id
      WHERE vendas.tipo = 'RESTANTE DE VENDA'
        AND vendas.valorRecebido > 0
        AND vendas.atualizacao = ?
        AND vendas.idVendedor = ?`,
      [selectedDate, idVendedor]
    )

    const totalRota =
      (Number(totalRecebido[0].total) || 0) +
      (Number(restantesRecebido[0].total) || 0)

    const [clients] = await db.query(
      `SELECT clientes.id, clientes.nomeCliente, clientes.endereco, clientes.numero, clientes.bairro, clientes.cidade, clientes.estado, vendas.tipo, vendas.valor, vendas.valorRecebido, vendas.vb
          FROM vendas
          JOIN clientes ON vendas.cliente_id = clientes.id
          WHERE 
                  (clientes.rota = ? OR vendas.tipo != 'NF') 
                  AND vendas.idVendedor = ? 
                  AND (
                    (vendas.tipo = 'NF' 
                      AND vendas.atualizacao = ? 
                      AND valor < 2000) 
                    OR 
                    (vendas.tipo = 'RESTANTE DE VENDA' 
                      AND vendas.atualizacao = ? 
                      AND valorRecebido != 0)
                  )
                ORDER BY vendas.atualizacao DESC`,
      [routeName, idVendedor, selectedDate, selectedDate]
    )

    res.status(200).json({
      valorTotalVendido: totalVendido[0].total || 0,
      valorTotalRecebido: totalRecebido[0].total || 0,
      restantesTotalAnterior: restantesAnterior[0].total || 0,
      restantesTotalRecebido: restantesRecebido[0].total || 0,
      totalRota,
      clients,
    })
  } catch (error) {
    console.error('Erro ao buscar dados do relatório:', error)
    res.status(500).json({ error: 'Erro ao buscar dados do relatório.' })
  }
}
// exports.getRestanteNaNova = async (req, res) => {
//   const { clientId } = req.params
//   console.log(
//     `[INFO] Recebido pedido de RESTANTE NA NOVA para clientId: ${clientId}`
//   )
//   try {
//     const query = `
//       SELECT venda_id, valor
//       FROM vendas
//       WHERE cliente_id = ?
//         AND tipo = 'RESTANTE NA NOVA'
//         AND valorRecebido = 0
//         AND status_venda = 1
//     `
//     console.log(
//       '[INFO] Executando consulta SQL:',
//       query,
//       `com o parâmetro: ${clientId}`
//     )
//     const [rows] = await db.query(query, [clientId])
//     if (rows.length > 0) {
//       console.log('[INFO] Resultados da consulta:', rows[0])
//       res.status(200).json(rows[0])
//     } else {
//       res.status(200).json({ venda_id: null, valor: 0 })
//     }
//   } catch (error) {
//     console.error('[ERROR] Erro ao buscar restante na nova:', error)
//     res.status(500).json({ error: 'Erro ao buscar restante na nova' })
//   }
// }
// exports.updateRestanteNaNova = async (req, res) => {
//   const { venda_id, valorRecebido } = req.body
//   console.log(
//     `[INFO] Atualizando RESTANTE NA NOVA para venda_id: ${venda_id}, valorRecebido: ${valorRecebido}`
//   )

//   try {
//     const query = `
//       UPDATE vendas
//       SET valorRecebido = ?, status_venda = 0, atualizacao = DATE_FORMAT(NOW(), '%Y-%m-%d')
//       WHERE venda_id = ?
//     `
//     console.log('[INFO] Executando consulta SQL:', query)

//     const [result] = await db.query(query, [valorRecebido, venda_id])
//     console.log('[INFO] Resultados da consulta:', result)

//     if (result.affectedRows === 0) {
//       console.warn(
//         '[WARN] Nenhuma linha foi atualizada. Verifique o venda_id fornecido.'
//       )
//       res.status(404).json({
//         message:
//           'Nenhuma linha foi atualizada. Verifique o venda_id fornecido.',
//       })
//     } else {
//       console.log(
//         '[INFO] Valor recebido do RESTANTE NA NOVA atualizado com sucesso'
//       )
//       res.status(200).json({ message: 'Valor recebido atualizado com sucesso' })
//     }
//   } catch (error) {
//     console.error('[ERROR] Erro ao atualizar valor recebido:', error)
//     res.status(500).json({ error: 'Erro ao atualizar valor recebido' })
//   }
// }
exports.getcheckVendorInTeam = async (req, res) => {
  const { idVendedor } = req.params
  // console.log(
  //   `[INFO] Recebido pedido de verificação para idVendedor: ${idVendedor}`
  // )

  try {
    // Verificar se o idVendedor existe na tabela equipe
    const query = 'SELECT idVendedor, ids FROM equipe WHERE idVendedor = ?'
    // console.log(
    //   '[INFO] Executando consulta SQL para verificar existência:',
    //   query,
    //   `com o parâmetro: ${idVendedor}`
    // )
    const [rows] = await db.query(query, [idVendedor])

    if (rows.length > 0) {
      let ids = []

      // Processar o campo `ids`
      const idsString = rows[0].ids
      // console.log('[INFO] IDs obtidos do banco de dados:', idsString)

      // Verificar se `idsString` está em formato JSON
      try {
        if (typeof idsString === 'string') {
          ids = JSON.parse(idsString)
        } else if (Array.isArray(idsString)) {
          ids = idsString
        } else {
          throw new Error('Formato inesperado para ids')
        }

        if (!Array.isArray(ids)) {
          throw new Error('ids não é um array')
        }
      } catch (error) {
        console.error('[ERROR] Erro ao processar ids:', error)
        return res.status(500).json({ error: 'Erro ao processar lista de ids' })
      }

      // Adicionar o próprio idVendedor à lista de ids
      ids.push(parseInt(idVendedor))

      // Consultar os fullName dos usuários que possuem idVendedor na lista de ids
      const userQuery =
        'SELECT idVendedor, fullName FROM users WHERE idVendedor IN (?)'
      // console.log(
      //   '[INFO] Executando consulta SQL para obter fullNames:',
      //   userQuery,
      //   `com o parâmetro: ${ids}`
      // )
      const [users] = await db.query(userQuery, [ids])

      // Transformar o resultado em um objeto onde a chave é o idVendedor e o valor é o fullName
      const userNames = users.reduce((acc, user) => {
        acc[user.idVendedor] = user.fullName
        return acc
      }, {})

      res.status(200).json({
        hasPermission: true,
        userNames,
      })
    } else {
      res.status(200).json({ hasPermission: false })
    }
  } catch (error) {
    console.error('[ERROR] Erro ao verificar idVendedor:', error)
    res
      .status(500)
      .json({ error: `Erro ao verificar idVendedor: ${error.message}` })
  }
}
exports.updateClientStatus = async (req, res) => {
  const { cliente_id } = req.params

  try {
    if (!cliente_id) {
      return res.status(400).json({ error: 'cliente_id não fornecido' })
    }

    // Verificar se há vendas do cliente com tipo 'NF' e status_venda = 1
    const checkQuery = `
      SELECT COUNT(*) AS total
      FROM vendas
      WHERE cliente_id = ? AND tipo = 'NF' AND status_venda = 1
    `

    const [checkResult] = await db.query(checkQuery, [cliente_id])

    const hasActiveNF = checkResult[0].total > 0

    // Determinar o novo status do cliente
    const newStatus = hasActiveNF ? 1 : 0

    // Atualizar o status do cliente
    const updateQuery = 'UPDATE clientes SET status = ? WHERE id = ?'
    const [updateResult] = await db.query(updateQuery, [newStatus, cliente_id])

    if (updateResult.affectedRows > 0) {
      res
        .status(200)
        .json({ message: `Status do cliente atualizado para ${newStatus}` })
    } else {
      res.status(404).json({ error: 'Cliente não encontrado' })
    }
  } catch (error) {
    console.error('[ERROR] Erro ao atualizar status do cliente:', error)
    res
      .status(500)
      .json({ error: `Erro ao atualizar status do cliente: ${error.message}` })
  }
}
exports.getClientsDay = async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Cabeçalho de autorização ausente' })
    }

    const token = req.headers.authorization.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const idVendedor = decoded.idVendedor

    if (!idVendedor) {
      return res
        .status(400)
        .json({ error: 'idVendedor não encontrado no token' })
    }

    const query = `
      SELECT clientes.id, clientes.nomeCliente, clientes.endereco, clientes.bairro, clientes.cidade, clientes.pontoRef, clientes.idVendedor, clientes.rota, clientes.status, clientes.latitude, clientes.longitude,
             DATE_FORMAT(vendas.vencimento, '%d/%m/%y') AS vencimento 
      FROM clientes 
      JOIN vendas ON vendas.cliente_id = clientes.id 
      WHERE clientes.idVendedor = ? 
        AND vendas.tipo = 'NF' 
        AND vendas.status_venda = 1 
        AND vendas.vencimento = CURDATE() 
      ORDER BY nomeCliente;
    `

    // console.log('Buscando clientes do dia para o vendedor ID:', idVendedor)
    // console.log('SQL Query:', query)

    const [rows] = await db.query(query, [idVendedor])

    const clients = rows.map((client) => ({
      ...client,
      status: client.status === 1 ? 'ativa' : 'inativa',
    }))

    // console.log('Clientes encontrados:', clients.length)
    res.json(clients)
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({
      error: 'Erro ao processar requisição para buscar clientes do dia',
    })
  }
}
exports.getVendaAlteracoesByClienteId = async (req, res) => {
  try {
    const clienteId = req.body.clienteId || req.query.clienteId

    if (!clienteId) {
      return res
        .status(400)
        .json({ error: 'clienteId não informado no body ou na query' })
    }

    const query = `
      SELECT 
        c.nomeCliente,
        va.venda_id,
        va.campo_alterado,
        va.valor_anterior,
        va.valor_novo,
        va.data_alteracao
      FROM
        vendas_alteracoes va
      INNER JOIN
        clientes c ON va.cliente_id = c.id
      WHERE
        c.id = ?
      ORDER BY va.data_alteracao DESC;
    `

    const [rows] = await db.query(query, [clienteId])

    res.json({ clienteId, alteracoes: rows })
  } catch (error) {
    console.error(
      'Erro ao buscar histórico de alterações de venda do cliente:',
      error
    )
    res.status(500).json({
      error: 'Erro ao buscar alterações de vendas do cliente',
    })
  }
}
exports.getClienteAlteracoesById = async (req, res) => {
  try {
    const clienteId = req.body.clienteId || req.query.clienteId

    if (!clienteId) {
      return res
        .status(400)
        .json({ error: 'clienteId não informado no body ou na query' })
    }

    const query = `
      SELECT 
        ca.id,
        ca.campo_alterado,
        ca.valor_anterior,
        ca.valor_novo,
        ca.data_alteracao,
        c.nomeCliente
      FROM
        clientes_alteracoes ca
      JOIN
        clientes c ON ca.cliente_id = c.id
      WHERE
        ca.cliente_id = ?
      ORDER BY ca.data_alteracao DESC;
    `

    const [rows] = await db.query(query, [clienteId])

    res.json({
      clienteId,
      nomeCliente: rows[0]?.nomeCliente || null,
      alteracoes: rows,
    })
  } catch (error) {
    console.error('Erro ao buscar histórico de alterações do cliente:', error)
    res.status(500).json({
      error: 'Erro ao buscar alterações do cliente',
    })
  }
}

exports.getTodasAlteracoesPaginadas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit

    const clienteIdRaw = req.query.clienteId || req.body?.clienteId || null
    const clienteId = clienteIdRaw ? parseInt(clienteIdRaw) : null

    let totalQuery = ''
    let dataQuery = ''
    let queryParams = []

    if (clienteId) {
      // --- Com filtro por cliente
      totalQuery = `
        SELECT COUNT(*) AS total FROM (
          SELECT cliente_id FROM clientes_alteracoes WHERE cliente_id = ?
          UNION ALL
          SELECT cliente_id FROM vendas_alteracoes WHERE cliente_id = ?
        ) AS todas;
      `

      dataQuery = `
        SELECT
          ca.id,
          ca.cliente_id,
          NULL AS venda_id,
          c.nomeCliente,
          ca.campo_alterado,
          ca.valor_anterior,
          ca.valor_novo,
          ca.data_alteracao,
          'clientes' AS origem
        FROM clientes_alteracoes ca
        JOIN clientes c ON ca.cliente_id = c.id
        WHERE ca.cliente_id = ?

        UNION ALL

        SELECT
          va.id,
          va.cliente_id,
          va.venda_id,
          c.nomeCliente,
          va.campo_alterado,
          va.valor_anterior,
          va.valor_novo,
          va.data_alteracao,
          'vendas' AS origem
        FROM vendas_alteracoes va
        JOIN clientes c ON va.cliente_id = c.id
        WHERE va.cliente_id = ?

        ORDER BY data_alteracao DESC
        LIMIT ? OFFSET ?;
      `

      queryParams = [clienteId, clienteId, limit, offset]
    } else {
      // --- Sem filtro (todos os registros)
      totalQuery = `
        SELECT COUNT(*) AS total FROM (
          SELECT cliente_id FROM clientes_alteracoes
          UNION ALL
          SELECT cliente_id FROM vendas_alteracoes
        ) AS todas;
      `

      dataQuery = `
        SELECT
          ca.id,
          ca.cliente_id,
          NULL AS venda_id,
          c.nomeCliente,
          ca.campo_alterado,
          ca.valor_anterior,
          ca.valor_novo,
          ca.data_alteracao,
          'clientes' AS origem
        FROM clientes_alteracoes ca
        JOIN clientes c ON ca.cliente_id = c.id

        UNION ALL

        SELECT
          va.id,
          va.cliente_id,
          va.venda_id,
          c.nomeCliente,
          va.campo_alterado,
          va.valor_anterior,
          va.valor_novo,
          va.data_alteracao,
          'vendas' AS origem
        FROM vendas_alteracoes va
        JOIN clientes c ON va.cliente_id = c.id

        ORDER BY data_alteracao DESC
        LIMIT ? OFFSET ?;
      `

      queryParams = [limit, offset]
    }

    const [[{ total }]] = await db.query(
      totalQuery,
      clienteId ? [clienteId, clienteId] : []
    )
    const [rows] = await db.query(dataQuery, queryParams)

    const totalPaginas = Math.ceil(total / limit)

    res.json({
      paginaAtual: page,
      totalPaginas,
      totalRegistros: total,
      alteracoes: rows,
    })
  } catch (error) {
    console.error('Erro ao buscar alterações combinadas:', error)
    res.status(500).json({ error: 'Erro ao buscar alterações combinadas' })
  }
}
exports.getAlteracoesLocalizacaoCliente = async (req, res) => {
  try {
    const clienteId = req.body.clienteId || req.query.clienteId

    if (!clienteId) {
      return res
        .status(400)
        .json({ error: 'clienteId não informado no body ou na query' })
    }

    const query = `
      SELECT
        lat.cliente_id,
        c.nomeCliente,
        lat.valor_anterior AS latitude_anterior,
        lat.valor_novo AS latitude_nova,
        lon.valor_anterior AS longitude_anterior,
        lon.valor_novo AS longitude_nova,
        lat.data_alteracao
      FROM
        clientes_alteracoes lat
      JOIN
        clientes_alteracoes lon
        ON lat.cliente_id = lon.cliente_id
        AND lat.data_alteracao = lon.data_alteracao
      JOIN
        clientes c ON c.id = lat.cliente_id
      WHERE
        lat.campo_alterado = 'latitude'
        AND lon.campo_alterado = 'longitude'
        AND lat.cliente_id = ?
      ORDER BY lat.data_alteracao DESC;
    `

    const [rows] = await db.query(query, [clienteId])

    res.json({
      clienteId,
      nomeCliente: rows[0]?.nomeCliente || null,
      alteracoesLocalizacao: rows,
    })
  } catch (error) {
    console.error('Erro ao buscar alterações de localização do cliente:', error)
    res.status(500).json({
      error: 'Erro ao buscar alterações de localização do cliente',
    })
  }
}
exports.registrarVisitaRestante = async (req, res) => {
  try {
    const idVendedor = req.user?.idVendedor
    if (!idVendedor) {
      return res
        .status(401)
        .json({ error: 'Token inválido ou vendedor não identificado' })
    }

    const { clienteId, dataVisita, latitude, longitude, motivo } = req.body

    if (!clienteId || !dataVisita) {
      return res
        .status(400)
        .json({ error: 'clienteId e dataVisita são obrigatórios' })
    }

    const dataFormatada = formatToMySQLDatetime(dataVisita)
    const dataVisitaDateOnly = dataFormatada.split(' ')[0]

    const checkVisitaMesmoDiaQuery = `
      SELECT 1 FROM visita_restantes
      WHERE idVendedor = ?
        AND clienteId = ?
        AND DATE(dataVisita) = ?
      LIMIT 1
    `

    const [existing] = await db.query(checkVisitaMesmoDiaQuery, [
      idVendedor,
      clienteId,
      dataVisitaDateOnly,
    ])

    if (existing.length > 0) {
      return res.status(409).json({
        error: 'Já existe uma visita registrada hoje para esse cliente',
      })
    }

    // Inserção com o campo motivo
    const insertQuery = `
      INSERT INTO visita_restantes (
        idVendedor, clienteId, dataVisita, motivo, latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?)
    `

    await db.query(insertQuery, [
      idVendedor,
      clienteId,
      dataFormatada,
      motivo || null,
      latitude || null,
      longitude || null,
    ])

    res.status(201).json({ message: 'Visita registrada com sucesso' })
  } catch (error) {
    console.error('[ERROR] Falha ao registrar visita:', error)
    res.status(500).json({ error: 'Erro interno ao registrar visita' })
  }
}
exports.listarVisitasRestantes = async (req, res) => {
  try {
    const {
      id,
      nomeCliente,
      idVendedor,
      data,
      page = 1,
      limit = 20,
    } = req.query

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const values = []
    const filters = []

    // Filtros dinâmicos
    if (id) {
      filters.push('c.id = ?')
      values.push(id)
    }

    if (nomeCliente) {
      filters.push('c.nomeCliente LIKE ?')
      values.push(`%${nomeCliente}%`)
    }

    if (idVendedor) {
      filters.push('vr.idVendedor = ?')
      values.push(idVendedor)
    }

    if (data) {
      filters.push('DATE(vr.dataVisita) = ?')
      values.push(data)
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

    const dataQuery = `
      SELECT 
        vr.idVisita,
        c.id,
        c.nomeCliente,
        c.endereco,
        c.numero,
        c.bairro,
        c.cidade,
        c.pontoRef,
        v.nome_unico AS vendedor,
        vr.idVendedor,
        vr.dataVisita,
        vr.motivo,
        c.latitude AS latitude_cliente,
        c.longitude AS longitude_cliente,
        vr.latitude AS latitude_visita,
        vr.longitude AS longitude_visita
      FROM visita_restantes vr
      INNER JOIN clientes c ON vr.clienteId = c.id
      INNER JOIN vendedores v ON vr.idVendedor = v.idVendedor
      ${whereClause}
      ORDER BY vr.dataVisita DESC
      LIMIT ? OFFSET ?
    `

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM visita_restantes vr
      INNER JOIN clientes c ON vr.clienteId = c.id
      INNER JOIN vendedores v ON vr.idVendedor = v.idVendedor
      ${whereClause}
    `

    const dataValues = [...values, parseInt(limit), offset]
    const [[{ total }]] = await db.query(countQuery, values)
    const [resultados] = await db.query(dataQuery, dataValues)

    res.status(200).json({
      resultados,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[ERROR] Falha ao listar visitas restantes:', error)
    res.status(500).json({ error: 'Erro interno ao listar visitas' })
  }
}
exports.deletarVisitasRestantes = async (req, res) => {
  try {
    const { idVisita } = req.body

    if (!idVisita || (Array.isArray(idVisita) && idVisita.length === 0)) {
      return res.status(400).json({
        error: 'É necessário fornecer ao menos um idVisita para deletar.',
      })
    }

    const ids = Array.isArray(idVisita) ? idVisita : [idVisita]

    const placeholders = ids.map(() => '?').join(', ')

    const deleteQuery = `
      DELETE FROM visita_restantes
      WHERE idVisita IN (${placeholders})
    `

    const [result] = await db.query(deleteQuery, ids)

    res.status(200).json({
      message: `Visita(s) removida(s) com sucesso.`,
      afetadas: result.affectedRows,
    })
  } catch (error) {
    console.error('[ERROR] Falha ao deletar visita(s):', error)
    res.status(500).json({ error: 'Erro interno ao deletar visita(s).' })
  }
}
