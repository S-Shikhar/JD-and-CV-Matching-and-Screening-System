document.addEventListener('DOMContentLoaded', () => {
    const jdUploadArea = document.getElementById('jdUploadArea');
    const cvUploadArea = document.getElementById('cvUploadArea');
    const jdFileInput = document.getElementById('jdFileInput');
    const cvFileInput = document.getElementById('cvFileInput');

    // File upload handling functions
    function handleFileSelect(file, type) {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(file.type)) {
            alert('Please upload a PDF or Word document.');
            return false;
        }

        const uploadArea = type === 'jd' ? jdUploadArea : cvUploadArea;
        uploadArea.querySelector('p').textContent = file.name;
        return true;
    }

    // Click handlers
    jdUploadArea.addEventListener('click', () => jdFileInput.click());
    cvUploadArea.addEventListener('click', () => cvFileInput.click());

    // File input change handlers
    jdFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0], 'jd');
        }
    });

    cvFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0], 'cv');
        }
    });

    // Drag and drop handlers
    [jdUploadArea, cvUploadArea].forEach(area => {
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('drag-over');
        });

        area.addEventListener('dragleave', () => {
            area.classList.remove('drag-over');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('drag-over');
            
            const file = e.dataTransfer.files[0];
            const type = area === jdUploadArea ? 'jd' : 'cv';
            handleFileSelect(file, type);
        });
    });
});


async function analyzeDocuments(jdFile, cvFile) {
    const formData = new FormData();
    formData.append('jd_file', jdFile);
    formData.append('cv_file', cvFile);

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}