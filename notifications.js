import { storage } from './storage.js';

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

class NotificationManager {
  constructor() {
    this.localNotifications = null;
    this.isNative = false;
    this.channelCreated = false;
    this.isPWA = false;
    this.pushSubscription = null;
  }

  // Check if we're on native platform
  async checkNative() {
    try {
      if (typeof window !== 'undefined' && window.Capacitor) {
        const isNative = window.Capacitor.isNativePlatform();
        console.log('[Notifications] Capacitor check:', isNative);
        if (isNative) {
          this.isNative = true;
          return true;
        }
      }
      
      try {
        const CapacitorModule = await import('@capacitor/core');
        if (CapacitorModule && CapacitorModule.Capacitor) {
          const isNative = CapacitorModule.Capacitor.isNativePlatform();
          console.log('[Notifications] Capacitor import check:', isNative);
          if (isNative) {
            this.isNative = true;
            return true;
          }
        }
      } catch (e) {
        console.log('[Notifications] Capacitor import failed (expected on web):', e.message);
      }
      
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        if (LocalNotifications) {
          console.log('[Notifications] LocalNotifications loaded successfully - assuming native platform');
          this.isNative = true;
          return true;
        }
      } catch (e) {
        console.log('[Notifications] LocalNotifications import failed:', e.message);
      }
      
      this.isNative = false;
      return false;
    } catch (e) {
      console.error('[Notifications] Error in checkNative:', e);
      this.isNative = false;
      return false;
    }
  }

  async init() {
    if (!this.localNotifications) {
      try {
        console.log('[Notifications] Attempting to load LocalNotifications...');
        
        // Check if running as PWA
        this.isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                     (window.navigator.standalone === true) ||
                     document.referrer.includes('android-app://');
        
        if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
          const LocalNotifications = window.Capacitor.Plugins.LocalNotifications;
          if (LocalNotifications) {
            console.log('[Notifications] Found LocalNotifications via window.Capacitor.Plugins');
            this.localNotifications = LocalNotifications;
            this.isNative = true;
            await this.createNotificationChannel();
            return this.localNotifications;
          }
        }
        
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          if (LocalNotifications) {
            console.log('[Notifications] Loaded LocalNotifications via dynamic import');
            this.localNotifications = LocalNotifications;
            this.isNative = true;
            await this.createNotificationChannel();
            return this.localNotifications;
          }
        } catch (importError) {
          console.log('[Notifications] Dynamic import failed:', importError.message);
        }
        
        if (typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.getPlugin === 'function') {
          try {
            const LocalNotifications = window.Capacitor.getPlugin('LocalNotifications');
            if (LocalNotifications) {
              console.log('[Notifications] Found LocalNotifications via Capacitor.getPlugin');
              this.localNotifications = LocalNotifications;
              this.isNative = true;
              await this.createNotificationChannel();
              return this.localNotifications;
            }
          } catch (pluginError) {
            console.log('[Notifications] getPlugin failed:', pluginError.message);
          }
        }
        
        // Fallback to Web Notifications API for PWA
        if (this.isPWA && 'Notification' in window && 'serviceWorker' in navigator) {
          console.log('[Notifications] Using Web Notifications API for PWA');
          this.isNative = false;
          return 'web';
        }
        
        console.error('[Notifications] Could not load LocalNotifications - likely web platform');
        console.log('[Notifications] window.Capacitor:', typeof window !== 'undefined' ? window.Capacitor : 'undefined');
        this.isNative = false;
        return null;
      } catch (error) {
        console.error('[Notifications] Error in init():', error);
        this.isNative = false;
        return null;
      }
    }
    return this.localNotifications;
  }

  // Create notification channel with HIGH importance for heads-up notifications
  async createNotificationChannel() {
    if (this.channelCreated) {
      return; // Already created
    }

    try {
      if (!this.localNotifications) {
        console.log('[Notifications] LocalNotifications not available, skipping channel creation');
        return;
      }

      await this.localNotifications.createChannel({
        id: 'classroom-changes',
        name: 'Teremváltozások',
        description: 'Értesítések az órai teremváltozásokról',
        importance: 5, // MAX importance - heads-up notification!
        visibility: 1, // Public
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#488AFF'
      });

      this.channelCreated = true;
      console.log('[Notifications] Channel created successfully');
    } catch (error) {
      console.error('[Notifications] Error creating channel:', error);
    }
  }

  async checkPermissions() {
    try {
      const notifications = await this.init();
      
      // Web Notifications API for PWA
      if (notifications === 'web') {
        if ('Notification' in window) {
          return Notification.permission === 'granted';
        }
        return false;
      }
      
      if (!notifications) {
        return false;
      }

      const permResult = await notifications.checkPermissions();
      const isGranted = permResult?.display === 'granted';
      
      console.log('[Notifications] Check permissions result:', isGranted);
      return isGranted;
    } catch (error) {
      console.error('[Notifications] Error checking permissions:', error);
      return false;
    }
  }

  async requestPermissions() {
    try {
      const notifications = await this.init();
      
      // Web Notifications API for PWA
      if (notifications === 'web') {
        if ('Notification' in window) {
          if (Notification.permission === 'granted') {
            return true;
          }
          
          if (Notification.permission === 'denied') {
            return false;
          }
          
          const permission = await Notification.requestPermission();
          return permission === 'granted';
        }
        return false;
      }
      
      if (!notifications) {
        console.log('[Notifications] Not available (web platform)');
        return false;
      }

      console.log('[Notifications] Requesting permissions...');
      const permResult = await notifications.requestPermissions();
      
      console.log('[Notifications] Permission result:', JSON.stringify(permResult));
      
      const isGranted = permResult?.display === 'granted' || 
                       permResult?.display === 'yes' ||
                       permResult?.permission === 'granted' ||
                       permResult?.permission === 'yes';
      
      console.log('[Notifications] Is granted:', isGranted);
      
      return isGranted;
    } catch (error) {
      console.error('[Notifications] Error requesting permissions:', error);
      
      if (error.message && error.message.toLowerCase().includes('not enabled')) {
        console.log('[Notifications] Permission might not be granted, but error occurred');
        return false;
      }
      
      return false;
    }
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

  // Helper function to get offset time for a class on a specific day
  async getOffsetTime(dayName, classNumber) {
    if (!dayName) return null;
    const offsets = await storage.getHourOffsets();
    const dayOffsets = offsets[dayName] || [];
    return dayOffsets.find(offset => offset.classNumbers.includes(classNumber));
  }

  // Helper function to check if an hour should be ignored
  async isHourIgnored(dayName, classNumber) {
    if (!dayName) return false;
    const ignoredHours = await storage.getIgnoredHours();
    const dayIgnored = ignoredHours[dayName] || [];
    return dayIgnored.includes(classNumber);
  }

  getPreviousClassEndTime(classNumber, offset = null) {
    // If there's an offset, calculate based on offset start time
    if (offset && offset.startTime) {
      const [hours, minutes] = offset.startTime.split(':').map(Number);
      // Notification should be 10 minutes before the offset start time
      let notificationMinutes = minutes - 10;
      let notificationHours = hours;
      
      if (notificationMinutes < 0) {
        notificationMinutes += 60;
        notificationHours -= 1;
      }
      
      if (notificationHours < 0) {
        notificationHours += 24;
      }
      
      return { hours: notificationHours, minutes: notificationMinutes };
    }

    // Default behavior: use previous class end time
    if (classNumber === 1) {
      return { hours: 7, minutes: 50 };
    }

    const currentClass = CLASS_TIMES.find(ct => ct.number === classNumber);
    if (!currentClass) return null;

    const currentIndex = CLASS_TIMES.indexOf(currentClass);
    if (currentIndex === 0) return null;

    const previousClass = CLASS_TIMES[currentIndex - 1];
    const [hours, minutes] = previousClass.end.split(':').map(Number);
    return { hours, minutes };
  }

  getNotificationId(change) {
    const dateStr = change.date || `${change.startDate}_${change.dayOfWeek || ''}`;
    const idString = `${dateStr}_${change.classNumber}_${change.group || ''}_${change.newRoom || ''}`;
    
    let hash = 0;
    for (let i = 0; i < idString.length; i++) {
      const char = idString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash) + 10000;
  }

  async scheduleChangeNotification(change, targetDate) {
    const notifications = await this.init();
    
    // Web Notifications API for PWA
    if (notifications === 'web') {
      await this.scheduleWebNotification(change, targetDate);
      return;
    }
    
    if (!notifications) return;

    // Check if hour is ignored
    const dayName = this.getDayNameForStorage(targetDate);
    const isIgnored = await this.isHourIgnored(dayName, change.classNumber);
    if (isIgnored) {
      console.log(`[Notifications] Skipping notification for ignored hour ${change.classNumber} on ${dayName}`);
      return;
    }

    // Get offset time if exists
    const offset = await this.getOffsetTime(dayName, change.classNumber);
    const previousClassEnd = this.getPreviousClassEndTime(change.classNumber, offset);
    if (!previousClassEnd) return;

    const notificationDate = new Date(targetDate);
    notificationDate.setHours(previousClassEnd.hours, previousClassEnd.minutes, 0, 0);

    const now = new Date();
    if (notificationDate <= now) {
      return;
    }

    // Use offset time and display number for notification if available
    let displayTime = '';
    let displayClassNumber = change.classNumber.toString();
    
    if (offset) {
      displayTime = `${offset.startTime} - ${offset.endTime}`;
      // Use displayAs for the class number if available
      if (offset.displayAs) {
        displayClassNumber = offset.displayAs;
      }
    } else {
      const classTime = CLASS_TIMES.find(ct => ct.number === change.classNumber);
      if (classTime) {
        displayTime = `${classTime.start} - ${classTime.end}`;
      }
    }

    const title = `${displayClassNumber}. óra - Teremváltozás`;
    let body = `${change.group ? change.group + ' - ' : ''}${change.teacher || 'Ismeretlen tanár'} → Terem: ${change.newRoom || 'Ismeretlen'}`;
    if (displayTime) {
      body += ` (${displayTime})`;
    }

    const notificationId = this.getNotificationId(change);

    try {
      await notifications.schedule({
        notifications: [{
          id: notificationId,
          title: title,
          body: body,
          channelId: 'classroom-changes', // FONTOS: használd a channel-t!
          schedule: {
            at: notificationDate,
            repeats: false,
            allowWhileIdle: true
          },
          sound: 'default',
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#488AFF',
          extra: {
            changeId: change.id,
            classNumber: change.classNumber,
            date: targetDate.toISOString().split('T')[0]
          },
          ongoing: false,
          autoCancel: true
        }]
      });
      
      console.log(`[Notifications] Scheduled notification for ${change.classNumber}. óra on ${targetDate.toISOString().split('T')[0]} at ${previousClassEnd.hours}:${String(previousClassEnd.minutes).padStart(2, '0')}${offset ? ' (offset)' : ''}`);
    } catch (error) {
      console.error('[Notifications] Error scheduling notification:', error);
    }
  }

  async cancelAllNotifications() {
    try {
      const notifications = await this.init();
      
      // Cancel Service Worker notifications
      if (notifications === 'web' && 'serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.active.postMessage({
            type: 'CANCEL_ALL_NOTIFICATIONS'
          });
          console.log('[Notifications] All notifications cancelled via Service Worker');
        } catch (error) {
          console.error('[Notifications] Error canceling via Service Worker:', error);
        }
      }
      
      if (!notifications || notifications === 'web') {
        return;
      }

      const pending = await notifications.getPending();
      if (pending && pending.notifications && pending.notifications.length > 0) {
        const ids = pending.notifications.map(n => ({ id: n.id }));
        await notifications.cancel({ notifications: ids });
      }
    } catch (error) {
      console.error('[Notifications] Error canceling notifications:', error);
    }
  }

  async scheduleAllNotifications() {
    const notifications = await this.init();
    
    // Web Notifications API for PWA
    if (notifications === 'web') {
      const enabled = await storage.getNotificationsEnabled();
      if (!enabled) {
        return;
      }
      
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.error('[Notifications] Permission denied - cannot schedule notifications');
        return;
      }
      
      // Continue with web notification scheduling
    } else if (!notifications) {
      console.log('[Notifications] Not available - likely web platform');
      return;
    }

    const enabled = await storage.getNotificationsEnabled();
    if (!enabled) {
      await this.cancelAllNotifications();
      return;
    }

    // KRITIKUS: Ellenőrizd és kérd el a permissiont!
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.error('[Notifications] Permission denied - cannot schedule notifications');
      return;
    }

    if (notifications !== 'web') {
      await this.cancelAllNotifications();
    }

    const changes = await storage.getClassroomChanges();
    const selectedClasses = await storage.getSelectedClasses();
    const teacherMode = await storage.getTeacherMode();
    const selectedTeachers = await storage.getSelectedTeachers();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + dayOffset);

      const dayChanges = this.getChangesForDate(changes, targetDate);

      // Filter by teacher mode and ignored hours - COMPLETELY SEPARATE
      const dayName = this.getDayNameForStorage(targetDate);
      const filteredChanges = [];
      
      for (const change of dayChanges) {
        // Check teacher mode - COMPLETELY SEPARATE from class mode
        if (teacherMode) {
          // In teacher mode, ONLY show notifications for selected teachers
          // IGNORE class selection completely
          if (selectedTeachers.length > 0 && change.teacher) {
            if (!selectedTeachers.includes(change.teacher.trim())) {
              continue;
            }
          } else {
            // No teachers selected or no teacher in change - skip
            continue;
          }
        } else {
          // In class mode, ONLY show notifications for selected classes
          // IGNORE teacher selection completely
          if (selectedClasses.length > 0 && change.group) {
            // Convert both to uppercase for case-insensitive comparison
            const selectedClassesUpper = selectedClasses.map(cls => cls.toUpperCase());
            if (!selectedClassesUpper.includes(change.group.toUpperCase())) {
              continue;
            }
          } else {
            // No classes selected - skip
            continue;
          }
        }
        
        // Check if hour is ignored
        const isIgnored = await this.isHourIgnored(dayName, change.classNumber);
        if (isIgnored) {
          console.log(`[Notifications] Skipping ignored hour ${change.classNumber} on ${dayName}`);
          continue;
        }
        
        filteredChanges.push(change);
      }

      const scheduledChanges = new Set();
      for (const change of filteredChanges) {
        const changeKey = `${change.classNumber}_${change.group || ''}_${change.newRoom || ''}`;
        if (!scheduledChanges.has(changeKey)) {
          scheduledChanges.add(changeKey);
          await this.scheduleChangeNotification(change, targetDate);
        }
      }
    }

    console.log('[Notifications] All notifications scheduled successfully');
  }

  getChangesForDate(changes, date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    return changes.filter(change => {
      let dateMatches = false;

      if (change.date) {
        dateMatches = (change.date === dateStr);
      } else if (change.untilRevocation) {
        const startDate = new Date(change.startDate);
        startDate.setHours(0, 0, 0, 0);

        if (date < startDate) {
          dateMatches = false;
        } else if (change.dayOfWeek) {
          const dayNameMap = {
            'HETFO': 1,
            'KEDD': 2,
            'SZERDA': 3,
            'CSUTORTOK': 4,
            'PENTEK': 5
          };
          const targetDayOfWeek = dayNameMap[change.dayOfWeek];
          const actualDayOfWeek = date.getDay();
          dateMatches = (targetDayOfWeek === actualDayOfWeek);
        } else {
          dateMatches = (date >= startDate);
        }
      } else {
        const startDate = new Date(change.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(change.endDate);
        endDate.setHours(23, 59, 59, 999);

        dateMatches = (date >= startDate && date <= endDate);
      }

      return dateMatches;
    });
  }

  async scheduleNotification() {
    await this.scheduleAllNotifications();
  }

  async cancelNotification() {
    await this.cancelAllNotifications();
  }

  startAutoUpdate() {
    this.scheduleAllNotifications();
  }

  stopAutoUpdate() {
    this.cancelAllNotifications();
  }

  setupClassStartListeners() {
    // Not needed anymore - kept for compatibility
  }

  // Web Notification scheduling for PWA via Service Worker
  async scheduleWebNotification(change, targetDate) {
    if (!('Notification' in window)) {
      return;
    }
    
    if (Notification.permission !== 'granted') {
      return;
    }
    
    // Check if Service Worker is available
    if (!('serviceWorker' in navigator)) {
      console.warn('[Notifications] Service Worker not available, using fallback');
      await this.scheduleWebNotificationFallback(change, targetDate);
      return;
    }
    
    // Calculate notification time (10 minutes before class)
    const dayName = this.getDayNameForStorage(targetDate);
    const offset = await this.getOffsetTime(dayName, change.classNumber);
    const previousClassEnd = this.getPreviousClassEndTime(change.classNumber, offset);
    if (!previousClassEnd) return;
    
    const notificationDate = new Date(targetDate);
    notificationDate.setHours(previousClassEnd.hours, previousClassEnd.minutes, 0, 0);
    
    const now = new Date();
    if (notificationDate <= now) {
      return;
    }
    
    // Prepare notification data
    let displayTime = '';
    let displayClassNumber = change.classNumber.toString();
    
    if (offset) {
      displayTime = `${offset.startTime} - ${offset.endTime}`;
      if (offset.displayAs) {
        displayClassNumber = offset.displayAs;
      }
    } else {
      const classTime = CLASS_TIMES.find(ct => ct.number === change.classNumber);
      if (classTime) {
        displayTime = `${classTime.start} - ${classTime.end}`;
      }
    }
    
    const title = `${displayClassNumber}. óra - Teremváltozás`;
    let body = `${change.group ? change.group + ' - ' : ''}${change.teacher || 'Ismeretlen tanár'} → Terem: ${change.newRoom || 'Ismeretlen'}`;
    if (displayTime) {
      body += ` (${displayTime})`;
    }
    
    const notificationId = this.getNotificationId(change);
    const notificationTime = notificationDate.getTime();
    
    // Send to Service Worker for scheduling
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        notification: {
          id: notificationId,
          time: notificationTime,
          title: title,
          body: body,
          icon: '/logo.webp',
          badge: '/androidlogo.webp',
          tag: `room-change-${change.classNumber}`,
          requireInteraction: false,
          vibrate: [200, 100, 200],
          data: {
            changeId: change.id,
            classNumber: change.classNumber,
            date: targetDate.toISOString().split('T')[0]
          }
        }
      });
      
      console.log(`[Notifications] Notification scheduled via Service Worker for ${change.classNumber}. óra on ${targetDate.toISOString().split('T')[0]} at ${previousClassEnd.hours}:${String(previousClassEnd.minutes).padStart(2, '0')}`);
    } catch (error) {
      console.error('[Notifications] Error scheduling via Service Worker, using fallback:', error);
      await this.scheduleWebNotificationFallback(change, targetDate);
    }
  }
  
  // Fallback for when Service Worker is not available
  async scheduleWebNotificationFallback(change, targetDate) {
    const dayName = this.getDayNameForStorage(targetDate);
    const offset = await this.getOffsetTime(dayName, change.classNumber);
    const previousClassEnd = this.getPreviousClassEndTime(change.classNumber, offset);
    if (!previousClassEnd) return;
    
    const notificationDate = new Date(targetDate);
    notificationDate.setHours(previousClassEnd.hours, previousClassEnd.minutes, 0, 0);
    
    const now = new Date();
    if (notificationDate <= now) {
      return;
    }
    
    const delay = notificationDate.getTime() - now.getTime();
    
    // Use setTimeout as fallback (only works when app is active)
    setTimeout(() => {
      let displayTime = '';
      let displayClassNumber = change.classNumber.toString();
      
      if (offset) {
        displayTime = `${offset.startTime} - ${offset.endTime}`;
        if (offset.displayAs) {
          displayClassNumber = offset.displayAs;
        }
      } else {
        const classTime = CLASS_TIMES.find(ct => ct.number === change.classNumber);
        if (classTime) {
          displayTime = `${classTime.start} - ${classTime.end}`;
        }
      }
      
      const title = `${displayClassNumber}. óra - Teremváltozás`;
      let body = `${change.group ? change.group + ' - ' : ''}${change.teacher || 'Ismeretlen tanár'} → Terem: ${change.newRoom || 'Ismeretlen'}`;
      if (displayTime) {
        body += ` (${displayTime})`;
      }
      
      new Notification(title, {
        body: body,
        icon: '/logo.webp',
        badge: '/androidlogo.webp',
        tag: `room-change-${change.classNumber}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: {
          changeId: change.id,
          classNumber: change.classNumber,
          date: targetDate.toISOString().split('T')[0]
        }
      });
    }, delay);
  }

  async sendTestNotification() {
    console.log('[Notifications] Attempting to send test notification...');
    const notifications = await this.init();
    
    // Web Notifications API for PWA
    if (notifications === 'web') {
      if (!('Notification' in window)) {
        throw new Error('Értesítések nem támogatottak ezen a böngészőben.');
      }
      
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Nincs engedély értesítések küldésére.');
        }
      }
      
      const testDate = new Date();
      testDate.setSeconds(testDate.getSeconds() + 8);
      const testTime = testDate.getTime();
      
      const testClassNumber = Math.floor(Math.random() * 9) + 1;
      const testRooms = ['6', '18', 'fizikai', 'kémiai', 'biológiai', 'Nivák Zuse', 'könyvtár'];
      const testGroups = ['9D', '10E', '11B', '9D1', '10T1'];
      const testTeachers = ['Teszt Tanár', 'Macsinka Gábor', 'Bacsó Csaba', 'Veres Tibor'];
      
      const testRoom = testRooms[Math.floor(Math.random() * testRooms.length)];
      const testGroup = testGroups[Math.floor(Math.random() * testGroups.length)];
      const testTeacher = testTeachers[Math.floor(Math.random() * testTeachers.length)];
      
      const title = `${testClassNumber}. óra - Teremváltozás (TESZT)`;
      const body = `${testGroup} - ${testTeacher} → Terem: ${testRoom}`;
      
      // Try to schedule via Service Worker first
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.active.postMessage({
            type: 'SCHEDULE_NOTIFICATION',
            notification: {
              id: 99999,
              time: testTime,
              title: title,
              body: body,
              icon: '/logo.webp',
              badge: '/androidlogo.webp',
              tag: 'test-notification',
              requireInteraction: false,
              vibrate: [200, 100, 200],
              data: {
                test: true,
                classNumber: testClassNumber
              }
            }
          });
          console.log('[Notifications] Test notification scheduled via Service Worker');
          return;
        } catch (error) {
          console.error('[Notifications] Error scheduling via Service Worker, using fallback:', error);
        }
      }
      
      // Fallback to setTimeout (only works when app is active)
      setTimeout(() => {
        new Notification(title, {
          body: body,
          icon: '/logo.webp',
          badge: '/androidlogo.webp',
          tag: 'test-notification',
          requireInteraction: false,
          vibrate: [200, 100, 200]
        });
      }, 8000);
      
      return;
    }
    
    if (!notifications) {
      console.error('[Notifications] LocalNotifications not available');
      throw new Error('Értesítések csak natív platformon vagy PWA-ban működnek.');
    }
    
    console.log('[Notifications] LocalNotifications available, proceeding...');

    // KRITIKUS: Kérd el a permissiont teszt értesítéshez is!
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.error('[Notifications] Permission denied - cannot send test notification');
      throw new Error('Nincs engedély értesítések küldésére. Engedélyezd a beállításokban!');
    }

    const testDate = new Date();
    testDate.setSeconds(testDate.getSeconds() + 8);

    const testClassNumber = Math.floor(Math.random() * 9) + 1;
    const testRooms = ['6', '18', 'fizikai', 'kémiai', 'biológiai', 'Nivák Zuse', 'könyvtár'];
    const testGroups = ['9D', '10E', '11B', '9D1', '10T1'];
    const testTeachers = ['Teszt Tanár', 'Macsinka Gábor', 'Bacsó Csaba', 'Veres Tibor'];

    const testRoom = testRooms[Math.floor(Math.random() * testRooms.length)];
    const testGroup = testGroups[Math.floor(Math.random() * testGroups.length)];
    const testTeacher = testTeachers[Math.floor(Math.random() * testTeachers.length)];

    const title = `${testClassNumber}. óra - Teremváltozás (TESZT)`;
    const body = `${testGroup} - ${testTeacher} → Terem: ${testRoom}`;

    try {
      await notifications.schedule({
        notifications: [{
          id: 99999,
          title: title,
          body: body,
          channelId: 'classroom-changes', // FONTOS: használd a channel-t!
          schedule: {
            at: testDate,
            repeats: false,
            allowWhileIdle: true
          },
          sound: 'default',
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#488AFF',
          extra: {
            test: true,
            classNumber: testClassNumber
          },
          ongoing: false,
          autoCancel: true
        }]
      });
      
      console.log('[Notifications] Test notification scheduled successfully');
    } catch (error) {
      console.error('[Notifications] Error scheduling test notification:', error);
      throw error;
    }
  }
}

export const notificationManager = new NotificationManager();
