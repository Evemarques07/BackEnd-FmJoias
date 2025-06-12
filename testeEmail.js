require('dotenv').config()
const { sendEmail } = require('./emailService')

;(async () => {
  try {
    await sendEmail(
      'fmjoiassuporte@gmail.com',
      'Teste de Email',
      '<h1>Este é um email de teste</h1><p>Se você recebeu isso, o envio está funcionando!</p>'
    )
  } catch (error) {
    console.error('Falha no envio:', error)
  }
})()
