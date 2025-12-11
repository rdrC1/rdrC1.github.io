// PWA Install Prompt Handler
class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.init();
  }

  init() {
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
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && window.navigator.standalone;
    
    if (isIOS && !isInStandaloneMode) {
      // Show iOS install instructions
      this.showIOSInstallInstructions();
    }
  }

  showInstallButton() {
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
      
      // Add to header or bottom nav
      const header = document.querySelector('.app-header');
      if (header) {
        header.appendChild(this.installButton);
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

