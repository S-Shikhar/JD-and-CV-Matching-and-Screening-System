document.addEventListener('DOMContentLoaded', function() {
    const jdUpload = document.getElementById('jdUpload');
    const cvUpload = document.getElementById('cvUpload');
    const jdInput = document.getElementById('jdInput');
    const cvInput = document.getElementById('cvInput');
    const matchButton = document.getElementById('matchButton');
    const darkModeToggle = document.getElementById('darkModeToggle');

    // Dark mode initialization
    initializeDarkMode();

    // Dark mode toggle
    darkModeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        // Save preference to localStorage
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    });

    // Handle drag and drop events for JD
    setupDragAndDrop(jdUpload, jdInput, 'JD');

    // Handle drag and drop events for CVs
    setupDragAndDrop(cvUpload, cvInput, 'CV');

    // Click events for upload boxes
    jdUpload.addEventListener('click', () => jdInput.click());
    cvUpload.addEventListener('click', () => cvInput.click());

    // File input change events
    jdInput.addEventListener('change', (e) => handleFileSelect(e, 'JD'));
    cvInput.addEventListener('change', (e) => handleFileSelect(e, 'CV'));

    // Match button click event
    matchButton.addEventListener('click', handleMatch);
});

function initializeDarkMode() {
    // Check for saved user preference, default to light mode if not found
    const darkMode = localStorage.getItem('darkMode');
    
    // Check if user has dark mode preference in their system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (darkMode === 'true' || (darkMode === null && prefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

function setupDragAndDrop(dropZone, fileInput, type) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('border-gray-300', 'dark:border-gray-600');
            dropZone.classList.add('border-blue-500', 'dark:border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/50');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('border-blue-500', 'dark:border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/50');
            dropZone.classList.add('border-gray-300', 'dark:border-gray-600');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        handleFileSelect({ target: fileInput }, type);
    });
}

function handleFileSelect(e, type) {
    const files = Array.from(e.target.files);
    const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/rtf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const validFiles = files.filter(file => allowedTypes.includes(file.type));
    
    if (validFiles.length !== files.length) {
        alert('Please upload only PDF, TXT, RTF, or DOCX files.');
        return;
    }

    // Update UI to show selected files
    const uploadBox = type === 'JD' ? document.getElementById('jdUpload') : document.getElementById('cvUpload');
    const fileCount = validFiles.length;
    const fileText = uploadBox.querySelector('p');
    
    if (fileCount > 0) {
        fileText.textContent = `${fileCount} file${fileCount > 1 ? 's' : ''} selected`;
        uploadBox.classList.remove('border-gray-300', 'dark:border-gray-600');
        uploadBox.classList.add('border-green-500', 'dark:border-green-400', 'bg-green-50', 'dark:bg-green-900/50');
    }
}

function handleMatch() {
    const jdFiles = document.getElementById('jdInput').files;
    const cvFiles = document.getElementById('cvInput').files;

    if (jdFiles.length === 0 || cvFiles.length === 0) {
        alert('Please upload both a Job Description and at least one CV.');
        return;
    }

    // Here you would implement the actual matching logic
    // For now, we'll just show a success message
    alert('Processing files... This feature will be implemented soon!');
} 