# 🤖 Setup Guide - BonerHosting Proxy Bot

### 📌 1. Clone the Repository

```bash
git clone https://github.com/BonerHosting/BH-ProxyBot.git
cd repository
```

Or download the zip file from [here](https://github.com/BonerHosting/BH-ProxyBot/archive/refs/heads/main.zip)

### 📦 2. Install Dependencies

Make sure you have **Node.js** installed.

```bash
npm install
```

### 🔑 3. Discord Developer Setup

1. Go to Discord Developer Portal
2. Create a new application
3. Go to **Bot → Add Bot**
4. Copy your bot token

⚠️ Never share your bot token publicly.

### ⚙️ 4. Environment Configuration

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add:

```env
DISCORD_TOKEN=what_you_got_from_step_3
CLIENT_ID=your_client_id_here
GUILD_ID=your_server_id_here
HOST_NAME=name_of_host_or_anything

NPM_URL=url_where_nxpm_is_located *ex: nxpm.example.com*
NPM_IDENTITY=email_you_want_bot_to_use
NPM_SECRET=password_to_following_account
FORWARD_HOSTS="NODENAME Node |ip,NODENAME2 Node IP"
```

### 🚀 5. Run the Bot

```bash
node main.js
```

### 🔗 6. Invite Bot to Server

Replace `YOUR_CLIENT_ID`:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

### 🧪 7. Test Bot

* Make sure bot is online
* Try command:

```
/proxy
```
### ⚠️ 8. Issues

I currently know of **ZERO** issues with the code, if you find any issues please let me know by going [here](https://github.com/BonerHosting/BH-ProxyBot/issues) and creating a new issue or reaching out to me with the following

Email: [owen@puds.lol](mailto:owen@puds.lol)
Discord: ac1q
