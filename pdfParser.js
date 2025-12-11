// PDF Parser for extracting classroom change information
// Uses pdf.js for parsing PDF content

class PDFParser {
  constructor() {
    this.classTimes = [
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
    this.pdfjsLib = null;
  }

  async loadPDFJS() {
    if (this.pdfjsLib) {
      return this.pdfjsLib;
    }

    // Wait for PDF.js to load (loaded via script tag in index.html)
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50;
      
      const checkPDFJS = () => {
        if (window.pdfjsLib) {
          this.pdfjsLib = window.pdfjsLib;
          
          // Set worker source for version 2.6.347
          if (this.pdfjsLib.GlobalWorkerOptions) {
            this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js';
          }
          
          resolve(this.pdfjsLib);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkPDFJS, 100);
        } else {
          reject(new Error('PDF.js failed to load. Please refresh the page.'));
        }
      };
      
      // Start checking immediately
      checkPDFJS();
    });
  }

  async parsePDF(file) {
    try {
      // Load PDF.js library
      const pdfjsLib = await this.loadPDFJS();

      if (!pdfjsLib || !pdfjsLib.getDocument) {
        throw new Error('PDF.js library not available');
      }

      const arrayBuffer = await file.arrayBuffer();
      
      // Suppress PDF.js warnings (TT: undefined function is a common warning that can be ignored)
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        verbosity: 0 // Suppress warnings
      });
      
      const pdf = await loadingTask.promise;

      let fullText = '';

      // Extract text from all pages
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str || '').join(' ');
          fullText += pageText + '\n';
        } catch (pageError) {
          console.warn(`Error extracting text from page ${i}:`, pageError);
          // Continue with next page
        }
      }

      console.log('Extracted text length:', fullText.length);
      console.log('Extracted text preview:', fullText.substring(0, 500));

      if (!fullText || fullText.trim().length === 0) {
        console.warn('No text extracted from PDF');
        return [];
      }

      const changes = this.extractClassroomChanges(fullText);
      console.log('Extracted changes:', changes);
      
      return changes;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      // Return empty array instead of throwing to allow manual entry
      return [];
    }
  }

  extractClassroomChanges(text) {
    const changes = [];
    
    try {
      // Extract start date from header (e.g., "2025. november 7-től")
      const startDateInfo = this.extractStartDate(text);
      console.log('Start date info:', startDateInfo);
      
      // Find all table headers
      const headerPattern = /óra\s+csoport\s+tanár\s+hová/gi;
      const headers = [];
      let headerMatch;
      
      while ((headerMatch = headerPattern.exec(text)) !== null) {
        headers.push({
          index: headerMatch.index,
          end: headerMatch.index + headerMatch[0].length
        });
      }
      
      if (headers.length === 0) {
        console.warn('No table headers found');
        return [];
      }
      
      console.log(`Found ${headers.length} table(s)`);
      
      // Process each table
      for (let h = 0; h < headers.length; h++) {
        const tableStart = headers[h].end;
        
        // Find the day name before this table
        const dayInfo = this.findDayBeforeTable(text, headers[h].index, startDateInfo);
        console.log(`Table ${h + 1} day info:`, dayInfo);
        
        // Find where this table ends - look for next date pattern
        let tableEnd = text.length;
        if (h < headers.length - 1) {
          tableEnd = headers[h + 1].index;
        }
        
        // Find the next date that starts a new section (allow spaces in pattern and in month name)
        // Pattern: "2025. október 21." OR "2025 . október 21 ." OR "2025. novem ber 21."
        const datePattern = /\d{4}\s*\.\s*[a-záéíóöőúüű\s]+\d+\s*\./gi;
        datePattern.lastIndex = tableStart;
        const nextDate = datePattern.exec(text);
        
        if (nextDate && nextDate.index < tableEnd) {
          console.log(`Found date pattern "${nextDate[0]}" at position ${nextDate.index}, cutting table there`);
          tableEnd = nextDate.index;
        }
        
        let tableText = text.substring(tableStart, tableEnd);
        
        console.log(`Table ${h + 1} text length:`, tableText.length);
        console.log(`Table ${h + 1} preview:`, tableText.substring(0, 200));
        
        // Find all data rows by pattern: number(s). group teacher room
        // Match pattern: "1." or "1-2." followed by uppercase letter/number (start of group)
        const rowPattern = /(\d+(?:\s*[-–]\s*\d+)?)\.\s+([A-Z0-9]+)/g;
        const rowMatches = [];
        let rowMatch;
        
        while ((rowMatch = rowPattern.exec(tableText)) !== null) {
          rowMatches.push({
            index: rowMatch.index,
            fullMatch: rowMatch[0],
            classNumStr: rowMatch[1],
            groupStart: rowMatch[2]
          });
        }
        
        console.log(`Found ${rowMatches.length} potential rows in table ${h + 1}`);
        
        // Parse each row
        for (let i = 0; i < rowMatches.length; i++) {
          const rowStart = rowMatches[i].index;
          let rowEnd = i < rowMatches.length - 1 ? rowMatches[i + 1].index : tableText.length;
          
          let rowText = tableText.substring(rowStart, rowEnd).trim();
          
          // Additional check 1: stop at date pattern (in case table end detection missed it)
          // Pattern: "2025. október 21." or "2025 . október 21." or "2025. novem ber 21." (with spaces in month)
          // Allow spaces within the month name due to OCR errors
          const dateInRow = rowText.search(/\d{4}\s*\.\s*[a-záéíóöőúüű\s]+\d+\s*\./i);
          if (dateInRow > 0) {
            console.log('Trimming date at position', dateInRow, 'in row:', rowText.substring(0, 60));
            rowText = rowText.substring(0, dateInRow).trim();
          }
          
          // Additional check 2: stop at day names
          const dayInRow = rowText.search(/\s+(HÉTFŐ|KEDD|SZERDA|CSÜTÖRTÖK|PÉNTEK|SZOMBAT|VASÁRNAP)/i);
          if (dayInRow > 0) {
            console.log('Trimming day name at position', dayInRow);
            rowText = rowText.substring(0, dayInRow).trim();
          }
          
          // Additional check 3: stop at common markers of non-table text
          // These are words that appear after tables: "Délután", "Érettségi", "Notebook", "TEREMVÁLTOZÁS", etc.
          const afterTablePattern = rowText.search(/\s+(Délután|Érettségi|Notebook|Szünet|Megjegyzés|Jegyzet|TEREMVÁLTOZÁS|Nyílt\s+nap)/i);
          if (afterTablePattern > 20) { // Only if it's far from start
            console.log('Trimming after-table text at position', afterTablePattern);
            rowText = rowText.substring(0, afterTablePattern).trim();
          }
          
          // Additional check 3b: stop at partial date patterns like "november 6." without year
          // Pattern: "hónap szám." at the end (e.g., "november 6.")
          const partialDatePattern = rowText.search(/\s+[a-záéíóöőúüű]+\s+\d+\s*\.?\s*$/i);
          if (partialDatePattern > 30) { // Only if it's far from start
            console.log('Trimming partial date at position', partialDatePattern);
            rowText = rowText.substring(0, partialDatePattern).trim();
          }
          
          // Additional check 4: if row ends with pattern like "22 8. -" or "22   8. -" (start of "8.-9.")
          // Look for: room number, then ANY spaces, then 1-2 digit number, then ".", optional "-"
          // But make sure we're not trimming our own class number at the start
          const nextNumPattern = /\s+\d{1,2}\s*\.\s*[-–]?\s*$/;
          const nextNumMatch = rowText.match(nextNumPattern);
          if (nextNumMatch && nextNumMatch.index > 20) { // Only if it's far from start
            console.log('Trimming next class number at end:', nextNumMatch[0]);
            rowText = rowText.substring(0, nextNumMatch.index).trim();
          }
          
          const parsed = this.parseDataRow(rowText);
          if (parsed) {
            console.log(`Row ${i + 1}:`, parsed);
            
            const classNumbers = this.parseClassNumberString(parsed.classNumbersStr);
            
            classNumbers.forEach(classNum => {
              changes.push({
                classNumber: classNum,
                teacher: parsed.teacher,
                originalRoom: null,
                newRoom: parsed.newRoom,
                subject: null,
                group: parsed.group,
                date: dayInfo ? dayInfo.dateStr : null,
                dayName: dayInfo ? dayInfo.dayName : null,
                rawText: rowText.substring(0, 100)
              });
            });
          } else {
            console.warn(`Could not parse row (line too short or invalid format):`);
            console.warn(`  Full text: "${rowText.substring(0, 150)}"`);
          }
        }
      }
      
      // Safety check
      if (changes.length > 5000) {
        console.warn('Too many changes, stopping parsing');
      }
      
      // If no matches found with the main pattern, try alternative parsing
      if (changes.length === 0) {
        console.log('No changes found with standard parsing, trying alternative...');
        return this.alternativeParsing(text);
      }
      
      console.log('Found', changes.length, 'changes');
      
      // Print structured output for debugging
      console.log('\n=== STRUKTURÁLT TEREMVÁLTOZÁSOK ===\n');
      changes.forEach((change, index) => {
        console.log(`${index + 1}. VÁLTOZÁS:`);
        if (change.dayName || change.date) {
          console.log(`   Nap: ${change.dayName || 'Ismeretlen'} (${change.date || 'Nincs dátum'})`);
        }
        console.log(`   Óra: ${change.classNumber}`);
        console.log(`   Csoport: ${change.group}`);
        console.log(`   Tanár: ${change.teacher}`);
        console.log(`   Új terem: ${change.newRoom || '(nincs megadva)'}`);
        console.log('');
      });
      console.log('=== VÉG ===\n');
      
      return changes;
    } catch (error) {
      console.error('Error in extractClassroomChanges:', error);
      return [];
    }
  }

  parseHungarianDate(year, monthName, day) {
    const monthMap = {
      'január': 0, 'február': 1, 'március': 2, 'április': 3,
      'május': 4, 'június': 5, 'július': 6, 'augusztus': 7,
      'szeptember': 8, 'október': 9, 'november': 10, 'december': 11
    };
    
    const month = monthMap[monthName.toLowerCase()];
    if (month === undefined) {
      return null;
    }
    
    // Return date in YYYY-MM-DD format
    const date = new Date(year, month, parseInt(day));
    return date.toISOString().split('T')[0];
  }

  // Parse a single data row from the table
  // Example input: "1.   9E   Pethő Orsolya   5"
  // Returns: { classNumbersStr, group, teacher, newRoom } or null if parsing fails
  parseDataRow(line) {
    try {
      // Split by whitespace (spaces or tabs), keeping track of positions
      // Pattern: "number.  group  teacher  room"
      
      // First, extract the class number
      const classNumMatch = line.match(/^(\d+(?:\s*[-–]\s*\d+)?)\.\s+/);
      if (!classNumMatch) {
        console.warn('No class number found in row:', line.substring(0, 60));
        return null;
      }
      
      const classNumbersStr = classNumMatch[1].trim();
      const afterClassNum = line.substring(classNumMatch[0].length);
      
      // Split the rest by 2+ consecutive spaces or tabs
      const parts = afterClassNum.split(/[\s\t]{2,}/);
      
      if (parts.length < 2) {
        // Try splitting by single tab
        const tabParts = afterClassNum.split('\t');
        if (tabParts.length >= 3) {
          return {
            classNumbersStr: classNumbersStr,
            group: tabParts[0].trim(),
            teacher: tabParts[1].trim(),
            newRoom: tabParts.slice(2).join(' ').trim()
          };
        }
        console.warn('Not enough fields in row (need at least: class, group, teacher):', line.substring(0, 80));
        console.warn('  Parts found:', parts.length, '- Parts:', parts);
        return null;
      }
      
      let group = parts[0].trim();
      let teacher = parts[1].trim();
      let newRoom = parts.length > 2 ? parts.slice(2).join(' ').trim() : '';
      
      // Clean up newRoom: remove extra spaces, convert to null if empty
      if (newRoom) {
        newRoom = newRoom.replace(/\s+/g, ' ').trim(); // normalize whitespace
        if (newRoom.length === 0) {
          newRoom = null;
        }
      } else {
        newRoom = null;
      }
      
      // Fix: if group contains space, it probably captured too much
      // Group should be continuous without spaces (but can have dots, hyphens, etc.)
      const spaceInGroup = group.indexOf(' ');
      if (spaceInGroup > 0) {
        const groupParts = group.split(' ');
        // Check if the part after space is a number
        if (/^\d+$/.test(groupParts[1])) {
          // Check if teacher name looks broken (contains suspicious single space in middle, like "Viktó ria")
          const teacherLooksOK = !(/^[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]{1,3}\s[a-z]{1,3}$/.test(teacher.trim()));
          
          // If we have teacher and room data AND teacher looks OK, the number is likely part of the group name
          if (parts.length >= 3 && teacherLooksOK) {
            // We have enough data (group, teacher, room), so keep the number as part of group
            console.log('Group contains space+number but we have data - joining:', group, '→', group.replace(/\s+/g, ''));
            group = group.replace(/\s+/g, ''); // Remove all spaces from group
          } else if (!teacherLooksOK || !newRoom) {
            // Teacher looks broken OR no room - this row parsing is likely wrong, keep the number as part of group
            console.warn('Group space+number but data looks broken (teacher:', teacher, 'room:', newRoom, ') - keeping number in group');
            group = group.replace(/\s+/g, ''); // Keep the number, just remove space
          } else {
            // Not enough data, likely captured next row's class number
            console.warn('Group contains space followed by number (likely next row):', group);
            group = groupParts[0];
          }
        } else {
          // Non-numeric after space, move to teacher
          group = groupParts[0];
          teacher = groupParts.slice(1).join(' ') + ' ' + teacher;
        }
      }
      
      // Validate that group looks like a class code
      // Must start with uppercase or digit, can contain: letters, numbers, dots, hyphens, underscores, slashes
      // Examples: 9E, 10.A, 9-A, 9DNY12, 12NY116, 9EKNY2, 10ABCK13
      if (!/^[A-Z0-9][A-Z0-9.\-_/]*$/i.test(group)) {
        console.warn('Invalid group format:', group);
        return null;
      }
      
      // Validate that teacher looks like a name (starts with uppercase or "dr.")
      // Examples: "Nagy Péter", "dr. Nagy Péter", "Dr. Nagy Péter", "dr.Nagy Péter"
      if (!/^(dr\.?\s*)?[A-ZÁÉÍÓÖŐÚÜŰ]/i.test(teacher)) {
        console.warn('Invalid teacher format:', teacher);
        return null;
      }
      
      return {
        classNumbersStr,
        group,
        teacher,
        newRoom
      };
    } catch (error) {
      console.error('Error parsing row:', line, error);
      return null;
    }
  }

  parseClassNumberString(str) {
    const numbers = [];
    
    // Handle ranges: "1-2", "1 - 2", "1–2", "8.-9"
    // Remove dots first for easier parsing
    const cleanStr = str.replace(/\./g, '');
    const rangeMatch = cleanStr.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      for (let i = start; i <= end && i <= 9; i++) {
        numbers.push(i);
      }
      return numbers;
    }
    
    // Handle comma-separated: "1, 2, 3"
    const commaMatch = cleanStr.match(/\d+/g);
    if (commaMatch && commaMatch.length > 1) {
      commaMatch.forEach(numStr => {
        const num = parseInt(numStr);
        if (num >= 1 && num <= 9) {
          numbers.push(num);
        }
      });
      return numbers;
    }
    
    // Single number
    const singleMatch = cleanStr.match(/\d+/);
    if (singleMatch) {
      const num = parseInt(singleMatch[0]);
      if (num >= 1 && num <= 9) {
        numbers.push(num);
      }
    }
    
    return numbers;
  }

  extractTeacherNameFromLine(line) {
    // Look for capitalized words that might be names (2-4 words, starting with capital)
    // Exclude common words
    const namePattern = /\b([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+){1,3})\b/;
    const match = line.match(namePattern);
    
    if (match) {
      const name = match[1];
      if (!this.isCommonWord(name)) {
        return name;
      }
    }
    
    return null;
  }

  extractNewRoomFromLine(line) {
    // Look for room numbers or room names at the end of the line
    // Pattern: number or room name (like "Nivák 218", "aula", etc.)
    
    // Try to find room patterns: "Nivák 218", "33", "aula", "5", etc.
    const roomPatterns = [
      /Nivák\s+(\d+)/i,
      /(\d{1,3})(?:\s|$)/, // Simple number at end
      /(aula|servita|előadó)/i,
      /(\d+)\s*$/ // Number at the very end
    ];
    
    for (const pattern of roomPatterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    
    return null;
  }

  extractClassNumbers(line) {
    const numbers = [];
    
    // Pattern: "1. óra", "1-2. óra", "1,2,3. óra", "1 - 2"
    // Also handle variations with spaces: "1 - 2", "1 , 2"
    
    // Match single numbers: "1. óra", "1 óra", "1.óra"
    const singleMatch = line.match(/\b([1-9])\.?\s*óra/gi);
    if (singleMatch) {
      singleMatch.forEach(match => {
        const num = parseInt(match.match(/\d+/)[0]);
        if (num >= 1 && num <= 9) numbers.push(num);
      });
    }
    
    // Match ranges: "1-2", "1–2", "1 - 2", "1-2. óra", "1–2. óra"
    const rangeMatch = line.match(/\b([1-9])\s*[-–]\s*([1-9])\.?\s*óra?/gi);
    if (rangeMatch) {
      rangeMatch.forEach(match => {
        const nums = match.match(/\d+/g);
        if (nums && nums.length === 2) {
          const start = parseInt(nums[0]);
          const end = parseInt(nums[1]);
          for (let i = start; i <= end && i <= 9; i++) {
            numbers.push(i);
          }
        }
      });
    }
    
    // Match comma-separated: "1,2,3. óra", "1, 2, 3 óra", "1,2,3 óra"
    const commaMatch = line.match(/\b([1-9](?:\s*,\s*[1-9])+)\.?\s*óra?/gi);
    if (commaMatch) {
      commaMatch.forEach(match => {
        const nums = match.match(/\d+/g);
        if (nums) {
          nums.forEach(num => {
            const n = parseInt(num);
            if (n >= 1 && n <= 9) numbers.push(n);
          });
        }
      });
    }
    
    // Also try to find just numbers that might be class numbers (1-9)
    // This is a fallback if "óra" is missing
    if (numbers.length === 0) {
      const allNumbers = line.match(/\b([1-9])\b/g);
      if (allNumbers) {
        allNumbers.forEach(match => {
          const num = parseInt(match);
          if (num >= 1 && num <= 9 && !numbers.includes(num)) {
            numbers.push(num);
          }
        });
      }
    }
    
    return [...new Set(numbers)]; // Remove duplicates
  }

  extractTeacherName(lines, currentIndex) {
    // Look for teacher names in surrounding lines
    // Common patterns: Capitalized words, names with "né", etc.
    const searchRange = 3;
    const start = Math.max(0, currentIndex - searchRange);
    const end = Math.min(lines.length, currentIndex + searchRange);
    
    for (let i = start; i < end; i++) {
      const line = lines[i];
      // Look for capitalized words that might be names
      const nameMatch = line.match(/\b([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+)*)\b/);
      if (nameMatch && !this.isCommonWord(nameMatch[1])) {
        return nameMatch[1];
      }
    }
    
    return null;
  }

  isCommonWord(word) {
    const commonWords = ['ÓRA', 'TEREM', 'TANÁR', 'OSZTÁLY', 'TANÍTÓ', 'TANÍTÁS', 'MÓDOSÍTÁS'];
    return commonWords.includes(word.toUpperCase());
  }

  extractRoomInfo(line) {
    // Look for room patterns: "terem 12" -> "terem 15", "12. terem" -> "15. terem"
    // Also: "12-es terem" -> "15-ös terem"
    
    const roomPattern = /(\d+)[-\.]?\s*(?:es|os|\.)?\s*terem\s*(?:->|→|→|:|-|,)\s*(\d+)[-\.]?\s*(?:es|os|\.)?\s*terem/gi;
    const match = line.match(roomPattern);
    
    if (match) {
      const nums = line.match(/\d+/g);
      if (nums && nums.length >= 2) {
        return {
          from: nums[0],
          to: nums[1]
        };
      }
    }
    
    // Alternative pattern: just numbers that might be rooms
    const numberMatch = line.match(/\b(\d{2,3})\b.*?\b(\d{2,3})\b/);
    if (numberMatch) {
      return {
        from: numberMatch[1],
        to: numberMatch[2]
      };
    }
    
    return null;
  }

  extractSubject(line) {
    // Try to extract subject from common patterns
    const subjects = ['matematika', 'magyar', 'történelem', 'fizika', 'kémia', 'biológia', 'angol', 'német', 'informatika', 'testnevelés', 'rajz', 'zene'];
    
    const lowerLine = line.toLowerCase();
    for (const subject of subjects) {
      if (lowerLine.includes(subject)) {
        return subject.charAt(0).toUpperCase() + subject.slice(1);
      }
    }
    
    return null;
  }

  alternativeParsing(text) {
    // Fallback parsing if structured extraction fails
    const changes = [];
    
    // Look for any line with class numbers and try to extract information
    const lines = text.split('\n');
    
    for (const line of lines) {
      const classNums = this.extractClassNumbers(line);
      if (classNums.length > 0) {
        classNums.forEach(classNum => {
          changes.push({
            classNumber: classNum,
            teacher: 'Ismeretlen',
            originalRoom: 'Ismeretlen',
            newRoom: 'Ismeretlen',
            subject: 'Ismeretlen',
            rawText: line
          });
        });
      }
    }
    
    return changes;
  }

  extractStartDate(text) {
    // Look for patterns like:
    // "2025. november 7-től (péntektől) visszavonásig"
    // "2025. október 20." "HÉTFŐ"
    
    // Try pattern 1: "YYYY. hónap N-től (naptól)" - allow spaces in month name for OCR errors
    const pattern1 = /(\d{4})\s*\.\s*([a-záéíóöőúüű\s]+?)\s+(\d+)\s*-tő[l]/i;
    const match1 = text.match(pattern1);
    
    if (match1) {
      const year = parseInt(match1[1]);
      const monthName = match1[2].toLowerCase().replace(/\s+/g, ''); // Remove spaces from month
      const day = parseInt(match1[3]);
      
      // Extract day name from parentheses if present
      const dayNamePattern = /\(([a-záéíóöőúüű]+)[tő][l]\)/i;
      const dayMatch = text.match(dayNamePattern);
      let startDayName = null;
      
      if (dayMatch) {
        startDayName = this.normalizeHungarianDay(dayMatch[1]);
      }
      
      const month = this.hungarianMonthToNumber(monthName);
      
      return {
        year,
        month,
        day,
        startDayName,
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      };
    }
    
    // Try pattern 2: "YYYY. hónap N." - allow spaces in month name for OCR errors
    const pattern2 = /(\d{4})\s*\.\s*([a-záéíóöőúüű\s]+?)\s+(\d+)\s*\./i;
    const match2 = text.match(pattern2);
    
    if (match2) {
      const year = parseInt(match2[1]);
      const monthName = match2[2].toLowerCase().replace(/\s+/g, ''); // Remove spaces from month
      const day = parseInt(match2[3]);
      const month = this.hungarianMonthToNumber(monthName);
      
      return {
        year,
        month,
        day,
        startDayName: null,
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      };
    }
    
    console.warn('Could not extract start date from PDF');
    return null;
  }

  findDayBeforeTable(text, tableIndex, startDateInfo) {
    // Look backwards from the table to find the day name
    const beforeTable = text.substring(Math.max(0, tableIndex - 500), tableIndex);
    
    // Look for day names: HÉTFŐ, KEDD, SZERDA, CSÜTÖRTÖK, PÉNTEK, SZOMBAT, VASÁRNAP
    const dayPattern = /(HÉTFŐ|KEDD|SZERDA|CSÜTÖRTÖK|PÉNTEK|SZOMBAT|VASÁRNAP)/i;
    const matches = [];
    let match;
    const regex = new RegExp(dayPattern, 'gi');
    
    while ((match = regex.exec(beforeTable)) !== null) {
      matches.push({
        dayName: this.normalizeHungarianDay(match[1]),
        index: match.index
      });
    }
    
    if (matches.length === 0) {
      console.warn('No day name found before table');
      return null;
    }
    
    // Take the last (closest) match
    const lastMatch = matches[matches.length - 1];
    
    // NEW: Try to find an explicit date BEFORE the day name
    // Pattern: "2025. november 5." or "2025. november 5. SZERDA"
    const contextBefore = beforeTable.substring(Math.max(0, lastMatch.index - 100), lastMatch.index + 50);
    const explicitDatePattern = /(\d{4})\s*\.\s*([a-záéíóöőúüű\s]+?)\s+(\d{1,2})\s*\./i;
    const dateMatch = contextBefore.match(explicitDatePattern);
    
    if (dateMatch) {
      // We found an explicit date! Use it instead of calculating
      const year = parseInt(dateMatch[1]);
      const monthName = dateMatch[2].toLowerCase().replace(/\s+/g, ''); // Remove spaces
      const day = parseInt(dateMatch[3]);
      const month = this.hungarianMonthToNumber(monthName);
      
      if (month) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        console.log(`Found explicit date for ${lastMatch.dayName}: ${dateStr}`);
        return {
          dayName: lastMatch.dayName,
          dateStr
        };
      }
    }
    
    // Fallback: calculate the date based on start date
    if (!startDateInfo) {
      return {
        dayName: lastMatch.dayName,
        dateStr: null
      };
    }
    
    // Calculate the date for this day based on the start date
    const dateStr = this.calculateDateForDay(startDateInfo, lastMatch.dayName);
    console.log(`Calculated date for ${lastMatch.dayName}: ${dateStr} (no explicit date found)`);
    
    return {
      dayName: lastMatch.dayName,
      dateStr
    };
  }

  normalizeHungarianDay(day) {
    const dayMap = {
      'hétfő': 'HÉTFŐ',
      'hétfőtől': 'HÉTFŐ',
      'kedd': 'KEDD',
      'keddet': 'KEDD',
      'szerda': 'SZERDA',
      'szerdától': 'SZERDA',
      'csütörtök': 'CSÜTÖRTÖK',
      'csütörtöktől': 'CSÜTÖRTÖK',
      'péntek': 'PÉNTEK',
      'péntektől': 'PÉNTEK',
      'szombat': 'SZOMBAT',
      'szombattól': 'SZOMBAT',
      'vasárnap': 'VASÁRNAP',
      'vasárnaptól': 'VASÁRNAP'
    };
    
    return dayMap[day.toLowerCase()] || day.toUpperCase();
  }

  hungarianMonthToNumber(monthName) {
    const months = {
      'január': 1,
      'januá r': 1,
      'február': 2,
      'februá r': 2,
      'március': 3,
      'má rcius': 3,
      'április': 4,
      'á prilis': 4,
      'május': 5,
      'má jus': 5,
      'június': 6,
      'jú nius': 6,
      'július': 7,
      'jú lius': 7,
      'augusztus': 8,
      'szeptember': 9,
      'október': 10,
      'októ ber': 10,
      'november': 11,
      'novem ber': 11,
      'december': 12
    };
    
    return months[monthName.toLowerCase()] || 1;
  }

  calculateDateForDay(startDateInfo, targetDayName) {
    const dayOrder = ['HÉTFŐ', 'KEDD', 'SZERDA', 'CSÜTÖRTÖK', 'PÉNTEK', 'SZOMBAT', 'VASÁRNAP'];
    
    const startDate = new Date(startDateInfo.year, startDateInfo.month - 1, startDateInfo.day);
    const startDayOfWeek = startDate.getDay(); // 0 = vasárnap, 1 = hétfő, ...
    
    // Convert to our day order (0 = hétfő)
    const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    const startDayName = startDateInfo.startDayName || dayOrder[startDayIndex];
    
    const targetDayIndex = dayOrder.indexOf(targetDayName);
    const currentDayIndex = dayOrder.indexOf(startDayName);
    
    if (targetDayIndex === -1 || currentDayIndex === -1) {
      return startDateInfo.dateStr;
    }
    
    // Calculate days difference
    let daysDiff = targetDayIndex - currentDayIndex;
    if (daysDiff < 0) {
      daysDiff += 7; // Next week
    }
    
    const targetDate = new Date(startDate);
    targetDate.setDate(targetDate.getDate() + daysDiff);
    
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const day = targetDate.getDate();
    
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  getClassTime(classNumber) {
    return this.classTimes.find(ct => ct.number === classNumber) || null;
  }
}

export const pdfParser = new PDFParser();
