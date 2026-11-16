# 📈 Stock Recommendation Bot v2.6.1 (Interactive AI Engine)

Bot Telegram canggih yang dirancang untuk memberikan sinyal perdagangan saham IDX (Bursa Efek Indonesia) secara real-time menggunakan mesin analisis berbasis AI. Bot ini menggabungkan indikator teknikal, sentimen pasar, dan manajemen risiko otomatis.

---

## 🚀 Fitur Utama

- **Market Regime Filtering**: Menganalisis IHSG (^JKSE) untuk menentukan kondisi pasar (Bullish/Bearish) sebelum memberikan rekomendasi.
- **Multi-Factor Weighted Scoring**: Sistem penilaian berdasarkan bobot untuk akurasi sinyal yang lebih baik.
- **Interactive Commands**: Jalankan analisis kapan saja langsung dari Telegram.
- **Dynamic Risk Management**: Kalkulasi otomatis untuk *Entry Price*, *Stop Loss*, dan *Take Profit* berbasis ATR.
- **Breakout Detection**: Mendeteksi lonjakan volume dan harga yang menembus level tertinggi 20 hari.

---

## 🛠️ Arsitektur Teknis

Bot ini dibangun dengan teknologi modern:
- **Runtime**: Node.js (v16+)
- **Data Source**: Yahoo Finance API (via `yahoo-finance2`)
- **Messaging**: Telegram Bot API
- **Indicator Engine**: Custom logic untuk RSI, MACD, SMA, dan ATR.

---

## 🧠 Metodologi & Teknik Analisis (Deep Dive)

Bot ini menggunakan pendekatan **Quantitative Technical Analysis** dengan sistem skor tertimbang (*Weighted Scoring*).

### 1. Hard Filters (Penyaringan Awal)
Sebelum dianalisis, saham harus melewati filter ketat:
- **Price Limit**: Harga di bawah batas yang ditentukan (default ≤ 500 atau custom via command).
- **Liquidity Check**: Memastikan saham memiliki volume perdagangan aktif.
- **Volatility Filter (ATR/Price)**: Saham dengan volatilitas sangat rendah (< 1.5% dari harga) akan diabaikan karena kurangnya potensi pergerakan.

### 2. Market Regime Analysis (IHSG Filter)
Sistem memantau IHSG (^JKSE) sebagai filter utama:
- Jika IHSG > SMA 50 Hari: **Market Bullish** (Skor positif).
- Jika IHSG < SMA 50 Hari: **Market Bearish** (Hukuman skor 30% untuk sinyal beli).

### 3. Weighted Scoring System (Bobot Penilaian)
Sinyal dihasilkan dari gabungan faktor berikut dengan bobot berbeda:

| Komponen | Bobot | Deskripsi |
| :--- | :---: | :--- |
| **Market Trend** | 25% | Arah tren IHSG secara keseluruhan. |
| **Volume Confirmation** | 20% | Lonjakan volume di atas rata-rata 20 hari. |
| **MACD** | 20% | Golden Cross dan momentum histogram. |
| **RSI** | 15% | Kondisi Oversold (<30) atau Overbought (>70). |
| **SMA Trend** | 10% | Perbandingan SMA 20 vs SMA 50. |
| **Analyst Sentiment** | 10% | Konsensus dari analis profesional (Strong Buy/Buy). |

### 4. Breakout Detection
Bot mendeteksi kondisi khusus jika:
- Harga penutupan hari ini > Harga tertinggi dalam 20 hari terakhir.
- Volume hari ini > 1.2x Rata-rata volume 20 hari.
Jika terdeteksi, bot akan memberikan label **"Breakout Valid"** dan meningkatkan persentase kepercayaan (*Confidence Score*).

### 5. Manajemen Risiko (ATR-Based)
Bot menghitung level krusial menggunakan **Average True Range (ATR)**:
- **Entry Range**: ±0.5% dari harga penutupan terakhir.
- **Stop Loss (SL)**: Close - (2 * ATR).
- **Take Profit 1 (TP1)**: Close + (1.5 * ATR).
- **Take Profit 2 (TP2)**: Close + (3 * ATR).
- **Risk/Reward (RR)**: Menampilkan rasio perbandingan potensi profit vs kerugian.

---

## 📦 Instalasi & Penggunaan

### 1. Persiapan
Clone repository dan instal dependensi:
```bash
npm install
```

### 2. Konfigurasi (.env)
Buat file `.env` dan lengkapi data berikut:
```env
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
MAX_STOCK_PRICE=500
STOCK_SYMBOLS=ALL # Gunakan ALL untuk scan seluruh IDX

# Opsional - lapisan advisory AI. Kosongkan untuk mematikan.
AI_API_KEY=
AI_BASE_URL=https://9router.tefambo.site/v1
AI_MODEL=Hermes-Combo
AI_ENABLED=true
```

### 3. Menjalankan Bot
```bash
# Mode Development
npm start

# Mode Produksi (24/7 dengan PM2)
npm run pm2:start
```

### 4. Deploy Otomatis ke VPS

Workflow GitHub Actions menjalankan pemeriksaan saat ada push ke `main`. Jika
lulus, workflow mengambil versi terbaru di VPS pada `/opt/stock_bot`, memasang
dependensi produksi, lalu me-reload (atau memulai) proses PM2 `stock-bot`.
Workflow juga bisa dijalankan manual dari tab **Actions**.

Siapkan VPS terlebih dahulu:
- Clone repository ke `/opt/stock_bot`, dan pastikan remote `origin` mengarah ke
  repository ini dengan branch `main`.
- Buat file `.env` di direktori tersebut, instal Node.js/npm dan PM2.
- Pastikan user SSH yang dipakai workflow dapat menjalankan `git`, `npm`, dan
  `pm2` tanpa interaksi serta memiliki akses tulis ke direktori proyek.

Tambahkan di **Settings → Secrets and variables → Actions**:

| Nama | Jenis | Isi |
| --- | --- | --- |
| `VPS_HOST` | Secret | IP atau hostname VPS |
| `VPS_USER` | Secret | User SSH untuk deploy |
| `VPS_SSH_PRIVATE_KEY` | Secret | Private key SSH; public key pasang pada `authorized_keys` user VPS |
| `VPS_KNOWN_HOSTS` | Secret | Baris host key SSH VPS yang sudah diverifikasi |
| `VPS_PORT` | Variable (opsional) | Port SSH; default `22` |

Workflow menjalankan `git reset --hard origin/main` pada VPS, jadi perubahan
langsung pada file kode di VPS akan ditimpa. File `.env` tidak dilacak Git dan
tetap berada di VPS.

---

## 🤖 Lapisan AI (opsional)

AI **tidak pernah** menentukan skor, urutan, atau label rekomendasi. Semua keputusan tetap
dari rule engine dan model terkalibrasi. AI hanya menambah dua hal pada 20 saham yang sudah
lolos ranking:

| Lapisan | Sumber | Pengaruh |
|---|---|---|
| Sentimen berita | Google News RSS -> LLM (skor -1..+1) | Tampilan saja |
| Narasi | LLM, membaca angka yang sudah ada | Tampilan saja |

Tanpa `AI_API_KEY` bot berjalan identik seperti sebelumnya. Jika provider lambat atau gagal,
kedua lapisan dilewati dan analisis tetap terkirim (timeout keras 25 detik, hasil di-cache).

## 📊 Evaluasi & Kalibrasi Model

```bash
npm run backtest   # unduh & simpan fitur point-in-time (lambat, sekali saja)
npm run report     # metrik rule engine + perbandingan ranker
npm run train      # latih model.json, hanya menulis jika beat baseline
```

Hasil terukur pada 43 saham IDX, 2024-08..2026-10 (21.664 baris, 512 tanggal):

- Rule engine **tidak punya edge ranking**: top-20/hari selisih -0.01% vs rata-rata.
- Model 20 hari punya **timing skill**, bukan picking skill: pooled AUC 0.593 OOS, tetapi
  cross-sectional AUC 0.467 (di bawah acak). Karena itu model dipakai sebagai *market timing
  gate*, bukan ranker.
- Hari dengan rata-rata `mlProb` >= 0.45 -> +1.58% forward 20 hari (43 hari OOS).
  Hari < 0.40 -> -5.4% s/d -12.5%.
## 📱 Perintah Telegram

- `/start`: Memulai interaksi dengan bot.
- `/saham`: Menampilkan 20 rekomendasi terbaik dengan harga default (≤ 500).
- `/saham [harga]`: Contoh `/saham 1000`, mencari saham dengan harga di bawah 1000.

---

## 📊 Kategori Rekomendasi

Hasil analisis diklasifikasikan menjadi:
- **STRONG BUY**: Confidence > 80% & Tren Bullish.
- **BUY**: Confidence > 65%.
- **HOLD**: Confidence 40% - 65%.
- **SELL**: Confidence < 40%.
- **STRONG SELL**: Confidence < 25%.

---

## 📝 Disclaimer
Bot ini hanya alat bantu analisis teknikal. Keputusan investasi sepenuhnya ada di tangan pengguna. *Do Your Own Research (DYOR)*.
