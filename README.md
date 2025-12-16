# Magic Chess Go Go Predictor ⚔️

Aplikasi prediksi lawan untuk game **Magic Chess Go Go** (MLBB Auto-battler) dengan akurasi tinggi menggunakan algoritma Round-Robin Cycle.

![Preview](https://img.shields.io/badge/Status-Active-brightgreen)
![Version](https://img.shields.io/badge/Version-2.0-blue)

## 🎯 Fitur

- **Prediksi Lawan Akurat** - Menggunakan algoritma Round-Robin untuk memprediksi musuh berikutnya
- **Tracking Progress** - Tandai musuh yang sudah dilawan di fase learning
- **Visual Modern** - UI dengan glassmorphism dan animated background
- **Responsive** - Bisa digunakan di desktop maupun mobile
- **Ringan** - Pure HTML, CSS, JavaScript tanpa framework

## 🎮 Cara Penggunaan

1. Masukkan nama 7 musuh yang akan kamu hadapi
2. Klik "Mulai Pertandingan"
3. Setiap kali kamu bertanding, klik tombol "⚔️ Lawan" pada musuh yang kamu lawan
4. Jika ada musuh yang tereliminasi, klik tombol "💀 Mati"
5. Setelah fase learning selesai, prediksi akan aktif!

## 🔧 Algoritma

Game Magic Chess Go Go menggunakan sistem **Round-Robin**:
- Pemain akan melawan semua musuh yang masih hidup 1x sebelum cycle berulang
- Ronde creep/monster: 1-1, 2-3, 3-3, 4-3, 5-3
- Setelah bertemu musuh, urutan di-rotate (dipindah ke akhir)

## 🚀 Deployment

### Vercel
1. Push ke GitHub
2. Import repository di [Vercel](https://vercel.com)
3. Deploy!

### Lokal
```bash
# Gunakan Python
python -m http.server 8000

# Atau gunakan Node.js
npx serve
```

## 📁 Struktur File

```
├── index.html    # Struktur HTML
├── styles.css    # Styling dengan glassmorphism
├── app.js        # Logic prediksi
└── README.md     # Dokumentasi
```

## 📱 Screenshot

| Setup Phase | Battle Phase |
|-------------|--------------|
| Input nama musuh | Prediksi & tracking |

## 🤝 Kontribusi

Feel free to fork dan submit pull request!

## 📄 License

MIT License - Bebas digunakan untuk keperluan pribadi maupun komersial.

---

Made with ❤️ for Magic Chess Players
