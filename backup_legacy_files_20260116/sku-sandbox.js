// SKU Test-2 JavaScript
function renderTable() {
    const fixedBody = document.getElementById('fixedBody');
    const scrollBody = document.getElementById('scrollBody');
    
    if (!fixedBody || !scrollBody) {
        console.error('Table elements not found');
        return;
    }
    
    // Render Fixed Column (SKU)
    fixedBody.innerHTML = testSkuData.map(item => `
        <div class="fixed-row">${item.sku}</div>
    `).join('');
    
    // Render Scrollable Columns
    scrollBody.innerHTML = testSkuData.map(item => `
        <div class="scroll-row">
            <div class="scroll-cell">
                <div class="image-placeholder">IMG</div>
            </div>
            <div class="scroll-cell">${item.status}</div>
            <div class="scroll-cell">${item.productName}</div>
            <div class="scroll-cell">${item.category}</div>
            <div class="scroll-cell">${item.gs1Code}</div>
            <div class="scroll-cell">${item.gs1Type}</div>
            <div class="scroll-cell">${item.amzAsin}</div>
            <div class="scroll-cell">${item.itemDimensions}</div>
            <div class="scroll-cell">${item.itemWeight}</div>
            <div class="scroll-cell">${item.package}</div>
        </div>
    `).join('');
    
    console.log(`✅ Rendered ${testSkuData.length} SKUs`);
    console.log(`✅ Fixed rows: ${fixedBody.children.length}`);
    console.log(`✅ Scroll rows: ${scrollBody.children.length}`);
    
    // Verify alignment
    verifyAlignment();
}

function verifyAlignment() {
    const fixedRows = document.querySelectorAll('.fixed-row');
    const scrollRows = document.querySelectorAll('.scroll-row');
    
    if (fixedRows.length !== scrollRows.length) {
        console.error('❌ Row count mismatch!');
        return;
    }
    
    let allAligned = true;
    fixedRows.forEach((fixedRow, index) => {
        const scrollRow = scrollRows[index];
        const fixedHeight = fixedRow.offsetHeight;
        const scrollHeight = scrollRow.offsetHeight;
        
        if (fixedHeight !== scrollHeight) {
            console.error(`❌ Row ${index} height mismatch: fixed=${fixedHeight}px, scroll=${scrollHeight}px`);
            allAligned = false;
        }
    });
    
    if (allAligned) {
        console.log('✅ All rows perfectly aligned!');
    }
}

function syncHeaderScroll() {
    const scrollCol = document.querySelector('.scroll-col');
    const scrollHeader = document.querySelector('.scroll-header');
    
    if (!scrollCol || !scrollHeader) return;
    
    scrollCol.addEventListener('scroll', () => {
        scrollHeader.style.transform = `translateX(-${scrollCol.scrollLeft}px)`;
    });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 SKU Test-2 Loading...');
    renderTable();
    syncHeaderScroll();
    
    // Add scroll event listener for debugging
    const scrollCol = document.querySelector('.scroll-col');
    if (scrollCol) {
        scrollCol.addEventListener('scroll', () => {
            console.log(`Horizontal scroll: ${scrollCol.scrollLeft}px`);
        });
    }
});

// Expose for console testing
window.renderTable = renderTable;
window.verifyAlignment = verifyAlignment;
