<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://raw.githubusercontent.com/alexandr-kazakov/public_images/main/solana-crendel-bot-readme-logo.jpg" width="200" alt="Solana Crendel Bot Logo" /></a>
</p>

  <p align="center">A progressive Node.js Solana trading bot API for automatic trading on the Raydium exchange.</p>

  [![Support me on Patreon](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Fshieldsio-patreon.vercel.app%2Fapi%3Fusername%3Dalexkazakov%26type%3Dpatrons&style=flat)](https://patreon.com/alexkazakov)


## Description

Solana Crendel Bot API, created by Nestjs, Typescript, Nodejs. Trading bot tracks new tokens pools on Raydium, buys tokens and sells them.

## Features

- Token checks: freezeAuthority, mintAuthority, is not initialized, etc.
- Advanced tokens selling: additional attempts to sell at the error.
- RIch logs in the console.
- Option: LP burned check.
- Option: selling timeout.

## Requirements

- Nodejs v.21.x

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## How to use

- Creat and setup the config(.env file) in the project root.
- Run the app by `npm run start` command.
- Use the endpoints to control, send any POST requests to:
	1. http://localhost:3000/api/monitor/start for start
	2. http://localhost:3000/api/monitor/stop for stop(all current tokens will be processed, new tokens will be stopped monitored).
- Check logs in a console.

## Config setup

See .env.example
Create .env file in the project root near the env.example and write the config from .env.example on it.
```
MAX_LAMPORTS = max transaction fee for each TX(150000 ~= 0.000155 SOL)
MAX_RETRIES = max retries to send a new token
TOKEN_AA_ADDRESS = Solana address by default is "So11111111111111111111111111111111111111112", do not touch it
TOKEN_AA_DECIMALS = Solana decimals by default is "9", do not touch it
TOKEN_AA_AMOUNT = the SOL amount for which new tokens should be purchased
TX_DIRECTION = transaction direction by default is "in", do not touch it
SELLING_TIMEOUT = time to sell a new token(1000 = 1sec)
IS_BURNED_CHECK = use LP burned check for new tokens

SOLANA_RPC_URL = https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
SOLANA_WS_URL = wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
PAYER_WALLET_PRIVATE_KEY = Your Solana wallet private key like: "wG7LPvk...Z6gSEeZ". Tokens will be bought/sold from this wallet, also paid fee.

APP_PORT = port on which the application will run
```

## Tips and tricks
- Don't use free RPC nodes.
- Try increasing fees(MAX_LAMPORTS) to increase the prioritization of your transactions.
- When setting a timeout for token sales, please note that sending and confirming the transaction will take time too. 

## Support

Solana Crendel Bot is an MIT-licensed open source project, you can say thanks here:

[![Support me on Patreon](https://img.shields.io/badge/Patreon%20-be%20a%20Patron-FF424D?style=for-the-badge&logo=patreon)](https://patreon.com/alexkazakov)

Paid premium support from the bot author by sending an e-mail to:  [alexandr.kazakov1@gmail.com](mailto:alexandr.kazakov1@gmail.com)

## Roadmap

- Docker support: soon...
- Jito bundles support: soon...

## Stay in touch

- Author - [Alexandr Kazakov](mailto:alexandr.kazakov1@gmail.com)
- Website - [https://alexkazakov.info](https://alexkazakov.info)

## License

Solana Crendel Bot  is [MIT licensed](https://github.com/alexandr-kazakov/solana-crendel-bot/blob/main/LICENSE).
