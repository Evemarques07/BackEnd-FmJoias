const swaggerJsdoc = require('swagger-jsdoc')
const swaggerUi = require('swagger-ui-express')

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MY-APP API',
      version: '1.0.0',
      description: 'Documentação da API do MY-APP',
    },
  },
  apis: ['. *.js'], // Caminho para os arquivos que contêm as anotações da API
}

const specs = swaggerJsdoc(options)

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs))
}
