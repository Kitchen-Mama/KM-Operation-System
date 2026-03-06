// Blueprint Presentation JavaScript

let currentSlide = 1;
const totalSlides = 8;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateSlideIndicator();
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') {
            e.preventDefault();
            nextSlide();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevSlide();
        } else if (e.key === 'Home') {
            e.preventDefault();
            goToSlide(1);
        } else if (e.key === 'End') {
            e.preventDefault();
            goToSlide(totalSlides);
        }
    });
});

function nextSlide() {
    if (currentSlide < totalSlides) {
        goToSlide(currentSlide + 1);
    }
}

function prevSlide() {
    if (currentSlide > 1) {
        goToSlide(currentSlide - 1);
    }
}

function goToSlide(slideNumber) {
    if (slideNumber < 1 || slideNumber > totalSlides) return;
    
    // Hide current slide
    const currentSlideEl = document.querySelector('.slide.active');
    if (currentSlideEl) {
        currentSlideEl.classList.remove('active');
    }
    
    // Show target slide
    const targetSlideEl = document.querySelector(`.slide[data-slide="${slideNumber}"]`);
    if (targetSlideEl) {
        targetSlideEl.classList.add('active');
    }
    
    currentSlide = slideNumber;
    updateSlideIndicator();
}

function updateSlideIndicator() {
    const dots = document.querySelectorAll('.indicator-dot');
    dots.forEach((dot, index) => {
        if (index + 1 === currentSlide) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

// Expose functions to global scope
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.goToSlide = goToSlide;
