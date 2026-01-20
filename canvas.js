// Supply Chain Canvas Controller - Stage 1
const CanvasController = {
    panX: 0,
    panY: 0,
    zoom: 1,
    isDragging: false,
    startX: 0,
    startY: 0,
    
    init() {
        const canvas = document.getElementById('scCanvas');
        if (!canvas) return;
        
        // Reset to default state
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;
        
        // Mouse events for pan
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // Wheel event for zoom
        canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        
        // Zoom buttons
        document.querySelector('.sc-zoom-in')?.addEventListener('click', () => this.zoomIn());
        document.querySelector('.sc-zoom-out')?.addEventListener('click', () => this.zoomOut());
        document.querySelector('.sc-zoom-label')?.addEventListener('click', () => this.resetView());
        
        // Set initial cursor
        canvas.style.cursor = 'grab';
        
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    onMouseDown(e) {
        // Ignore if clicking on toolbar or zoom control
        if (e.target.closest('.sc-toolbar') || e.target.closest('.sc-zoom-control')) return;
        
        this.isDragging = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        
        const canvas = document.getElementById('scCanvas');
        if (canvas) canvas.style.cursor = 'grabbing';
    },
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
    },
    
    onMouseUp() {
        this.isDragging = false;
        const canvas = document.getElementById('scCanvas');
        if (canvas) canvas.style.cursor = 'grab';
    },
    
    onWheel(e) {
        e.preventDefault();
        
        // Zoom in/out based on wheel direction
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.5, Math.min(2, this.zoom * delta));
        
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    zoomIn() {
        this.zoom = Math.min(2, this.zoom * 1.1);
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    zoomOut() {
        this.zoom = Math.max(0.5, this.zoom * 0.9);
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;
        this.updateTransform();
        this.updateZoomLabel();
    },
    
    updateTransform() {
        const canvas = document.getElementById('scCanvas');
        if (canvas) {
            canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        }
    },
    
    updateZoomLabel() {
        const label = document.querySelector('.sc-zoom-label');
        if (label) {
            label.textContent = `${Math.round(this.zoom * 100)}%`;
        }
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CanvasController.init());
} else {
    CanvasController.init();
}

window.CanvasController = CanvasController;
