require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const userRoutes = require('./src/routes/userRoutes')
const clientRoutes = require('./src/routes/clientRoutes')
const vendedorRoutes = require('./src/routes/vendedorRoutes')
const kitRoutes = require('./src/routes/kitRoutes')
const apiAdmRoutes = require('./src/routes/apiAdmRoutes')
const vendasRoutes = require('./src/routes/vendasRoutes')
const fiscalRoutes = require('./src/routes/fiscalRoutes')
const panosRoutes = require('./src/routes/controlePanosRoutes')
const { pool, tryConnect } = require('./db');


const cors = require('cors')
const swaggerDocs = require('./swagger')

const app = express()
app.use(bodyParser.json())

app.use(
  cors({
    origin: ['https://fmjoias.app', 'http://localhost:4000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// CSP header
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://fmjoias.app; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com"
  )
  next()
})

swaggerDocs(app)

app.use('/users', userRoutes)
app.use('/client', clientRoutes)
app.use('/kit', kitRoutes)
app.use('/vendedor', vendedorRoutes)
app.use('/api', apiAdmRoutes)
app.use('/vendas', vendasRoutes)
app.use('/fiscal', fiscalRoutes)
app.use('/controle-panos', panosRoutes)

app.use(express.static(path.join(__dirname, 'public')))

app.get('/policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'policy.html'))
})


tryConnect()
  .then(async () => {
    const [res] = await pool.query('SELECT CURRENT_USER() AS mysql_user');
    console.log(`🧠 Conectado como MySQL user: ${res[0].mysql_user}`);

    app.listen(process.env.PORT || 37880, () => {
      console.log(`✅ Servidor iniciado na porta ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar com o banco:', err.message);
    process.exit(1);
  });