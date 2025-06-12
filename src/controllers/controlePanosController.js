const db = require('../../db')

// 1. Registrar envio de panos para nova rota
exports.registrarEnvioPanos = async (req, res) => {
  try {
    const { idVendedor, rota, spp, spg, pp, pg, data_registro } = req.body

    const sql = `
      INSERT INTO controle_panos (
        idVendedor, rota, spp, spg, pp, pg, data_registro, status_registro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `

    await db.query(sql, [idVendedor, rota, spp, spg, pp, pg, data_registro])

    res.status(201).json({ message: 'Envio de panos registrado com sucesso' })
  } catch (error) {
    console.error('Erro ao registrar envio de panos:', error)
    res.status(500).json({ error: 'Erro interno ao registrar envio de panos' })
  }
}

// 2. Registrar retorno da rota com panos vendidos
exports.registrarRetornoRota = async (req, res) => {
  try {
    const { idVendedor, rota, pv, vpp, vpg, valores, data_registro } = req.body

    const sql = `
      INSERT INTO controle_panos (
        idVendedor, rota, pv, vpp, vpg, valores, data_registro, status_registro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `

    await db.query(sql, [
      idVendedor,
      rota,
      pv,
      vpp,
      vpg,
      valores,
      data_registro,
    ])

    res.status(201).json({ message: 'Retorno de rota registrado com sucesso' })
  } catch (error) {
    console.error('Erro ao registrar retorno da rota:', error)
    res.status(500).json({ error: 'Erro interno ao registrar retorno da rota' })
  }
}

// 3. Listar todos os registros por vendedor
exports.listarRegistros = async (req, res) => {
  try {
    const {
      idVendedor,
      rota,
      dataInicio,
      dataFim,
      pagina = 1,
      limite = 10,
    } = req.query

    const offset = (pagina - 1) * limite
    const params = []
    let where = 'WHERE 1=1'

    if (idVendedor) {
      where += ' AND idVendedor = ?'
      params.push(idVendedor)
    }

    if (rota) {
      where += ' AND rota = ?'
      params.push(rota)
    }

    if (dataInicio && dataFim) {
      where += ' AND data_registro BETWEEN ? AND ?'
      params.push(dataInicio, dataFim)
    }

    const [dados] = await db.query(
      `SELECT * FROM controle_panos ${where} ORDER BY data_registro DESC LIMIT ? OFFSET ?`,
      [...params, Number(limite), Number(offset)]
    )

    const [total] = await db.query(
      `SELECT COUNT(*) as total FROM controle_panos ${where}`,
      params
    )

    res.status(200).json({
      registros: dados,
      total: total[0].total,
      pagina: Number(pagina),
      limite: Number(limite),
      paginas: Math.ceil(total[0].total / limite),
    })
  } catch (error) {
    console.error('Erro ao listar registros:', error)
    res.status(500).json({ error: 'Erro interno ao listar registros' })
  }
}
exports.resumoPorRotaEData = async (req, res) => {
  try {
    const { idVendedor, rota, data_inicio, data_fim } = req.body

    if (!idVendedor || !rota || !data_inicio || !data_fim) {
      return res.status(400).json({
        error: 'idVendedor, rota, data_inicio e data_fim são obrigatórios.',
      })
    }

    const [result] = await db.query(
      `
      SELECT
        SUM(pp) AS total_pp,
        SUM(pg) AS total_pg,
        SUM(vpp) AS total_vpp,
        SUM(vpg) AS total_vpg,
        SUM(spp) AS total_spp,
        SUM(spg) AS total_spg,
        SUM(pv) AS total_pv,
        SUM(valores) AS total_valores
      FROM controle_panos
      WHERE idVendedor = ? AND rota = ? AND data_registro BETWEEN ? AND ?
      `,
      [idVendedor, rota, data_inicio, data_fim]
    )

    const dados = result[0]

    const total_pp_rota =
      Number(dados.total_spp || 0) + Number(dados.total_pp || 0)
    const total_pg_rota =
      Number(dados.total_spg || 0) + Number(dados.total_pg || 0)
    const total_panos = total_pp_rota + total_pg_rota
    const saldo_pp = total_pp_rota - Number(dados.total_vpp || 0)
    const saldo_pg = total_pg_rota - Number(dados.total_vpg || 0)

    res.status(200).json({
      total_pp: Number(dados.total_pp || 0),
      total_pg: Number(dados.total_pg || 0),
      total_vpp: Number(dados.total_vpp || 0),
      total_vpg: Number(dados.total_vpg || 0),
      total_spp: Number(dados.total_spp || 0),
      total_spg: Number(dados.total_spg || 0),
      total_pv: Number(dados.total_pv || 0),
      total_valores: Number(dados.total_valores || 0),
      total_pp_rota,
      total_pg_rota,
      total_panos,
      saldo_pp,
      saldo_pg,
    })
  } catch (error) {
    console.error('Erro ao gerar resumo:', error)
    res.status(500).json({ error: 'Erro interno ao gerar resumo' })
  }
}
exports.deletarRegistroPorId = async (req, res) => {
  try {
    const { idControle } = req.params

    const [result] = await db.query(
      'DELETE FROM controle_panos WHERE idControle = ?',
      [idControle]
    )

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Registro não encontrado.' })
    }

    res.status(200).json({ message: 'Registro deletado com sucesso.' })
  } catch (error) {
    console.error('Erro ao deletar registro:', error)
    res.status(500).json({ error: 'Erro interno ao deletar registro' })
  }
}
exports.atualizarRegistroParcial = async (req, res) => {
  try {
    const { idControle } = req.params
    const campos = req.body

    if (!campos || Object.keys(campos).length === 0) {
      return res
        .status(400)
        .json({ error: 'Nenhum campo enviado para atualização.' })
    }

    const updates = []
    const values = []

    for (const campo in campos) {
      updates.push(`${campo} = ?`)
      values.push(campos[campo])
    }

    const sql = `UPDATE controle_panos SET ${updates.join(', ')} WHERE idControle = ?`
    values.push(idControle)

    const [result] = await db.query(sql, values)

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Registro não encontrado.' })
    }

    res.status(200).json({ message: 'Registro atualizado com sucesso.' })
  } catch (error) {
    console.error('Erro ao atualizar registro:', error)
    res.status(500).json({ error: 'Erro interno ao atualizar registro' })
  }
}
exports.getSaldoAtualPorVendedor = async (req, res) => {
  try {
    const { idVendedor } = req.user

    const [result] = await db.query(
      `
      SELECT
        SUM(pp) AS total_pp,
        SUM(pg) AS total_pg,
        SUM(vpp) AS total_vpp,
        SUM(vpg) AS total_vpg,
        SUM(spp) AS total_spp,
        SUM(spg) AS total_spg
      FROM controle_panos
      WHERE idVendedor = ?
      `,
      [idVendedor]
    )

    const dados = result[0]

    const total_pp_rota =
      Number(dados.total_spp || 0) + Number(dados.total_pp || 0)
    const total_pg_rota =
      Number(dados.total_spg || 0) + Number(dados.total_pg || 0)

    const saldo_pp = total_pp_rota - Number(dados.total_vpp || 0)
    const saldo_pg = total_pg_rota - Number(dados.total_vpg || 0)

    res.status(200).json({
      saldo_pp,
      saldo_pg,
      total_pp_rota,
      total_pg_rota,
    })
  } catch (error) {
    console.error('Erro ao calcular saldo atual:', error)
    res.status(500).json({ error: 'Erro interno ao calcular saldo' })
  }
}
exports.getRegistroPorId = async (req, res) => {
  try {
    const { idControle } = req.params

    const [rows] = await db.query(
      'SELECT * FROM controle_panos WHERE idControle = ?',
      [idControle]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registro não encontrado.' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar registro por ID:', error)
    res.status(500).json({ error: 'Erro interno ao buscar registro.' })
  }
}
exports.listarLogsControlePanos = async (req, res) => {
  try {
    const {
      idVendedor,
      rota,
      operacao,
      dataInicio,
      dataFim,
      pagina = 1,
      limite = 20,
    } = req.query

    const offset = (pagina - 1) * limite
    const filtros = []
    const params = []

    if (idVendedor) {
      filtros.push('idVendedor = ?')
      params.push(idVendedor)
    }

    if (rota) {
      filtros.push('rota = ?')
      params.push(rota)
    }

    if (operacao) {
      filtros.push('operacao = ?')
      params.push(operacao)
    }

    if (dataInicio && dataFim) {
      filtros.push('data_ocorrencia BETWEEN ? AND ?')
      params.push(dataInicio, dataFim)
    }

    const where = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : ''

    const [logs] = await db.query(
      `SELECT * FROM controle_panos_log ${where} ORDER BY data_ocorrencia DESC LIMIT ? OFFSET ?`,
      [...params, Number(limite), Number(offset)]
    )

    const [count] = await db.query(
      `SELECT COUNT(*) AS total FROM controle_panos_log ${where}`,
      params
    )

    res.status(200).json({
      total: count[0].total,
      pagina: Number(pagina),
      limite: Number(limite),
      paginas: Math.ceil(count[0].total / limite),
      logs,
    })
  } catch (error) {
    console.error('Erro ao listar logs do controle de panos:', error)
    res.status(500).json({ error: 'Erro interno ao listar logs' })
  }
}
