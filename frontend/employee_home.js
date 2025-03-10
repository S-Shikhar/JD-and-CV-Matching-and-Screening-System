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
            alert('An error occurred during analysis. Please try again.');
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
    
    // Set match percentage
    const matchScore = result.match_percentage || 0;
    matchPercentage.textContent = `${matchScore}%`;
    
    // Create analysis content HTML
    let analysisHTML = '';
    
    // Add match summary
    analysisHTML += `<h4>Match Summary</h4>`;
    analysisHTML += `<p>${result.match_summary || 'No summary available.'}</p>`;
    
    // Add skills analysis
    if (result.skills_analysis) {
        analysisHTML += `<h4>Skills Analysis</h4>`;
        analysisHTML += `<p>${result.skills_analysis}</p>`;
    }
    
    // Add experience analysis
    if (result.experience_analysis) {
        analysisHTML += `<h4>Experience Analysis</h4>`;
        analysisHTML += `<p>${result.experience_analysis}</p>`;
    }
    
    // Add education analysis
    if (result.education_analysis) {
        analysisHTML += `<h4>Education Analysis</h4>`;
        analysisHTML += `<p>${result.education_analysis}</p>`;
    }
    
    // Add improvement suggestions
    if (result.improvement_suggestions) {
        analysisHTML += `<h4>Improvement Suggestions</h4>`;
        analysisHTML += `<ul>`;
        if (Array.isArray(result.improvement_suggestions)) {
            result.improvement_suggestions.forEach(suggestion => {
                analysisHTML += `<li>${suggestion}</li>`;
            });
        } else {
            analysisHTML += `<li>${result.improvement_suggestions}</li>`;
        }
        analysisHTML += `</ul>`;
    }
    
    // Set analysis content
    analysisContent.innerHTML = analysisHTML;
}