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

// Employer signup form submission
const employerSignupForm = document.getElementById('employer-signup-form');
const employerErrorMessage = document.getElementById('employer-error-message');

employerSignupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form data
    const companyName = document.getElementById('company-name').value;
    const businessEmail = document.getElementById('business-email').value;
    const password = document.getElementById('employer-password').value;
    const confirmPassword = document.getElementById('employer-confirm-password').value;
    
    // Validate passwords match
    if (password !== confirmPassword) {
        employerErrorMessage.textContent = 'Passwords do not match';
        return;
    }
    
    // Clear previous error messages
    employerErrorMessage.textContent = '';
    
    try {
        const response = await fetch(`${API_URL}/register/employer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_name: companyName,
                business_email: businessEmail,
                password: password,
                confirm_password: confirmPassword
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Registration failed');
        }
        
        // Registration successful - redirect to signin
        alert('Registration successful! Please sign in.');
        window.location.href = 'signin.html';
        
    } catch (error) {
        employerErrorMessage.textContent = error.message;
    }
});

// Employee signup form submission
const employeeSignupForm = document.getElementById('employee-signup-form');
const employeeErrorMessage = document.getElementById('employee-error-message');

employeeSignupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form data
    const fullName = document.getElementById('full-name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('employee-password').value;
    const confirmPassword = document.getElementById('employee-confirm-password').value;
    
    // Validate passwords match
    if (password !== confirmPassword) {
        employeeErrorMessage.textContent = 'Passwords do not match';
        return;
    }
    
    // Clear previous error messages
    employeeErrorMessage.textContent = '';
    
    try {
        const response = await fetch(`${API_URL}/register/employee`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                full_name: fullName,
                email: email,
                password: password,
                confirm_password: confirmPassword
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Registration failed');
        }
        
        // Registration successful - redirect to signin
        alert('Registration successful! Please sign in.');
        window.location.href = 'signin.html';
        
    } catch (error) {
        employeeErrorMessage.textContent = error.message;
    }
});