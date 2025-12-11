// JSON Parser for fetching and parsing room changes from API

class JSONParser {
  constructor() {
    this.apiUrl = 'https://api.npoint.io/a475e5f1848f718f3395';
    this.dayNameMap = {
      'HETFO': 'Hétfő',
      'KEDD': 'Kedd',
      'SZERDA': 'Szerda',
      'CSUTORTOK': 'Csütörtök',
      'PENTEK': 'Péntek'
    };
    
    this.dayNameToEnglish = {
      'HETFO': 'Monday',
      'KEDD': 'Tuesday',
      'SZERDA': 'Wednesday',
      'CSUTORTOK': 'Thursday',
      'PENTEK': 'Friday'
    };
  }

  // Parse class number string (e.g., "1.", "2.", "8-9.") to array of numbers
  parseClassNumber(oraSzama) {
    if (!oraSzama) return [];
    
    // Remove trailing dot
    const cleaned = oraSzama.replace(/\.$/, '').trim();
    
    // Check for range (e.g., "8-9")
    if (cleaned.includes('-')) {
      const [start, end] = cleaned.split('-').map(n => parseInt(n.trim()));
      const numbers = [];
      for (let i = start; i <= end; i++) {
        numbers.push(i);
      }
      return numbers;
    }
    
    // Single number
    const num = parseInt(cleaned);
    return isNaN(num) ? [] : [num];
  }

  // Parse date string (YYYY-MM-DD) to Date object in local timezone
  parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  // Get all dates for a specific day of week within a date range
  getDatesForDayOfWeek(dayOfWeek, startDate, endDate) {
    const dayIndex = ['HETFO', 'KEDD', 'SZERDA', 'CSUTORTOK', 'PENTEK'].indexOf(dayOfWeek);
    if (dayIndex === -1) return [];
    
    // dayIndex: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday
    // JavaScript getDay(): 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
    // Target day in JavaScript format: dayIndex + 1 (since Monday=1 in JS)
    const targetDayOfWeek = dayIndex + 1; // 1=Monday, 2=Tuesday, etc.
    
    // Parse dates in local timezone to avoid UTC issues
    const start = typeof startDate === 'string' ? this.parseLocalDate(startDate) : new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? (typeof endDate === 'string' ? this.parseLocalDate(endDate) : new Date(endDate)) : null;
    if (end) end.setHours(23, 59, 59, 999);
    
    const dates = [];
    const current = new Date(start);
    
    // Find first occurrence of the target day of week
    const currentDayOfWeek = current.getDay(); // 0=Sunday, 1=Monday, etc.
    
    // Calculate days to add to get to the target day
    let daysToAdd = targetDayOfWeek - currentDayOfWeek;
    if (daysToAdd < 0) {
      daysToAdd += 7; // Move to next week
    }
    
    current.setDate(start.getDate() + daysToAdd);
    
    // Verify the first date is correct and within range
    if (current < start) {
      current.setDate(current.getDate() + 7);
    }
    
    // Generate all occurrences within the range
    // For "until revocation", limit to reasonable future (max 6 months from today or 1 year from start, whichever is smaller)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const maxDate = end || (() => {
      const sixMonthsFromToday = new Date(today);
      sixMonthsFromToday.setMonth(sixMonthsFromToday.getMonth() + 6);
      const oneYearFromStart = new Date(start);
      oneYearFromStart.setFullYear(start.getFullYear() + 1);
      // Use the smaller of the two
      return sixMonthsFromToday < oneYearFromStart ? sixMonthsFromToday : oneYearFromStart;
    })();
    
    while (true) {
      if (current > maxDate) break;
      
      // Only generate dates that are today or in the future
      if (current < today) {
        current.setDate(current.getDate() + 7);
        continue;
      }
      
      // Double-check that the date is actually the correct day of week
      const actualDayOfWeek = current.getDay();
      if (actualDayOfWeek === targetDayOfWeek) {
        dates.push(new Date(current));
      } else {
        console.warn(`Date calculation error: expected day ${targetDayOfWeek}, got ${actualDayOfWeek} for date ${current.toISOString()}`);
      }
      
      current.setDate(current.getDate() + 7); // Next week
    }
    
    return dates;
  }

  // Convert JSON structure to internal format
  parseJSONData(jsonData) {
    const changes = [];
    const groups = new Set();
    
    // Iterate through each teremváltozás entry
    for (const [teremvaltozasKey, teremvaltozasData] of Object.entries(jsonData)) {
      if (!teremvaltozasData.metaData) continue;
      
      const metaData = teremvaltozasData.metaData;
      const startDate = metaData.startDate;
      const endDate = metaData.endDate === 'tillCancellation' ? null : metaData.endDate;
      const untilRevocation = metaData.endDate === 'tillCancellation';
      
      // Process each day
      const dayNames = ['HETFO', 'KEDD', 'SZERDA', 'CSUTORTOK', 'PENTEK'];
      
      for (const dayName of dayNames) {
        const dayData = teremvaltozasData[dayName];
        if (!dayData) continue;
        
        // Skip if only megjegyzesek (notes) without actual changes
        const hasChanges = Object.keys(dayData).some(key => 
          key !== 'megjegyzesek' && !isNaN(parseInt(key))
        );
        if (!hasChanges) continue;
        
        // Process each change entry for this day
        for (const [index, changeData] of Object.entries(dayData)) {
          // Skip megjegyzesek
          if (index === 'megjegyzesek') continue;
          
          if (!changeData.oraSzama || !changeData.erintettCsoport) continue;
          
          // Parse class numbers
          const classNumbers = this.parseClassNumber(changeData.oraSzama);
          
          // Split group name by space if it contains multiple groups (e.g., "9E11 9E12")
          // Convert to uppercase to handle typos (e.g., "9Ny116" -> "9NY116")
          const groupNames = changeData.erintettCsoport.trim().split(/\s+/).filter(g => g.length > 0).map(g => g.toUpperCase());
          
          // Add all groups to set
          groupNames.forEach(groupName => {
            groups.add(groupName);
          });
          
          // For each group and each class number, create a change entry
          for (const groupName of groupNames) {
            if (untilRevocation) {
              // For "until revocation", don't generate specific dates
              // Store only the day of week, dates will be calculated dynamically when displaying
              for (const classNumber of classNumbers) {
                changes.push({
                  id: `${teremvaltozasKey}_${dayName}_${index}_${classNumber}_${groupName}_${Date.now()}`,
                  sourceId: teremvaltozasKey,
                  sourceAlias: metaData.alias,
                  classNumber: classNumber,
                  teacher: changeData.oraTanar || null,
                  originalRoom: null, // Not available in JSON
                  newRoom: changeData.ujTerem || null,
                  subject: null, // Not available in JSON
                  group: groupName,
                  date: null, // Will be calculated dynamically
                  dayName: this.dayNameMap[dayName] || dayName,
                  dayOfWeek: dayName, // Store original day name for dynamic date calculation
                  startDate: startDate,
                  endDate: endDate,
                  untilRevocation: untilRevocation,
                  classes: null,
                  notes: dayData.megjegyzesek || null
                });
              }
            } else {
              // For date range, generate all dates
              const dates = this.getDatesForDayOfWeek(dayName, startDate, endDate);
              
              for (const date of dates) {
                // Format date as YYYY-MM-DD in local timezone
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                for (const classNumber of classNumbers) {
                  changes.push({
                    id: `${teremvaltozasKey}_${dayName}_${index}_${classNumber}_${groupName}_${dateStr}_${Date.now()}`,
                    sourceId: teremvaltozasKey,
                    sourceAlias: metaData.alias,
                    classNumber: classNumber,
                    teacher: changeData.oraTanar || null,
                    originalRoom: null, // Not available in JSON
                    newRoom: changeData.ujTerem || null,
                    subject: null, // Not available in JSON
                    group: groupName,
                    date: dateStr,
                    dayName: this.dayNameMap[dayName] || dayName,
                    startDate: startDate,
                    endDate: endDate,
                    untilRevocation: untilRevocation,
                    classes: null,
                    notes: dayData.megjegyzesek || null
                  });
                }
              }
            }
          }
        }
      }
    }
    
    return {
      changes: changes,
      groups: Array.from(groups)
    };
  }

  // Fetch JSON from API
  async fetchJSON() {
    try {
      const response = await fetch(this.apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonData = await response.json();
      return jsonData;
    } catch (error) {
      console.error('Error fetching JSON:', error);
      throw error;
    }
  }

  // Main method to fetch and parse
  async fetchAndParse() {
    const jsonData = await this.fetchJSON();
    return this.parseJSONData(jsonData);
  }
}

export const jsonParser = new JSONParser();

