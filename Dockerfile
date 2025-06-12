# FROM node:18

# WORKDIR /app

# COPY package*.json ./

# RUN npm install

# COPY . .

# EXPOSE 37880

# CMD ["npm", "start"]

FROM node:18

# Instala o Nginx
RUN apt update && apt install -y nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia os arquivos do backend
COPY package*.json ./
RUN npm install
COPY . .

# Copia a configuração do Nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Expõe a porta 37880 (do Nginx)
EXPOSE 80

# Inicia Node.js e Nginx juntos
CMD ["sh", "-c", "service nginx start && npm start"]
