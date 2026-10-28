FROM node:20-slim

WORKDIR /app

RUN npm install -g @adobe/aem-cli

EXPOSE 3000

CMD ["aem", "up", "--addr", "*", "--port", "3000"]
