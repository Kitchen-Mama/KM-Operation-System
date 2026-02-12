// SKU Details 統一滾動控制
(function() {
    let unifiedScroll = null;
    let scrollCols = [];
    let isInitialized = false;
    
    function initSkuScroll() {
        const skuSection = document.getElementById('sku-section');
        if (!skuSection || isInitialized) return;
        
        const skuDetailsSection = skuSection.querySelector('#skuDetailsSection');
        if (!skuDetailsSection) return;
        
        scrollCols = Array.from(skuSection.querySelectorAll('.scroll-col'));
        if (scrollCols.length === 0) return;
        
        // 創建統一滾動條
        if (!unifiedScroll) {
            unifiedScroll = document.createElement('div');
            unifiedScroll.className = 'sku-unified-scroll';
            unifiedScroll.innerHTML = '<div class="sku-unified-scroll-content"></div>';
            skuDetailsSection.appendChild(unifiedScroll);
        }
        
        isInitialized = true;
        
        // 計算最大寬度
        updateScrollWidth();
        
        // 監聽統一滾動條
        unifiedScroll.addEventListener('scroll', function() {
            const scrollLeft = this.scrollLeft;
            scrollCols.forEach(col => {
                col.scrollLeft = scrollLeft;
            });
        });
        
        // 支援 Shift+滾輪 和 水平滾輪
        scrollCols.forEach(col => {
            col.addEventListener('wheel', function(e) {
                if (e.shiftKey || e.deltaX !== 0) {
                    e.preventDefault();
                    const delta = e.shiftKey ? e.deltaY : e.deltaX;
                    unifiedScroll.scrollLeft += delta;
                }
            }, { passive: false });
        });
    }
    
    function updateScrollWidth() {
        if (!unifiedScroll || scrollCols.length === 0) return;
        
        let maxScrollWidth = 0;
        
        scrollCols.forEach(col => {
            const scrollWidth = col.scrollWidth;
            if (scrollWidth > maxScrollWidth) {
                maxScrollWidth = scrollWidth;
            }
        });
        
        const content = unifiedScroll.querySelector('.sku-unified-scroll-content');
        const fixedColWidth = 200;
        content.style.width = (maxScrollWidth + fixedColWidth) + 'px';
    }
    
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(initSkuScroll, 100);
    });
    
    window.addEventListener('resize', function() {
        updateScrollWidth();
    });
    
    // 監聽 SKU Details 頁面切換
    const observer = new MutationObserver(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection && !skuSection.classList.contains('is-hidden')) {
            if (!isInitialized) {
                setTimeout(initSkuScroll, 100);
            }
            setTimeout(updateScrollWidth, 200);
        }
    });
    
    setTimeout(function() {
        const skuSection = document.getElementById('sku-section');
        if (skuSection) {
            observer.observe(skuSection, { attributes: true, attributeFilter: ['class'] });
        }
    }, 500);
    
    window.updateSkuScrollWidth = updateScrollWidth;
    window.initSkuScroll = initSkuScroll;
})();
