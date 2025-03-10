// Base URL for API calls
const BASE_URL = 'https://ats-eureka-ec04bc99ad36.herokuapp.com/api';

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
    const analyzeButton = document.getElementById('seeScore');
    const trialsLeftSpan = document.getElementById('trialsLeft');
    
    let jdFile = null;
    let cvFile = null;

    // Initialize trials count from localStorage or set to 3 if not exists
    let trialsLeft = parseInt(localStorage.getItem('trialsLeft')) || 3;
    trialsLeftSpan.textContent = trialsLeft;

    // Check if trials are exhausted and disable upload areas
    function checkTrialsAndUpdateUI() {
        if (trialsLeft <= 0) {
            jdUploadArea.classList.add('disabled');
            cvUploadArea.classList.add('disabled');
            analyzeButton.disabled = true;
            trialsLeftSpan.parentElement.textContent = 'No trials left. Please sign up to continue.';
            
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
        analyzeButton.disabled = !(jdFile && cvFile);
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
    analyzeButton.addEventListener('click', async () => {
        if (!jdFile || !cvFile) return;

        try {
            analyzeButton.disabled = true;
            analyzeButton.textContent = 'Analyzing...';

            const formData = new FormData();
            formData.append('file', cvFile);
            formData.append('jd_file', jdFile);

            const response = await fetch(`${BASE_URL}/demo`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            // Update trials left
            if (result.rate_limit) {
                trialsLeftSpan.textContent = result.rate_limit.remaining_requests;
                localStorage.setItem('trialsLeft', result.rate_limit.remaining_requests);
            }

            // Show results modal
            showResultsModal(result);

        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during analysis. Please try again.');
        } finally {
            analyzeButton.disabled = false;
            analyzeButton.textContent = 'Analyze';
        }
    });

    // Check trials status on page load
    checkTrialsAndUpdateUI();
});

function showResultsModal(result) {
    const modal = document.createElement('div');
    modal.className = 'analysis-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <div class="modal-header">
                <h2>Analysis Results</h2>
                <p class="modal-subtitle">Here's how your CV matches with the job description</p>
            </div>
            <div class="score-section">
                <div class="score-circle">
                    <div class="score-inner">
                        <span class="score-number">${result['JD-Match']}%</span>
                        <span class="score-label">Match Score</span>
                    </div>
                </div>
            </div>
            <div class="results-section">
                <div class="result-card">
                    <h3>Profile Summary</h3>
                    <p>${result['Profile Summary']}</p>
                </div>
                
                <div class="result-card">
                    <h3>Missing Skills</h3>
                    <ul class="skills-list">
                        ${result['Missing Skills'].length > 0 
                            ? result['Missing Skills'].map(skill => `<li>${skill}</li>`).join('')
                            : '<li class="no-skills">No major skill gaps identified</li>'
                        }
                    </ul>
                </div>
            </div>
            <div class="cta-section">
                <div class="cta-content">
                    <p>Want more detailed analysis and unlimited matches?</p>
                    <a href="signup.html" class="btn btn-primary">Sign Up Now</a>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeButton = modal.querySelector('.close-button');
    closeButton.onclick = () => modal.remove();

    window.onclick = (event) => {
        if (event.target === modal) modal.remove();
    };
} 