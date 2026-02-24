// ========================================
// Kitchen Mama - Page Lifecycle Manager
// 頁面生命週期管理
// ========================================

/**
 * 頁面生命週期管理系統
 * 負責頁面的掛載(mount)、卸載(unmount)，確保資源正確清理
 */
(function() {
    const registry = {}; // 頁面註冊表
    let currentPage = null; // 當前活躍頁面

    /**
     * 註冊頁面生命週期
     * @param {string} pageName - 頁面名稱 (對應 section id)
     * @param {Object} hooks - 生命週期鉤子 { mount, unmount }
     */
    KM.lifecycle.register = function(pageName, hooks) {
        if (!pageName || typeof hooks !== 'object') {
            console.warn('[Lifecycle] Invalid registration:', pageName);
            return;
        }

        registry[pageName] = {
            mount: hooks.mount || function() {},
            unmount: hooks.unmount || function() {}
        };

        console.log(`[Lifecycle] Registered: ${pageName}`);
    };

    /**
     * 切換到指定頁面
     * @param {string} pageName - 目標頁面名稱
     */
    KM.lifecycle.switchTo = function(pageName) {
        // 如果切換到相同頁面，不執行任何操作
        if (currentPage === pageName) {
            return;
        }

        // 卸載當前頁面
        if (currentPage && registry[currentPage]) {
            try {
                registry[currentPage].unmount();
                console.log(`[Lifecycle] Unmounted: ${currentPage}`);
            } catch (error) {
                console.error(`[Lifecycle] Unmount error (${currentPage}):`, error);
            }
        }

        // 掛載新頁面
        if (registry[pageName]) {
            try {
                registry[pageName].mount();
                console.log(`[Lifecycle] Mounted: ${pageName}`);
            } catch (error) {
                console.error(`[Lifecycle] Mount error (${pageName}):`, error);
            }
        }

        currentPage = pageName;
    };

    /**
     * 取得當前活躍頁面
     * @returns {string|null} 當前頁面名稱
     */
    KM.lifecycle.getCurrentPage = function() {
        return currentPage;
    };

    /**
     * 取消註冊頁面（用於動態頁面管理）
     * @param {string} pageName - 頁面名稱
     */
    KM.lifecycle.unregister = function(pageName) {
        if (registry[pageName]) {
            delete registry[pageName];
            console.log(`[Lifecycle] Unregistered: ${pageName}`);
        }
    };

    console.log('[KM] Lifecycle manager initialized');
})();
