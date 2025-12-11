# PWA Telepítési Útmutató - reTerem

A reTerem alkalmazás mostantól PWA (Progressive Web App) támogatással rendelkezik, így telepíthető iOS-re és Androidra App Store nélkül!

## 📱 Telepítés iOS-en

### Lépések:

1. **Nyisd meg az alkalmazást Safari böngészőben** (nem működik más böngészőkben iOS-en)
2. **Koppints a Share gombra** (négyzetből kinyíló nyíl ikon) a képernyő alján
3. **Görgess le** és keresd meg a **"Kezdőképernyőhöz adás"** vagy **"Add to Home Screen"** opciót
4. **Koppints rá** és válaszd ki az ikont és nevet
5. **Koppints a "Hozzáadás"** gombra

Az alkalmazás mostantól a kezdőképernyőn fog megjelenni, és standalone módban fog futni!

## 🤖 Telepítés Androidon

### Automatikus telepítési prompt:

1. Amikor először megnyitod az alkalmazást, egy **"Telepítés"** gomb jelenik meg
2. **Koppints a "Telepítés"** gombra
3. A telepítési ablakban **"Telepítés"** gombra koppintás
4. Az alkalmazás telepítve lesz és megjelenik a kezdőképernyőn

### Manuális telepítés:

1. **Nyisd meg a Chrome böngészőt** (vagy más Chromium-alapú böngészőt)
2. **Koppints a menü gombra** (3 pont) a jobb felső sarokban
3. Válaszd a **"Telepítés alkalmazás"** vagy **"Add to Home screen"** opciót
4. **Erősítsd meg** a telepítést

## ✨ PWA Funkciók

### ✅ Offline Támogatás
- Az alkalmazás működik offline módban is
- A korábban betöltött adatok elérhetők maradnak
- Service Worker automatikusan cache-eli a fontos fájlokat

### ✅ Értesítések
- **iOS**: Web Notifications API használata (Safari-ban működik)
- **Android**: Web Notifications API vagy natív értesítések
- Az értesítések működnek, még akkor is, ha az alkalmazás nincs megnyitva

### ✅ Standalone Mód
- Az alkalmazás saját ablakban fut (nincs böngésző toolbar)
- Teljes képernyős élmény
- Gyors elérés a kezdőképernyőről

### ✅ Gyors Indítás
- Az alkalmazás gyorsabban indul, mint egy weboldal
- Splash screen automatikusan megjelenik
- Optimalizált betöltés

## 🔔 Értesítések Beállítása

1. **Nyisd meg az alkalmazást**
2. Menj a **Beállítások** oldalra
3. Kapcsold be a **"Teremváltozási értesítések"** opciót
4. **Engedélyezd az értesítéseket** amikor a böngésző kéri
5. Kész! Az értesítések automatikusan működni fognak

## ⚠️ Fontos Megjegyzések

### iOS:
- **Csak Safari-ban működik** a PWA telepítés
- Az értesítések csak akkor működnek, ha az alkalmazás **Safari-ban van telepítve**
- iOS 16.4+ szükséges a teljes PWA támogatáshoz

### Android:
- **Chrome vagy Chromium-alapú böngészők** ajánlottak
- Az értesítések minden modern Android böngészőben működnek
- Android 5.0+ szükséges

### Általános:
- **HTTPS szükséges** - az alkalmazás csak HTTPS-en keresztül telepíthető
- **Service Worker** automatikusan regisztrálódik
- Az adatok **localStorage-ban** tárolódnak (nem törlődnek az alkalmazás eltávolításakor)

## 🆘 Hibaelhárítás

### Az alkalmazás nem telepíthető:

1. **Ellenőrizd, hogy HTTPS-en fut-e** - HTTP-n nem telepíthető
2. **Safari-t használsz iOS-en?** - Más böngészők nem támogatják iOS-en
3. **Chrome-t használsz Androidon?** - Ajánlott a Chrome használata

### Az értesítések nem működnek:

1. **Engedélyezd az értesítéseket** a böngésző beállításaiban
2. **Ellenőrizd az alkalmazás beállításait** - az értesítések bekapcsolva vannak?
3. **iOS-en**: Csak Safari-ban telepített PWA-ban működnek az értesítések
4. **Androidon**: Ellenőrizd a Chrome értesítési beállításait

### Offline mód nem működik:

1. **Várj egy kicsit** - a Service Worker először cache-eli a fájlokat
2. **Frissítsd az oldalt** - ez aktiválja a Service Worker-t
3. **Ellenőrizd a böngésző konzolt** - lehet, hogy hibák vannak

## 📚 További Információk

- [PWA Dokumentáció](https://web.dev/progressive-web-apps/)
- [iOS PWA Támogatás](https://webkit.org/blog/8042/progressive-web-apps/)
- [Android PWA Támogatás](https://developer.chrome.com/docs/android/pwa/)

## 🎉 Kész!

Az alkalmazás mostantól teljes értékű PWA-ként működik, és telepíthető iOS-re és Androidra App Store nélkül!

