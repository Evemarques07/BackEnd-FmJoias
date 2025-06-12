// auth.js
const jwt = require('jsonwebtoken')
const secret = process.env.JWT_SECRET

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token == null) return res.sendStatus(401) // Se não houver token, retorna 401

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403) // Se o token for inválido, retorna 403
    req.user = user
    next()
  })
}

// Middleware para administradores
const authenticateAdminToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token == null) return res.sendStatus(401)

  jwt.verify(token, secret, (err, admin) => {
    if (err) return res.sendStatus(403)
    req.admin = admin // guarda o payload do admin
    next()
  })
}

module.exports = {
  authenticateToken,
  authenticateAdminToken,
}
