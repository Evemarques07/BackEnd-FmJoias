const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587, // Porta correta para SMTP com STARTTLS
  secure: false, // Não use `true` com a porta 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// Função para enviar emails
const sendEmail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER, // Remetente
      to, // Destinatário
      subject, // Assunto
      html, // Conteúdo em HTML
      // bcc: 'logs@suaempresa.com', // Cópia oculta (opcional)
      // replyTo: 'suporte@suaempresa.com', // Endereço de resposta (opcional)
      // headers: { // Cabeçalhos personalizados (opcional)
      //   'X-Custom-Header': 'valor',
      // },
    })

    console.log('Email enviado:', info.response)
    return info
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    console.error('Código de erro SMTP:', error.code) // Log do código de erro SMTP
    console.error('Mensagem de erro completa:', error.message) // Log da mensagem completa
    throw error // Propaga o erro
  }
}

module.exports = { sendEmail }
