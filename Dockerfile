# Use an official Node.js runtime as a parent image.
FROM node:18-alpine

# Set the working directory inside the container.
WORKDIR /app

# Copy package files and install dependencies.
COPY package*.json ./
RUN npm install

# Copy the entire source code and assets.
COPY src/ /app/src

# Set the working directory to the source directory
WORKDIR /app/src

# Start the bot.
CMD ["node", "index.js"]
