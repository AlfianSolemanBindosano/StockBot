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
```

### 3. Menjalankan Bot
```bash
# Mode Development
npm start

# Mode Produksi (24/7 dengan PM2)
npm run pm2:start
```

---

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
