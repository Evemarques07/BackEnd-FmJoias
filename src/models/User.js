// User.js
const db = require('../../db')

class User {
  constructor(fullName, cpf, password, idVendedor) {
    this.fullName = fullName
    this.cpf = cpf
    this.password = password
    this.idVendedor = idVendedor
  }

  async save() {
    try {
      const sql =
        'INSERT INTO users (fullName, cpf, password, idVendedor) VALUES (?, ?, ?, ?)'
      const values = [this.fullName, this.cpf, this.password, this.idVendedor]
      await db.query(sql, values)
    } catch (error) {
      console.error('Erro ao salvar o usuário:', error)
      throw error
    }
  }

  static async findByCPF(cpf) {
    try {
      const sql = 'SELECT * FROM users WHERE cpf = ?'
      const [rows] = await db.query(sql, [cpf])
      return rows[0]
    } catch (error) {
      console.error('Erro ao buscar o usuário pelo CPF:', error)
      throw error
    }
  }

  static async findById(id) {
    try {
      const sql = 'SELECT * FROM users WHERE id = ?'
      const [rows] = await db.query(sql, [id])
      return rows[0]
    } catch (error) {
      console.error('Erro ao buscar o usuário pelo ID:', error)
      throw error
    }
  }
}

module.exports = User
