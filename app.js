import { storage } from './storage.js';
import { jsonParser } from './jsonParser.js';
import { notificationManager } from './notifications.js';

// All available classes - will be populated from room changes
let ALL_CLASSES = [];
let ALL_TEACHERS = [];

// Function to extract unique groups and teachers from classroom changes
async function updateClassesAndTeachersFromChanges() {
  try {
    const changes = await storage.getClassroomChanges();
    const uniqueGroups = new Set();
    const uniqueTeachers = new Set();
    
    // Extract all unique groups and teachers from changes
    // Convert group names to uppercase to handle typos
    changes.forEach(change => {
      if (change.group) {
        uniqueGroups.add(change.group.toUpperCase());
      }
      if (change.teacher && change.teacher !== 'Ismeretlen tanár' && change.teacher.trim()) {
        uniqueTeachers.add(change.teacher.trim());
      }
    });
    
    // Convert to sorted arrays
    const newGroups = Array.from(uniqueGroups).sort();
    const newTeachers = Array.from(uniqueTeachers).sort();
    
    // Update ALL_CLASSES
    newGroups.forEach(group => {
      if (!ALL_CLASSES.includes(group)) {
        ALL_CLASSES.push(group);
      }
    });
    ALL_CLASSES.sort();
    
    // Update ALL_TEACHERS
    newTeachers.forEach(teacher => {
      if (!ALL_TEACHERS.includes(teacher)) {
        ALL_TEACHERS.push(teacher);
      }
    });
    ALL_TEACHERS.sort();
    
    // Save to storage
    await storage.saveAllGroups(ALL_CLASSES);
    await storage.saveAllTeachers(ALL_TEACHERS);
    
    console.log('Updated classes list:', ALL_CLASSES);
    console.log('Updated teachers list:', ALL_TEACHERS);
  } catch (error) {
    console.error('Error updating classes and teachers from changes:', error);
  }
}

// Legacy function for compatibility
async function updateClassesFromChanges() {
  await updateClassesAndTeachersFromChanges();
}

// Class times
const CLASS_TIMES = [
  { number: 1, start: '08:00', end: '08:40' },
  { number: 2, start: '08:55', end: '09:35' },
  { number: 3, start: '09:50', end: '10:30' },
  { number: 4, start: '10:55', end: '11:35' },
  { number: 5, start: '11:50', end: '12:30' },
  { number: 6, start: '12:45', end: '13:15' },
  { number: 7, start: '13:40', end: '14:20' },
  { number: 8, start: '14:30', end: '15:10' },
  { number: 9, start: '15:20', end: '16:00' }
];

class App {
  constructor() {
    this.currentPage = 'dailyPage';
    this.showAllFutureChanges = false;
    this.roomChangesDetailsModalHandlers = null;
    this.backButtonListener = null;
    this.pageHistory = ['dailyPage']; // Track page navigation history
    this.init();
  }

  async init() {
    // Hide OS splash screen immediately to prevent white flash
    // Hide it before loading theme to avoid white background flash in dark mode
    // Do this synchronously if possible, or as early as possible
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      if (SplashScreen) {
        try {
          // Hide immediately with no fade to prevent white flash
          await SplashScreen.hide({ fadeOutDuration: 0 });
        } catch (e) {
          // Ignore if already hidden or not available
        }
      }
    } catch (e) {
      // SplashScreen plugin not available, that's okay
    }
    
    // Load theme early to set background color
    await this.loadTheme();
    await this.loadAmoledMode();
    await this.loadShowAllFutureChanges();
    this.setupEventListeners();
    this.setupNavigation();
    this.lockOrientation();
    await this.setupBackButton();
    
    // Load stored groups and teachers
    const storedGroups = await storage.getAllGroups();
    const storedTeachers = await storage.getAllTeachers();
    if (storedGroups.length > 0) ALL_CLASSES = storedGroups;
    if (storedTeachers.length > 0) ALL_TEACHERS = storedTeachers;
    
    await this.loadCachedData();
    await updateClassesAndTeachersFromChanges();
    await this.loadRoomChangesList();
    await this.loadDailySummary();
    await this.loadSettings();
    await storage.cleanupExpiredChanges();
    
    // Auto-refresh on startup if internet is available
    if (navigator.onLine) {
      console.log('[App] Internet available, auto-refreshing data...');
      // Run silently in background without UI feedback
      this.silentRefresh().catch(error => {
        console.log('[App] Silent refresh failed:', error);
        // Silently fail, user can manually refresh if needed
      });
    } else {
      console.log('[App] No internet connection, skipping auto-refresh');
    }
    
    // Setup notifications
    const notificationsEnabled = await storage.getNotificationsEnabled();
    if (notificationsEnabled) {
      // Opcionális: Csak 12 óránként ütemezz újra
      const lastSchedule = await storage.getLastNotificationSchedule();
      const now = Date.now();
      const COOLDOWN = 12 * 60 * 60 * 1000; // 12 óra
      
      if (!lastSchedule || (now - lastSchedule) > COOLDOWN) {
        console.log('[App] Re-scheduling notifications...');
        await notificationManager.scheduleAllNotifications();
        await storage.setLastNotificationSchedule(now);
      } else {
        console.log('[App] Notifications already scheduled (cooldown active)');
      }
    }
  }

  lockOrientation() {
    // Lock orientation to portrait on mobile
    if (window.screen && window.screen.orientation) {
      try {
        window.screen.orientation.lock('portrait').catch(() => {
          // Orientation lock may not be supported
          console.log('Orientation lock not supported');
        });
      } catch (e) {
        // Ignore error if not supported
      }
    }
  }

  async setupBackButton() {
    // Handle Android back button
    try {
      const { App } = await import('@capacitor/app');
      
      // Remove existing listener if any
      if (this.backButtonListener) {
        await this.backButtonListener.remove();
      }
      
      // Register back button listener
      // The listener automatically prevents default behavior (app exit)
      this.backButtonListener = await App.addListener('backButton', () => {
        this.handleBackButton();
      });
      
      console.log('[BackButton] Back button listener registered successfully');
    } catch (e) {
      // App plugin not available (web environment), that's okay
      console.log('[BackButton] App plugin not available (expected on web):', e);
    }
    
    // Also listen for browser back button / hardware back button via popstate
    window.addEventListener('popstate', (event) => {
      console.log('[BackButton] Popstate event triggered');
      // Prevent default navigation and handle it ourselves
      this.handleBackButton();
      // Push a new state to keep history management working
      if (this.currentPage !== 'dailyPage') {
        history.pushState({ page: this.currentPage }, '', '');
      }
    });
    
    // Initialize history state
    history.replaceState({ page: 'dailyPage' }, '', '');
  }
  
  handleBackButton() {
    console.log('[BackButton] Back button pressed');
    
    // Check if any modal is open
    const modals = document.querySelectorAll('.modal.active');
    if (modals.length > 0) {
      // Close the last opened modal
      const lastModal = modals[modals.length - 1];
      const modalId = lastModal.id;
      
      console.log('[BackButton] Closing modal:', modalId);
      
      // Close modal based on its ID
      if (modalId === 'classSelectorModal') {
        this.closeClassSelector();
      } else if (modalId === 'teacherSelectorModal') {
        this.closeTeacherSelector();
      } else if (modalId === 'hourOffsetsModal') {
        this.closeHourOffsetsManager();
      } else if (modalId === 'yearTransitionModal') {
        this.closeYearTransitionModal();
      } else if (modalId === 'roomChangesDetailsModal') {
        // This modal has inline close handler
        const closeBtn = document.getElementById('closeRoomChangesDetailsBtn');
        if (closeBtn) {
          closeBtn.click();
        } else {
          lastModal.classList.remove('active');
        }
      } else {
        // Generic close for any other modal
        lastModal.classList.remove('active');
      }
      return;
    }
    
    // If no modal is open, navigate back in page history
    if (this.pageHistory.length > 1) {
      // Remove current page from history
      this.pageHistory.pop();
      // Get previous page
      const previousPage = this.pageHistory[this.pageHistory.length - 1];
      console.log('[BackButton] Navigating back to:', previousPage);
      // Navigate back to previous page (don't add to history)
      this.switchPage(previousPage, false);
      this.updateNavActive(previousPage);
      return;
    }
    
    // If we're on the main page with no history, minimize the app or do nothing
    console.log('[BackButton] On main page with no history');
    // Try to minimize app on Android
    this.minimizeApp();
  }
  
  async minimizeApp() {
    try {
      const { App } = await import('@capacitor/app');
      await App.minimizeApp();
    } catch (e) {
      console.log('[BackButton] Cannot minimize app:', e);
    }
  }

  async loadShowAllFutureChanges() {
    this.showAllFutureChanges = await storage.getShowAllFutureChanges();
  }

  async toggleShowAllFutureChanges() {
    this.showAllFutureChanges = !this.showAllFutureChanges;
    await storage.setShowAllFutureChanges(this.showAllFutureChanges);
    
    // Update toggle button state
    const toggleBtn = document.getElementById('toggleAllFutureChanges');
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', this.showAllFutureChanges);
    }
    
    await this.loadDailySummary();
  }

  async loadTheme() {
    const theme = await storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeIcon(theme);
  }

  async loadAmoledMode() {
    const amoledMode = await storage.getAmoledMode();
    if (amoledMode) {
      document.documentElement.setAttribute('data-amoled', 'true');
    } else {
      document.documentElement.removeAttribute('data-amoled');
    }
  }

  updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle .material-symbols-outlined');
    if (icon) {
      icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }
  }

  setupEventListeners() {
    // Theme toggle with long press for AMOLED mode
    const themeToggle = document.getElementById('themeToggle');
    let longPressTimer = null;
    let longPressTriggered = false;
    const LONG_PRESS_DURATION = 500; // 500ms

    const handleLongPress = () => {
      longPressTriggered = true;
      this.hapticFeedback('heavy');
      this.toggleAmoledMode();
      longPressTimer = null;
    };

    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    themeToggle.addEventListener('click', (e) => {
      // Prevent click if long press was triggered
      if (longPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        longPressTriggered = false;
        return;
      }
      this.hapticFeedback('light');
      this.toggleTheme();
    });

    themeToggle.addEventListener('touchstart', (e) => {
      longPressTriggered = false;
      longPressTimer = setTimeout(handleLongPress, LONG_PRESS_DURATION);
    });

    themeToggle.addEventListener('touchend', () => {
      cancelLongPress();
      // Reset flag after a short delay to allow click event to check it
      setTimeout(() => {
        longPressTriggered = false;
      }, 100);
    });

    themeToggle.addEventListener('touchcancel', () => {
      cancelLongPress();
      longPressTriggered = false;
    });

    // Mouse long press support for desktop testing
    themeToggle.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left mouse button
        longPressTriggered = false;
        longPressTimer = setTimeout(handleLongPress, LONG_PRESS_DURATION);
      }
    });

    themeToggle.addEventListener('mouseup', () => {
      cancelLongPress();
      setTimeout(() => {
        longPressTriggered = false;
      }, 100);
    });

    themeToggle.addEventListener('mouseleave', () => {
      cancelLongPress();
      longPressTriggered = false;
    });

    // Show all future changes toggle
    document.getElementById('toggleAllFutureChanges')?.addEventListener('click', () => {
      this.toggleShowAllFutureChanges();
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.hapticFeedback('medium');
      this.handleRefresh();
    });

    document.getElementById('classSelectorModalBackdrop')?.addEventListener('click', () => {
      this.closeClassSelector();
    });

    // Class selector
    document.getElementById('selectClassesBtn').addEventListener('click', () => {
      this.hapticFeedback('light');
      this.openClassSelector();
    });

    document.getElementById('closeClassSelectorModal').addEventListener('click', () => {
      this.closeClassSelector();
    });

    document.getElementById('cancelClassSelectorBtn').addEventListener('click', () => {
      this.closeClassSelector();
    });

    document.getElementById('confirmClassSelectorBtn').addEventListener('click', () => {
      this.confirmClassSelection();
    });

    // Search in class selector
    document.getElementById('classSearch').addEventListener('input', (e) => {
      this.filterClasses(e.target.value);
    });

    // Notifications toggle
    document.getElementById('notificationToggle').addEventListener('change', (e) => {
      this.toggleNotifications(e.target.checked);
    });

    // Test notification button
    document.getElementById('testNotificationBtn').addEventListener('click', () => {
      this.testNotification();
    });

    // Haptic feedback toggle
    document.getElementById('hapticFeedbackToggle').addEventListener('change', (e) => {
      this.toggleHapticFeedback(e.target.checked);
    });

    // Teacher mode toggle
    document.getElementById('teacherModeToggle').addEventListener('change', (e) => {
      this.toggleTeacherMode(e.target.checked);
    });

    // Teacher selector
    document.getElementById('selectTeachersBtn').addEventListener('click', () => {
      this.openTeacherSelector();
    });

    document.getElementById('teacherSelectorModalBackdrop')?.addEventListener('click', () => {
      this.closeTeacherSelector();
    });

    document.getElementById('closeTeacherSelectorModal').addEventListener('click', () => {
      this.closeTeacherSelector();
    });

    document.getElementById('cancelTeacherSelectorBtn').addEventListener('click', () => {
      this.closeTeacherSelector();
    });

    document.getElementById('confirmTeacherSelectorBtn').addEventListener('click', () => {
      this.confirmTeacherSelection();
    });

    document.getElementById('teacherSearch').addEventListener('input', (e) => {
      this.filterTeachers(e.target.value);
    });

    // Hour offsets management
    document.getElementById('manageHourOffsetsBtn').addEventListener('click', () => {
      this.openHourOffsetsManager();
    });

    document.getElementById('hourOffsetsModalBackdrop')?.addEventListener('click', () => {
      this.closeHourOffsetsManager();
    });

    document.getElementById('closeHourOffsetsModal').addEventListener('click', () => {
      this.closeHourOffsetsManager();
    });

    document.getElementById('cancelHourOffsetsBtn').addEventListener('click', () => {
      this.closeHourOffsetsManager();
    });

    document.getElementById('saveHourOffsetsBtn').addEventListener('click', () => {
      this.saveHourOffsets();
    });

    // Swipe gestures for page navigation
    this.setupSwipeGestures();

    // Hide splash screen after initialization
    this.hideSplashScreen();

    // Year transition button
    document.getElementById('yearTransitionBtn')?.addEventListener('click', () => {
      this.hapticFeedback('medium');
      this.openYearTransitionModal();
    });

    document.getElementById('yearTransitionModalBackdrop')?.addEventListener('click', () => {
      this.closeYearTransitionModal();
    });

    document.getElementById('closeYearTransitionModal')?.addEventListener('click', () => {
      this.closeYearTransitionModal();
    });

    document.getElementById('cancelYearTransitionBtn')?.addEventListener('click', () => {
      this.closeYearTransitionModal();
    });

    document.getElementById('confirmYearTransitionBtn')?.addEventListener('click', () => {
      this.confirmYearTransition();
    });

    // Add class button in class selector
    document.getElementById('addClassBtn')?.addEventListener('click', () => {
      this.addNewClass();
    });

    document.getElementById('addClassInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addNewClass();
      }
    });
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hapticFeedback('light');
        const pageId = item.getAttribute('data-page');
        this.switchPage(pageId);
        
        // Remove active from all, add to clicked
        navItems.forEach(ni => ni.classList.remove('active'));
        item.classList.add('active');
      });
      
      // Remove hover state on touch devices
      item.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.hapticFeedback('light');
        const pageId = item.getAttribute('data-page');
        this.switchPage(pageId);
        navItems.forEach(ni => ni.classList.remove('active'));
        item.classList.add('active');
      });
    });
    
    // Remove active state when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-item') && !e.target.closest('.bottom-nav')) {
        // Keep current active state, just ensure it's properly set
        const currentNavItem = document.querySelector(`.nav-item[data-page="${this.currentPage}"]`);
        if (currentNavItem) {
          navItems.forEach(ni => ni.classList.remove('active'));
          currentNavItem.classList.add('active');
        }
      }
    });
  }

  setupSwipeGestures() {
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    const mainContent = document.getElementById('mainContent');
    
    mainContent.addEventListener('touchstart', (e) => {
      // Don't handle swipe if touching nav items or header
      if (e.target.closest('.nav-item') || e.target.closest('.bottom-nav') || 
          e.target.closest('.app-header')) {
        return;
      }
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    });

    mainContent.addEventListener('touchend', (e) => {
      // Don't handle swipe if touching nav items or header
      if (e.target.closest('.nav-item') || e.target.closest('.bottom-nav') || 
          e.target.closest('.app-header')) {
        return;
      }
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      this.handleSwipe();
    });

    this.handleSwipe = () => {
      const swipeThreshold = 50;
      const diffX = touchStartX - touchEndX;
      const diffY = Math.abs(touchStartY - touchEndY);

      // Only handle horizontal swipes (ignore vertical scrolling)
      if (Math.abs(diffX) > swipeThreshold && Math.abs(diffX) > diffY) {
        if (diffX > 0) {
          // Swipe left - next page
          this.navigateNext();
        } else {
          // Swipe right - previous page
          this.navigatePrevious();
        }
      }
    };
  }

  navigateNext() {
    const pages = ['dailyPage', 'managementPage', 'settingsPage'];
    const currentIndex = pages.indexOf(this.currentPage);
    if (currentIndex < pages.length - 1) {
      this.switchPage(pages[currentIndex + 1], true); // Add to history
      this.updateNavActive(pages[currentIndex + 1]);
    }
  }

  navigatePrevious() {
    const pages = ['dailyPage', 'managementPage', 'settingsPage'];
    const currentIndex = pages.indexOf(this.currentPage);
    if (currentIndex > 0) {
      this.switchPage(pages[currentIndex - 1], true); // Add to history
      this.updateNavActive(pages[currentIndex - 1]);
    }
  }

  updateNavActive(pageId) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      if (item.getAttribute('data-page') === pageId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  switchPage(pageId, addToHistory = true) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
      page.classList.remove('active');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      // Add to history if not already the current page
      if (addToHistory && this.currentPage !== pageId) {
        // Remove any future pages if we're going back
        const currentIndex = this.pageHistory.indexOf(this.currentPage);
        if (currentIndex >= 0) {
          this.pageHistory = this.pageHistory.slice(0, currentIndex + 1);
        }
        // Add new page to history
        this.pageHistory.push(pageId);
        // Also push to browser history for popstate event
        history.pushState({ page: pageId }, '', '');
      }
      
      targetPage.classList.add('active');
      this.currentPage = pageId;

      // Load page-specific content
      if (pageId === 'dailyPage') {
        this.loadDailySummary();
      } else if (pageId === 'managementPage') {
        this.loadRoomChangesList();
      } else if (pageId === 'settingsPage') {
        this.loadSettings();
        // Ensure PWA install button is in settings, not header
        if (typeof window !== 'undefined' && window.pwaInstallManager) {
          window.pwaInstallManager.ensureButtonInSettings();
        }
      }
    }
  }

  async toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    // Keep AMOLED mode if it was enabled and switching to dark mode
    const amoledMode = document.documentElement.getAttribute('data-amoled');
    if (amoledMode === 'true' && newTheme === 'dark') {
      document.documentElement.setAttribute('data-amoled', 'true');
    } else {
      document.documentElement.removeAttribute('data-amoled');
      // Disable AMOLED mode in storage if switching to light mode
      if (newTheme === 'light' && amoledMode === 'true') {
        await storage.setAmoledMode(false);
      }
    }
    
    await storage.setTheme(newTheme);
    this.updateThemeIcon(newTheme);
  }

  async toggleAmoledMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme !== 'dark') {
      // AMOLED mode only works in dark mode
      this.showSnackbar('AMOLED mód csak sötét módban érhető el', 'error');
      return;
    }

    const currentAmoled = document.documentElement.getAttribute('data-amoled');
    const newAmoled = currentAmoled !== 'true';
    
    if (newAmoled) {
      document.documentElement.setAttribute('data-amoled', 'true');
      await storage.setAmoledMode(true);
      this.showSnackbar('AMOLED mód bekapcsolva', 'success');
    } else {
      document.documentElement.removeAttribute('data-amoled');
      await storage.setAmoledMode(false);
      this.showSnackbar('AMOLED mód kikapcsolva', 'success');
    }
  }

  async loadDailySummary() {
    const container = document.getElementById('summaryContainer');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Betöltés...</p></div>';

    const changes = await storage.getClassroomChanges();
    const teacherMode = await storage.getTeacherMode();
    const selectedClassesRaw = await storage.getSelectedClasses();
    // Convert to uppercase to ensure consistency
    const selectedClasses = selectedClassesRaw.map(cls => cls.toUpperCase());
    const selectedTeachers = await storage.getSelectedTeachers();
    
    // Check if no classes/teachers selected - show empty state
    if (!teacherMode && selectedClasses.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 32px 24px;">
          <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 12px; opacity: 0.6; display: block;">school</span>
          <p style="font-size: 16px; margin-bottom: 4px; font-weight: 500; color: var(--md-sys-color-on-surface);">Nincs kiválasztott csoport</p>
          <p style="font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 20px; line-height: 1.4;">Válassz ki csoportokat a beállításokban</p>
          <button class="btn-primary" id="goToSettingsBtn" style="margin: 0 auto; padding: 10px 20px; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; vertical-align: middle;">
            <span class="material-symbols-outlined" style="font-size: 18px; line-height: 18px; height: 18px; width: 18px; display: flex; align-items: center; justify-content: center; vertical-align: middle; margin-bottom: 0px;">settings</span>
            <span style="line-height: 18px; display: inline-block; vertical-align: middle;">Beállítások</span>
          </button>
        </div>
      `;
      const goToSettingsBtn = document.getElementById('goToSettingsBtn');
      if (goToSettingsBtn) {
        goToSettingsBtn.addEventListener('click', () => {
          this.hapticFeedback('light');
          this.switchPage('settingsPage');
          this.updateNavActive('settingsPage');
        });
      }
      return;
    }
    
    if (teacherMode && selectedTeachers.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 32px 24px;">
          <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 12px; opacity: 0.6; display: block;">person</span>
          <p style="font-size: 16px; margin-bottom: 4px; font-weight: 500; color: var(--md-sys-color-on-surface);">Nincs kiválasztott tanár</p>
          <p style="font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 20px; line-height: 1.4;">Válassz ki tanárokat a beállításokban</p>
          <button class="btn-primary" id="goToSettingsBtn" style="margin: 0 auto; padding: 10px 20px; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; vertical-align: middle;">
            <span class="material-symbols-outlined" style="font-size: 18px; line-height: 18px; height: 18px; width: 18px; display: flex; align-items: center; justify-content: center; vertical-align: middle; margin-bottom: 0px;">settings</span>
            <span style="line-height: 18px; display: inline-block; vertical-align: middle;">Beállítások</span>
          </button>
        </div>
      `;
      const goToSettingsBtn = document.getElementById('goToSettingsBtn');
      if (goToSettingsBtn) {
        goToSettingsBtn.addEventListener('click', () => {
          this.hapticFeedback('light');
          this.switchPage('settingsPage');
          this.updateNavActive('settingsPage');
        });
      }
      return;
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Filter changes that haven't passed yet (for today)
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    container.innerHTML = '';
    
    // Add toggle button at the top
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'toggle-container';
    toggleContainer.innerHTML = `
      <button id="toggleAllFutureChanges" class="toggle-btn ${this.showAllFutureChanges ? 'active' : ''}">
        <span class="material-symbols-outlined">${this.showAllFutureChanges ? 'calendar_month' : 'today'}</span>
        <span>${this.showAllFutureChanges ? 'Összes módosítás' : 'Jövőbeli módosítások'}</span>
      </button>
    `;
    container.appendChild(toggleContainer);
    
    // Re-attach event listener after creating the button
    const toggleBtn = document.getElementById('toggleAllFutureChanges');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleShowAllFutureChanges());
    }

    // Helper function to filter changes by teacher mode and ignored hours
    const filterChanges = async (dayChanges, date) => {
      const dayName = this.getDayNameForStorage(date);
      
      // Filter by teacher mode - COMPLETELY SEPARATE from class mode
      let filtered = [];
      if (teacherMode) {
        // In teacher mode, ONLY show changes for selected teachers
        // IGNORE class selection completely
        if (selectedTeachers.length > 0) {
          filtered = dayChanges.filter(change => {
            if (change.teacher) {
              return selectedTeachers.includes(change.teacher.trim());
            }
            return false;
          });
        } else {
          // No teachers selected - show nothing
          filtered = [];
        }
      } else {
        // In class mode, ONLY show changes for selected classes
        // IGNORE teacher selection completely
        if (selectedClasses.length > 0) {
          // Convert both to uppercase for case-insensitive comparison
          const selectedClassesUpper = selectedClasses.map(cls => cls.toUpperCase());
          filtered = dayChanges.filter(change => {
            if (change.group) {
              return selectedClassesUpper.includes(change.group.toUpperCase());
            }
            return false;
          });
        } else {
          // No classes selected - show nothing (will show empty state)
          filtered = [];
        }
      }
      
      // Filter out ignored hours
      const filteredByIgnored = [];
      for (const change of filtered) {
        const isIgnored = await this.isHourIgnored(dayName, change.classNumber);
        if (!isIgnored) {
          filteredByIgnored.push(change);
        }
      }
      
      return filteredByIgnored;
    };

    if (this.showAllFutureChanges) {
      // Show all future changes (next 7 days) - show ALL changes including past ones for today
      const daysToShow = 7;
      let hasAnyChanges = false;
      
      for (let dayOffset = 0; dayOffset < daysToShow; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);
        
        const dayChanges = this.getChangesForDate(changes, date);
        
        // Filter by teacher mode and ignored hours
        const relevantChanges = await filterChanges(dayChanges, date);
        
        if (relevantChanges.length > 0) {
          hasAnyChanges = true;
          const dayName = dayOffset === 0 ? 'Ma' : dayOffset === 1 ? 'Holnap' : this.getDayName(date);
          const section = await this.createDaySection(dayName, relevantChanges, date);
          container.appendChild(section);
        }
      }
      
      if (!hasAnyChanges) {
        const emptyState = this.createEmptyState('Nincs aktív teremmódosításod!');
        container.appendChild(emptyState);
      }
    } else {
      // Show only today (upcoming) + tomorrow
      const todayChanges = this.getChangesForDate(changes, today);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowChanges = this.getChangesForDate(changes, tomorrow);

      // Filter by teacher mode and ignored hours
      const filteredTodayChanges = await filterChanges(todayChanges, today);
      const filteredTomorrowChanges = await filterChanges(tomorrowChanges, tomorrow);

      // Pre-load offsets for today
      const offsets = await storage.getHourOffsets();
      const dayName = this.getDayNameForStorage(today);
      
      const upcomingTodayChanges = filteredTodayChanges.filter(change => {
        // Get offset time if exists
        const offset = this.getOffsetTimeSync(offsets, dayName, change.classNumber);
        
        let classTime = CLASS_TIMES.find(ct => ct.number === change.classNumber);
        if (offset) {
          // Use offset time
          const [hours, minutes] = offset.startTime.split(':').map(Number);
          const classStartTime = hours * 60 + minutes;
          return classStartTime > currentTime;
        } else if (classTime) {
          const [hours, minutes] = classTime.start.split(':').map(Number);
          const classStartTime = hours * 60 + minutes;
          return classStartTime > currentTime;
        }
        return false;
      });

      // Check if there are any changes at all for today or tomorrow
      const hasAnyTodayChanges = upcomingTodayChanges.length > 0;
      const hasAnyTomorrowChanges = filteredTomorrowChanges.length > 0;
      
      // If no changes at all (neither today nor tomorrow), show unified message
      if (!hasAnyTodayChanges && !hasAnyTomorrowChanges) {
        const emptyState = this.createEmptyState('Nincs aktív teremmódosításod!');
        container.appendChild(emptyState);
      } else {
        // Today's upcoming section
        if (hasAnyTodayChanges) {
          const todaySection = await this.createDaySection('Ma', upcomingTodayChanges, today);
          container.appendChild(todaySection);
        }

        // Tomorrow's section
        if (hasAnyTomorrowChanges) {
          const tomorrowSection = await this.createDaySection('Holnap', filteredTomorrowChanges, tomorrow);
          container.appendChild(tomorrowSection);
        }
      }
    }
  }
  
  getDayName(date) {
    const days = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${days[date.getDay()]} (${month}/${day})`;
  }

  // Helper function to get day name in Hungarian format for storage keys
  getDayNameForStorage(date) {
    const dayNames = ['HETFO', 'KEDD', 'SZERDA', 'CSUTORTOK', 'PENTEK'];
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      return dayNames[dayOfWeek - 1];
    }
    return null;
  }

  // Helper function to check if an hour should be ignored
  async isHourIgnored(dayName, classNumber) {
    const ignoredHours = await storage.getIgnoredHours();
    if (!dayName) return false;
    const dayIgnored = ignoredHours[dayName] || [];
    return dayIgnored.includes(classNumber);
  }

  // Helper function to get offset time for a class on a specific day (synchronous version)
  getOffsetTimeSync(offsets, dayName, classNumber) {
    if (!dayName || !offsets) return null;
    const dayOffsets = offsets[dayName] || [];
    return dayOffsets.find(offset => offset.classNumbers.includes(classNumber));
  }

  getChangesForDate(changes, date) {
    // Build date string in local timezone (YYYY-MM-DD) to avoid UTC conversion issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    console.log(`Filtering changes for date: ${dateStr}`);
    
    return changes.filter(change => {
      // Check date - prefer specific date over date range
      let dateMatches = false;
      
      if (change.date) {
        // Use specific date from JSON parsing
        dateMatches = (change.date === dateStr);
        if (dateMatches) {
          console.log(`Match found for ${dateStr}:`, change.group, change.classNumber);
        }
      } else if (change.untilRevocation) {
        // Use date range: from start date indefinitely
        // Also check if the date matches the day of week
        const startDate = new Date(change.startDate);
        startDate.setHours(0, 0, 0, 0);
        
        if (date < startDate) {
          dateMatches = false;
        } else if (change.dayOfWeek) {
          // Check if the date matches the day of week
          const dayNameMap = {
            'HETFO': 1, // Monday
            'KEDD': 2,  // Tuesday
            'SZERDA': 3, // Wednesday
            'CSUTORTOK': 4, // Thursday
            'PENTEK': 5  // Friday
          };
          const targetDayOfWeek = dayNameMap[change.dayOfWeek];
          const actualDayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.
          dateMatches = (targetDayOfWeek === actualDayOfWeek);
        } else {
        dateMatches = (date >= startDate);
        }
      } else {
        // Use date range: from start to end
        const startDate = new Date(change.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(change.endDate);
        endDate.setHours(23, 59, 59, 999);
        
        dateMatches = (date >= startDate && date <= endDate);
      }
      
      return dateMatches;
    });
  }

  async createDaySection(title, changes, date = null) {
    const section = document.createElement('div');
    section.className = 'day-section';

    const header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = `<h3>${title}</h3>`;
    section.appendChild(header);

    // Collect unique notes from changes for this day
    const notesMap = new Map(); // key: note text, value: noteId
    changes.forEach(change => {
      if (change.notes && change.notes.trim()) {
        // Create a unique ID for this note based on date/dayOfWeek and note text
        // For untilRevocation changes, use dayOfWeek; for date range, use date
        const dateKey = change.date || (change.dayOfWeek ? `${change.startDate}_${change.dayOfWeek}` : change.startDate);
        const noteId = `${dateKey}_${change.notes.substring(0, 50).replace(/\s+/g, '_')}`;
        if (!notesMap.has(change.notes)) {
          notesMap.set(change.notes, noteId);
        }
      }
    });

    // Display notes if any, and they're not dismissed
    if (notesMap.size > 0) {
      const dismissedNotes = await storage.getDismissedNotes();
      
      for (const [noteText, noteId] of notesMap.entries()) {
        if (!dismissedNotes.includes(noteId)) {
          const noteElement = document.createElement('div');
          noteElement.className = 'day-note';
          noteElement.dataset.noteId = noteId;
          noteElement.innerHTML = `
            <div class="note-content">
              <span class="material-symbols-outlined note-icon">info</span>
              <span class="note-text">${noteText}</span>
            </div>
            <button class="note-close" aria-label="Megjegyzés bezárása">
              <span class="material-symbols-outlined">close</span>
            </button>
          `;
          
          const closeBtn = noteElement.querySelector('.note-close');
          closeBtn.addEventListener('click', async () => {
            await storage.addDismissedNote(noteId);
            noteElement.remove();
          });
          
          section.appendChild(noteElement);
        }
      }
    }

    // Sort changes by class number before displaying
    const sortedChanges = [...changes].sort((a, b) => {
      const classNumA = a.classNumber || 0;
      const classNumB = b.classNumber || 0;
      return classNumA - classNumB;
    });

    // Load offsets if date is provided
    let offsets = null;
    let dayName = null;
    if (date) {
      offsets = await storage.getHourOffsets();
      dayName = this.getDayNameForStorage(date);
    }

    sortedChanges.forEach(change => {
      const card = this.createChangeCard(change, offsets, dayName);
      section.appendChild(card);
    });

    return section;
  }

  createChangeCard(change, offsets = null, dayName = null) {
    const card = document.createElement('div');
    card.className = 'class-change-card';

    // Check for offset time and display
    let timeStr = '';
    let displayClassNumber = change.classNumber.toString();
    if (offsets && dayName) {
      const offset = this.getOffsetTimeSync(offsets, dayName, change.classNumber);
      if (offset) {
        timeStr = `${offset.startTime} - ${offset.endTime}`;
        // Use displayAs for the class number if available
        if (offset.displayAs) {
          displayClassNumber = offset.displayAs;
        }
      }
    }
    
    // Fallback to default class time
    if (!timeStr) {
      const classTime = CLASS_TIMES.find(ct => ct.number === change.classNumber);
      timeStr = classTime ? `${classTime.start} - ${classTime.end}` : '';
    }

    // Build room change text
    let roomChangeText = '';
    if (change.originalRoom && change.originalRoom !== 'Ismeretlen') {
      roomChangeText = `Terem: ${change.originalRoom} → `;
    }
    roomChangeText += `Terem: ${change.newRoom || 'Ismeretlen'}`;

    card.innerHTML = `
      <div class="class-change-header">
        <span class="class-change-time">${displayClassNumber}. óra</span>
        <span style="font-size: 14px; color: var(--md-sys-color-on-surface-variant);">${timeStr}</span>
      </div>
      <div class="class-change-details">
        <p><span class="teacher">${change.teacher || 'Ismeretlen tanár'}</span></p>
        <p class="room-change">${roomChangeText}</p>
        ${change.group ? `<p style="font-size: 14px; color: var(--md-sys-color-on-surface-variant);">Csoport: ${change.group}</p>` : ''}
        ${change.subject && change.subject !== 'Ismeretlen' ? `<p style="font-size: 14px; color: var(--md-sys-color-on-surface-variant);">${change.subject}</p>` : ''}
      </div>
    `;

    return card;
  }

  createEmptyState(message) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `
      <span class="material-symbols-outlined">celebration</span>
      <p>${message}</p>
    `;
    return div;
  }

  showSnackbar(message, type = 'success') {
    // Remove existing snackbar if any
    const existingSnackbar = document.querySelector('.snackbar');
    if (existingSnackbar) {
      existingSnackbar.remove();
    }

    const snackbar = document.createElement('div');
    snackbar.className = `snackbar snackbar-${type}`;
    snackbar.innerHTML = `
      <div class="snackbar-content">
        <span class="material-symbols-outlined snackbar-icon">${type === 'success' ? 'check_circle' : 'error'}</span>
        <span class="snackbar-message">${message}</span>
      </div>
    `;

    document.body.appendChild(snackbar);

    // Trigger animation
    setTimeout(() => {
      snackbar.classList.add('show');
    }, 10);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      snackbar.classList.remove('show');
      setTimeout(() => {
        snackbar.remove();
      }, 300);
    }, 3000);
  }

  async loadCachedData() {
    try {
      const cachedData = await storage.getCachedJSONData();
      if (cachedData) {
        const parsed = jsonParser.parseJSONData(cachedData);
        // Clear existing changes and replace with cached ones
        await storage.saveClassroomChanges(parsed.changes);
        // Add new groups to ALL_CLASSES (merge with existing, no duplicates)
        parsed.groups.forEach(group => {
          if (!ALL_CLASSES.includes(group)) {
            ALL_CLASSES.push(group);
          }
        });
        ALL_CLASSES.sort();
        
        // Save merged groups to storage
        await storage.saveAllGroups(ALL_CLASSES);
        
        // Extract and save teachers from changes
        await updateClassesAndTeachersFromChanges();
        
        console.log('Loaded cached data');
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  }

  // Silent refresh without UI feedback (for auto-refresh on startup)
  async silentRefresh() {
    try {
      // Check internet connection
      if (!navigator.onLine) {
        console.log('[App] No internet connection for silent refresh');
        return;
      }
      
      // Fetch JSON data
      const jsonData = await jsonParser.fetchJSON();
      
      // Parse JSON data
      const parsed = jsonParser.parseJSONData(jsonData);
      
      // Clear old cache and save new cached JSON data
      await storage.clearCache();
      await storage.saveCachedJSONData(jsonData);
      
      // Clear existing changes and replace with new ones
      await storage.saveClassroomChanges(parsed.changes);
      
      // Add new groups to ALL_CLASSES (merge with existing, no duplicates)
      parsed.groups.forEach(group => {
        if (!ALL_CLASSES.includes(group)) {
          ALL_CLASSES.push(group);
        }
      });
      ALL_CLASSES.sort();
      
      // Save merged groups to storage
      await storage.saveAllGroups(ALL_CLASSES);
      
      // Extract and save teachers from changes
      await updateClassesAndTeachersFromChanges();
      
      // Reload views
      await this.loadRoomChangesList();
      await this.loadDailySummary();
      
      // Update notifications
      notificationManager.scheduleNotification();
      
      console.log('[App] Silent refresh completed successfully');
    } catch (error) {
      console.error('[App] Silent refresh error:', error);
      // Silently fail, don't show error to user
      throw error;
    }
  }

  async handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    const icon = refreshBtn.querySelector('.material-symbols-outlined');
    
    // Disable button and show loading state
    refreshBtn.disabled = true;
    if (icon) {
      icon.textContent = 'sync';
      icon.style.animation = 'spin 1s linear infinite';
    }
    
    try {
      // Fetch JSON data
      const jsonData = await jsonParser.fetchJSON();
      
      // Parse JSON data
      const parsed = jsonParser.parseJSONData(jsonData);
      
      // Clear old cache and save new cached JSON data
      await storage.clearCache();
      await storage.saveCachedJSONData(jsonData);
      
      // Clear existing changes and replace with new ones
      await storage.saveClassroomChanges(parsed.changes);
      
      // Add new groups to ALL_CLASSES (merge with existing, no duplicates)
      parsed.groups.forEach(group => {
        if (!ALL_CLASSES.includes(group)) {
          ALL_CLASSES.push(group);
        }
      });
      ALL_CLASSES.sort();
      
      // Save merged groups to storage
      await storage.saveAllGroups(ALL_CLASSES);
      
      // Extract and save teachers from changes
      await updateClassesAndTeachersFromChanges();
      
      this.showSnackbar('Teremváltozások sikeresen frissítve!', 'success');
      
      // Reload views
      await this.loadRoomChangesList();
      await this.loadDailySummary();
      
      // Update notifications
      notificationManager.scheduleNotification();
    } catch (error) {
      console.error('Refresh error:', error);
      this.showSnackbar('Hiba történt a frissítés során: ' + error.message, 'error');
      
      // Try to load cached data if fetch failed
      await this.loadCachedData();
    } finally {
      refreshBtn.disabled = false;
      if (icon) {
        icon.textContent = 'refresh';
        icon.style.animation = '';
      }
    }
  }

  async loadRoomChangesList() {
    const changes = await storage.getClassroomChanges();
    const list = document.getElementById('pdfList'); // Keep same ID for now

    // Group changes by source
    const changesBySource = {};
    changes.forEach(change => {
      const sourceId = change.sourceId || 'unknown';
      if (!changesBySource[sourceId]) {
        changesBySource[sourceId] = {
          alias: change.sourceAlias || sourceId,
          changes: [],
          startDate: change.startDate,
          endDate: change.endDate,
          untilRevocation: change.untilRevocation
        };
      }
      changesBySource[sourceId].changes.push(change);
    });

    if (Object.keys(changesBySource).length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined">event_busy</span>
          <p>Még nincs teremváltozás</p>
          <p style="font-size: 14px; margin-top: 8px; color: var(--md-sys-color-on-surface-variant);">
            Kattints a frissítés gombra a legfrissebb adatok letöltéséhez
          </p>
        </div>
      `;
      return;
    }

    list.innerHTML = '';

    // Show last update time
    const lastUpdate = await storage.getLastUpdateTime();
    if (lastUpdate) {
      const updateInfo = document.createElement('div');
      updateInfo.className = 'update-info';
      updateInfo.style.cssText = 'padding: 12px; margin-bottom: 16px; background: var(--md-sys-color-surface-variant); border-radius: 8px; font-size: 14px; color: var(--md-sys-color-on-surface-variant);';
      updateInfo.innerHTML = `
        <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 8px;">schedule</span>
        Utolsó frissítés: ${lastUpdate.toLocaleString('hu-HU')}
      `;
      list.appendChild(updateInfo);
    }

    // Display each source
    Object.entries(changesBySource).forEach(([sourceId, sourceData]) => {
      const item = document.createElement('div');
      item.className = 'pdf-item'; // Keep same class for styling

      const dateRange = sourceData.untilRevocation 
        ? 'Visszavonásig érvényes'
        : sourceData.endDate
        ? `${new Date(sourceData.startDate).toLocaleDateString('hu-HU')} - ${new Date(sourceData.endDate).toLocaleDateString('hu-HU')}`
        : `${new Date(sourceData.startDate).toLocaleDateString('hu-HU')} -`;

      item.innerHTML = `
        <div class="pdf-info">
          <div class="pdf-name">${sourceData.alias}</div>
          <div class="pdf-date">${dateRange}</div>
          <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-top: 4px;">
            ${sourceData.changes.length} teremváltozás
          </div>
        </div>
        <button class="btn-secondary pdf-details-btn" style="margin-top: 8px;" data-source-id="${sourceId}">
          <span class="material-symbols-outlined">visibility</span>
          Részletek
        </button>
      `;

      // Add click event to show details
      const detailsBtn = item.querySelector('button[data-source-id]');
      detailsBtn.addEventListener('click', () => {
        this.hapticFeedback('light');
        this.showRoomChangesDetails(sourceId, sourceData);
      });

      list.appendChild(item);
    });
  }

  async showRoomChangesDetails(sourceId, sourceData) {
    const modal = document.getElementById('roomChangesDetailsModal');
    const title = document.getElementById('roomChangesDetailsTitle');
    const body = document.getElementById('roomChangesDetailsList');
    const filterInput = document.getElementById('roomChangesClassFilter');
    
    // Set title
    title.textContent = sourceData.alias;
    
    // Extract unique classes from this source's changes
    const uniqueClasses = new Set();
    sourceData.changes.forEach(change => {
      if (change.group) {
        uniqueClasses.add(change.group);
      }
    });
    const availableClasses = Array.from(uniqueClasses).sort();
    
    // Store current filter
    let currentFilter = '';
    
    // Render function
    const renderChanges = (filter = '') => {
      currentFilter = filter.toLowerCase();
      const filteredChanges = sourceData.changes.filter(change => {
        if (!currentFilter) return true;
        return change.group && change.group.toLowerCase().includes(currentFilter);
      });
      
      // Group by day
      const changesByDay = {};
      filteredChanges.forEach(change => {
        let dayKey = change.dayName || change.dayOfWeek || change.date || 'Ismeretlen nap';
        
        // Normalize day names to Hungarian format
        const dayNameMap = {
          'HETFO': 'Hétfő',
          'KEDD': 'Kedd',
          'SZERDA': 'Szerda',
          'CSUTORTOK': 'Csütörtök',
          'PENTEK': 'Péntek',
          'HÉTFŐ': 'Hétfő',
          'KEDD': 'Kedd',
          'SZERDA': 'Szerda',
          'CSÜTÖRTÖK': 'Csütörtök',
          'PÉNTEK': 'Péntek'
        };
        
        if (dayNameMap[dayKey]) {
          dayKey = dayNameMap[dayKey];
        }
        
        if (!changesByDay[dayKey]) {
          changesByDay[dayKey] = [];
        }
        changesByDay[dayKey].push(change);
      });
      
      // Sort days - Hungarian day names
      const dayOrder = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek'];
      const sortedDays = Object.keys(changesByDay).sort((a, b) => {
        const aIndex = dayOrder.indexOf(a);
        const bIndex = dayOrder.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        // If it's a date string, sort by date
        if (a.match(/^\d{4}-\d{2}-\d{2}$/) && b.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return a.localeCompare(b);
        }
        return a.localeCompare(b);
      });
      
      body.innerHTML = '';
      
      if (filteredChanges.length === 0) {
        body.innerHTML = `
          <div class="empty-state" style="padding: 32px; text-align: center;">
            <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.6;">filter_alt_off</span>
            <p style="margin-top: 16px; color: var(--md-sys-color-on-surface-variant);">Nincs találat a szűréshez</p>
          </div>
        `;
        return;
      }
      
      sortedDays.forEach(dayName => {
        const dayChanges = changesByDay[dayName];
        dayChanges.sort((a, b) => (a.classNumber || 0) - (b.classNumber || 0));
        
        const daySection = document.createElement('div');
        daySection.style.marginBottom = '24px';
        daySection.style.padding = '16px';
        daySection.style.background = 'var(--md-sys-color-surface-variant)';
        daySection.style.borderRadius = '12px';
        
        const dayHeader = document.createElement('h3');
        dayHeader.textContent = dayName;
        dayHeader.style.marginBottom = '12px';
        dayHeader.style.fontSize = '18px';
        dayHeader.style.fontWeight = '500';
        dayHeader.style.color = 'var(--md-sys-color-on-surface)';
        daySection.appendChild(dayHeader);
        
        dayChanges.forEach(change => {
          const changeCard = document.createElement('div');
          changeCard.style.padding = '12px';
          changeCard.style.marginBottom = '8px';
          changeCard.style.background = 'var(--md-sys-color-surface)';
          changeCard.style.borderRadius = '8px';
          changeCard.style.border = '1px solid var(--md-sys-color-outline-variant)';
          
          const classTime = CLASS_TIMES.find(ct => ct.number === change.classNumber);
          const timeStr = classTime ? `${classTime.start} - ${classTime.end}` : '';
          
          changeCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 16px; color: var(--md-sys-color-on-surface);">
                  ${change.classNumber}. óra
                </div>
                ${timeStr ? `<div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-top: 2px;">${timeStr}</div>` : ''}
              </div>
            </div>
            <div style="font-size: 14px; color: var(--md-sys-color-on-surface); margin-bottom: 4px;">
              <strong>Tanár:</strong> ${change.teacher || 'Ismeretlen tanár'}
            </div>
            <div style="font-size: 14px; color: var(--md-sys-color-on-surface); margin-bottom: 4px;">
              <strong>Csoport:</strong> ${change.group || 'Ismeretlen'}
            </div>
            <div style="font-size: 14px; color: var(--md-sys-color-on-surface);">
              <strong>Új terem:</strong> ${change.newRoom || 'Ismeretlen'}
            </div>
          `;
          
          daySection.appendChild(changeCard);
        });
        
        body.appendChild(daySection);
      });
    };
    
    // Initial render
    renderChanges();
    
    // Remove old event listeners if they exist
    if (this.roomChangesDetailsModalHandlers) {
      filterInput.removeEventListener('input', this.roomChangesDetailsModalHandlers.filterHandler);
      document.getElementById('closeRoomChangesDetailsModal').removeEventListener('click', this.roomChangesDetailsModalHandlers.closeModal);
      document.getElementById('roomChangesDetailsModalBackdrop').removeEventListener('click', this.roomChangesDetailsModalHandlers.closeModal);
      document.getElementById('closeRoomChangesDetailsBtn').removeEventListener('click', this.roomChangesDetailsModalHandlers.closeModal);
    }
    
    // Filter input event
    filterInput.value = '';
    const filterHandler = (e) => {
      renderChanges(e.target.value);
    };
    filterInput.addEventListener('input', filterHandler);
    
    // Close handlers
    const closeModal = () => {
      this.hapticFeedback('light');
      modal.classList.remove('active');
      filterInput.value = '';
      renderChanges(''); // Reset filter
    };
    
    document.getElementById('closeRoomChangesDetailsModal').addEventListener('click', closeModal);
    document.getElementById('roomChangesDetailsModalBackdrop').addEventListener('click', closeModal);
    document.getElementById('closeRoomChangesDetailsBtn').addEventListener('click', closeModal);
    
    // Store handlers for cleanup
    this.roomChangesDetailsModalHandlers = {
      filterHandler,
      closeModal
    };
    
    // Show modal
    modal.classList.add('active');
  }

  async loadSettings() {
    const notificationsEnabled = await storage.getNotificationsEnabled();
    document.getElementById('notificationToggle').checked = notificationsEnabled;

    const selectedClasses = await storage.getSelectedClasses();
    this.displaySelectedClasses(selectedClasses);
  }

  async toggleNotifications(enabled) {
    if (enabled) {
      try {
        // Request permissions first (before enabling in storage)
        console.log('[App] Requesting notification permissions...');
        const permissionGranted = await notificationManager.requestPermissions();
        
        if (permissionGranted) {
          // Only enable in storage after permission is granted
          await storage.setNotificationsEnabled(true);
          notificationManager.startAutoUpdate();
          notificationManager.setupClassStartListeners();
          this.showSnackbar('Értesítések engedélyezve', 'success');
        } else {
          // If permission denied, show message and keep toggle off
          this.showSnackbar('Értesítési engedély szükséges az értesítésekhez. Kérjük, adja meg a beállításokban!', 'error');
          document.getElementById('notificationToggle').checked = false;
        }
      } catch (error) {
        console.error('[App] Error requesting notification permissions:', error);
        this.showSnackbar('Hiba az értesítési engedély kérésénél: ' + error.message, 'error');
        document.getElementById('notificationToggle').checked = false;
      }
    } else {
      // Disable notifications
      await storage.setNotificationsEnabled(false);
      notificationManager.stopAutoUpdate();
      notificationManager.cancelNotification();
    }
  }

  async testNotification() {
    const testBtn = document.getElementById('testNotificationBtn');
    const originalText = testBtn.innerHTML;
    
    // Disable button
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Készítés...';
    
    try {
      // Debug: Skip permission check, just try to send test notification
      await notificationManager.sendTestNotification();
      
      this.showSnackbar('Teszt értesítés beütemezve 8 másodpercre. Zárja be az appot a teszteléshez!', 'success');
      
      // Re-enable button after a short delay
      setTimeout(() => {
        testBtn.disabled = false;
        testBtn.innerHTML = originalText;
      }, 2000);
    } catch (error) {
      console.error('Test notification error:', error);
      this.showSnackbar('Hiba történt: ' + error.message, 'error');
      testBtn.disabled = false;
      testBtn.innerHTML = originalText;
    }
  }

  async openClassSelector() {
    this.hapticFeedback('light');
    const modal = document.getElementById('classSelectorModal');
    const selectedClasses = await storage.getSelectedClasses();
    // Convert to uppercase to ensure consistency with stored data
    this.selectedClassesForSelector = selectedClasses.map(cls => cls.toUpperCase());
    
    modal.classList.add('active');
    document.getElementById('classSearch').value = '';
    this.renderClassList();
  }

  closeClassSelector() {
    this.hapticFeedback('light');
    document.getElementById('classSelectorModal').classList.remove('active');
  }

  renderClassList() {
    const list = document.getElementById('classList');
    const searchTerm = document.getElementById('classSearch').value.toLowerCase();
    const selectedClasses = this.selectedClassesForSelector || [];

    const filteredClasses = ALL_CLASSES.filter(cls => 
      cls.toLowerCase().includes(searchTerm)
    );

    list.innerHTML = '';

    filteredClasses.forEach(className => {
      const item = document.createElement('div');
      item.className = 'class-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `class-${className}`;
      // Compare in uppercase for consistency
      checkbox.checked = selectedClasses.map(cls => cls.toUpperCase()).includes(className.toUpperCase());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          // Find existing (case-insensitive) or add new
          const existingIndex = selectedClasses.findIndex(cls => cls.toUpperCase() === className.toUpperCase());
          if (existingIndex === -1) {
            selectedClasses.push(className); // className is already uppercase from ALL_CLASSES
          }
        } else {
          // Remove by case-insensitive comparison
          const index = selectedClasses.findIndex(cls => cls.toUpperCase() === className.toUpperCase());
          if (index > -1) {
            selectedClasses.splice(index, 1);
          }
        }
      });

      const label = document.createElement('label');
      label.htmlFor = `class-${className}`;
      label.textContent = className;

      item.appendChild(checkbox);
      item.appendChild(label);
      list.appendChild(item);
    });
  }

  filterClasses(searchTerm) {
    this.renderClassList();
  }

  async confirmClassSelection() {
    this.hapticFeedback('medium');
    // Convert to uppercase to ensure consistency
    const selectedClasses = (this.selectedClassesForSelector || []).map(cls => cls.toUpperCase());
    await storage.saveSelectedClasses(selectedClasses);
    this.displaySelectedClasses(selectedClasses);
    this.closeClassSelector();
    await this.loadDailySummary();
    // Reschedule notifications with new class selection
    await notificationManager.scheduleAllNotifications();
  }

  displaySelectedClasses(classes) {
    const container = document.getElementById('selectedClasses');
    
    if (classes.length === 0) {
      container.innerHTML = '<p class="no-classes">Nincs kiválasztott csoport</p>';
      return;
    }

    container.innerHTML = classes.map(cls => 
      `<span class="class-chip">${cls}</span>`
    ).join('');
  }

  // Haptic feedback helper
  async hapticFeedback(type = 'light') {
    try {
      // Check if haptic feedback is enabled
      const enabled = await storage.getHapticFeedbackEnabled();
      if (!enabled) {
        return;
      }

      // Try Capacitor Haptics plugin first (native)
      try {
        const { Haptics } = await import('@capacitor/haptics');
        if (Haptics) {
          // Map our types to Capacitor impact styles
          const impactStyles = {
            light: Haptics.ImpactStyle.Light,
            medium: Haptics.ImpactStyle.Medium,
            heavy: Haptics.ImpactStyle.Heavy
          };
          
          const impactStyle = impactStyles[type] || Haptics.ImpactStyle.Light;
          await Haptics.impact({ style: impactStyle });
          return;
        }
      } catch (e) {
        // Capacitor Haptics not available, fall back to web API
        console.log('Capacitor Haptics not available, using fallback:', e);
      }

      // Fallback to web Vibration API
      if (navigator.vibrate) {
        const patterns = {
          light: 10,
          medium: 20,
          heavy: 30
        };
        navigator.vibrate(patterns[type] || patterns.light);
      }
    } catch (e) {
      // Ignore errors
      console.log('Haptic feedback error:', e);
    }
  }

  // Hide splash screen
  async hideSplashScreen() {
    const splash = document.getElementById('splashScreen');
    const splashLogo = splash?.querySelector('.splash-logo');
    const navLogo = document.querySelector('.logo');
    
    if (splash && splashLogo && navLogo) {
      // Wait for fade-in and pulse animation to complete (1s fade-in + 1s pulse + 0.2s delay = ~2.2s)
      setTimeout(() => {
        // Calculate navbar logo position
        const navLogoRect = navLogo.getBoundingClientRect();
        const splashLogoRect = splashLogo.getBoundingClientRect();
        
        // Calculate the difference in position (center to center)
        const splashCenterX = splashLogoRect.left + splashLogoRect.width / 2;
        const splashCenterY = splashLogoRect.top + splashLogoRect.height / 2;
        const navCenterX = navLogoRect.left + navLogoRect.width / 2;
        const navCenterY = navLogoRect.top + navLogoRect.height / 2;
        
        const deltaX = navCenterX - splashCenterX;
        const deltaY = navCenterY - splashCenterY;
        const scaleFactor = 140 / 168; // Nav logo is 140px, splash logo is 168px
        
        // Ensure logo is visible before moving
        splashLogo.style.opacity = '1';
        
        // Move logo out of splash-content to body to ensure it's independent
        // This prevents any parent opacity/visibility issues
        document.body.appendChild(splashLogo);
        
        // Start moving the splash logo to navbar position
        splashLogo.classList.add('moving-to-nav');
        
        // Force reflow to ensure the class is applied
        void splashLogo.offsetHeight;
        
        // Apply transform to move logo to navbar position and scale it
        // The logo is fixed at center (50%, 50%) with translate(-50%, -50%)
        // We need to move it to the navbar position
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Calculate offset from center to target
        const offsetX = navCenterX - centerX;
        const offsetY = navCenterY - centerY;
        
        // Apply transform: start from center (-50%, -50%) and add offset
        // Use only scale, not width, to avoid conflicts
        const finalX = offsetX;
        const finalY = offsetY;
        
        // Set the final transform - this will be animated by CSS transition
        const finalTransform = `translate(calc(-50% + ${finalX}px), calc(-50% + ${finalY}px)) scale(${scaleFactor})`;
        
        // First set the initial position (current position) to ensure smooth transition
        const currentTransform = splashLogo.style.transform || 'translate(-50%, -50%) scale(1)';
        splashLogo.style.transform = currentTransform;
        
        // Force reflow
        void splashLogo.offsetHeight;
        
        // Now set the final transform - CSS transition will animate it
        splashLogo.style.transform = finalTransform;
        
        // Remove width transition from CSS since we're only using scale
        splashLogo.style.width = '';
        
        // Force another reflow to ensure transform is applied
        void splashLogo.offsetHeight;
        
        // Wait for splash logo animation to fully complete
        setTimeout(() => {
          // Ensure splash logo is at exact final position
          const finalTransform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scaleFactor})`;
          splashLogo.style.transform = finalTransform;
          splashLogo.style.transition = 'opacity 0.4s ease-out';
          
          // Force reflow
          void splashLogo.offsetHeight;
          
          // Logo has reached its position - NOW trigger the main content fade-in
          const header = document.querySelector('.app-header');
          const mainContent = document.querySelector('.main-content');
          const bottomNav = document.querySelector('.bottom-nav');
          
          if (header) header.classList.add('intro-complete');
          if (mainContent) mainContent.classList.add('intro-complete');
          if (bottomNav) bottomNav.classList.add('intro-complete');
          
          // Wait a moment for splash logo to be stable at position
          setTimeout(() => {
            // Show navbar logo behind splash logo
            navLogo.classList.add('visible');
            
            // Enable pointer events on splash screen background so user can interact
            // Logo is already in position, so we can allow clicks
            splash.style.pointerEvents = 'none';
            // Also disable pointer events on splash logo so it doesn't block clicks
            splashLogo.style.pointerEvents = 'none';
            
            // Wait for navbar logo to fully fade in, then fade out splash logo
            setTimeout(() => {
              splashLogo.style.opacity = '0';
            }, 700); // Wait for navbar logo fade-in (0.6s) + small buffer
          }, 300); // Wait 300ms for splash logo to settle
        }, 1200); // Wait for splash logo movement animation to complete (1.2s)
        
        // Fade out splash screen background only after logo has moved to position
        setTimeout(() => {
          splash.classList.add('fade-out');
        }, 3500); // After logo has moved to position (1200ms animation + 300ms settle) + extra delay for background
        
        // Wait for splash screen fade-out transition to complete before hiding
        setTimeout(() => {
          splash.style.display = 'none';
          // Remove logo from DOM completely
          if (splashLogo.parentNode) {
            splashLogo.parentNode.removeChild(splashLogo);
          }
        }, 4700); // After splash screen fade-out completes (3500ms start + 1200ms transition duration)
      },2200);
    }
    
    // Also handle OS splash screen if available
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      if (SplashScreen) {
        // Hide OS splash after our custom animation
        setTimeout(async () => {
          try {
            await SplashScreen.hide({
              fadeOutDuration: 300
            });
          } catch (e) {
            console.log('SplashScreen plugin not available:', e);
          }
        }, 2200);
      }
    } catch (e) {
      // SplashScreen plugin not available, that's okay
      console.log('SplashScreen import failed (expected on web):', e);
    }
  }

  // Teacher mode methods
  async toggleHapticFeedback(enabled) {
    // Don't use haptic feedback here to avoid infinite loop
    await storage.setHapticFeedbackEnabled(enabled);
  }

  async toggleTeacherMode(enabled) {
    this.hapticFeedback('light');
    await storage.setTeacherMode(enabled);
    const classesSection = document.getElementById('classesSection');
    const teachersSection = document.getElementById('teachersSection');
    
    if (enabled) {
      // Switch to teacher mode - hide class section, show teacher section
      classesSection.style.display = 'none';
      teachersSection.style.display = 'block';
      // Clear class selection to avoid conflicts
      await storage.saveSelectedClasses([]);
      this.displaySelectedClasses([]);
    } else {
      // Switch to class mode - show class section, hide teacher section
      classesSection.style.display = 'block';
      teachersSection.style.display = 'none';
      // Clear teacher selection to avoid conflicts
      await storage.saveSelectedTeachers([]);
      this.displaySelectedTeachers([]);
    }
    
    await this.loadSettings();
    await this.loadDailySummary();
    
    // Reschedule notifications with new mode
    await notificationManager.scheduleAllNotifications();
  }

  async openTeacherSelector() {
    this.hapticFeedback('light');
    const modal = document.getElementById('teacherSelectorModal');
    const selectedTeachers = await storage.getSelectedTeachers();
    this.selectedTeachersForSelector = [...selectedTeachers];
    
    modal.classList.add('active');
    document.getElementById('teacherSearch').value = '';
    this.renderTeacherList();
  }

  closeTeacherSelector() {
    this.hapticFeedback('light');
    document.getElementById('teacherSelectorModal').classList.remove('active');
  }

  renderTeacherList() {
    const list = document.getElementById('teacherList');
    const searchTerm = document.getElementById('teacherSearch').value.toLowerCase();
    const selectedTeachers = this.selectedTeachersForSelector || [];

    const filteredTeachers = ALL_TEACHERS.filter(teacher => 
      teacher.toLowerCase().includes(searchTerm)
    );

    list.innerHTML = '';

    filteredTeachers.forEach(teacherName => {
      const item = document.createElement('div');
      item.className = 'class-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `teacher-${teacherName}`;
      checkbox.checked = selectedTeachers.includes(teacherName);
      checkbox.addEventListener('change', () => {
        this.hapticFeedback('light');
        if (checkbox.checked) {
          if (!selectedTeachers.includes(teacherName)) {
            selectedTeachers.push(teacherName);
          }
        } else {
          const index = selectedTeachers.indexOf(teacherName);
          if (index > -1) {
            selectedTeachers.splice(index, 1);
          }
        }
      });

      const label = document.createElement('label');
      label.htmlFor = `teacher-${teacherName}`;
      label.textContent = teacherName;

      item.appendChild(checkbox);
      item.appendChild(label);
      list.appendChild(item);
    });
  }

  filterTeachers(searchTerm) {
    this.renderTeacherList();
  }

  async confirmTeacherSelection() {
    this.hapticFeedback('medium');
    const selectedTeachers = this.selectedTeachersForSelector || [];
    await storage.saveSelectedTeachers(selectedTeachers);
    this.displaySelectedTeachers(selectedTeachers);
    this.closeTeacherSelector();
    await this.loadDailySummary();
    // Reschedule notifications with new teacher selection
    await notificationManager.scheduleAllNotifications();
  }

  displaySelectedTeachers(teachers) {
    const container = document.getElementById('selectedTeachers');
    
    if (teachers.length === 0) {
      container.innerHTML = '<p class="no-classes">Nincs kiválasztott tanár</p>';
      return;
    }

    container.innerHTML = teachers.map(teacher => 
      `<span class="class-chip">${teacher}</span>`
    ).join('');
  }

  // Hour offsets management
  async openHourOffsetsManager() {
    this.hapticFeedback('light');
    const modal = document.getElementById('hourOffsetsModal');
    const offsets = await storage.getHourOffsets();
    const ignoredHours = await storage.getIgnoredHours();
    this.currentOffsets = JSON.parse(JSON.stringify(offsets)); // Deep copy
    this.currentIgnoredHours = JSON.parse(JSON.stringify(ignoredHours)); // Deep copy
    
    modal.classList.add('active');
    this.renderHourOffsetsManager();
  }

  closeHourOffsetsManager() {
    this.hapticFeedback('light');
    document.getElementById('hourOffsetsModal').classList.remove('active');
  }

  renderHourOffsetsManager() {
    const body = document.getElementById('hourOffsetsModalBody');
    const days = ['HETFO', 'KEDD', 'SZERDA', 'CSUTORTOK', 'PENTEK'];
    const dayNames = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek'];
    
    body.innerHTML = '';
    
    days.forEach((day, index) => {
      const daySection = document.createElement('div');
      daySection.className = 'hour-offset-day-section';
      daySection.style.marginBottom = '24px';
      daySection.style.padding = '16px';
      daySection.style.background = 'var(--md-sys-color-surface-variant)';
      daySection.style.borderRadius = '12px';
      daySection.style.boxSizing = 'border-box';
      
      const dayHeader = document.createElement('h3');
      dayHeader.textContent = dayNames[index];
      dayHeader.style.marginBottom = '16px';
      daySection.appendChild(dayHeader);
      
      const offsetsForDay = this.currentOffsets[day] || [];
      const offsetsContainer = document.createElement('div');
      offsetsContainer.id = `offsets-${day}`;
      
      offsetsForDay.forEach((offset, offsetIndex) => {
        const offsetItem = this.createOffsetItem(day, offsetIndex, offset);
        offsetsContainer.appendChild(offsetItem);
      });
      
      const addOffsetBtn = document.createElement('button');
      addOffsetBtn.className = 'btn-primary';
      addOffsetBtn.style.width = '100%';
      addOffsetBtn.style.marginTop = '12px';
      addOffsetBtn.innerHTML = '<span class="material-symbols-outlined">add</span> Új eltolás hozzáadása';
      addOffsetBtn.addEventListener('click', () => {
        this.hapticFeedback('light');
        this.addNewOffset(day);
      });
      
      daySection.appendChild(offsetsContainer);
      daySection.appendChild(addOffsetBtn);
      body.appendChild(daySection);
    });
    
    // Add ignored hours section
    const ignoredSection = document.createElement('div');
    ignoredSection.className = 'hour-offset-day-section';
    ignoredSection.style.marginTop = '24px';
    ignoredSection.style.padding = '16px';
    ignoredSection.style.background = 'var(--md-sys-color-surface-variant)';
    ignoredSection.style.borderRadius = '12px';
    
    const ignoredHeader = document.createElement('h3');
    ignoredHeader.textContent = 'Figyelmen kívül hagyott órák';
    ignoredHeader.style.marginBottom = '16px';
    ignoredSection.appendChild(ignoredHeader);
    
    const ignoredContainer = document.createElement('div');
    ignoredContainer.id = 'ignored-hours-container';
    this.renderIgnoredHours(ignoredContainer);
    ignoredSection.appendChild(ignoredContainer);
    
    body.appendChild(ignoredSection);
  }

  createOffsetItem(day, index, offset) {
    const item = document.createElement('div');
    item.className = 'offset-item';
    item.style.marginBottom = '16px';
    item.style.padding = '16px';
    item.style.background = 'var(--md-sys-color-surface)';
    item.style.borderRadius = '12px';
    item.style.border = '1px solid var(--md-sys-color-outline-variant)';
    
    const classNumbers = offset.classNumbers || [];
    const startTime = offset.startTime || '08:00';
    const endTime = offset.endTime || '08:40';
    const displayAs = offset.displayAs || classNumbers.join('-');
    
    // Get default class time for reference
    const defaultClass = CLASS_TIMES.find(ct => ct.number === classNumbers[0]);
    const defaultTime = defaultClass ? `${defaultClass.start} - ${defaultClass.end}` : '';
    
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: var(--md-sys-color-on-surface);">
            ${displayAs}. óra
          </div>
          ${defaultTime ? `<div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant);">Alapértelmezett: ${defaultTime}</div>` : ''}
        </div>
        <button class="btn-secondary" style="padding: 8px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; min-width: 40px; min-height: 40px;" data-day="${day}" data-index="${index}" onclick="app.removeOffset('${day}', ${index})">
          <span class="material-symbols-outlined" style="font-size: 20px; line-height: 1;">delete</span>
        </button>
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; color: var(--md-sys-color-on-surface);">Melyik órákra vonatkozik ez az eltolás?</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
            const checked = classNumbers.includes(num);
            return `
              <label style="display: inline-flex; align-items: center; padding: 8px 12px; background: ${checked ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-variant)'}; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 8px; cursor: pointer; user-select: none; transition: all 0.2s;">
                <input type="checkbox" class="offset-class-checkbox" data-day="${day}" data-index="${index}" data-class="${num}" ${checked ? 'checked' : ''} style="display: none;">
                <span style="font-weight: ${checked ? '600' : '400'}; color: ${checked ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)'};">${num}.</span>
              </label>
            `;
          }).join('')}
        </div>
        <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-top: 8px;">Válaszd ki, hogy melyik órákra vonatkozik ez az eltolás (pl. 8. és 9. óra együtt)</div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px;" class="offset-time-inputs-container">
        <div>
          <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; color: var(--md-sys-color-on-surface);">Kezdő időpont</label>
          <input type="time" class="offset-time-input" data-day="${day}" data-index="${index}" data-type="start" value="${startTime}" style="width: 100%; padding: 16px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 8px; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); font-size: 18px; min-height: 48px; -webkit-appearance: none; appearance: none;">
        </div>
        <div>
          <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; color: var(--md-sys-color-on-surface);">Végső időpont</label>
          <input type="time" class="offset-time-input" data-day="${day}" data-index="${index}" data-type="end" value="${endTime}" style="width: 100%; padding: 16px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 8px; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); font-size: 18px; min-height: 48px; -webkit-appearance: none; appearance: none;">
        </div>
      </div>
      
      <div>
        <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; color: var(--md-sys-color-on-surface);">Megjelenítési szám (pl. "8-9" vagy "8")</label>
        <input type="text" class="offset-display-input" data-day="${day}" data-index="${index}" value="${displayAs}" placeholder="8-9" style="width: 100%; padding: 12px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 8px; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); font-size: 16px;">
        <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-top: 4px;">Ez az érték jelenik meg a főoldalon az óra számaként (pl. "8-9. óra" vagy "8. óra")</div>
      </div>
    `;
    
    // Add event listeners for time inputs
    item.querySelectorAll('.offset-time-input').forEach(input => {
      input.addEventListener('change', (e) => {
        this.updateOffsetValue(day, index, e.target.dataset.type || 'display', e.target.value);
      });
    });
    
    // Add special listener for display input to auto-fill times
    const displayInput = item.querySelector('.offset-display-input');
    if (displayInput) {
      displayInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        // Check if it's a valid class number format (single number or range like "8-9")
        const singleMatch = value.match(/^(\d+)$/);
        const rangeMatch = value.match(/^(\d+)-(\d+)$/);
        
        if (singleMatch) {
          const classNum = parseInt(singleMatch[1]);
          if (classNum >= 1 && classNum <= 9) {
            const classTime = CLASS_TIMES.find(ct => ct.number === classNum);
            if (classTime) {
              const startInput = item.querySelector('.offset-time-input[data-type="start"]');
              const endInput = item.querySelector('.offset-time-input[data-type="end"]');
              if (startInput && endInput) {
                startInput.value = classTime.start;
                endInput.value = classTime.end;
                this.updateOffsetValue(day, index, 'start', classTime.start);
                this.updateOffsetValue(day, index, 'end', classTime.end);
              }
            }
          }
        } else if (rangeMatch) {
          const startClassNum = parseInt(rangeMatch[1]);
          const endClassNum = parseInt(rangeMatch[2]);
          if (startClassNum >= 1 && startClassNum <= 9 && endClassNum >= 1 && endClassNum <= 9 && startClassNum < endClassNum) {
            const startClassTime = CLASS_TIMES.find(ct => ct.number === startClassNum);
            const endClassTime = CLASS_TIMES.find(ct => ct.number === endClassNum);
            if (startClassTime && endClassTime) {
              const startInput = item.querySelector('.offset-time-input[data-type="start"]');
              const endInput = item.querySelector('.offset-time-input[data-type="end"]');
              if (startInput && endInput) {
                startInput.value = startClassTime.start;
                endInput.value = endClassTime.end;
                this.updateOffsetValue(day, index, 'start', startClassTime.start);
                this.updateOffsetValue(day, index, 'end', endClassTime.end);
              }
            }
          }
        }
      });
      
      displayInput.addEventListener('change', (e) => {
        this.updateOffsetValue(day, index, 'display', e.target.value);
      });
    }
    
    // Add event listeners for class checkboxes
    item.querySelectorAll('.offset-class-checkbox').forEach(checkbox => {
      const label = checkbox.parentElement;
      const classNum = parseInt(checkbox.dataset.class);
      
      // Handle checkbox change
      checkbox.addEventListener('change', (e) => {
        this.hapticFeedback('light');
        const offset = this.currentOffsets[day][index];
        if (!offset.classNumbers) {
          offset.classNumbers = [];
        }
        
        if (e.target.checked) {
          if (!offset.classNumbers.includes(classNum)) {
            offset.classNumbers.push(classNum);
          }
        } else {
          const idx = offset.classNumbers.indexOf(classNum);
          if (idx > -1) {
            offset.classNumbers.splice(idx, 1);
          }
        }
        
        // Update display
        label.style.background = e.target.checked ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-variant)';
        const span = label.querySelector('span');
        span.style.fontWeight = e.target.checked ? '600' : '400';
        span.style.color = e.target.checked ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)';
        
        // Auto-update displayAs if not manually set
        if (offset.classNumbers.length > 0) {
          offset.classNumbers.sort((a, b) => a - b);
          if (!offset.displayAs || offset.displayAs === offset.classNumbers.join('-')) {
            offset.displayAs = offset.classNumbers.length === 1 ? offset.classNumbers[0].toString() : offset.classNumbers.join('-');
            const displayInput = item.querySelector('.offset-display-input');
            if (displayInput) {
              displayInput.value = offset.displayAs;
            }
          }
        }
      });
      
      // Handle label click - make entire label clickable
      label.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    
    return item;
  }

  addNewOffset(day) {
    if (!this.currentOffsets[day]) {
      this.currentOffsets[day] = [];
    }
    
    // Find first available class number that's not already offset
    const existingOffsets = this.currentOffsets[day];
    const existingClassNumbers = new Set();
    existingOffsets.forEach(offset => {
      (offset.classNumbers || []).forEach(num => existingClassNumbers.add(num));
    });
    
    let newClassNumber = 1;
    for (let i = 1; i <= 9; i++) {
      if (!existingClassNumbers.has(i)) {
        newClassNumber = i;
        break;
      }
    }
    
    // Get default time for this class
    const defaultClass = CLASS_TIMES.find(ct => ct.number === newClassNumber);
    const defaultStart = defaultClass ? defaultClass.start : '08:00';
    const defaultEnd = defaultClass ? defaultClass.end : '08:40';
    
    this.currentOffsets[day].push({
      classNumbers: [newClassNumber],
      startTime: defaultStart,
      endTime: defaultEnd,
      displayAs: newClassNumber.toString()
    });
    
    this.renderHourOffsetsManager();
  }

  removeOffset(day, index) {
    this.hapticFeedback('medium');
    if (this.currentOffsets[day]) {
      this.currentOffsets[day].splice(index, 1);
      if (this.currentOffsets[day].length === 0) {
        delete this.currentOffsets[day];
      }
      this.renderHourOffsetsManager();
    }
  }

  updateOffsetValue(day, index, type, value) {
    if (!this.currentOffsets[day] || !this.currentOffsets[day][index]) return;
    
    const offset = this.currentOffsets[day][index];
    if (type === 'start') {
      offset.startTime = value;
    } else if (type === 'end') {
      offset.endTime = value;
    } else if (type === 'display') {
      offset.displayAs = value;
    }
  }

  renderIgnoredHours(container) {
    if (!this.currentIgnoredHours) {
      this.currentIgnoredHours = {};
    }
    const ignoredHours = this.currentIgnoredHours;
    const days = ['HETFO', 'KEDD', 'SZERDA', 'CSUTORTOK', 'PENTEK'];
    const dayNames = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek'];
    
    container.innerHTML = '';
    
    days.forEach((day, index) => {
      const dayItem = document.createElement('div');
      dayItem.style.marginBottom = '16px';
      
      const dayLabel = document.createElement('label');
      dayLabel.textContent = dayNames[index];
      dayLabel.style.display = 'block';
      dayLabel.style.marginBottom = '8px';
      dayLabel.style.fontWeight = '500';
      dayItem.appendChild(dayLabel);
      
      const hoursContainer = document.createElement('div');
      hoursContainer.style.display = 'flex';
      hoursContainer.style.flexWrap = 'wrap';
      hoursContainer.style.gap = '8px';
      
      for (let hour = 1; hour <= 9; hour++) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `ignored-${day}-${hour}`;
        checkbox.checked = (ignoredHours[day] || []).includes(hour);
        checkbox.addEventListener('change', () => {
          this.hapticFeedback('light');
          if (!ignoredHours[day]) {
            ignoredHours[day] = [];
          }
          if (checkbox.checked) {
            if (!ignoredHours[day].includes(hour)) {
              ignoredHours[day].push(hour);
            }
          } else {
            const idx = ignoredHours[day].indexOf(hour);
            if (idx > -1) {
              ignoredHours[day].splice(idx, 1);
            }
          }
          this.currentIgnoredHours = ignoredHours;
        });
        
        const label = document.createElement('label');
        label.htmlFor = `ignored-${day}-${hour}`;
        label.textContent = `${hour}.`;
        label.style.padding = '8px 12px';
        label.style.background = checkbox.checked ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface)';
        label.style.border = '1px solid var(--md-sys-color-outline-variant)';
        label.style.borderRadius = '8px';
        label.style.cursor = 'pointer';
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.justifyContent = 'center';
        label.style.userSelect = 'none';
        label.style.transition = 'all 0.2s';
        
        // Make entire label clickable
        label.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        checkbox.style.display = 'none';
        hoursContainer.appendChild(checkbox);
        hoursContainer.appendChild(label);
        
        checkbox.addEventListener('change', () => {
          label.style.background = checkbox.checked ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface)';
        });
      }
      
      dayItem.appendChild(hoursContainer);
      container.appendChild(dayItem);
    });
  }

  async saveHourOffsets() {
    this.hapticFeedback('medium');
    await storage.saveHourOffsets(this.currentOffsets);
    await storage.saveIgnoredHours(this.currentIgnoredHours || {});
    this.closeHourOffsetsManager();
    await this.loadDailySummary();
    // Reschedule notifications with new offsets
    await notificationManager.scheduleAllNotifications();
    this.showSnackbar('Óra eltolások mentve!', 'success');
  }

  async loadSettings() {
    const notificationsEnabled = await storage.getNotificationsEnabled();
    document.getElementById('notificationToggle').checked = notificationsEnabled;

    const hapticFeedbackEnabled = await storage.getHapticFeedbackEnabled();
    document.getElementById('hapticFeedbackToggle').checked = hapticFeedbackEnabled;

    const teacherMode = await storage.getTeacherMode();
    document.getElementById('teacherModeToggle').checked = teacherMode;
    
    const classesSection = document.getElementById('classesSection');
    const teachersSection = document.getElementById('teachersSection');
    
    if (teacherMode) {
      classesSection.style.display = 'none';
      teachersSection.style.display = 'block';
    } else {
      classesSection.style.display = 'block';
      teachersSection.style.display = 'none';
    }

    const selectedClasses = await storage.getSelectedClasses();
    // Convert to uppercase to ensure consistency
    const selectedClassesUpper = selectedClasses.map(cls => cls.toUpperCase());
    this.displaySelectedClasses(selectedClassesUpper);

    const selectedTeachers = await storage.getSelectedTeachers();
    this.displaySelectedTeachers(selectedTeachers);
  }

  // Year transition methods
  openYearTransitionModal() {
    const modal = document.getElementById('yearTransitionModal');
    modal.classList.add('active');
  }

  closeYearTransitionModal() {
    this.hapticFeedback('light');
    const modal = document.getElementById('yearTransitionModal');
    modal.classList.remove('active');
  }

  async confirmYearTransition() {
    this.hapticFeedback('heavy');
    const modal = document.getElementById('yearTransitionModal');
    const confirmBtn = document.getElementById('confirmYearTransitionBtn');
    
    // Disable button and show loading
    confirmBtn.disabled = true;
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span> Feldolgozás...';
    
    try {
      // Clear all data
      await storage.clearAllData();
      
      // Clear in-memory arrays
      ALL_CLASSES = [];
      ALL_TEACHERS = [];
      
      // Fetch and parse new data (same as refresh)
      const jsonData = await jsonParser.fetchJSON();
      const parsed = jsonParser.parseJSONData(jsonData);
      
      // Save new cached JSON data
      await storage.saveCachedJSONData(jsonData);
      
      // Save new changes
      await storage.saveClassroomChanges(parsed.changes);
      
      // Update classes and teachers (merge with existing, no duplicates)
      parsed.groups.forEach(group => {
        if (!ALL_CLASSES.includes(group)) {
          ALL_CLASSES.push(group);
        }
      });
      ALL_CLASSES.sort();
      
      // Save merged groups to storage
      await storage.saveAllGroups(ALL_CLASSES);
      
      await updateClassesAndTeachersFromChanges();
      
      // Reload views
      await this.loadRoomChangesList();
      await this.loadDailySummary();
      await this.loadSettings();
      
      // Update notifications
      await notificationManager.scheduleAllNotifications();
      
      // Close modal
      modal.classList.remove('active');
      
      this.showSnackbar('Évváltás sikeresen megtörtént!', 'success');
    } catch (error) {
      console.error('Year transition error:', error);
      this.showSnackbar('Hiba történt az évváltás során: ' + error.message, 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalText;
    }
  }

  // Add new class method
  addNewClass() {
    const input = document.getElementById('addClassInput');
    const className = input.value.trim().toUpperCase(); // Convert to uppercase
    
    if (!className) {
      this.showSnackbar('Kérjük, adj meg egy csoportnevet!', 'error');
      return;
    }
    
    // Check if class already exists (case-insensitive comparison)
    const existingClass = ALL_CLASSES.find(cls => cls.toUpperCase() === className);
    if (existingClass) {
      this.showSnackbar('Ez az csoport már létezik!', 'error');
      input.value = '';
      return;
    }
    
    // Add to ALL_CLASSES
    ALL_CLASSES.push(className);
    ALL_CLASSES.sort();
    
    // Save to storage
    storage.saveAllGroups(ALL_CLASSES).then(() => {
      // Clear input
      input.value = '';
      
      // Refresh class list in modal if it's open
      const modal = document.getElementById('classSelectorModal');
      if (modal && modal.classList.contains('active')) {
        this.renderClassList();
      }
      
      this.showSnackbar(`"${className}" csoport hozzáadva!`, 'success');
      this.hapticFeedback('light');
    }).catch(error => {
      console.error('Error saving new class:', error);
      this.showSnackbar('Hiba történt az csoport hozzáadása során', 'error');
    });
  }
}

// Hide splash screen as early as possible, even before DOM is ready
// This prevents white flash in dark mode
(async () => {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    if (SplashScreen) {
      try {
        await SplashScreen.hide({ fadeOutDuration: 0 });
      } catch (e) {
        // Ignore if already hidden or not available
      }
    }
  } catch (e) {
    // SplashScreen plugin not available, that's okay
  }
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});


