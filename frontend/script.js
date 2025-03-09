// File Upload Handling
document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    const jdUploadArea = document.getElementById('jdUploadArea');
    const cvUploadArea = document.getElementById('cvUploadArea');
    const jdFileInput = document.getElementById('jdFileInput');
    const cvFileInput = document.getElementById('cvFileInput');
    const scoreButton = document.getElementById('seeScore');
    const trialsLeftElement = document.getElementById('trialsLeft');
    
    let jdFile = null;
    let cvFile = null;

    // Initialize trials count from localStorage or set to 3 if not exists
    let trialsLeft = parseInt(localStorage.getItem('trialsLeft')) || 3;
    trialsLeftElement.textContent = trialsLeft;

    // Check if trials are exhausted and disable upload areas
    function checkTrialsAndUpdateUI() {
        if (trialsLeft <= 0) {
            jdUploadArea.classList.add('disabled');
            cvUploadArea.classList.add('disabled');
            scoreButton.disabled = true;
            trialsLeftElement.parentElement.textContent = 'No trials left. Please sign up to continue.';
            
            // Remove event listeners when trials are exhausted
            jdUploadArea.removeEventListener('click', handleJdClick);
            cvUploadArea.removeEventListener('click', handleCvClick);
            jdFileInput.removeEventListener('change', handleJdChange);
            cvFileInput.removeEventListener('change', handleCvChange);
            
            // Remove drag and drop listeners
            [jdUploadArea, cvUploadArea].forEach(area => {
                area.removeEventListener('dragover', handleDragOver);
                area.removeEventListener('dragleave', handleDragLeave);
                area.removeEventListener('drop', handleDrop);
            });
        }
    }

    // Function to handle file selection
    function handleFileSelect(file, type) {
        if (trialsLeft <= 0) {
            alert('No trials left. Please sign up to continue.');
            return false;
        }

        const allowedTypes = [
            'application/pdf',
            'text/plain',
            'application/rtf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(file.type)) {
            alert('Please upload a PDF, TXT, RTF, or DOCX file.');
            return false;
        }

        if (type === 'jd') {
            jdFile = file;
            jdUploadArea.querySelector('p').textContent = file.name;
        } else {
            cvFile = file;
            cvUploadArea.querySelector('p').textContent = file.name;
        }

        // Enable score button if both files are uploaded
        scoreButton.disabled = !(jdFile && cvFile);
        return true;
    }

    // Event handler functions
    function handleJdClick() {
        if (trialsLeft > 0) jdFileInput.click();
    }

    function handleCvClick() {
        if (trialsLeft > 0) cvFileInput.click();
    }

    function handleJdChange(e) {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0], 'jd');
        }
    }

    function handleCvChange(e) {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0], 'cv');
        }
    }

    function handleDragOver(e) {
        if (trialsLeft > 0) {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        if (trialsLeft > 0) {
            const file = e.dataTransfer.files[0];
            const type = e.currentTarget.id === 'jdUploadArea' ? 'jd' : 'cv';
            handleFileSelect(file, type);
        }
    }

    // Click handlers for upload areas
    jdUploadArea.addEventListener('click', handleJdClick);
    cvUploadArea.addEventListener('click', handleCvClick);

    // File input change handlers
    jdFileInput.addEventListener('change', handleJdChange);
    cvFileInput.addEventListener('change', handleCvChange);

    // Drag and drop handlers
    [jdUploadArea, cvUploadArea].forEach(area => {
        area.addEventListener('dragover', handleDragOver);
        area.addEventListener('dragleave', handleDragLeave);
        area.addEventListener('drop', handleDrop);
    });

    // Score button click handler
    scoreButton.addEventListener('click', async () => {
        if (!jdFile || !cvFile) return;

        try {
            // Create FormData and append files
            const formData = new FormData();
            formData.append('jobDescription', jdFile);
            formData.append('resume', cvFile);

            // Show loading state
            scoreButton.disabled = true;
            scoreButton.textContent = 'Analyzing...';

            // Send files to backend
            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Analysis failed');

            const result = await response.json();
            
            // Decrease trials count and update localStorage
            trialsLeft--;
            localStorage.setItem('trialsLeft', trialsLeft);
            
            // Update UI
            if (trialsLeft > 0) {
                trialsLeftElement.textContent = trialsLeft;
            }
            
            // Check if trials are exhausted
            checkTrialsAndUpdateUI();

            // Navigate to results page or show modal with results
            window.location.href = `/results?id=${result.analysisId}`;

        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during analysis. Please try again.');
        } finally {
            scoreButton.disabled = false;
            scoreButton.textContent = 'See Your Score';
        }
    });

    // Check trials status on page load
    checkTrialsAndUpdateUI();
}); 