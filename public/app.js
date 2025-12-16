const API_KEY = 'rewizer_SecureKey_UserOnly_2025';
const API_BASE = 'https://87.106.151.120:43561/api'; // HTTPS for GitHub Pages compatibility


// State
let currentClass = null; // { id, name }
let currentSubject = null; // { id, name }

// Elements
const viewClasses = document.getElementById('view-classes');
const viewSubjects = document.getElementById('view-subjects');
const viewMaterials = document.getElementById('view-materials');
const viewReader = document.getElementById('view-reader');

const classesList = document.getElementById('classes-list');
const subjectsList = document.getElementById('subjects-list');
const materialsList = document.getElementById('materials-list');

const breadcrumbs = document.getElementById('breadcrumbs');
const currentPath = document.getElementById('current-path');
const homeBtn = document.getElementById('home-btn');

// --- Theme Logic ---
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

// --- Navigation ---
function showView(view) {
    [viewClasses, viewSubjects, viewMaterials, viewReader].forEach(v => {
        v.classList.add('hidden-view');
        v.classList.remove('active-view');
    });
    view.classList.remove('hidden-view');
    view.classList.add('active-view');
    updateBreadcrumbs();
}

function updateBreadcrumbs() {
    if (currentClass) {
        breadcrumbs.classList.remove('hidden');
        let pathHTML = `<span class="crumb" onclick="goToClass()">${currentClass.name}</span>`;
        if (currentSubject) {
            pathHTML += ` <span class="separator">/</span> <span class="crumb">${currentSubject.name}</span>`;
        }
        currentPath.innerHTML = pathHTML;
    } else {
        breadcrumbs.classList.add('hidden');
        currentPath.innerHTML = ''; // Clear content
    }
}

homeBtn.addEventListener('click', () => {
    loadClasses();
});

window.goToClass = () => {
    currentSubject = null;
    loadSubjects(currentClass.id, currentClass.name);
};

// --- API Helpers ---
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(API_BASE + endpoint, options);
    if (!res.ok) {
        const err = await res.json();
        showNotification(err.error || 'Hiba történt', true);
        throw new Error(err.error);
    }
    return res.json();
}

function showNotification(msg, isError = false) {
    const notif = document.getElementById('notification');
    notif.textContent = msg;
    notif.style.backgroundColor = isError ? '#e74c3c' : 'var(--accent-color)';
    notif.classList.add('show');
    setTimeout(() => notif.classList.remove('show'), 3000);
}

// --- Admin Logic ---
let isAdmin = false;
let geminiApiKey = localStorage.getItem('geminiApiKey') || '';
let currentMaterial = null; // Store for editing
let isEditing = false;
let editingMaterialId = null;

const adminLock = document.getElementById('admin-lock');
const adminModal = document.getElementById('admin-modal');
const adminForm = document.getElementById('admin-form');
const adminPassInput = document.getElementById('admin-password');
const geminiKeyInput = document.getElementById('gemini-api-key');
const closeModalBtn = document.getElementById('close-modal');
const editMaterialBtn = document.getElementById('edit-material-btn');

// Auto-login if credentials saved
(function autoLogin() {
    const savedPass = localStorage.getItem('adminPass');
    if (savedPass) {
        // Verify on server silently
        fetchAPI('/verify-admin', 'POST', { password: savedPass })
            .then(res => {
                if (res.success) {
                    isAdmin = true;
                    adminLock.classList.add('unlocked');
                    geminiApiKey = localStorage.getItem('geminiApiKey') || '';
                    updateAdminUI();
                }
            })
            .catch(() => {
                // Invalid saved password, clear
                localStorage.removeItem('adminPass');
            });
    }
})();

adminLock.addEventListener('click', () => {
    if (isAdmin) {
        // Logout
        isAdmin = false;
        adminLock.classList.remove('unlocked');
        showNotification('Kilépve a szerkesztő módból');
        updateAdminUI();
    } else {
        // Open Login - prefill API key if saved
        geminiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
        adminModal.classList.add('open');
        adminPassInput.focus();
    }
});

closeModalBtn.addEventListener('click', () => {
    adminModal.classList.remove('open');
});

adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = adminPassInput.value;
    const apiKey = geminiKeyInput.value.trim();

    try {
        const res = await fetchAPI('/verify-admin', 'POST', { password });
        if (res.success) {
            isAdmin = true;
            adminLock.classList.add('unlocked');
            adminModal.classList.remove('open');

            // Save to localStorage for next time
            localStorage.setItem('adminPass', password);
            if (apiKey) {
                localStorage.setItem('geminiApiKey', apiKey);
                geminiApiKey = apiKey;
            }

            adminPassInput.value = '';
            showNotification('Sikeres belépés! Adatok elmentve.');
            updateAdminUI();
        }
    } catch (err) {
        // notification handled by fetchAPI
    }
});

function updateAdminUI() {
    if (isAdmin) {
        editMaterialBtn.style.display = 'block';
    } else {
        editMaterialBtn.style.display = 'none';
    }
}

// --- Editing Logic ---
editMaterialBtn.addEventListener('click', () => {
    if (!currentMaterial) return;

    // Populate form with current material
    document.getElementById('new-material-title').value = currentMaterial.title;
    document.getElementById('new-material-content').value = currentMaterial.content;

    isEditing = true;
    editingMaterialId = currentMaterial.id;

    showView(viewMaterials);
    document.querySelector('#add-material-form').scrollIntoView({ behavior: 'smooth' });
});


// --- Deletion Logic ---
// --- Deletion Logic ---
const contextMenu = document.getElementById('context-menu');
const contextDeleteBtn = document.getElementById('context-delete-btn');
let deleteTarget = null; // { type, parentId, id }

// Hide context menu on click elsewhere (but NOT on the menu itself)
document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target)) {
        contextMenu.classList.add('hidden');
    }
});

// Global function called by inline onclick
window.confirmDelete = function () {
    console.log('confirmDelete called, target:', deleteTarget);
    contextMenu.classList.add('hidden');

    if (deleteTarget) {
        handleDelete(deleteTarget.type, deleteTarget.parentId, deleteTarget.id);
        deleteTarget = null;
    } else {
        console.error('No delete target!');
        showNotification('Hiba: nincs kiválasztva elem', true);
    }
};

function attachDeleteHandler(element, type, parentId, id) {
    // Desktop Right Click -> Custom Menu
    element.addEventListener('contextmenu', (e) => {
        // console.log('Right click detected on:', type, id);
        if (!isAdmin) return;

        e.preventDefault();
        e.stopPropagation();

        deleteTarget = { type, parentId, id };
        // console.log('Context menu target set:', deleteTarget);

        // Position menu
        const x = e.clientX;
        const y = e.clientY;

        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.remove('hidden');
    });

    // Mobile Long Press (Keep as is, direct delete confirm)
    let isTouching = false;
    let timer;
    element.addEventListener('touchstart', (e) => {
        isTouching = true;
        timer = setTimeout(() => {
            if (isTouching) {
                handleDelete(type, parentId, id);
                isTouching = false;
            }
        }, 800);
    });

    element.addEventListener('touchend', () => {
        isTouching = false;
        clearTimeout(timer);
    });

    element.addEventListener('touchmove', () => {
        isTouching = false;
        clearTimeout(timer);
    });
}

async function handleDelete(type, parentId, id) {
    console.log('handleDelete called for:', type, id);
    // Admin check again just in case
    if (!isAdmin) {
        showNotification('Törléshez jelentkezz be (Admin)!', true);
        return;
    }

    if (!confirm('Biztosan törölni szeretnéd ezt az elemet?')) {
        console.log('Deletion cancelled by user');
        return;
    }

    let endpoint = '';
    if (type === 'class') {
        endpoint = `/classes/${id}`;
    } else if (type === 'subject') {
        endpoint = `/classes/${parentId}/subjects/${id}`;
    } else if (type === 'material') {
        endpoint = `/subjects/${parentId}/materials/${id}`;
    }

    try {
        await fetchAPI(endpoint, 'DELETE');
        showNotification('Elem törölve!');

        // Refresh view
        if (type === 'class') loadClasses();
        else if (type === 'subject') loadSubjects(currentClass.id, currentClass.name);
        else if (type === 'material') loadMaterials(currentSubject.id, currentSubject.name);
    } catch (err) {
        // Notification handles error
    }
}


// --- Classes ---
async function loadClasses() {
    // Reset state when going back to classes
    currentClass = null;
    currentSubject = null;
    updateBreadcrumbs(); // Hide or update breadcrumbs

    const classes = await fetchAPI('/classes');
    classesList.innerHTML = '';
    classes.forEach(cls => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-title">${cls.name}</div>`;
        card.onclick = () => loadSubjects(cls.id, cls.name);
        // Attach Delete
        attachDeleteHandler(card, 'class', null, cls.id);
        classesList.appendChild(card);
    });

    showView(viewClasses);
}

document.getElementById('add-class-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-class-name');
    if (!input.value.trim()) return;

    await fetchAPI('/classes', 'POST', { name: input.value });
    input.value = '';
    showNotification('Osztály hozzáadva!');
    loadClasses();
});

// --- Subjects ---
async function loadSubjects(classId, className) {
    currentClass = { id: classId, name: className };
    const subjects = await fetchAPI(`/classes/${classId}/subjects`);

    document.getElementById('class-title').textContent = className;
    subjectsList.innerHTML = '';

    subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-title">${sub.name}</div>`;
        card.onclick = () => loadMaterials(sub.id, sub.name);
        // Attach Delete
        attachDeleteHandler(card, 'subject', classId, sub.id);
        subjectsList.appendChild(card);
    });

    showView(viewSubjects);
}

document.getElementById('add-subject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-subject-name');
    if (!input.value.trim()) return;

    await fetchAPI(`/classes/${currentClass.id}/subjects`, 'POST', { name: input.value });
    input.value = '';
    showNotification('Tantárgy hozzáadva!');
    loadSubjects(currentClass.id, currentClass.name);
});

// --- Materials ---
async function loadMaterials(subjectId, subjectName) {
    currentSubject = { id: subjectId, name: subjectName };
    const materials = await fetchAPI(`/subjects/${subjectId}/materials`);

    document.getElementById('subject-title').textContent = subjectName;
    materialsList.innerHTML = '';

    materials.forEach(mat => {
        const item = document.createElement('div');
        item.className = 'material-item';
        item.innerHTML = `<h3>${mat.title}</h3>`;
        item.onclick = () => openReader(mat);
        // Attach Delete
        attachDeleteHandler(item, 'material', subjectId, mat.id);
        materialsList.appendChild(item);
    });

    showView(viewMaterials);
}

document.getElementById('add-material-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('new-material-title');
    const contentInput = document.getElementById('new-material-content');

    if (!titleInput.value.trim() || !contentInput.value.trim()) return;

    if (isEditing && editingMaterialId) {
        // Update
        await fetchAPI(`/subjects/${currentSubject.id}/materials/${editingMaterialId}`, 'PUT', {
            title: titleInput.value,
            content: contentInput.value
        });
        showNotification('Tananyag frissítve!');
        isEditing = false;
        editingMaterialId = null;
    } else {
        // Create
        await fetchAPI(`/subjects/${currentSubject.id}/materials`, 'POST', {
            title: titleInput.value,
            content: contentInput.value
        });
        showNotification('Tananyag mentve!');
    }

    titleInput.value = '';
    contentInput.value = '';
    loadMaterials(currentSubject.id, currentSubject.name);
});

// --- Reader ---
// --- Reader ---
function openReader(material) {
    currentMaterial = material; // Save reference for editing
    document.getElementById('reader-title').textContent = material.title;
    document.getElementById('reader-date').textContent = new Date(material.timestamp).toLocaleDateString('hu-HU');

    updateAdminUI(); // Show/Hide edit button

    // Parse Markdown
    const htmlContent = parseMarkdown(material.content);

    document.getElementById('reader-content').innerHTML = htmlContent;
    showView(viewReader);
}

function parseMarkdown(text) {
    if (!text) return '';

    // Simple sanitization (very basic)
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // H2 (## Text)
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');

    // H3 (### Text) - fallback if AI uses 3 hashes
    html = html.replace(/^### (.*$)/gm, '<h2>$1</h2>');

    // Lists (- item)
    // Convert lines starting with "- " to list items, wrap in <ul> manually or via CSS
    // Here we just use a styled paragraph for simplicity or basic HTML list
    const lines = html.split('\n');
    let inList = false;
    let processedLines = [];

    for (let line of lines) {
        if (line.trim().startsWith('- ')) {
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            processedLines.push(`<li>${line.trim().substring(2)}</li>`);
        } else {
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            if (line.trim() === '') continue;
            if (line.startsWith('<h2>')) {
                processedLines.push(line);
            } else {
                processedLines.push(`<p>${line}</p>`);
            }
        }
    }
    if (inList) processedLines.push('</ul>');

    return processedLines.join('');
}

// --- Toolbar Logic ---
window.formatText = (type) => {
    const textarea = document.getElementById('new-material-content');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (type) {
        case 'bold':
            replacement = `**${selected || 'szöveg'}**`;
            cursorOffset = selected ? replacement.length : 2; // After first **
            break;
        case 'italic':
            replacement = `*${selected || 'szöveg'}*`;
            cursorOffset = selected ? replacement.length : 1;
            break;
        case 'list':
            replacement = `\n- ${selected || 'elem'}`;
            cursorOffset = replacement.length;
            break;
        case 'h2':
            replacement = `\n## ${selected || 'Alcím'}`;
            cursorOffset = replacement.length;
            break;
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end);

    // Restore cursor position (don't jump to bottom)
    const newCursorPos = start + cursorOffset;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
};

// --- AI Format Function ---
window.aiFormat = async () => {
    if (!geminiApiKey) {
        showNotification('Nincs API kulcs! Lépj be adminként és add meg.', true);
        return;
    }

    const textarea = document.getElementById('new-material-content');
    const text = textarea.value.trim();

    if (!text) {
        showNotification('Írj be szöveget az AI formázáshoz!', true);
        return;
    }

    // Show persistent notification
    const notif = document.getElementById('notification');
    notif.textContent = 'AI formázás folyamatban...';
    notif.style.backgroundColor = 'var(--accent-color)';
    notif.classList.add('show');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Te egy szövegformázó eszköz vagy. A feladatod KIZÁRÓLAG Markdown formázás hozzáadása.

TILTOTT:
- Szavak megváltoztatása (kivéve alcímek)
- Fordítás bármilyen nyelvre
- Tartalom hozzáadása vagy törlése
- Mondatok átfogalmazása (kivéve alcímek)
- Szinonimák használata a szövegben

MEGENGEDETT:
- ## (KETTŐ hash, NE három) hozzáadása alcímek elé
- **szó** formátum fontos szavakhoz
- *szó* formátum kiemelésekhez  
- - hozzáadása felsorolás elemek elé
- Alcímek átfogalmazása ha szükséges (DE: ugyanazon a nyelven maradjon, és ugyanazt jelentse)

Formázd az alábbi szöveget. A válaszod CSAK a formázott markdown kompatibilis szöveg legyen:

${text}`
                    }]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'API hiba');
        }

        const formattedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (formattedText) {
            textarea.value = formattedText;
            notif.textContent = 'AI formázás kész!';
            setTimeout(() => notif.classList.remove('show'), 3000);
        } else {
            throw new Error('Üres válasz az AI-tól');
        }
    } catch (err) {
        console.error('AI error:', err);
        notif.textContent = 'AI hiba: ' + err.message;
        notif.style.backgroundColor = '#e74c3c';
        setTimeout(() => notif.classList.remove('show'), 5000);
    }
};

document.getElementById('back-to-materials').addEventListener('click', () => {
    showView(viewMaterials);
});

// Init
loadClasses();
