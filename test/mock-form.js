// Mock form submit handler (external JS compliant with MV3 CSP)
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('test-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Form submitted! (This is a test.)');
    });
  }
});
