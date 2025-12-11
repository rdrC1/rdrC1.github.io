# iOS PWA Értesítések - Fontos Információk

## ⚠️ iOS Korlátok

iOS-en a PWA értesítések **korlátozottan működnek háttérben**. Ez az iOS működésének sajátossága, nem az alkalmazás hibája.

### Hogyan működik iOS-en:

1. **Amikor az app aktív (megnyitva)**:
   - ✅ Az értesítések **tökéletesen működnek**
   - ✅ A Service Worker aktív
   - ✅ A `setTimeout`-ok lefutnak
   - ✅ Az értesítések időben megjelennek

2. **Amikor az app bezárva van**:
   - ⚠️ A Service Worker **korlátozottan aktív**
   - ⚠️ A `setTimeout`-ok **nem mindig futnak le**
   - ⚠️ Az értesítések **csak akkor jelennek meg, ha az app aktiválódik**

### Megoldás:

Az alkalmazás **automatikusan ellenőrzi** az esedékes értesítéseket, amikor:
- ✅ Az app megnyílik
- ✅ Az app aktívvá válik (focus)
- ✅ Az oldal láthatóvá válik

Ez azt jelenti, hogy **amikor megnyitod az alkalmazást**, azonnal megjelennek az esedékes értesítések, amelyek az app bezárása után lettek volna küldve.

## 🔔 Teszt Értesítés iOS-en

### Működés:
1. **Amikor az app aktív**: A teszt értesítés **8 másodperc múlva megjelenik**
2. **Amikor az app bezárva van**: Az értesítés **nem jelenik meg automatikusan**
3. **Amikor újra megnyitod az appot**: Ha az értesítés ideje elmúlt, **azonnal megjelenik**

### Javaslat:
- Teszteld az értesítéseket, amikor az app **aktív**
- Vagy várj 8 másodpercet, majd **nyisd meg újra az appot** - az értesítés megjelenik

## 📱 Android vs iOS

### Android:
- ✅ **Teljes háttérben futó értesítések**
- ✅ Service Worker aktív háttérben
- ✅ Értesítések időben megjelennek, még akkor is, ha az app bezárva van

### iOS:
- ⚠️ **Korlátozott háttérben futó értesítések**
- ⚠️ Service Worker csak akkor aktív, amikor az app aktív
- ⚠️ Értesítések csak akkor jelennek meg, ha az app aktiválódik

## 💡 Javaslatok

1. **Tartsd megnyitva az appot** az értesítések idején
2. **Nyisd meg az appot reggel** - az esedékes értesítések azonnal megjelennek
3. **Használj Androidot** a teljes háttérben futó értesítésekhez

## 🔧 Technikai Részletek

Az alkalmazás a következő technológiákat használja:

1. **Service Worker**: IndexedDB-ben tárolja az ütemezett értesítéseket
2. **setTimeout**: Service Worker-ben ütemezza az értesítéseket
3. **App Activation Detection**: Amikor az app aktiválódik, ellenőrzi az esedékes értesítéseket

### iOS-specifikus kezelés:
- Amikor az app aktiválódik, azonnal ellenőrzi az IndexedDB-t
- Megjeleníti az esedékes értesítéseket
- Újra ütemezzi a jövőbeli értesítéseket

## 📚 További Információk

- [iOS PWA Támogatás](https://webkit.org/blog/8042/progressive-web-apps/)
- [Service Worker iOS-en](https://developer.apple.com/documentation/safari-release-notes/safari-16-release-notes)
- [Web Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)

## ✅ Összefoglalás

**iOS-en az értesítések működnek, de csak akkor, ha az app aktív vagy amikor újra megnyitod az appot.** Ez az iOS működésének sajátossága, és nem az alkalmazás hibája.

Az alkalmazás **automatikusan kezeli** ezt: amikor megnyitod az appot, azonnal megjelennek az esedékes értesítések.

