FROM node:18

# Instala Nginx e utilitários
RUN apt update && apt install -y nginx curl

# Cria diretório da app
WORKDIR /app

# Copia arquivos do backend
COPY . .

# Copia a configuração do Nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Comenta o include problemático
RUN sed -i 's|^\s*include /etc/nginx/sites-enabled/\*;|# &|' /etc/nginx/nginx.conf

# Expondo a porta 80
EXPOSE 80

# Inicializa Nginx + Node
CMD service nginx start && npm install && npm start
