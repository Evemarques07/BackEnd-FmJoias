const axios = require('axios')
const db = require('../../db')
const jwt = require('jsonwebtoken')
require('dotenv').config()

exports.getKitBySKU = async (req, res) => {
  const { sku } = req.params
  try {
    const [rows] = await db.query('SELECT * FROM kits WHERE sku = ?', [sku])
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Kit não encontrado' })
    }
    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Erro ao buscar valor do kit:', error)
    res.status(500).json({ error: 'Erro ao buscar valor do kit' })
  }
}
