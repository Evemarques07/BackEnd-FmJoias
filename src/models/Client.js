// Client.js
const db = require('../../db')

class Client {
  constructor({
    nomeCliente,
    endTipo,
    endereco,
    numero,
    bairro,
    pontoRef,
    cidade,
    estado,
    telefone,
    cpf,
    nomeMae,
    dataNascimento,
    rota,
    idVendedor,
    latitude,
    longitude,
    status,
    data_cadastro = new Date().toISOString().split('T')[0],
  }) {
    this.nomeCliente = nomeCliente
    this.endTipo = endTipo
    this.endereco = endereco
    this.numero = numero
    this.bairro = bairro
    this.pontoRef = pontoRef
    this.cidade = cidade
    this.estado = estado
    this.telefone = telefone
    this.cpf = cpf
    this.nomeMae = nomeMae
    this.dataNascimento = dataNascimento // Certifique-se de atribuir aqui
    this.rota = rota
    this.idVendedor = idVendedor
    this.latitude = latitude
    this.longitude = longitude
    this.status = status // Adicionado status
    this.data_cadastro = data_cadastro // Adicionando data_cadastro
  }
  async save() {
    const sql = `
      INSERT INTO clientes (
        nomeCliente, endTipo, endereco, numero, bairro, 
        pontoRef, cidade, estado, telefone, cpf, 
        nomeMae, dataNascimento, rota, idVendedor, latitude, longitude, status, data_cadastro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    const values = [
      this.nomeCliente,
      this.endTipo,
      this.endereco,
      this.numero,
      this.bairro,
      this.pontoRef,
      this.cidade,
      this.estado,
      this.telefone,
      this.cpf,
      this.nomeMae,
      this.dataNascimento,
      this.rota ? this.rota.replace(/\s+/g, '') : null, // Remover espaços de `rota`
      this.idVendedor,
      this.latitude,
      this.longitude,
      this.status,
      this.data_cadastro,
    ]

    try {
      await db.query(sql, values)
      // console.log('Cliente inserido com sucesso.')
    } catch (error) {
      console.error('Erro ao inserir cliente:', error)
      throw error
    }
  }

  static async findOne(where) {
    const keys = Object.keys(where)
    const values = Object.values(where)
    const conditions = keys.map((key) => `${key} = ?`).join(' AND ')

    const sql = `SELECT * FROM clientes WHERE ${conditions} LIMIT 1`

    try {
      const [rows] = await db.query(sql, values)
      return rows[0] // Retorna o primeiro cliente encontrado
    } catch (error) {
      console.error('Erro ao buscar cliente:', error)
      throw error
    }
  }

  static async findByVendedor(idVendedor) {
    const sql = `SELECT * FROM clientes WHERE idVendedor = ?`
    try {
      const [rows] = await db.query(sql, [idVendedor])
      return rows
    } catch (error) {
      console.error('Erro ao buscar clientes:', error)
      throw error
    }
  }
}

module.exports = Client
