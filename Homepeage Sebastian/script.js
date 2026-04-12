// Simple AOS (Animate On Scroll) implementation
const observerOptions = {
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('aos-animate');
        }
    });
}, observerOptions);

document.querySelectorAll('[data-aos]').forEach(el => {
    observer.observe(el);
});

// Smooth Scrolling for navigation links
document.querySelectorAll('nav a, .btn-book').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        
        if (href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // Header offset
                    behavior: 'smooth'
                });
            }
        }
    });
});

// Form submission handler (Mock)
const contactForm = document.querySelector('form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Vielen Dank für deine Anfrage! Ich werde mich bald bei dir melden. (Demo-Modus)');
        contactForm.reset();
    });
}
