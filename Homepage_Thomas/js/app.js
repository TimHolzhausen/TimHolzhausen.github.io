// Load local storage content if updated by the CMS, fallback to data.js CATERING_DATA
let cateringData = CATERING_DATA;
try {
    const savedData = localStorage.getItem("tw_catering_data");
    if (savedData) {
        cateringData = JSON.parse(savedData);
    }
} catch (e) {
    console.error("Fehler beim Laden der CMS-Daten:", e);
}

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initial Content Loading
    initializeCompanyDetails();
    renderServices();
    renderMenuTabs();
    renderMenuItems("fingerfood_glas"); // Default menu category
    loadTestimonials();
    
    // 2. Navigation Behavior
    setupNavigation();
    
    // 3. Interactive Event Handlers
    setupMenuTabs();
    setupTestimonialSlider();
    setupReviewForm();
    setupContactForm();
    setupModals();

    // 4. Hero Slider & Scroll Animations
    startHeroSlider();
    setupScrollAnimations();
});

// Cycles the hero background image slideshow
function startHeroSlider() {
    const slides = document.querySelectorAll(".hero-slide");
    if (slides.length <= 1) return;
    
    let currentSlide = 0;
    setInterval(() => {
        slides[currentSlide].classList.remove("active");
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add("active");
    }, 5000);
}

// Lightweight native scroll animations using IntersectionObserver
function setupScrollAnimations() {
    const animElements = document.querySelectorAll("[data-aos]");
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -60px 0px"
    };
    
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("aos-animate");
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    animElements.forEach(el => {
        el.style.opacity = "0";
        el.style.transform = "translateY(30px)";
        el.style.transition = "opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        observer.observe(el);
    });
    
    const style = document.createElement('style');
    style.innerHTML = `
        .aos-animate {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}


// Setup company info in header, contact area, and footer
function initializeCompanyDetails() {
    const company = cateringData.company;
    
    // Set text content for various contact elements
    document.querySelectorAll(".company-phone").forEach(el => {
        el.textContent = company.phone;
        if (el.tagName === 'A') {
            el.href = `tel:${company.phone.replace(/\s+/g, '')}`;
        }
    });
    
    document.querySelectorAll(".company-email").forEach(el => {
        el.textContent = company.email;
        if (el.tagName === 'A') {
            el.href = `mailto:${company.email}`;
        }
    });
    
    document.querySelectorAll(".company-address").forEach(el => {
        el.innerHTML = `${company.address.street}<br>${company.address.zip} ${company.address.city}`;
    });
}

// Render Catering Services Cards
function renderServices() {
    const servicesContainer = document.getElementById("services-grid");
    if (!servicesContainer) return;
    
    servicesContainer.innerHTML = cateringData.services.map(service => `
        <article class="service-card" data-aos="fade-up">
            <div class="service-img-wrapper">
                <img src="${service.image}" alt="${service.title}" class="service-img" loading="lazy">
            </div>
            <div class="service-content">
                <div class="service-icon">${service.icon}</div>
                <h3>${service.title}</h3>
                <p>${service.description}</p>
                <a href="#kontakt" class="service-link">${service.linkText}</a>
            </div>
        </article>
    `).join('');
}

// Render Menu Category Tab Buttons
function renderMenuTabs() {
    const tabsContainer = document.getElementById("menu-tabs");
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = cateringData.menuCategories.map((cat, index) => `
        <button class="menu-tab ${index === 0 ? 'active' : ''}" data-category="${cat.id}">
            ${cat.name}
        </button>
    `).join('');
}

// Render Menu Items for Selected Category
function renderMenuItems(categoryId) {
    const menuContent = document.getElementById("menu-content");
    if (!menuContent) return;
    
    const items = cateringData.menuItems[categoryId] || [];
    
    // Split items into 2 columns for a balanced layout
    const midIndex = Math.ceil(items.length / 2);
    const leftColItems = items.slice(0, midIndex);
    const rightColItems = items.slice(midIndex);
    
    const renderColHtml = (colItems) => colItems.map(item => {
        const tagsHtml = item.tags ? item.tags.map(tag => {
            const cleanTag = tag.toLowerCase();
            const tagClass = cleanTag.includes('vegan') ? 'vegan' : (cleanTag.includes('veg') ? 'veggie' : '');
            return `<span class="menu-tag ${tagClass}">${tag}</span>`;
        }).join('') : '';
        
        return `
            <div class="menu-item">
                <div class="menu-item-header">
                    <h4>${item.name}</h4>
                </div>
                <p>${item.description}</p>
                ${tagsHtml ? `<div class="menu-item-tags">${tagsHtml}</div>` : ''}
            </div>
        `;
    }).join('');

    menuContent.innerHTML = `
        <div class="menu-pane active">
            <div class="menu-column">${renderColHtml(leftColItems)}</div>
            <div class="menu-column">${renderColHtml(rightColItems)}</div>
        </div>
    `;
}

// Setup Event Handlers for Menu Tab Buttons
function setupMenuTabs() {
    const tabsContainer = document.getElementById("menu-tabs");
    if (!tabsContainer) return;
    
    tabsContainer.addEventListener("click", (e) => {
        const clickedTab = e.target.closest(".menu-tab");
        if (!clickedTab || clickedTab.classList.contains("active")) return;
        
        // Remove active class from previous
        tabsContainer.querySelectorAll(".menu-tab").forEach(tab => tab.classList.remove("active"));
        
        // Add to current
        clickedTab.classList.add("active");
        
        // Render corresponding items
        const categoryId = clickedTab.dataset.category;
        renderMenuItems(categoryId);
    });
}



// Global variable for current slides list
let testimonialsList = [];
let currentTestimonialIndex = 0;
let testimonialInterval;

// Load testimonials (from localStorage first, fall back to initial data)
function loadTestimonials() {
    const stored = localStorage.getItem("tw_testimonials");
    if (stored) {
        testimonialsList = JSON.parse(stored);
    } else {
        testimonialsList = [...cateringData.testimonials];
        localStorage.setItem("tw_testimonials", JSON.stringify(testimonialsList));
    }
    
    renderTestimonials();
}

// Render Testimonials List into slider
function renderTestimonials() {
    const slider = document.getElementById("testimonials-slider");
    if (!slider) return;
    
    slider.innerHTML = testimonialsList.map(t => {
        const starsHtml = '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating);
        return `
            <div class="testimonial-slide">
                <div class="testimonial-rating">${starsHtml}</div>
                <blockquote class="testimonial-text">${t.text}</blockquote>
                <cite class="testimonial-author">${t.author}</cite>
                <div class="testimonial-event">${t.event}</div>
            </div>
        `;
    }).join('');
    
    // Reset slider position
    currentTestimonialIndex = 0;
    updateSliderPosition();
}

// Setup navigation events (hamburger menu & scroll color change)
function setupNavigation() {
    const header = document.querySelector("header");
    const navToggle = document.getElementById("nav-toggle");
    const navLinks = document.getElementById("nav-links");
    
    // Background change on scroll
    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    });
    
    // Mobile navigation toggle
    if (navToggle && navLinks) {
        navToggle.addEventListener("click", () => {
            navToggle.classList.toggle("active");
            navLinks.classList.toggle("active");
        });
        
        // Close menu when link is clicked
        navLinks.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                navToggle.classList.remove("active");
                navLinks.classList.remove("active");
            });
        });
    }
}

// Setup Testimonial Slider Controls
function setupTestimonialSlider() {
    const prevBtn = document.getElementById("testimonial-prev");
    const nextBtn = document.getElementById("testimonial-next");
    
    if (!prevBtn || !nextBtn) return;
    
    prevBtn.addEventListener("click", () => {
        clearInterval(testimonialInterval);
        currentTestimonialIndex = (currentTestimonialIndex === 0) ? testimonialsList.length - 1 : currentTestimonialIndex - 1;
        updateSliderPosition();
        startAutoSlider();
    });
    
    nextBtn.addEventListener("click", () => {
        clearInterval(testimonialInterval);
        currentTestimonialIndex = (currentTestimonialIndex === testimonialsList.length - 1) ? 0 : currentTestimonialIndex + 1;
        updateSliderPosition();
        startAutoSlider();
    });
    
    startAutoSlider();
}

function updateSliderPosition() {
    const slider = document.getElementById("testimonials-slider");
    if (slider) {
        slider.style.transform = `translateX(-${currentTestimonialIndex * 100}%)`;
    }
}

function startAutoSlider() {
    testimonialInterval = setInterval(() => {
        if (testimonialsList.length <= 1) return;
        currentTestimonialIndex = (currentTestimonialIndex === testimonialsList.length - 1) ? 0 : currentTestimonialIndex + 1;
        updateSliderPosition();
    }, 6000);
}

// Setup customer review form submission
function setupReviewForm() {
    const form = document.getElementById("add-review-form");
    if (!form) return;
    
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const author = document.getElementById("review-name").value.trim();
        const event = document.getElementById("review-event").value.trim();
        const text = document.getElementById("review-text").value.trim();
        const rating = parseInt(form.querySelector('input[name="rating"]:checked')?.value || "5");
        
        if (!author || !event || !text) {
            showToast("Bitte füllen Sie alle Felder aus.", "error");
            return;
        }
        
        const newReview = { rating, text, author, event };
        
        // Add to array, save to localStorage
        testimonialsList.push(newReview);
        localStorage.setItem("tw_testimonials", JSON.stringify(testimonialsList));
        
        // Re-render
        renderTestimonials();
        
        // Reset form
        form.reset();
        
        // Show success toast
        showToast("Vielen Dank für Ihre Kundenstimme!", "success");
        
        // Move to the newly added review
        clearInterval(testimonialInterval);
        currentTestimonialIndex = testimonialsList.length - 1;
        updateSliderPosition();
        startAutoSlider();
    });
}

// Setup Contact/Inquiry Form Submission
function setupContactForm() {
    const form = document.getElementById("inquiry-form");
    if (!form) return;
    
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const name = document.getElementById("inquiry-name").value.trim();
        const email = document.getElementById("inquiry-email").value.trim();
        const phone = document.getElementById("inquiry-phone").value.trim();
        const date = document.getElementById("inquiry-date").value;
        const guests = document.getElementById("inquiry-guests").value;
        const details = document.getElementById("inquiry-details").value.trim();
        
        // Get checked services
        const selectedServices = [];
        form.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            selectedServices.push(cb.value);
        });
        
        if (!name || !email || !date || !guests) {
            showToast("Bitte füllen Sie alle Pflichtfelder (*) aus.", "error");
            return;
        }
        
        // Save inquiry simulation to local storage
        const inquiries = JSON.parse(localStorage.getItem("tw_inquiries") || "[]");
        const newInquiry = {
            id: Date.now(),
            name, email, phone, date, guests, details,
            services: selectedServices,
            timestamp: new Date().toISOString()
        };
        inquiries.push(newInquiry);
        localStorage.setItem("tw_inquiries", JSON.stringify(inquiries));
        
        // Reset form
        form.reset();
        
        // Show Success Dialog / Toast
        showToast("Ihre Anfrage wurde erfolgreich gesendet! Wir melden uns in Kürze bei Ihnen.", "success");
    });
}

// Toast Notifications System
function showToast(message, type = "success") {
    // Check if toast already exists
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    
    toast.className = `toast ${type === "success" ? "success" : "error"} show`;
    toast.innerHTML = `
        <span>${type === "success" ? "✓" : "✗"}</span>
        <span>${message}</span>
    `;
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 4500);
}

// Modals management (Datenschutz, Impressum)
function setupModals() {
    const modal = document.getElementById("legal-modal");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");
    const closeBtn = document.querySelector(".modal-close");
    
    if (!modal || !closeBtn) return;
    
    // Open modal listeners
    document.querySelectorAll("[data-modal]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const modalType = btn.dataset.modal;
            
            if (modalType === "impressum") {
                modalTitle.textContent = "Impressum";
                modalBody.innerHTML = `
                    <h4>Angaben gemäß § 5 TMG</h4>
                    <p>Thomas Wies Catering GmbH<br>Große Bleiche 64<br>55116 Mainz</p>
                    
                    <h4>Vertreten durch:</h4>
                    <p>Thomas Wies (Geschäftsführer)</p>
                    
                    <h4>Kontakt:</h4>
                    <p>Telefon: +49 1575 3672500<br>E-Mail: hallo@thomaswies-catering.de</p>
                    
                    <h4>Umsatzsteuer-ID:</h4>
                    <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br>DE 123 456 789</p>
                    
                    <h4>Aufsichtsbehörde:</h4>
                    <p>Gewerbeamt Mainz</p>
                    
                    <h4>EU-Streitschlichtung:</h4>
                    <p>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" style="color:var(--accent-gold);text-decoration:underline;">https://ec.europa.eu/consumers/odr/</a>.<br>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>
                `;
            } else if (modalType === "datenschutz") {
                modalTitle.textContent = "Datenschutzerklärung";
                modalBody.innerHTML = `
                    <h4>1. Datenschutz auf einen Blick</h4>
                    <p>Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.</p>
                    
                    <h4>2. Datenerfassung auf dieser Website</h4>
                    <p>Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Dessen Kontaktdaten können Sie dem Impressum dieser Website entnehmen.</p>
                    <p>Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen. Hierbei kann es sich z. B. um Daten handeln, die Sie in ein Kontaktformular eingeben (Name, E-Mail-Adresse, Telefonnummer).</p>
                    
                    <h4>3. Rechte der betroffenen Person</h4>
                    <p>Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben außerdem ein Recht, die Berichtigung oder Löschung dieser Daten zu verlangen.</p>
                    
                    <h4>4. Kontaktformular und Kundenstimmen</h4>
                    <p>Wenn Sie uns per Kontaktformular Anfragen zukommen lassen, werden Ihre Angaben aus dem Anfrageformular inklusive der von Ihnen dort angegebenen Kontaktdaten zwecks Bearbeitung der Anfrage und für den Fall von Anschlussfragen bei uns gespeichert. Diese Daten geben wir nicht ohne Ihre Einwilligung weiter.</p>
                    <p>Wenn Sie eine Kundenstimme abgeben, wird der von Ihnen eingegebene Name und Event-Typ zur Veröffentlichung auf unserer Webseite lokal in Ihrem Browser und auf unserem Server gespeichert.</p>
                `;
            }
            
            modal.classList.add("active");
            document.body.style.overflow = "hidden"; // Disable background scrolling
        });
    });
    
    // Close modal
    const closeModalFunc = () => {
        modal.classList.remove("active");
        document.body.style.overflow = ""; // Enable background scrolling
    };
    
    closeBtn.addEventListener("click", closeModalFunc);
    
    // Close on click outside content
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeModalFunc();
        }
    });
    
    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("active")) {
            closeModalFunc();
        }
    });
}
