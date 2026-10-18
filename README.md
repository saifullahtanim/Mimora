# Mimora — All-in-One Online Tools & Utilities Platform

A modern, fast, and responsive web tools application featuring utilities, prank screens, user authentication, profile customization, and zero-config Vercel serverless deployment.

[![Live on Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=flat&logo=vercel)](https://vercel.com)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?logo=node.js)](https://nodejs.org/)

---

## 🚀 Key Features

- **🛠️ Creative & Productivity Tools:** Video Merger, Image Upscaler, Lorem Ipsum Generator, QR Code Tools, Prank Screens, and more.
- **🔐 Instant Authentication System:** 
  - Signup, Login, and Password Recovery popup modal.
  - Zero-latency email verification & instant login redirect.
  - Reset password flow with direct homepage redirection.
- **👤 User Profile & Settings:**
  - Full Name, Email, and Avatar management.
  - In-browser avatar compression & cropping (HTML5 Canvas to WebP).
  - Secure in-profile password change.
- **✉️ EmailJS Integration:** Automated confirmation emails, password reset links, and contact form notifications with dynamic live domain detection.
- **⚡ Vercel Serverless Ready:** Dedicated API endpoints in `/api/` compatible with both Vercel edge/serverless and local Node.js server.

---

## 📂 Project Structure

```bash
├── api/                    # Vercel serverless functions (auth, contact, profile)
├── contact/                # Responsive modern contact page
├── data/                   # Bundled seed database (users.json)
├── profile/                # User profile & account settings page
├── reset-password/         # Standalone password reset page
├── tools/                  # Collection of interactive web tools
├── prank-screens/          # Fullscreen prank utility screens
├── verify-email/           # Instant token email verification
├── wp-content/             # Custom themes, UI styles & scripts
├── server.js               # Local development Node.js HTTP server
└── vercel.json             # Vercel routing, clean URLs & rewrites
```

---

## 💻 Quick Start (Local Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/saifullahtanim/Mimora.git
   cd Mimora
   ```

2. **Start the local server:**
   ```bash
   npm start
   ```
   Or simply run `start-localhost.bat` on Windows.

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

---

## ☁️ Deploy to Vercel

1. Import this repository into [Vercel](https://vercel.com).
2. Framework Preset: **Other**.
3. Output Directory: **./** (Leave default).
4. Click **Deploy**! Everything is pre-configured via `vercel.json` and `/api/` functions.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
