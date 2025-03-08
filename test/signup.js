const toggleBtns = document.querySelectorAll('.toggle-btn');
const slider = document.querySelector('.toggle-slider');
const employerForm = document.querySelector('.employer-form');
const employeeForm = document.querySelector('.employee-form');

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