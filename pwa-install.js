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
    
    // Ensure button is not in header on init
    setTimeout(() => {
      this.ensureButtonInSettings();
    }, 500);
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

  ensureButtonInSettings() {
    // Don't do anything if native app
    if (this.isNative) {
      return;
    }
    
    // Check if button exists in header and remove it
    const header = document.querySelector('.app-header');
    if (header) {
      const headerButton = header.querySelector('#pwa-install-button');
      if (headerButton) {
        console.log('[PWA] Removing install button from header');
        headerButton.remove();
        this.installButton = null;
      }
    }
    
    // If we have a deferred prompt, ensure button is in settings
    if (this.deferredPrompt && this.installButton) {
      const settingsPage = document.getElementById('settingsPage');
      if (settingsPage) {
        const buttonInSettings = settingsPage.querySelector('#pwa-install-button');
        if (!buttonInSettings && this.installButton.parentElement !== settingsPage) {
          // Button not in settings, move it there
          this.addButtonToSettings();
        }
      }
    }
  }

  addButtonToSettings() {
    const settingsPage = document.getElementById('settingsPage');
    if (!settingsPage) {
      return;
    }
    
    // Remove button from any existing location (especially header)
    if (this.installButton && this.installButton.parentElement) {
      const parent = this.installButton.parentElement;
      // Only remove if it's in header or wrong location
      if (parent.classList.contains('app-header') || 
          parent.classList.contains('header-content') ||
          (!parent.closest('#pwa-install-section'))) {
        this.installButton.remove();
      }
    }
    
    // Check if PWA section already exists
    let pwaSection = settingsPage.querySelector('#pwa-install-section');
    if (!pwaSection) {
      // Create a new settings section for PWA install
      pwaSection = document.createElement('div');
      pwaSection.id = 'pwa-install-section';
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
      
      // Find the credits section or add at the end
      const pageContent = settingsPage.querySelector('.page-content');
      const creditsSection = settingsPage.querySelector('.credits-section');
      if (creditsSection) {
        pageContent.insertBefore(pwaSection, creditsSection);
      } else {
        pageContent.appendChild(pwaSection);
      }
    }
    
    // Create button if it doesn't exist
    if (!this.installButton) {
      this.installButton = document.createElement('button');
      this.installButton.id = 'pwa-install-button';
      this.installButton.className = 'pwa-install-button';
      this.installButton.innerHTML = `
        <span class="material-symbols-outlined">download</span>
        <span>Telepítés</span>
      `;
      this.installButton.addEventListener('click', () => this.installApp());
    }
    
    // Add button to the setting-item if not already there
    const settingItem = pwaSection.querySelector('.setting-item');
    if (settingItem && !settingItem.querySelector('#pwa-install-button')) {
      settingItem.appendChild(this.installButton);
      this.installButton.style.display = 'flex';
    }
  }

  showInstallButton() {
    // Don't show if native app
    if (this.isNative) {
      return;
    }
    
    // Create button if it doesn't exist
    if (!this.installButton) {
      this.installButton = document.createElement('button');
      this.installButton.id = 'pwa-install-button';
      this.installButton.className = 'pwa-install-button';
      this.installButton.innerHTML = `
        <span class="material-symbols-outlined">download</span>
        <span>Telepítés</span>
      `;
      this.installButton.addEventListener('click', () => this.installApp());
    }
    
    // Always add to settings page
    this.addButtonToSettings();
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

// Export for use in app.js
if (typeof window !== 'undefined') {
  window.pwaInstallManager = pwaInstallManager;
}

