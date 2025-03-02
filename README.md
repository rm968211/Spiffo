# Spiffio

This Discord bot manages and restarts a Project Zomboid server using slash commands. It lets administrators configure role-based access, rate limits, webhook URLs, and even enable/disable the restart feature.

## Features

- **/setrole:** Set the role ID that is allowed to restart the server.
- **/getconfig:** Display the current configuration settings.
- **/setratelimit:** Adjust the rate limit (in minutes) for restarts.
- **/setwebhook:** Configure the webhook URL used to trigger a server restart.
- **/setrestartfeature:** Enable or disable the restart command.
- **/restartserver:** Initiate a server restart (requires confirmation via buttons).
- **/help:** Display a help message with a brief bot description.

## Setup

1. **Clone the Repository**

    git clone <repository-url>
    cd <repository-directory>

2. **Configure Environment Variables**

    DISCORD_BOT_TOKEN=your_discord_bot_token_here
    CONFIG_PATH=/data/config.json  # Optional; defaults to /data/config.json if not set

3. **Install Dependencies**

    npm install

## Running the Bot Locally

    node src/index.js

## Docker Usage

This project includes a Dockerfile that builds an image using an official Node.js runtime.

1. **Build the Docker Image**

       docker build -t discord-bot .

2. **Run the Docker Container**

       docker run -d --name discord-bot \
         -e DISCORD_BOT_TOKEN=your_discord_bot_token_here \
         discord-bot

The image is also published on Docker Hub at: **rm968211/spiffio**

## Docker Compose

You can also run the bot using Docker Compose. Below is an example `docker-compose.yml` file:

    services:
      spiffio:
        image: rm968211/Spiffio
        environment:
          - DISCORD_BOT_TOKEN=your_discord_bot_token_here
          - CONFIG_PATH=/data/config.json
        volumes:
          - ./data:/data
        restart: unless-stopped

To use Docker Compose:

1. Save the above content into a file named `docker-compose.yml` in your project directory.
2. Run the following command to start the service:

       docker-compose up -d

## Code Structure

- **src/index.js:** Main bot code handling configuration, command registration, and interactions.
- **config.json:** (Auto-generated) Stores settings like role ID, webhook URL, rate limit, and restart feature toggle.