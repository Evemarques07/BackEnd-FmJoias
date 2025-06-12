// userController.js
const db = require('../../db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const User = require('../models/User')
const { sendEmail } = require('../../emailService')
const path = require('path')
const fs = require('fs')

const secret = process.env.JWT_SECRET
const MIN_PASSWORD_LENGTH = 4 // Defina o comprimento mínimo desejado (use um valor maior em produção, ex: 6 ou 8)
const BCRYPT_SALT_ROUNDS = 10 // Número de salt rounds para bcrypt

exports.register = async (req, res) => {
  const { fullName, cpf, password } = req.body
  // console.log('Tentativa de registro com CPF:', cpf)

  if (!fullName || !cpf || !password) {
    // console.log('Erro: Todos os campos são obrigatórios.')
    return res.status(400).send('Todos os campos são obrigatórios.')
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    // Busca o idVendedor pelo CPF
    const sql = 'SELECT idVendedor FROM vendedores WHERE cpf = ?'
    const [rows] = await db.query(sql, [cpf])
    const idVendedor = rows[0]?.idVendedor

    if (!idVendedor) {
      console.log('Erro: Vendedor não encontrado para o CPF fornecido.')
      return res.status(404).send('Vendedor não encontrado.')
    }

    const user = new User(fullName, cpf, hashedPassword, idVendedor)
    await user.save()
    res.status(201).send('Usuário registrado com sucesso')
  } catch (error) {
    console.error('Erro ao registrar o usuário:', error.message)
    console.error('Detalhes do erro:', error)
    res.status(500).send('Erro ao registrar o usuário')
  }
}
exports.registerMasterUser = async (req, res) => {
  const { nome, cpf, password } = req.body

  console.log('Iniciando registro de usuário mestre...')

  if (!nome || !cpf || !password) {
    console.log('Erro: Todos os campos são obrigatórios.')
    return res.status(400).send('Todos os campos são obrigatórios.')
  }

  try {
    console.log(`Verificando autorização do CPF: ${cpf}`)
    const checkAuthSql =
      'SELECT nomeCompleto, cargo FROM users_adm_autorizados WHERE cpf = ?'
    const [authRows] = await db.query(checkAuthSql, [cpf])

    if (authRows.length === 0) {
      console.log('Erro: CPF não autorizado.')
      return res.status(403).send('CPF não autorizado para cadastro.')
    }

    const { nomeCompleto, cargo } = authRows[0]
    console.log(`Autorizado. Nome: ${nomeCompleto}, Cargo: ${cargo}`)

    console.log(`Verificando se o CPF já está cadastrado: ${cpf}`)
    const checkUserSql = 'SELECT id FROM users_adm WHERE cpf = ?'
    const [userRows] = await db.query(checkUserSql, [cpf])

    if (userRows.length > 0) {
      console.log('Erro: Usuário já cadastrado.')
      return res.status(409).send('Usuário já cadastrado.')
    }

    console.log('Gerando hash da senha...')
    const hashedPassword = await bcrypt.hash(password, 10)

    console.log('Inserindo novo usuário na tabela users_adm...')
    const insertUserSql =
      'INSERT INTO users_adm (nome, cpf, cargo, password) VALUES (?, ?, ?, ?)'
    await db.query(insertUserSql, [nomeCompleto, cpf, cargo, hashedPassword])

    console.log('Usuário mestre registrado com sucesso.')
    res.status(201).send('Usuário mestre registrado com sucesso.')
  } catch (error) {
    console.error('Erro ao registrar usuário mestre:', error)
    res.status(500).send('Erro interno ao processar o cadastro.')
  }
}
exports.loginMasterUser = async (req, res) => {
  const { cpf, password } = req.body

  console.log('Iniciando login de usuário mestre...')

  // Validação de entrada
  if (!cpf || !password) {
    console.log('Erro: CPF e senha são obrigatórios.')
    return res.status(400).send('CPF e senha são obrigatórios.')
  }

  try {
    // Limpa o CPF por precaução (remove caracteres não numéricos)
    const cleanedCpf = cpf.replace(/\D/g, '')

    console.log(`Buscando usuário na tabela users_adm com CPF: ${cleanedCpf}`)
    const getUserSql =
      'SELECT id, nome, cpf, cargo, password FROM users_adm WHERE cpf = ?'
    const [userRows] = await db.query(getUserSql, [cleanedCpf])

    // Usuário não encontrado
    if (userRows.length === 0) {
      console.log('Erro: Usuário não encontrado.')
      return res.status(401).send('Credenciais inválidas.') // Usa 401 para falha de autenticação
    }

    const user = userRows[0]
    console.log(`Usuário encontrado: ${user.nome}, Cargo: ${user.cargo}`)

    // Verifica a senha
    console.log('Verificando senha...')
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      console.log('Erro: Senha inválida.')
      return res.status(401).send('Credenciais inválidas.') // Usa 401
    }

    // --- Senha é Válida - Gera o JWT ---
    console.log('Login bem-sucedido. Gerando token JWT...')

    // 1. Define o payload (carga útil) para o JWT
    //    Inclua dados essenciais e não sensíveis necessários para autorização/identificação
    const payload = {
      id: user.id, // ID do usuário é crucial
      nome: user.nome, // Opcional: Útil para logs ou personalização
      cargo: user.cargo, // Opcional: Útil para controle de acesso baseado em cargo (role)
      // NÃO inclua dados sensíveis como senha ou CPF completo, a menos que seja absolutamente necessário
    }

    // 2. Define as opções do JWT (ex: tempo de expiração)
    const options = {
      expiresIn: '1h', // Token expira em 1 hora (ajuste conforme necessário: '7d', '30m', etc.)
      // Você pode adicionar outras opções como 'audience', 'issuer' se precisar
    }

    // 3. Assina o token
    const token = jwt.sign(payload, secret, options)

    console.log('Token JWT gerado com sucesso.')

    // 4. Envia a resposta de sucesso COM o token
    res.status(200).send({
      message: 'Login bem-sucedido',
      token: token, // <-- Envia o token gerado
      user: {
        // Envia dados do usuário (excluindo o hash da senha!)
        id: user.id,
        nome: user.nome,
        cpf: user.cpf, // Enviar o CPF de volta pode ser aceitável se o frontend precisar dele imediatamente
        cargo: user.cargo,
      },
    })
    // --- Fim da Geração do JWT ---
  } catch (error) {
    console.error('Erro ao realizar login:', error)
    // Loga o erro específico para depuração, mas envia uma mensagem genérica para o cliente
    res.status(500).send('Erro interno ao processar o login.')
  }
}
exports.changeMasterUserPassword = async (req, res) => {
  // 1. Obter ID do usuário do middleware de autenticação
  //    Substitua 'req.user.id' pela forma como seu middleware anexa o ID do usuário.
  const userId = req.user?.id

  if (!userId) {
    console.log(
      'Erro: ID do usuário não encontrado na requisição. Middleware de autenticação falhou ou ausente.'
    )
    // Usar 401 Unauthorized ou 403 Forbidden
    return res.status(401).send('Não autorizado: Faça login novamente.')
  }

  // 2. Obter senhas do corpo da requisição
  const { currentPassword, newPassword } = req.body

  console.log(`Iniciando alteração de senha para usuário ID: ${userId}...`)

  // 3. Validações básicas de input
  if (!currentPassword || !newPassword) {
    console.log('Erro: Senha atual e nova senha são obrigatórias.')
    return res.status(400).send('Senha atual e nova senha são obrigatórias.')
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    console.log(
      `Erro: Nova senha muito curta (mínimo ${MIN_PASSWORD_LENGTH} caracteres).`
    )
    return res
      .status(400)
      .send(
        `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
      )
  }

  if (currentPassword === newPassword) {
    console.log('Erro: Nova senha não pode ser igual à senha atual.')
    return res.status(400).send('A nova senha deve ser diferente da atual.')
  }

  try {
    // 4. Buscar a hash da senha atual do usuário no banco de dados
    console.log(`Buscando hash da senha atual para usuário ID: ${userId}`)
    const getUserSql = 'SELECT password FROM users_adm WHERE id = ?'
    const [userRows] = await db.query(getUserSql, [userId])

    if (userRows.length === 0) {
      // Isso não deveria acontecer se o middleware de autenticação estiver correto
      console.log(
        'Erro: Usuário não encontrado no banco de dados, embora autenticado.'
      )
      return res.status(404).send('Usuário não encontrado.')
    }

    const user = userRows[0]
    const storedHashedPassword = user.password

    // 5. Verificar se a senha atual fornecida corresponde à senha armazenada
    console.log('Verificando senha atual...')
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      storedHashedPassword
    )

    if (!isCurrentPasswordValid) {
      console.log('Erro: Senha atual incorreta.')
      return res.status(401).send('Senha atual incorreta.') // 401 é apropriado para credencial inválida
    }

    // 6. Gerar o hash da nova senha
    console.log('Gerando hash para a nova senha...')
    const newHashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS)

    // 7. Atualizar a senha no banco de dados
    console.log(
      `Atualizando senha no banco de dados para usuário ID: ${userId}`
    )
    const updateUserSql = 'UPDATE users_adm SET password = ? WHERE id = ?'
    const [updateResult] = await db.query(updateUserSql, [
      newHashedPassword,
      userId,
    ])

    // Verificar se a atualização realmente afetou alguma linha
    if (updateResult.affectedRows === 0) {
      // Pouco provável se as verificações anteriores passaram, mas é uma segurança extra
      console.log('Erro: Nenhuma linha afetada ao tentar atualizar a senha.')
      return res
        .status(500)
        .send(
          'Erro ao atualizar a senha, usuário não encontrado ou ID incorreto.'
        )
    }

    console.log('Senha alterada com sucesso.')
    res.status(200).send('Senha alterada com sucesso.') // 200 OK ou 204 No Content são adequados
  } catch (error) {
    console.error('Erro interno ao processar a alteração de senha:', error)
    res.status(500).send('Erro interno ao processar sua solicitação.')
  }
}
exports.login = async (req, res) => {
  try {
    const { cpf, password, device } = req.body

    if (!cpf || !password) {
      // console.log('Erro: Dados do login não fornecidos.')
      return res.status(400).json({ error: 'Dados do login não fornecidos' })
    }

    // console.log('Tentativa de login com CPF:', cpf)
    // console.log('Informações do dispositivo:', device)

    const [users] = await db.query('SELECT * FROM users WHERE cpf = ?', [cpf])
    const user = users[0]

    if (!user) {
      // console.log('Erro: Credenciais inválidas. Usuário não encontrado.')
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      // console.log('Erro: Credenciais inválidas. Senha incorreta.')
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const [vendedores] = await db.query(
      'SELECT idVendedor FROM vendedores WHERE cpf = ?',
      [cpf]
    )
    const vendedor = vendedores[0]

    if (!vendedor) {
      // console.log('Erro: Vendedor não encontrado.')
      return res.status(404).json({ error: 'Vendedor não encontrado' })
    }

    // Verifica se é líder de equipe
    const [equipes] = await db.query(
      'SELECT * FROM equipe WHERE idVendedor = ?',
      [vendedor.idVendedor]
    )
    const liderEquipe = equipes.length > 0

    const token = jwt.sign(
      {
        id: user.id,
        fullName: user.fullName,
        cpf: user.cpf,
        idVendedor: vendedor.idVendedor,
        lider_equipe: liderEquipe,
      },
      secret,
      { expiresIn: '4h' }
    )

    res.json({ token })
  } catch (error) {
    console.error('Erro inesperado:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
exports.createAdminUser = async (req, res) => {
  const { name, password, cpf } = req.body // 'name' será usado como nome_unico

  console.log('Tentativa de criação de usuário administrativo:', { name, cpf })

  if (!name || !password || !cpf) {
    return res.status(400).json({
      message: 'Nome de identificação, senha e CPF são obrigatórios.',
    })
  }

  try {
    // 1. Verifica se o CPF está autorizado
    const checkCpfSql = `SELECT * FROM users_adm_autorizados WHERE cpf = ?`
    const [existingCpf] = await db.query(checkCpfSql, [cpf])

    if (existingCpf.length === 0) {
      return res
        .status(403)
        .json({ message: 'Usuário não autorizado (CPF não encontrado).' })
    }

    const authorizedUser = existingCpf[0]
    const cargo = authorizedUser.cargo
    const nomeCompleto = authorizedUser.nomeCompleto // <- Aqui pegamos o nome completo

    // 2. Verifica se o nome_unico ou CPF já existem
    const checkUserSql = `SELECT * FROM users_adm WHERE nome_unico = ? OR cpf = ?`
    const [existingUser] = await db.query(checkUserSql, [name, cpf])

    if (existingUser.length > 0) {
      return res
        .status(409)
        .json({ message: 'Nome único ou CPF já cadastrado.' })
    }

    // 3. Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10)

    // 4. Insere na tabela users_adm
    const insertUserSql = `
      INSERT INTO users_adm (nome, nome_unico, cpf, cargo, password)
      VALUES (?, ?, ?, ?, ?)
    `
    const values = [nomeCompleto, name, cpf, cargo, hashedPassword]

    await db.query(insertUserSql, values)

    res
      .status(201)
      .json({ message: 'Usuário administrativo criado com sucesso.' })
  } catch (error) {
    console.error('Erro ao criar usuário administrativo:', error)
    res.status(500).json({ message: 'Erro ao criar usuário administrativo.' })
  }
}
exports.loginAdminUser = async (req, res) => {
  // const { fullName, password } = req.body
  const { name, password } = req.body

  // Verifica se os campos obrigatórios estão presentes
  if (!name || !password) {
    console.log('Erro: Nome completo e senha são obrigatórios.')
    return res.status(400).send('Nome completo e senha são obrigatórios.')
  }

  try {
    const sql = 'SELECT * FROM users_adm WHERE nome_unico = ?'
    const [rows] = await db.query(sql, [name])

    // Verifica se o usuário foi encontrado
    if (rows.length === 0) {
      console.log('Erro: Usuário não encontrado.')
      return res.status(404).send('Usuário não encontrado.')
    }

    const user = rows[0]

    // Compara a senha fornecida com a senha armazenada
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      console.log('Erro: Senha incorreta.')
      return res.status(401).send('Senha incorreta.')
    }

    // Gera um token JWT para autenticação
    const token = jwt.sign(
      { id: user.id, fullName: user.nome_unico, cargo: user.cargo },
      secret,
      { expiresIn: '10h' }
    )

    res.status(200).json({
      message: 'Login realizado com sucesso',
      token,
    })
  } catch (error) {
    console.error('Erro ao realizar login:', error)
    res.status(500).send('Erro ao realizar login')
  }
}
exports.editAdminName = async (req, res) => {
  const { fullName } = req.body
  const token = req.user
  const userId = token.id
  try {
    await db.query('UPDATE users_adm SET nome_unico = ? WHERE id = ?', [
      fullName,
      userId,
    ])

    // Busca o usuário atualizado
    const [userRows] = await db.query(
      'SELECT id, nome_unico, cpf, cargo FROM users_adm WHERE id = ?',
      [userId]
    )

    if (userRows.length === 0) {
      return res
        .status(404)
        .json({ error: 'Usuário administrador não encontrado' })
    }

    const userProfile = userRows[0]

    // Gera novo token
    const newToken = jwt.sign(
      {
        id: userProfile.id,
        fullName: userProfile.nome_unico,
        cpf: userProfile.cpf,
        cargo: userProfile.cargo,
      },
      secret,
      { expiresIn: '4h' }
    )

    res.status(200).json({ token: newToken })
  } catch (error) {
    console.error('Erro ao alterar o nome do administrador:', error)
    res.status(500).json({ error: 'Erro ao alterar o nome do administrador' })
  }
}
exports.changeAdminPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body
  const token = req.headers.authorization.split(' ')[1]
  const decoded = jwt.verify(token, secret)
  const userId = decoded.id

  const [users] = await db.query('SELECT * FROM users_adm WHERE id = ?', [
    userId,
  ])
  const user = users[0]

  if (!user) {
    return res
      .status(404)
      .json({ error: 'Usuário administrador não encontrado' })
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password)

  if (!isMatch) {
    return res.status(401).json({ error: 'Senha atual incorreta' })
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10)

  try {
    await db.query('UPDATE users_adm SET password = ? WHERE id = ?', [
      hashedNewPassword,
      userId,
    ])
    res
      .status(200)
      .json({ message: 'Senha do administrador alterada com sucesso' })
  } catch (error) {
    console.error('Erro ao alterar a senha do administrador:', error)
    res.status(500).json({ error: 'Erro ao alterar a senha do administrador' })
  }
}
exports.checkAuthorization = async (req, res) => {
  const { cpf } = req.body
  // console.log('Verificando autorização para CPF:', cpf)

  try {
    const [authorizedUser] = await db.query(
      'SELECT nome FROM vendedores WHERE cpf = ? AND status = 1',
      [cpf]
    )
    if (authorizedUser.length > 0) {
      const user = authorizedUser[0]

      const [existingUser] = await db.query(
        'SELECT id FROM users WHERE cpf = ?',
        [cpf]
      )
      if (existingUser.length > 0) {
        // console.log('Usuário já registrado:', user)
        res.status(200).json({
          authorized: true,
          registered: true,
          message:
            'Vendedor possui autorização e já possui um cadastro ativo. Caso não lembre a senha, solicitar nova liberação à empresa.',
        })
      } else {
        // console.log('Usuário autorizado:', user)
        res
          .status(200)
          .json({ authorized: true, registered: false, nome: user.nome })
      }
    } else {
      // console.log('Usuário não autorizado')
      res.status(200).json({ authorized: false })
    }
  } catch (error) {
    console.error('Erro ao verificar autorização:', error)
    res.status(500).send('Erro ao verificar autorização')
  }
}
exports.getProfile = async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1]
    const decoded = jwt.verify(token, secret)
    const userId = decoded.id

    // console.log('Buscando perfil para usuário ID:', userId)

    const [userRows] = await db.query(
      'SELECT id, fullName, cpf FROM users WHERE id = ?',
      [userId]
    )

    if (userRows.length === 0) {
      // console.log('Erro: Usuário não encontrado.')
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    const userProfile = userRows[0]

    const [vendedorRows] = await db.query(
      'SELECT idVendedor FROM vendedores WHERE cpf = ?',
      [userProfile.cpf]
    )

    if (vendedorRows.length === 0) {
      // console.log('Erro: Vendedor não encontrado.')
      return res.status(404).json({ error: 'Vendedor não encontrado' })
    }

    const idVendedor = vendedorRows[0].idVendedor

    res.status(200).json({
      ...userProfile,
      idVendedor,
    })
  } catch (error) {
    console.error('Erro ao buscar perfil:', error)
    res.status(500).json({ error: 'Erro ao buscar perfil' })
  }
}
exports.editName = async (req, res) => {
  const { fullName } = req.body
  const token = req.headers.authorization.split(' ')[1]
  const decoded = jwt.verify(token, secret)
  const userId = decoded.id

  try {
    await db.query('UPDATE users SET fullName = ? WHERE id = ?', [
      fullName,
      userId,
    ])

    // Busca o usuário
    const [userRows] = await db.query(
      'SELECT id, fullName, cpf FROM users WHERE id = ?',
      [userId]
    )

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    const userProfile = userRows[0]

    // Agora busca também o vendedor
    const [vendedorRows] = await db.query(
      'SELECT idVendedor FROM vendedores WHERE cpf = ?',
      [userProfile.cpf]
    )

    if (vendedorRows.length === 0) {
      return res.status(404).json({ error: 'Vendedor não encontrado' })
    }

    const vendedor = vendedorRows[0]

    // Gera novo token completo
    const newToken = jwt.sign(
      {
        id: userProfile.id,
        fullName: userProfile.fullName,
        cpf: userProfile.cpf,
        idVendedor: vendedor.idVendedor, // <-- ESSA LINHA É CRUCIAL
      },
      secret,
      { expiresIn: '4h' } // Igual ao login
    )

    res.status(200).json({ token: newToken })
  } catch (error) {
    console.error('Erro ao alterar o nome:', error)
    res.status(500).json({ error: 'Erro ao alterar o nome' })
  }
}
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body
  const token = req.headers.authorization.split(' ')[1]
  const decoded = jwt.verify(token, secret)
  const userId = decoded.id

  // console.log('Usuário solicitando mudança de senha:', userId)

  const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId])
  const user = users[0]

  if (!user) {
    // console.log('Erro: Usuário não encontrado.')
    return res.status(404).json({ error: 'Usuário não encontrado' })
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password)

  if (!isMatch) {
    // console.log('Erro: Senha atual incorreta.')
    return res.status(401).json({ error: 'Senha atual incorreta' })
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10)

  try {
    await db.query('UPDATE users SET password = ? WHERE id = ?', [
      hashedNewPassword,
      userId,
    ])
    // console.log('Senha alterada com sucesso para o usuário:', userId)
    res.status(200).json({ message: 'Senha alterada com sucesso' })
  } catch (error) {
    console.error('Erro ao alterar a senha:', error)
    res.status(500).json({ error: 'Erro ao alterar a senha' })
  }
}
exports.getResultsByRoute = async (req, res) => {
  try {
    // Obtendo o token do cabeçalho da requisição e verificando-o
    const token = req.headers.authorization.split(' ')[1]
    const decoded = jwt.verify(token, secret)
    const idVendedor = decoded.idVendedor

    // Obtendo o nome da rota a partir do corpo da requisição
    const { rota } = req.body

    if (!rota) {
      // console.log('Erro: Nome da rota não fornecido.')
      return res.status(400).json({ error: 'Nome da rota é obrigatório' })
    }

    // console.log(
    //   `Buscando resultados para idVendedor: ${idVendedor}, rota: ${rota}`
    // )

    // Consultando a tabela resultados com base no idVendedor e na rota fornecida
    const sql = `
      SELECT id, idVendedor, rota, data, valor, cobrancas, media
      FROM resultados
      WHERE idVendedor = ? AND rota = ?
    `
    const [rows] = await db.query(sql, [idVendedor, rota])

    if (rows.length === 0) {
      console.log('Nenhum resultado encontrado para os critérios fornecidos.')
      return res.status(200).json([]) // retorna lista vazia com status OK
    }

    // Retornando os resultados encontrados
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar os resultados:', error)
    res.status(500).json({ error: 'Erro ao buscar os resultados' })
  }
}
exports.getVendedor = async (req, res) => {
  try {
    const [vendedores] = await db.query(
      'SELECT nome_unico, rotas, idVendedor FROM vendedores WHERE status = 1'
    )

    if (vendedores.length === 0) {
      return res.status(404).json({ error: 'Nenhum vendedor encontrado' })
    }

    res.status(200).json(vendedores)
  } catch (error) {
    console.error('Erro ao buscar vendedores:', error.message)
    res.status(500).json({ error: 'Erro ao buscar vendedores' })
  }
}
exports.getRankingVendedores = async (req, res) => {
  try {
    const [ranking] = await db.query(
      `WITH ranked_vendedores AS ( 
          SELECT 
              v.idVendedor,
              v.nome_unico,
              COUNT(*) AS total_clientes,
              DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_vendedor
          FROM 
              clientes c
          INNER JOIN 
              vendedores v ON c.idVendedor = v.idVendedor
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
          ranked_vendedores;`
    )

    if (ranking.length === 0) {
      return res
        .status(404)
        .json({ error: 'Nenhum vendedor encontrado para este mês' })
    }

    res.status(200).json(ranking)
  } catch (error) {
    console.error('Erro ao buscar ranking de vendedores:', error.message)
    res.status(500).json({ error: 'Erro ao buscar ranking de vendedores' })
  }
}
exports.getMediaValorRecebidoRanking = async (req, res) => {
  try {
    const [ranking] = await db.query(
      `WITH ranked_vendedores AS (
          SELECT 
              v.idVendedor,
              v.nome_unico,
              AVG(vd.valorRecebido) AS media_valorRecebido,
              DENSE_RANK() OVER (ORDER BY AVG(vd.valorRecebido) DESC) AS rank_vendedor
          FROM 
              vendas vd
          INNER JOIN 
              vendedores v ON vd.idVendedor = v.idVendedor
          WHERE 
              vd.tipo = 'NF'
              AND vd.status_venda = 0
              AND MONTH(vd.atualizacao) = MONTH(CURRENT_DATE())
              AND YEAR(vd.atualizacao) = YEAR(CURRENT_DATE())
          GROUP BY 
              v.idVendedor, v.nome_unico
      )
      SELECT 
          idVendedor,
          nome_unico,
          media_valorRecebido,
          rank_vendedor
      FROM 
          ranked_vendedores
      ORDER BY 
          rank_vendedor;`
    )

    if (ranking.length === 0) {
      return res
        .status(404)
        .json({ error: 'Nenhum dado de vendas encontrado para este mês' })
    }

    res.status(200).json(ranking)
  } catch (error) {
    console.error(
      'Erro ao buscar ranking de média valorRecebido:',
      error.message
    )
    res.status(500).json({ error: 'Erro ao buscar ranking de vendas' })
  }
}
exports.uploadProfileImage = async (req, res) => {
  try {
    const idUser = req.user.id

    console.log(
      '📥 Requisição recebida para upload de imagem do usuário:',
      idUser
    )

    if (!req.file) {
      console.warn('⚠️ Nenhum arquivo foi enviado no campo "imagem".')
      return res.status(400).json({ error: 'Imagem não enviada.' })
    }

    console.log('✅ Arquivo recebido:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path,
    })

    const imageDir = path.join(__dirname, '../../public/images')
    const extension = path.extname(req.file.originalname).toLowerCase()

    // 🧹 Deletar imagens antigas que NÃO sejam o tipo atual
    const exts = ['.jpg', '.jpeg', '.png']
    for (const ext of exts) {
      const oldImagePath = path.join(imageDir, `${idUser}${ext}`)
      if (fs.existsSync(oldImagePath) && ext !== extension) {
        fs.unlinkSync(oldImagePath)
        console.log('🧹 Imagem antiga deletada:', oldImagePath)
      }
    }

    // ✅ NÃO precisa fazer rename, já está com o nome certo!

    console.log('✅ Upload finalizado com sucesso.')
    return res.status(200).json({
      message: 'Imagem enviada com sucesso.',
      filename: req.file.filename,
    })
  } catch (error) {
    console.error('❌ Erro ao enviar imagem:', error)
    res.status(500).json({ error: 'Erro ao enviar imagem.' })
  }
}
exports.getProfileImage = (req, res) => {
  const idUser = req.user.id
  const imageDir = path.join(__dirname, '../../public/images')

  const exts = ['.jpg', '.jpeg', '.png']

  for (const ext of exts) {
    const imagePath = path.join(imageDir, `${idUser}${ext}`)
    if (fs.existsSync(imagePath)) {
      const extname = path.extname(imagePath).toLowerCase()

      // 🛠 Corrigindo o Content-Type antes de enviar
      if (extname === '.png') {
        res.contentType('image/png')
      } else if (extname === '.jpg' || extname === '.jpeg') {
        res.contentType('image/jpeg')
      }

      return res.sendFile(imagePath)
    }
  }

  res.status(404).json({ error: 'Imagem não encontrada.' })
}
exports.deleteProfileImage = (req, res) => {
  const idUser = req.user.id
  const imageDir = path.join(__dirname, '../../public/images')
  const exts = ['.jpg', '.jpeg', '.png']
  let deleted = false

  for (const ext of exts) {
    const imagePath = path.join(imageDir, `${idUser}${ext}`)
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath)
      deleted = true
    }
  }

  if (!deleted) {
    return res
      .status(404)
      .json({ error: 'Imagem não encontrada para deletar.' })
  }

  res.status(200).json({ message: 'Imagem deletada com sucesso.' })
}
exports.listarUsuarios = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, fullName, cpf, idVendedor FROM users ORDER BY id DESC`
    )
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao listar usuários:', error)
    res.status(500).json({ error: 'Erro ao listar usuários' })
  }
}
exports.deletarUsuario = async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório.' })
  }

  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id])

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    res.status(200).json({ message: 'Usuário deletado com sucesso.' })
  } catch (error) {
    console.error('Erro ao deletar usuário:', error)
    res.status(500).json({ error: 'Erro ao deletar usuário.' })
  }
}
exports.cadastrarAutorizado = async (req, res) => {
  const { nomeCompleto, cpf, cargo } = req.body

  if (!nomeCompleto || !cpf || !cargo) {
    return res
      .status(400)
      .json({ message: 'Todos os campos são obrigatórios.' })
  }

  try {
    const sqlCheck = 'SELECT * FROM users_adm_autorizados WHERE cpf = ?'
    const [existing] = await db.query(sqlCheck, [cpf])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'CPF já autorizado.' })
    }

    const sql = `
      INSERT INTO users_adm_autorizados (nomeCompleto, cpf, cargo)
      VALUES (?, ?, ?)
    `
    await db.query(sql, [nomeCompleto, cpf, cargo])

    res.status(201).json({ message: 'Autorizado cadastrado com sucesso.' })
  } catch (error) {
    console.error('Erro ao cadastrar autorizado:', error)
    res.status(500).json({ message: 'Erro ao cadastrar autorizado.' })
  }
}
exports.listarAutorizados = async (req, res) => {
  try {
    const sql =
      'SELECT id, nomeCompleto, cpf, cargo FROM users_adm_autorizados ORDER BY nomeCompleto ASC'
    const [rows] = await db.query(sql)
    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao listar autorizados:', error)
    res.status(500).json({ message: 'Erro ao listar autorizados.' })
  }
}
exports.atualizarCargoAutorizado = async (req, res) => {
  const { id } = req.params
  const { cargo } = req.body

  if (!cargo) {
    return res.status(400).json({ message: 'O novo cargo é obrigatório.' })
  }

  try {
    const sql = 'UPDATE users_adm_autorizados SET cargo = ? WHERE id = ?'
    const [result] = await db.query(sql, [cargo, id])

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: 'Usuário autorizado não encontrado.' })
    }

    res.status(200).json({ message: 'Cargo atualizado com sucesso.' })
  } catch (error) {
    console.error('Erro ao atualizar cargo:', error)
    res.status(500).json({ message: 'Erro ao atualizar cargo.' })
  }
}
exports.deletarAutorizado = async (req, res) => {
  const { id } = req.params

  try {
    const sql = 'DELETE FROM users_adm_autorizados WHERE id = ?'
    const [result] = await db.query(sql, [id])

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: 'Usuário autorizado não encontrado.' })
    }

    res.status(200).json({ message: 'Autorizado deletado com sucesso.' })
  } catch (error) {
    console.error('Erro ao deletar autorizado:', error)
    res.status(500).json({ message: 'Erro ao deletar autorizado.' })
  }
}
exports.listarAdmins = async (req, res) => {
  try {
    const sql =
      'SELECT id, nome, nome_unico, cpf, cargo FROM users_adm ORDER BY nome ASC'
    const [rows] = await db.query(sql)

    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao listar usuários administrativos:', error)
    res
      .status(500)
      .json({ message: 'Erro ao listar usuários administrativos.' })
  }
}
exports.deletarAdmin = async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'ID do usuário é obrigatório.' })
  }

  try {
    const sql = 'DELETE FROM users_adm WHERE id = ?'
    const [result] = await db.query(sql, [id])

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' })
    }

    res.status(200).json({ message: 'Usuário deletado com sucesso.' })
  } catch (error) {
    console.error('Erro ao deletar usuário administrativo:', error)
    res.status(500).json({ message: 'Erro ao deletar usuário administrativo.' })
  }
}
exports.getUsersByIdVendedor = async (req, res) => {
  const { idVendedor } = req.params

  if (!idVendedor) {
    return res.status(400).json({ error: 'ID do vendedor é obrigatório.' })
  }

  try {
    const sql = `
      SELECT id, fullName, cpf, idVendedor FROM users WHERE idVendedor = ?
    `
    const [rows] = await db.query(sql, [idVendedor])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum usuário encontrado.' })
    }

    res.status(200).json(rows)
  } catch (error) {
    console.error('Erro ao buscar usuários por ID do vendedor:', error)
    res.status(500).json({ error: 'Erro ao buscar usuários.' })
  }
}
exports.getUersAuthorizedAdminId = async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório.' })
  }

  try {
    const sql = `
      SELECT * FROM users_adm_autorizados WHERE id = ?
    `
    const [rows] = await db.query(sql, [id])

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: 'Usuário autorizado não encontrado.' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar usuário autorizado por ID:', error)
    res.status(500).json({ error: 'Erro ao buscar usuário autorizado.' })
  }
}
exports.getUserAdminById = async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório.' })
  }

  try {
    const sql = 'SELECT * FROM users_adm WHERE id = ?'
    const [rows] = await db.query(sql, [id])

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar usuário administrativo por ID:', error)
    res.status(500).json({ error: 'Erro ao buscar usuário administrativo.' })
  }
}
