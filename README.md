# 🎮 Rock-Paper-Scissors on Sui  
*(deprecated app with security issues) A minimal blockchain game built on the Sui Testnet — prebuilt for GitHub Pages.*

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Sui Testnet](https://img.shields.io/badge/Network-Sui%20Testnet-green)](https://sui.io/)
[![Deploy Status](https://img.shields.io/badge/Deployed-GitHub%20Pages-success)](https://ol-ironsides.github.io/eve_f_rps_on_sui/)

---

## 🧩 Overview
**Rock-Paper-Scissors on Sui** is a simple 1v1 commit-reveal game running fully on the **Sui blockchain Testnet**.  
It demonstrates minimal smart-contract logic in Move, paired with a static front-end that connects via Sui Wallet.

🪶 Designed for **low gas**, **simple deploy**, and **educational clarity**.  

---

## 🖼️ Preview
<p align="center">
  <img src="https://github.com/ol-ironsides/eve_f_rps_on_sui/blob/main/docs/Screenshot.png" width="520" alt="RPS on Sui UI preview"/>
</p>

---

## 📁 Project Structure
| Folder | Description |
|:--------|:-------------|
| `move/` | Move source (`rps_commit_reveal.move`) + `Move.toml` manifest |
| `frontend/` | Optional full dev source if rebuilding frontend |
| `docs/` | Pre-built static site ready for GitHub Pages |
| `README.md` | This documentation file |

---

## 🚀 Quick Start (GitHub Pages)
1. **Clone** this repo  
   ```bash
   git clone https://github.com/ol-ironsides/eve_f_rps_on_sui.git
   cd eve_f_rps_on_sui
