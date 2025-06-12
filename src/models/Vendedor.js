// Vendedor.js
const db = require('../../db')

class Vendedor {
  static async findByCPF(cpf) {
    try {
      const sql = 'SELECT * FROM vendedores WHERE cpf = ?'
      const [rows] = await db.query(sql, [cpf])
      return rows[0]
    } catch (error) {
      console.error('Erro ao buscar vendedor pelo CPF:', error)
      throw error
    }
  }
}

module.exports = Vendedor
