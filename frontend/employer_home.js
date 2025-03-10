// Define API_URL at the global scope
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8000' 
    : '';

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is authenticated
    const authToken = localStorage.getItem('authToken');
    const userType = localStorage.getItem('userType');
    
    if (!authToken || userType !== 'employer') {
        // Redirect to signin page if not authenticated as employer
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
    const logoutBtn = document.getElementById('logout-btn');

    // Store file references
    let jdFile = null;
    let cvFiles = [];

    // File upload handling functions
    function handleJdFileSelect(file) {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(file.type)) {
            alert('Please upload a PDF or Word document.');
            return false;
        }

        // Update UI
        jdUploadArea.querySelector('p').textContent = file.name;
        jdFileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
        
        // Store file reference
        jdFile = file;
        
        // Enable analyze button if both JD and at least one CV are uploaded
        analyzeBtn.disabled = !(jdFile && cvFiles.length > 0);
        
        return true;
    }

    function handleCvFilesSelect(files) {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        // Convert FileList to Array
        const filesArray = Array.from(files);
        
        // Filter valid files
        const validFiles = filesArray.filter(file => allowedTypes.includes(file.type));
        
        if (validFiles.length === 0) {
            alert('Please upload PDF or Word documents.');
            return false;
        }
        
        if (validFiles.length !== filesArray.length) {
            alert('Some files were skipped because they are not PDF or Word documents.');
        }

        // Update UI
        cvUploadArea.querySelector('p').textContent = `${validFiles.length} file(s) selected`;
        
        // Create file info text
        let fileInfoText = validFiles.map(file => 
            `${file.name} (${formatFileSize(file.size)})`
        ).join('<br>');
        
        cvFileInfo.innerHTML = fileInfoText;
        
        // Store file references
        cvFiles = validFiles;
        
        // Enable analyze button if both JD and at least one CV are uploaded
        analyzeBtn.disabled = !(jdFile && cvFiles.length > 0);
        
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
            handleJdFileSelect(e.target.files[0]);
        }
    });

    cvFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleCvFilesSelect(e.target.files);
        }
    });

    // Drag and drop handlers for JD
    jdUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        jdUploadArea.classList.add('drag-over');
    });

    jdUploadArea.addEventListener('dragleave', () => {
        jdUploadArea.classList.remove('drag-over');
    });

    jdUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        jdUploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length) {
            handleJdFileSelect(e.dataTransfer.files[0]);
        }
    });

    // Drag and drop handlers for CVs
    cvUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        cvUploadArea.classList.add('drag-over');
    });

    cvUploadArea.addEventListener('dragleave', () => {
        cvUploadArea.classList.remove('drag-over');
    });

    cvUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        cvUploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length) {
            handleCvFilesSelect(e.dataTransfer.files);
        }
    });

    // Analyze button click handler
    analyzeBtn.addEventListener('click', async () => {
        if (!jdFile) {
            alert('Please upload a Job Description.');
            return;
        }

        if (cvFiles.length === 0) {
            alert('Please upload at least one CV.');
            return;
        }

        // Show loading spinner
        analyzeBtn.disabled = true;
        loadingSpinner.style.display = 'flex';

        try {
            // Get the results section
            const resultsSection = document.getElementById('results-section');
            const resultsContainer = document.getElementById('results-container');
            
            // Clear previous results
            resultsContainer.innerHTML = '';
            
            // Process CVs in smaller batches to avoid rate limiting
            const batchSize = 2; // Process 2 CVs at a time
            let allCandidateResults = [];
            
            // Split CVs into batches
            for (let i = 0; i < cvFiles.length; i += batchSize) {
                const batch = cvFiles.slice(i, i + batchSize);
                
                // Update loading message
                loadingSpinner.querySelector('p').textContent = `Analyzing CVs (${i + 1}-${Math.min(i + batch.length, cvFiles.length)} of ${cvFiles.length})...`;
                
                try {
                    // Process each batch with retry logic
                    const batchResponse = await processCvBatch(jdFile, batch);
                    
                    // Extract candidate results from the response
                    if (batchResponse && batchResponse.candidates_results) {
                        allCandidateResults = [...allCandidateResults, ...batchResponse.candidates_results];
                    }
                    
                    // Add a delay between batches to avoid rate limiting
                    if (i + batchSize < cvFiles.length) {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between batches
                    }
                } catch (error) {
                    console.error(`Error processing batch ${i / batchSize + 1}:`, error);
                    // Continue with next batch even if one fails
                }
            }
            
            // Display results for each CV
            if (allCandidateResults.length > 0) {
                // Sort by position (already sorted by the API, but just to be sure)
                allCandidateResults.sort((a, b) => a.Position - b.Position);
                
                allCandidateResults.forEach((candidateResult) => {
                    const resultCard = createResultCard(candidateResult);
                    resultsContainer.appendChild(resultCard);
                });
                
                // Show results section
                resultsSection.style.display = 'block';
                
                // Scroll to results
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                throw new Error('No results were returned. Please try again with fewer CVs.');
            }
            
        } catch (error) {
            alert(`An error occurred: ${error.message}`);
            console.error('Analysis error:', error);
        } finally {
            // Hide loading spinner
            loadingSpinner.style.display = 'none';
            analyzeBtn.disabled = false;
            // Reset loading message
            loadingSpinner.querySelector('p').textContent = 'Analyzing CVs...';
        }
    });

    // Process a batch of CVs
    async function processCvBatch(jdFile, cvBatch) {
        const maxRetries = 3;
        let retryCount = 0;
        let backoffTime = 1000; // Start with 1 second
        
        while (retryCount < maxRetries) {
            try {
                // Create a FormData object for this batch
                const formData = new FormData();
                
                // Add JD file
                formData.append('jd_file', jdFile);
                
                // Add CV files from this batch
                cvBatch.forEach(file => {
                    formData.append('candidates', file);
                });
                
                const authToken = localStorage.getItem('authToken');
                
                const response = await fetch(`${API_URL}/api/employer`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: formData
                });
                
                if (response.status === 429) {
                    // Rate limit exceeded
                    const retryAfter = response.headers.get('Retry-After') || 5; // Default to 5 seconds if header not present
                    const waitTime = parseInt(retryAfter) * 1000;
                    
                    console.log(`Rate limit exceeded. Retrying after ${waitTime/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryCount++;
                    continue;
                }
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Failed to analyze documents');
                }
                
                // Get results for this batch
                const responseData = await response.json();
                console.log('API Response:', responseData); // Debug log
                
                return responseData;
                
            } catch (error) {
                retryCount++;
                
                if (retryCount >= maxRetries) {
                    throw error; // Give up after max retries
                }
                
                // Exponential backoff
                console.log(`Retry ${retryCount}/${maxRetries} after ${backoffTime/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                backoffTime *= 2; // Double the wait time for next retry
            }
        }
        
        throw new Error('Maximum retries exceeded');
    }

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

// Function to create a result card for each CV
function createResultCard(candidateResult) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'result-card';
    
    // Get data from candidate result
    const fileName = candidateResult.filename || 'Unknown File';
    const matchScore = candidateResult['JD-Match'] || 0;
    const missingSkills = candidateResult['Missing Skills'] || [];
    const profileSummary = candidateResult['Profile Summary'] || 'No summary available.';
    const position = candidateResult['Position'] || 0;
    
    // Create card content
    cardDiv.innerHTML = `
        <div class="card-header">
            <h3>${fileName} ${position ? `(Rank: #${position})` : ''}</h3>
            <div class="match-badge">${matchScore}% Match</div>
        </div>
        <div class="card-content">
            <div class="summary">
                <h4>Profile Summary</h4>
                <p>${profileSummary}</p>
            </div>
            
            ${missingSkills.length > 0 ? `
            <div class="detail-item">
                <h4>Missing Skills</h4>
                <ul>
                    ${missingSkills.map(skill => `<li>${skill}</li>`).join('')}
                </ul>
            </div>` : ''}
        </div>
    `;
    
    // Style the match badge based on the score
    const matchBadge = cardDiv.querySelector('.match-badge');
    if (matchScore >= 80) {
        matchBadge.classList.add('high-match');
    } else if (matchScore >= 50) {
        matchBadge.classList.add('medium-match');
    } else {
        matchBadge.classList.add('low-match');
    }
    
    return cardDiv;
} 