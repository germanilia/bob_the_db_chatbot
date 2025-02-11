FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install vite globally first and then install dependencies without running scripts
RUN npm install -g vite && npm install --ignore-scripts

COPY . .

EXPOSE 9877

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"] 