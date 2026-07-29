# 🌍 Mahalima.cyou | Interactive SB19 Global Sightings Globe

[![Hosted on GitHub Pages](https://img.shields.io/badge/Hosted%20On-GitHub%20Pages-blue?logo=github)](https://mahalima.cyou)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Fandom: SB19 / A'TIN](https://img.shields.io/badge/Fandom-A%27TIN-cyan)](https://twitter.com/SB19Official)

**Mahalima.cyou** is an interactive, serverless 3D web application created for **A'TIN** (the global fanbase of Filipino P-Pop group **SB19**: Pablo, Josh, Stell, Ken, and Justin). 

The platform features a glowing 3D interactive globe that visualizes fan sightings, concert check-ins, billboard locations, and global fan gatherings in real time by dynamically embedding live social media posts.

---

## ✨ Features

- **🌐 Interactive 3D Globe:** Built with `Globe.gl` and `Three.js` featuring custom dark-mode styling with electric gold and cyan accents.
- **📱 Dynamic Social Media Embeds:** Supports direct link embeds from **TikTok, X (Twitter), Instagram, and Facebook**. Clicking a pin slides out a sleek glassmorphism drawer rendering the original social post live.
- **⚡ Serverless & Lightweight:** Operates 100% on the client side with zero backend databases or paid APIs required.
- **📍 Community Submissions:** Visitors can drop a social post link and pick globe coordinates to instantly view new markers.
- **💾 LocalStorage & PR Sync:** New user pins persist locally in the visitor's browser (`localStorage`) with an option to export JSON snippets for GitHub Pull Requests.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Glassmorphism & Flexbox/Grid), ES6 JavaScript
- **3D Graphics Engine:** [Globe.gl](https://globe.gl/) (Three.js abstraction)
- **Data Model:** Static JSON (`sightings.json`) + Browser `localStorage`
- **Social Media SDKs:** Official embed widgets for Twitter/X, TikTok, Instagram, and Facebook
- **Hosting:** GitHub Pages with custom domain pointing to `mahalima.cyou`

---

## 📁 Repository Structure

```text
├── index.html         # Main entry point & HTML structure
├── styles.css         # Custom dark aesthetic & drawer layouts
├── app.js             # Globe rendering & social embed parsing logic
├── sightings.json     # Initial curated dataset of global pins
├── CNAME              # Points custom domain to mahalima.cyou
├── LICENSE            # MIT License for underlying codebase
└── README.md          # Project documentation

🚀 How to Add a Sighting (For Contributors)

If you want to permanently add a new SB19 sighting or fan event pin to the global map:

    Fork this repository.

    Open sightings.json.

    Add a new JSON object to the array following this format:

JSON

{
  "id": "pin-005",
  "lat": 14.5995,
  "lng": 120.9842,
  "title": "PAGTATAG! World Tour Manila",
  "category": "Concert",
  "social_url": "[https://twitter.com/SB19Official/status/123456789](https://twitter.com/SB19Official/status/123456789)",
  "platform": "twitter"
}

    Create a Pull Request (PR). Once approved, your pin will appear live on mahalima.cyou for everyone!

💻 Local Development

    Clone the repo:
    Bash

    git clone [https://github.com/your-username/mahalima-app.git](https://github.com/your-username/mahalima-app.git)

    Open index.html directly in your browser or run a local dev server (e.g., VS Code Live Server extension).

📜 License & Copyright

    Codebase: The source code, web templates, and custom scripts of this repository are open source and available under the MIT License.

    Trademarks & Media: All original artwork, custom logos, and media assets belong to their respective creators.

    📌 Disclaimer: Mahalima.cyou is an independent, non-commercial, fan-made community initiative created for entertainment purposes. It is not affiliated with, endorsed by, or officially connected to 1Z Entertainment or SB19. All SB19 trademarks, logos, and media embedded from social platforms belong to 1Z Entertainment and their respective rights holders.
