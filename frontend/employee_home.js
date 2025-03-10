// Define API_URL at the global scope
const API_URL = 'https://ats-eureka-ec04bc99ad36.herokuapp.com/api';

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is authenticated
    const authToken = localStorage.getItem('authToken');
    const userType = localStorage.getItem('userType');
    
    if (!authToken || userType !== 'employee') {
        // Redirect to signin page if not authenticated as employee
        window.location.href = 'signin.html';
        return;
    }

    // DOM elements
    const jdUploadArea = document.getElementById('jdUploadArea');
    const cvUploadArea = document.getElementById('cvUploadArea');
    const jdFileInput = document.getElementById('jdFileInput');
    const cvFileInput = document.getElementById('cvFileInput');
    const jdFileInfo = document.getElementById('jdFileInfo');
    const cvFileInfo = document.getElementById('cvFileInfo');
    const analyzeBtn = document.getElementById('analyze-btn');
    const loadingSpinner = document.getElementById('loading-spinner');
    const resultsSection = document.getElementById('results-section');
    const matchPercentage = document.getElementById('match-percentage');
    const analysisContent = document.getElementById('analysis-content');
    const logoutBtn = document.getElementById('logout-btn');

    // Store file references
    let jdFile = null;
    let cvFile = null;

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
        const fileInfo = type === 'jd' ? jdFileInfo : cvFileInfo;
        
        // Update UI
        uploadArea.querySelector('p').textContent = file.name;
        fileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        
        // Store file reference
        if (type === 'jd') {
            jdFile = file;
        } else {
            cvFile = file;
        }
        
        // Enable analyze button if both files are uploaded
        analyzeBtn.disabled = !(jdFile && cvFile);
        
        return true;
    }

    // Format file size
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
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

    // Analyze button click handler
    analyzeBtn.addEventListener('click', async () => {
        if (!jdFile || !cvFile) {
            alert('Please upload both a Job Description and your CV.');
            return;
        }

        // Show loading spinner
        analyzeBtn.disabled = true;
        loadingSpinner.style.display = 'flex';
        resultsSection.style.display = 'none';

        try {
            const result = await analyzeDocuments(jdFile, cvFile);
            displayResults(result);
        } catch (error) {
            if (error.message.includes('too many requests')) {
                alert('You are making requests too quickly. Please wait a moment before trying again.');
            } else {
                alert('An error occurred during analysis. Please try again.');
            }
            console.error('Analysis error:', error);
        } finally {
            // Hide loading spinner
            loadingSpinner.style.display = 'none';
            analyzeBtn.disabled = false;
        }
    });

    // Logout button click handler
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Clear authentication data
        localStorage.removeItem('authToken');
        localStorage.removeItem('userType');
        // Redirect to signin page
        window.location.href = 'signin.html';
    });
});

// Function to analyze documents
async function analyzeDocuments(jdFile, cvFile) {
    const formData = new FormData();
    
    // If JD is provided as a file
    if (jdFile) {
        formData.append('jd_file', jdFile);
    }
    
    // CV file is required
    formData.append('file', cvFile);

    try {
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch(`${API_URL}/employee`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('You have made too many requests. Please wait a moment before trying again.');
            }
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to analyze documents');
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Function to display results
function displayResults(result) {
    const resultsSection = document.getElementById('results-section');
    const matchPercentage = document.getElementById('match-percentage');
    const analysisContent = document.getElementById('analysis-content');
    
    // Show results section
    resultsSection.style.display = 'block';
    
    // Set match percentage (using JD-Match from API)
    const matchScore = result['JD-Match'] || 0;
    matchPercentage.textContent = `${matchScore}%`;
    
    // Create analysis content HTML
    let analysisHTML = '';
    
    // Add profile summary
    if (result['Profile Summary']) {
        analysisHTML += `<h4>Profile Summary</h4>`;
        analysisHTML += `<p>${result['Profile Summary']}</p>`;
    }
    
    // Add missing skills
    if (result['Missing Skills'] && result['Missing Skills'].length > 0) {
        analysisHTML += `<h4>Missing Skills</h4>`;
        analysisHTML += `<ul>`;
        result['Missing Skills'].forEach(skill => {
            analysisHTML += `<li>${skill}</li>`;
        });
        analysisHTML += `</ul>`;
    }

    // // Add rate limit information if available
    // if (result.rate_limit) {
    //     analysisHTML += `<div class="rate-limit-info" style="margin-top: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">`;
    //     analysisHTML += `<h4>Usage Information</h4>`;
    //     analysisHTML += `<p>Remaining requests today: ${result.rate_limit.remaining_requests}/${result.rate_limit.max_requests}</p>`;
    //     analysisHTML += `<p>Resets in: ${result.rate_limit.reset_after_hours} hours</p>`;
    //     analysisHTML += `</div>`;
    // }
    
    // Set analysis content
    analysisContent.innerHTML = analysisHTML;
}