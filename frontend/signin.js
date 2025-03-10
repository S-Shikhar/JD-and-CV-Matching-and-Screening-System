const toggleBtns = document.querySelectorAll('.toggle-btn');
const slider = document.querySelector('.toggle-slider');
const employerForm = document.querySelector('.employer-form');
const employeeForm = document.querySelector('.employee-form');

// Toggle between employer and employee forms
toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update toggle buttons
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Move slider
        const isEmployee = btn.dataset.form === 'employee';
        slider.style.transform = isEmployee ? 'translateX(100%)' : 'translateX(0)';

        // Switch forms with animation
        if (isEmployee) {
            employerForm.classList.remove('active');
            employeeForm.classList.add('active');
        } else {
            employeeForm.classList.remove('active');
            employerForm.classList.add('active');
        }
    });
});

// API URL
const API_URL = 'https://ats-eureka-ec04bc99ad36.herokuapp.com/api';

// Helper function to store token in localStorage
function storeAuthToken(token, userType) {
    localStorage.setItem('authToken', token);
    localStorage.setItem('userType', userType);
}

// Employer signin form submission
const employerSigninForm = document.getElementById('employer-signin-form');
const employerErrorMessage = document.getElementById('employer-error-message');

employerSigninForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form data
    const formData = new FormData(employerSigninForm);
    
    // Clear previous error messages
    employerErrorMessage.textContent = '';
    
    try {
        const response = await fetch(`${API_URL}/token`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Authentication failed');
        }
        
        // Store token and redirect based on user type
        storeAuthToken(data.access_token, 'employer');
        
        // Redirect to employer dashboard
        window.location.href = 'employer_home.html';
        
    } catch (error) {
        employerErrorMessage.textContent = error.message;
    }
});

// Employee signin form submission
const employeeSigninForm = document.getElementById('employee-signin-form');
const employeeErrorMessage = document.getElementById('employee-error-message');

employeeSigninForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form data
    const formData = new FormData(employeeSigninForm);
    
    // Clear previous error messages
    employeeErrorMessage.textContent = '';
    
    try {
        const response = await fetch(`${API_URL}/token`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Authentication failed');
        }
        
        // Store token and redirect based on user type
        storeAuthToken(data.access_token, 'employee');
        
        // Redirect to employee dashboard
        window.location.href = 'employee_home.html';
        
    } catch (error) {
        employeeErrorMessage.textContent = error.message;
    }
}); 