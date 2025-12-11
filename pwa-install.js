// PWA Install Prompt Handler
class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.isNative = false;
    this.init();
  }

  async checkIfNative() {
    // Check if running as native app (Capacitor)
    try {
      if (typeof window !== 'undefined' && window.Capacitor) {
        const isNative = window.Capacitor.isNativePlatform();
        if (isNative) {
          this.isNative = true;
          return true;
        }
      }
      
      try {
        const CapacitorModule = await import('@capacitor/core');
        if (CapacitorModule && CapacitorModule.Capacitor) {
          const isNative = CapacitorModule.Capacitor.isNativePlatform();
          if (isNative) {
            this.isNative = true;
            return true;
          }
        }
      } catch (e) {
        // Capacitor not available, not native
      }
    } catch (e) {
      // Error checking, assume not native
    }
    
    this.isNative = false;
    return false;
  }

  async init() {
    // Don't initialize if running as native app
    const isNative = await this.checkIfNative();
    if (isNative) {
      console.log('[PWA] Running as native app, skipping PWA install manager');
      return;
    }

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] beforeinstallprompt event fired');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed');
      this.deferredPrompt = null;
      this.hideInstallButton();
      this.showInstalledMessage();
    });

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] App is running in standalone mode');
      this.hideInstallButton();
    }

    // iOS install detection
    this.detectIOSInstall();
  }

  detectIOSInstall() {
    // Don't show iOS instructions if native app
    if (this.isNative) {
      return;
    }
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && window.navigator.standalone;
    
    if (isIOS && !isInStandaloneMode) {
      // Show iOS install instructions
      this.showIOSInstallInstructions();
    }
  }

  showInstallButton() {
    // Don't show if native app
    if (this.isNative) {
      return;
    }
    
    // Create install button if it doesn't exist
    if (!this.installButton) {
      this.installButton = document.createElement('button');
      this.installButton.id = 'pwa-install-button';
      this.installButton.className = 'pwa-install-button';
      this.installButton.innerHTML = `
        <span class="material-symbols-outlined">download</span>
        <span>Telepítés</span>
      `;
      this.installButton.addEventListener('click', () => this.installApp());
      
      // Add to settings page instead of header
      const settingsPage = document.getElementById('settingsPage');
      if (settingsPage) {
        // Find the credits section or add before it
        const creditsSection = settingsPage.querySelector('.credits-section');
        if (creditsSection) {
          // Create a new settings section for PWA install
          const pwaSection = document.createElement('div');
          pwaSection.className = 'settings-section';
          pwaSection.innerHTML = `
            <h3 class="section-title">Alkalmazás telepítése</h3>
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-label">PWA telepítés</span>
                <span class="setting-description">Telepítsd az alkalmazást a kezdőképernyőre, hogy gyorsabban elérhesd</span>
              </div>
            </div>
          `;
          pwaSection.querySelector('.setting-item').appendChild(this.installButton);
          settingsPage.querySelector('.page-content').insertBefore(pwaSection, creditsSection);
        } else {
          // If no credits section, add at the end
          const pageContent = settingsPage.querySelector('.page-content');
          const pwaSection = document.createElement('div');
          pwaSection.className = 'settings-section';
          pwaSection.innerHTML = `
            <h3 class="section-title">Alkalmazás telepítése</h3>
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-label">PWA telepítés</span>
                <span class="setting-description">Telepítsd az alkalmazást a kezdőképernyőre, hogy gyorsabban elérhesd</span>
              </div>
            </div>
          `;
          pwaSection.querySelector('.setting-item').appendChild(this.installButton);
          pageContent.appendChild(pwaSection);
        }
      }
    }
    
    this.installButton.style.display = 'flex';
  }

  hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();
    
    // Wait for user response
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log('[PWA] User choice:', outcome);
    
    if (outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }
    
    this.deferredPrompt = null;
    this.hideInstallButton();
  }

  showIOSInstallInstructions() {
    // Check if instructions already shown
    if (document.getElementById('ios-install-instructions')) {
      return;
    }

    const instructions = document.createElement('div');
    instructions.id = 'ios-install-instructions';
    instructions.className = 'ios-install-banner';
    instructions.innerHTML = `
      <div class="ios-install-content">
        <span class="material-symbols-outlined">ios_share</span>
        <div>
          <strong>Telepítés iOS-en:</strong>
          <p>Koppints a Share gombra <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">ios_share</span>, majd válaszd a "Kezdőképernyőhöz adás" opciót</p>
        </div>
        <button class="ios-install-close" onclick="this.parentElement.parentElement.remove()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    `;
    
    document.body.insertBefore(instructions, document.body.firstChild);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (instructions.parentElement) {
        instructions.remove();
      }
    }, 10000);
  }

  showInstalledMessage() {
    // Show a snackbar or toast message
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar snackbar-success';
    snackbar.innerHTML = `
      <div class="snackbar-content">
        <span class="material-symbols-outlined snackbar-icon">check_circle</span>
        <span class="snackbar-message">Alkalmazás telepítve!</span>
      </div>
    `;
    document.body.appendChild(snackbar);
    
    setTimeout(() => {
      snackbar.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      snackbar.classList.remove('show');
      setTimeout(() => snackbar.remove(), 300);
    }, 3000);
  }
}

// Initialize PWA Install Manager
const pwaInstallManager = new PWAInstallManager();

