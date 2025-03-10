// Define API_URL at the global scope
const API_URL = 'https://ats-eureka-ec04bc99ad36.herokuapp.com/api';

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
            
            // Sort candidates by match score (highest to lowest)
            allCandidateResults.sort((a, b) => {
                const scoreA = parseFloat(a['JD-Match']) || 0;
                const scoreB = parseFloat(b['JD-Match']) || 0;
                return scoreB - scoreA;
            });

            // Add rank to each candidate
            allCandidateResults = allCandidateResults.map((result, index) => ({
                ...result,
                rank: index + 1
            }));
            
            // Display results for each CV
            if (allCandidateResults.length > 0) {
                // Add summary statistics
                const summaryDiv = document.createElement('div');
                summaryDiv.className = 'results-summary';
                summaryDiv.innerHTML = `
                    <div class="summary-stats">
                        <h3><i class="fas fa-chart-line"></i> Analysis Summary</h3>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <i class="fas fa-users"></i>
                                <div class="stat-details">
                                    <span class="stat-label">Total CVs Analyzed</span>
                                    <span class="stat-value">${allCandidateResults.length}</span>
                                </div>
                            </div>
                            <div class="stat-item">
                                <i class="fas fa-trophy"></i>
                                <div class="stat-details">
                                    <span class="stat-label">Top Match Score</span>
                                    <span class="stat-value">${Math.round(parseFloat(allCandidateResults[0]['JD-Match']))}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                resultsContainer.appendChild(summaryDiv);
                
                // Display individual results
                allCandidateResults.forEach((candidateResult) => {
                    const resultCard = createResultCard({
                        ...candidateResult,
                        Position: candidateResult.rank // Use the calculated rank
                    });
                    resultsContainer.appendChild(resultCard);
                });
                
                // Show results section
                resultsSection.style.display = 'block';
                
                // Scroll to results
                resultsSection.scrollIntoView({ behavior: 'smooth' });

                // Modify the display of results to expand the first card
                setTimeout(() => {
                    const firstCard = document.querySelector('.result-card');
                    if (firstCard) {
                        firstCard.classList.add('expanded');
                    }
                }, 100);
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
                
                const response = await fetch(`${API_URL}/employer`, {
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

    // Add CSS styles for the cards
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .results-summary {
            background: linear-gradient(135deg, #1a1f3c, #2a2f4c);
            color: #e0e4fc;
            padding: 32px;
            border-radius: 20px;
            margin-bottom: 32px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .summary-stats {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .summary-stats h3 {
            margin: 0;
            font-size: 1.75rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
            color: #e0e4fc;
        }

        .summary-stats h3 i {
            font-size: 1.5rem;
            color: #8b9aff;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 24px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 20px;
            background: rgba(139, 154, 255, 0.08);
            border-radius: 12px;
            border: 1px solid rgba(139, 154, 255, 0.15);
            transition: all 0.3s ease;
        }

        .stat-item:hover {
            transform: translateY(-2px);
            background: rgba(139, 154, 255, 0.12);
            border-color: rgba(139, 154, 255, 0.25);
        }

        .stat-item i {
            font-size: 1.5rem;
            color: #8b9aff;
        }

        .stat-details {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .stat-label {
            font-size: 0.9rem;
            color: #b4c0ff;
        }

        .stat-value {
            font-size: 1.5rem;
            font-weight: 600;
            color: #e0e4fc;
        }

        #results-container {
            display: flex;
            flex-direction: column;
            gap: 24px;
            max-width: 1200px;
            margin: 0 auto;
        }

        .result-card {
            background: #1a1f3c;
            border-radius: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            margin-bottom: 24px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.08);
            transition: all 0.3s ease;
        }

        .result-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
            border-color: rgba(139, 154, 255, 0.25);
        }
        
        .card-header {
            padding: 24px;
            background: linear-gradient(135deg, #1f2649, #1a1f3c);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .card-header h3 {
            margin: 0;
            color: #e0e4fc;
            font-size: 1.25rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .card-header h3 i {
            color: #8b9aff;
        }
        
        .match-badge {
            padding: 10px 20px;
            border-radius: 30px;
            font-weight: 600;
            font-size: 1rem;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
        }
        
        .match-badge:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 15px rgba(0, 0, 0, 0.25);
        }

        .high-match {
            background: linear-gradient(135deg, #2d8a6b, #3aa17c);
            color: #e0e4fc;
        }
        
        .medium-match {
            background: linear-gradient(135deg, #b86e00, #c97800);
            color: #e0e4fc;
        }
        
        .low-match {
            background: linear-gradient(135deg, #a13c3c, #b54444);
            color: #e0e4fc;
        }

        .card-content {
            padding: 24px;
            background: #1a1f3c;
            color: #e0e4fc;
        }

        .summary, .detail-item {
            margin-bottom: 24px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .summary h4, .detail-item h4 {
            color: #8b9aff;
            margin-bottom: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .summary h4:before, .detail-item h4:before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 20px;
            background: #8b9aff;
            border-radius: 2px;
        }
        
        .summary p {
            color: #b4c0ff;
            line-height: 1.6;
            margin: 0;
        }
        
        .detail-item ul {
            list-style-type: none;
            padding-left: 0;
            margin: 0;
        }
        
        .detail-item ul li {
            padding: 12px 16px;
            color: #b4c0ff;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 8px;
            margin-bottom: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }

        .detail-item ul li:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(139, 154, 255, 0.2);
        }

        .detail-item ul li:before {
            content: "•";
            color: #8b9aff;
            font-weight: bold;
            font-size: 1.2em;
        }

        .rate-limit-info {
            margin-top: 24px;
            padding: 20px;
            background: rgba(139, 154, 255, 0.08);
            border-radius: 12px;
            border: 1px solid rgba(139, 154, 255, 0.15);
        }

        .rate-limit-info h4 {
            color: #8b9aff;
            margin-bottom: 12px;
            font-size: 1.1rem;
            font-weight: 600;
        }

        .rate-limit-info p {
            color: #b4c0ff;
            margin: 8px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .rate-limit-info i {
            color: #8b9aff;
        }

        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: 1fr;
            }

            .card-header {
                flex-direction: column;
                gap: 16px;
                text-align: center;
            }

            .match-badge {
                width: 100%;
                justify-content: center;
            }

            .results-summary {
                padding: 24px;
            }
        }

        .result-card {
            cursor: pointer;
        }

        .card-header {
            cursor: pointer;
            padding: 20px 24px;
            background: linear-gradient(135deg, #1f2649, #1a1f3c);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            transition: all 0.3s ease;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex: 1;
        }

        .dropdown-icon {
            margin-left: 16px;
            transition: transform 0.3s ease;
        }

        .dropdown-icon i {
            color: #8b9aff;
            font-size: 1.2rem;
        }

        .result-card .card-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding: 0 24px;
        }

        .result-card.expanded .card-content {
            max-height: 2000px; /* Adjust this value based on your content */
            padding: 24px;
            transition: max-height 0.5s ease-in;
        }

        .result-card.expanded .dropdown-icon {
            transform: rotate(180deg);
        }

        .result-card:not(.expanded) {
            margin-bottom: 16px;
        }

        .result-card.expanded {
            margin-bottom: 24px;
        }

        .card-header:hover {
            background: linear-gradient(135deg, #252b54, #1f2447);
        }
    `;
    document.head.appendChild(styleElement);
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
        <div class="card-header" onclick="this.parentElement.classList.toggle('expanded')">
            <div class="header-content">
                <h3>
                    <i class="fas fa-file-alt"></i> 
                    ${fileName} ${position ? `(Rank: #${position})` : ''}
                </h3>
                <div class="match-badge ${
                    matchScore >= 80 ? 'high-match' : 
                    matchScore >= 50 ? 'medium-match' : 
                    'low-match'
                }">
                    <i class="fas fa-chart-pie"></i>
                    ${matchScore}% Match
                </div>
            </div>
            <div class="dropdown-icon">
                <i class="fas fa-chevron-down"></i>
            </div>
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
            
            ${candidateResult.rate_limit ? `
            <div class="rate-limit-info">
                <h4><i class="fas fa-clock"></i> Usage Information</h4>
                <p><i class="fas fa-redo-alt"></i> Remaining requests today: ${candidateResult.rate_limit.remaining_requests}/${candidateResult.rate_limit.max_requests}</p>
                <p><i class="fas fa-hourglass-half"></i> Resets in: ${candidateResult.rate_limit.reset_after_hours} hours</p>
            </div>` : ''}
        </div>
    `;
    
    return cardDiv;
} 