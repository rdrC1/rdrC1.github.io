// Storage manager with web compatibility
const STORAGE_KEYS = {
  PDFS: 'pdfs',
  CLASSROOM_CHANGES: 'classroom_changes',
  SELECTED_CLASSES: 'selected_classes',
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  THEME: 'theme',
  SHOW_ALL_FUTURE_CHANGES: 'show_all_future_changes',
  CACHED_JSON_DATA: 'cached_json_data',
  LAST_UPDATE_TIME: 'last_update_time',
  DISMISSED_NOTES: 'dismissed_notes',
  LAST_NOTIFICATION_SCHEDULE: 'last_notification_schedule',
  TEACHER_MODE: 'teacher_mode',
  SELECTED_TEACHERS: 'selected_teachers',
  ALL_TEACHERS: 'all_teachers',
  ALL_GROUPS: 'all_groups',
  HOUR_OFFSETS: 'hour_offsets',
  IGNORED_HOURS: 'ignored_hours',
  AMOLED_MODE: 'amoled_mode'
};

// Get Preferences API (web or native)
async function getPreferences() {
  // Try native Capacitor first
  try {
    const { Preferences } = await import('@capacitor/preferences');
    return Preferences;
  } catch (e) {
    // Fallback to web compatibility (localStorage)
    return {
      get: async ({ key }) => {
        const value = localStorage.getItem(key);
        return { value: value || null };
      },
      set: async ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      remove: async ({ key }) => {
        localStorage.removeItem(key);
      },
      clear: async () => {
        localStorage.clear();
      }
    };
  }
}

class StorageManager {
  constructor() {
    this.preferences = null;
  }

  async init() {
    if (!this.preferences) {
      this.preferences = await getPreferences();
    }
    return this.preferences;
  }

  async getPDFs() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.PDFS });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting PDFs:', error);
      return [];
    }
  }

  async savePDF(pdfData) {
    try {
      await this.init();
      const pdfs = await this.getPDFs();
      pdfs.push(pdfData);
      await this.preferences.set({ key: STORAGE_KEYS.PDFS, value: JSON.stringify(pdfs) });
      return true;
    } catch (error) {
      console.error('Error saving PDF:', error);
      return false;
    }
  }

  async deletePDF(pdfId) {
    try {
      await this.init();
      const pdfs = await this.getPDFs();
      const filtered = pdfs.filter(pdf => pdf.id !== pdfId);
      await this.preferences.set({ key: STORAGE_KEYS.PDFS, value: JSON.stringify(filtered) });
      
      // Also delete associated classroom changes
      const changes = await this.getClassroomChanges();
      const filteredChanges = changes.filter(change => change.pdfId !== pdfId);
      await this.preferences.set({ key: STORAGE_KEYS.CLASSROOM_CHANGES, value: JSON.stringify(filteredChanges) });
      
      return true;
    } catch (error) {
      console.error('Error deleting PDF:', error);
      return false;
    }
  }

  async getClassroomChanges() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.CLASSROOM_CHANGES });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting classroom changes:', error);
      return [];
    }
  }

  async saveClassroomChanges(changes) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.CLASSROOM_CHANGES, value: JSON.stringify(changes) });
      return true;
    } catch (error) {
      console.error('Error saving classroom changes:', error);
      return false;
    }
  }

  async addClassroomChanges(newChanges) {
    try {
      const existing = await this.getClassroomChanges();
      const combined = [...existing, ...newChanges];
      await this.saveClassroomChanges(combined);
      return true;
    } catch (error) {
      console.error('Error adding classroom changes:', error);
      return false;
    }
  }

  async getSelectedClasses() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.SELECTED_CLASSES });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting selected classes:', error);
      return [];
    }
  }

  async saveSelectedClasses(classes) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.SELECTED_CLASSES, value: JSON.stringify(classes) });
      return true;
    } catch (error) {
      console.error('Error saving selected classes:', error);
      return false;
    }
  }

  async getNotificationsEnabled() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.NOTIFICATIONS_ENABLED });
      return value === 'true';
    } catch (error) {
      console.error('Error getting notifications setting:', error);
      return false;
    }
  }

  async setNotificationsEnabled(enabled) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.NOTIFICATIONS_ENABLED, value: enabled.toString() });
      return true;
    } catch (error) {
      console.error('Error setting notifications:', error);
      return false;
    }
  }

  async getTheme() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.THEME });
      return value || 'light';
    } catch (error) {
      console.error('Error getting theme:', error);
      return 'light';
    }
  }

  async setTheme(theme) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.THEME, value: theme });
      return true;
    } catch (error) {
      console.error('Error setting theme:', error);
      return false;
    }
  }

  async getShowAllFutureChanges() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.SHOW_ALL_FUTURE_CHANGES });
      return value === 'true';
    } catch (error) {
      console.error('Error getting show all future changes:', error);
      return false;
    }
  }

  async setShowAllFutureChanges(show) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.SHOW_ALL_FUTURE_CHANGES, value: String(show) });
      return true;
    } catch (error) {
      console.error('Error setting show all future changes:', error);
      return false;
    }
  }

  async cleanupExpiredChanges() {
    try {
      const changes = await this.getClassroomChanges();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const activeChanges = changes.filter(change => {
        if (change.untilRevocation) {
          return true; // Keep until manually removed
        }
        
        const endDate = new Date(change.endDate);
        endDate.setHours(23, 59, 59, 999);
        
        return endDate >= today;
      });
      
      await this.saveClassroomChanges(activeChanges);
      return true;
    } catch (error) {
      console.error('Error cleaning up expired changes:', error);
      return false;
    }
  }

  async getCachedJSONData() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.CACHED_JSON_DATA });
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Error getting cached JSON data:', error);
      return null;
    }
  }

  async saveCachedJSONData(jsonData) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.CACHED_JSON_DATA, value: JSON.stringify(jsonData) });
      await this.preferences.set({ key: STORAGE_KEYS.LAST_UPDATE_TIME, value: new Date().toISOString() });
      return true;
    } catch (error) {
      console.error('Error saving cached JSON data:', error);
      return false;
    }
  }

  async getLastUpdateTime() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.LAST_UPDATE_TIME });
      return value ? new Date(value) : null;
    } catch (error) {
      console.error('Error getting last update time:', error);
      return null;
    }
  }

  async clearCache() {
    try {
      await this.init();
      await this.preferences.remove({ key: STORAGE_KEYS.CACHED_JSON_DATA });
      await this.preferences.remove({ key: STORAGE_KEYS.LAST_UPDATE_TIME });
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  async getDismissedNotes() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.DISMISSED_NOTES });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting dismissed notes:', error);
      return [];
    }
  }

  async addDismissedNote(noteId) {
    try {
      await this.init();
      const dismissed = await this.getDismissedNotes();
      if (!dismissed.includes(noteId)) {
        dismissed.push(noteId);
        await this.preferences.set({ key: STORAGE_KEYS.DISMISSED_NOTES, value: JSON.stringify(dismissed) });
      }
      return true;
    } catch (error) {
      console.error('Error adding dismissed note:', error);
      return false;
    }
  }

  async getLastNotificationSchedule() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.LAST_NOTIFICATION_SCHEDULE });
      return value ? parseInt(value, 10) : null;
    } catch (error) {
      console.error('Error getting last notification schedule:', error);
      return null;
    }
  }

  async setLastNotificationSchedule(timestamp) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.LAST_NOTIFICATION_SCHEDULE, value: timestamp.toString() });
      return true;
    } catch (error) {
      console.error('Error setting last notification schedule:', error);
      return false;
    }
  }

  async getTeacherMode() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.TEACHER_MODE });
      return value === 'true';
    } catch (error) {
      console.error('Error getting teacher mode:', error);
      return false;
    }
  }

  async setTeacherMode(enabled) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.TEACHER_MODE, value: enabled.toString() });
      return true;
    } catch (error) {
      console.error('Error setting teacher mode:', error);
      return false;
    }
  }

  async getSelectedTeachers() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.SELECTED_TEACHERS });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting selected teachers:', error);
      return [];
    }
  }

  async saveSelectedTeachers(teachers) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.SELECTED_TEACHERS, value: JSON.stringify(teachers) });
      return true;
    } catch (error) {
      console.error('Error saving selected teachers:', error);
      return false;
    }
  }

  async getAllTeachers() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.ALL_TEACHERS });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting all teachers:', error);
      return [];
    }
  }

  async saveAllTeachers(teachers) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.ALL_TEACHERS, value: JSON.stringify(teachers) });
      return true;
    } catch (error) {
      console.error('Error saving all teachers:', error);
      return false;
    }
  }

  async getAllGroups() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.ALL_GROUPS });
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error getting all groups:', error);
      return [];
    }
  }

  async saveAllGroups(groups) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.ALL_GROUPS, value: JSON.stringify(groups) });
      return true;
    } catch (error) {
      console.error('Error saving all groups:', error);
      return false;
    }
  }

  async getHourOffsets() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.HOUR_OFFSETS });
      return value ? JSON.parse(value) : {};
    } catch (error) {
      console.error('Error getting hour offsets:', error);
      return {};
    }
  }

  async saveHourOffsets(offsets) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.HOUR_OFFSETS, value: JSON.stringify(offsets) });
      return true;
    } catch (error) {
      console.error('Error saving hour offsets:', error);
      return false;
    }
  }

  async getIgnoredHours() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.IGNORED_HOURS });
      return value ? JSON.parse(value) : {};
    } catch (error) {
      console.error('Error getting ignored hours:', error);
      return {};
    }
  }

  async saveIgnoredHours(ignored) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.IGNORED_HOURS, value: JSON.stringify(ignored) });
      return true;
    } catch (error) {
      console.error('Error saving ignored hours:', error);
      return false;
    }
  }

  async getAmoledMode() {
    try {
      await this.init();
      const { value } = await this.preferences.get({ key: STORAGE_KEYS.AMOLED_MODE });
      return value === 'true';
    } catch (error) {
      console.error('Error getting AMOLED mode:', error);
      return false;
    }
  }

  async setAmoledMode(enabled) {
    try {
      await this.init();
      await this.preferences.set({ key: STORAGE_KEYS.AMOLED_MODE, value: enabled.toString() });
      return true;
    } catch (error) {
      console.error('Error setting AMOLED mode:', error);
      return false;
    }
  }

  // Clear all data related to classes, teachers, and classroom changes (for year transition)
  async clearAllData() {
    try {
      await this.init();
      // Clear classroom changes
      await this.preferences.remove({ key: STORAGE_KEYS.CLASSROOM_CHANGES });
      // Clear selected classes
      await this.preferences.remove({ key: STORAGE_KEYS.SELECTED_CLASSES });
      // Clear selected teachers
      await this.preferences.remove({ key: STORAGE_KEYS.SELECTED_TEACHERS });
      // Clear all groups
      await this.preferences.remove({ key: STORAGE_KEYS.ALL_GROUPS });
      // Clear all teachers
      await this.preferences.remove({ key: STORAGE_KEYS.ALL_TEACHERS });
      // Clear cached JSON data
      await this.preferences.remove({ key: STORAGE_KEYS.CACHED_JSON_DATA });
      // Clear last update time
      await this.preferences.remove({ key: STORAGE_KEYS.LAST_UPDATE_TIME });
      // Clear dismissed notes
      await this.preferences.remove({ key: STORAGE_KEYS.DISMISSED_NOTES });
      // Clear last notification schedule
      await this.preferences.remove({ key: STORAGE_KEYS.LAST_NOTIFICATION_SCHEDULE });
      return true;
    } catch (error) {
      console.error('Error clearing all data:', error);
      return false;
    }
  }
  
}

export const storage = new StorageManager();
