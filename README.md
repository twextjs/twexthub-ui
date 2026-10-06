# 📦 TwextHub UI

> _Host extensions built with Twext online. UI-only._

## 📕 Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [ℹ️ Overview](#-overview)
  - [✍️ Authors](#-authors)
- [🪽 Deploying](#-deploying)
- [💭 Feedback and Contributing](#-feedback-and-contributing)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## ℹ️ Overview

TwextHub UI is the consumer-facing web interface for the [TwextHub API](https://github.com/twextjs/twexthub-api). You can see the public instance at [twexts.sdisk.us](https://twexts.sdisk.us). It's built with Node.js and React.

### ✍️ Authors

> **AI Disclosure:** AI was used in the development of the TwextHub UI.

- **Main Developer:** [@kamixfox](https://github.com/kamixfox)

## 🪽 Deploying

While installation with Node.js exists, you should prefer Docker because it's safer. We will only provide steps for deployment with Docker Compose.

1. Copy the required files to a directory of your choosing:

   ```bash
   cp compose.example.yml <YOUR_DIRECTORY>/compose.yml
   ```

2. Create a `.env` file:

   ```bash
   TWEXTHUB_API_URL=https://you.example.com/v2
   ```

3. Deploy:

   ```bash
   docker compose up -d
   ```

## 💭 Feedback and Contributing

Discussions are turned off here, just open an issue if you have a question, or if you find a bug/a new feature to add.

Development is done like pretty much every other web app with React. Run `npm run check` and `npm run dev` to check and preview your changes.
