// ========================================
// Kitchen Mama - Global Namespace
// 全域命名空間，避免全域污染
// ========================================

/**
 * KM (Kitchen Mama) 全域命名空間
 * 所有頁面邏輯、工具函式、狀態管理都統一在此命名空間下
 */
window.KM = {
    /**
     * 頁面模組
     * 每個頁面的初始化、渲染、狀態管理函式
     */
    pages: {},
    
    /**
     * 工具函式
     * 共用的工具函式，如資料管理、滾動同步等
     */
    utils: {},
    
    /**
     * 全域狀態
     * 跨頁面共享的狀態（預留給 Phase 2）
     */
    state: {},
    
    /**
     * 生命週期管理
     * 頁面的掛載、卸載管理（預留給 Phase 1 後續）
     */
    lifecycle: {}
};

// 向下相容：保留 DataRepo 的全域存取
// 確保現有程式碼不受影響
if (window.DataRepo) {
    KM.utils.data = window.DataRepo;
}

console.log('[KM] Namespace initialized');
