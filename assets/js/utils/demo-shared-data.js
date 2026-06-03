// ========================================
// Demo Shared Data Layer - Phase 1
// 共用 Demo 假資料核心檔案
// 不接任何頁面，僅提供資料與 debug helpers
// ========================================

window.KM = window.KM || {};

(function() {
    'use strict';

    // ========================================
    // Demo SKU 主資料 (12 筆)
    // ========================================
    var skus = [
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', category: 'Electric Can Opener', series: 'CO1100', lifecycle: 'Running in the Market', image_url: 'assets/img/products/CO1100-R.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO1100-R-US', asin: 'B09XXXXR01', currency: 'USD', regular_price: 29.99, minimum_price: 24.99, pm: 'Vic' },
        { sku: 'CO1100-S', product_name: 'Electric Can Opener - Silver', category: 'Electric Can Opener', series: 'CO1100', lifecycle: 'Running in the Market', image_url: 'assets/img/products/CO1100-S.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO1100-S-US', asin: 'B09XXXXS01', currency: 'USD', regular_price: 29.99, minimum_price: 24.99, pm: 'Vic' },
        { sku: 'CO1100-W', product_name: 'Electric Can Opener - White', category: 'Electric Can Opener', series: 'CO1100', lifecycle: 'Running in the Market', image_url: 'assets/img/products/CO1100-W.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO1100-W-US', asin: 'B09XXXXW01', currency: 'USD', regular_price: 29.99, minimum_price: 24.99, pm: 'Vic' },
        { sku: 'CO1150-ZW', product_name: 'Electric Can Opener Deluxe - White', category: 'Electric Can Opener', series: 'CO1150', lifecycle: 'Running in the Market', image_url: 'assets/img/products/CO1150-ZW.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO1150-ZW-US', asin: 'B09XXXZW01', currency: 'USD', regular_price: 34.99, minimum_price: 29.99, pm: 'Vic' },
        { sku: 'CO1150-AG', product_name: 'Electric Can Opener Deluxe - Green', category: 'Electric Can Opener', series: 'CO1150', lifecycle: 'Running in the Market', image_url: 'assets/img/products/CO1150-AG.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO1150-AG-US', asin: 'B09XXXAG01', currency: 'USD', regular_price: 34.99, minimum_price: 29.99, pm: 'Vic' },
        { sku: 'CO2600-B', product_name: 'Electric Can Opener Pro - Black', category: 'Electric Can Opener', series: 'CO2600', lifecycle: 'Upcoming SKU', image_url: 'assets/img/products/CO2600-B.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO2600-B-US', asin: 'B09XXX2B01', currency: 'USD', regular_price: 39.99, minimum_price: 34.99, pm: 'Wendy' },
        { sku: 'CO5600-RB', product_name: 'Electric Can Opener Compact - Blue', category: 'Electric Can Opener', series: 'CO5600', lifecycle: 'Upcoming SKU', image_url: 'assets/img/products/CO5600-RB.png', country: 'US', marketplace: 'Amazon', site_sku: 'CO5600-RB-US', asin: 'B09XXX5R01', currency: 'USD', regular_price: 24.99, minimum_price: 19.99, pm: 'Wendy' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', category: 'Silicone Product', series: 'SP3120', lifecycle: 'Running in the Market', image_url: 'assets/img/products/SP3120-R.png', country: 'US', marketplace: 'Amazon', site_sku: 'SP3120-R-US', asin: 'B09XXXSR01', currency: 'USD', regular_price: 14.99, minimum_price: 11.99, pm: 'Wendy' },
        { sku: 'SP3120-M', product_name: 'Silicone Spatula Set - Mint', category: 'Silicone Product', series: 'SP3120', lifecycle: 'Running in the Market', image_url: 'assets/img/products/SP3120-M.png', country: 'US', marketplace: 'Amazon', site_sku: 'SP3120-M-US', asin: 'B09XXXSM01', currency: 'USD', regular_price: 14.99, minimum_price: 11.99, pm: 'Wendy' },
        { sku: 'SP3410-B', product_name: 'Silicone Baking Mat - Blue', category: 'Silicone Product', series: 'SP3410', lifecycle: 'Running in the Market', image_url: 'assets/img/products/SP3410-B.png', country: 'US', marketplace: 'Amazon', site_sku: 'SP3410-B-US', asin: 'B09XXXSB01', currency: 'USD', regular_price: 12.99, minimum_price: 9.99, pm: 'Wendy' },
        { sku: 'SP0750', product_name: 'Kitchen Scale - White', category: 'Kitchen Scale', series: 'SP0750', lifecycle: 'Running in the Market', image_url: 'assets/img/products/SP0750.png', country: 'US', marketplace: 'Amazon', site_sku: 'SP0750-US', asin: 'B09XXX0750', currency: 'USD', regular_price: 19.99, minimum_price: 15.99, pm: 'Vic' },
        { sku: 'BOX-CO1100', product_name: 'CO1100 Selling Material Box', category: 'Selling Material', series: 'BOX', lifecycle: 'Running in the Market', image_url: 'assets/img/products/BOX-CO1100.png', country: 'US', marketplace: 'Internal', site_sku: 'BOX-CO1100-INT', asin: '', currency: 'USD', regular_price: 0, minimum_price: 0, pm: 'Vic' }
    ];

    // ========================================
    // Marketplace SKU 資料
    // ========================================
    var marketplaceSkus = [
        { sku: 'CO1100-R', country: 'US', marketplace: 'Amazon', site_sku: 'CO1100-R-US', asin: 'B09XXXXR01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'CO1100-S', country: 'US', marketplace: 'Amazon', site_sku: 'CO1100-S-US', asin: 'B09XXXXS01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'CO1100-W', country: 'US', marketplace: 'Amazon', site_sku: 'CO1100-W-US', asin: 'B09XXXXW01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'CO1100-R', country: 'US', marketplace: 'Walmart', site_sku: 'CO1100-R-WM', asin: '', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'CO1150-ZW', country: 'US', marketplace: 'Amazon', site_sku: 'CO1150-ZW-US', asin: 'B09XXXZW01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'CO1150-AG', country: 'US', marketplace: 'Amazon', site_sku: 'CO1150-AG-US', asin: 'B09XXXAG01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'CO2600-B', country: 'US', marketplace: 'Amazon', site_sku: 'CO2600-B-US', asin: 'B09XXX2B01', listing_status: 'pending', sales_status: 'upcoming', is_active: false },
        { sku: 'CO5600-RB', country: 'US', marketplace: 'Amazon', site_sku: 'CO5600-RB-US', asin: 'B09XXX5R01', listing_status: 'pending', sales_status: 'upcoming', is_active: false },
        { sku: 'SP3120-R', country: 'US', marketplace: 'Amazon', site_sku: 'SP3120-R-US', asin: 'B09XXXSR01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'SP3120-M', country: 'US', marketplace: 'Amazon', site_sku: 'SP3120-M-US', asin: 'B09XXXSM01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'SP3120-R', country: 'US', marketplace: 'Walmart', site_sku: 'SP3120-R-WM', asin: '', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'SP3410-B', country: 'US', marketplace: 'Amazon', site_sku: 'SP3410-B-US', asin: 'B09XXXSB01', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'SP0750', country: 'US', marketplace: 'Amazon', site_sku: 'SP0750-US', asin: 'B09XXX0750', listing_status: 'active', sales_status: 'selling', is_active: true },
        { sku: 'BOX-CO1100', country: 'US', marketplace: 'Internal', site_sku: 'BOX-CO1100-INT', asin: '', listing_status: 'internal', sales_status: 'not_selling', is_active: false }
    ];

    // ========================================
    // Inventory Demo Data
    // ========================================
    var inventory = [
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', sales_1d: 45, sales_7d: 310, sales_30d: 1350, sales_90d: 4200, fba_stock: 2800, third_wh_david: 500, third_wh_winit: 300, overseas_on_way_18d: 1200, overseas_on_way_45d: 2400, factory_youxin: 5000, factory_shengyi: 0, warning_status: 'normal', recommendation: '' },
        { sku: 'CO1100-S', product_name: 'Electric Can Opener - Silver', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', sales_1d: 38, sales_7d: 265, sales_30d: 1150, sales_90d: 3600, fba_stock: 2200, third_wh_david: 400, third_wh_winit: 200, overseas_on_way_18d: 1000, overseas_on_way_45d: 2000, factory_youxin: 4000, factory_shengyi: 0, warning_status: 'normal', recommendation: '' },
        { sku: 'CO1100-W', product_name: 'Electric Can Opener - White', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', sales_1d: 32, sales_7d: 220, sales_30d: 960, sales_90d: 3000, fba_stock: 1800, third_wh_david: 350, third_wh_winit: 150, overseas_on_way_18d: 800, overseas_on_way_45d: 1600, factory_youxin: 3500, factory_shengyi: 0, warning_status: 'normal', recommendation: '' },
        { sku: 'CO1150-ZW', product_name: 'Electric Can Opener Deluxe - White', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', sales_1d: 22, sales_7d: 155, sales_30d: 670, sales_90d: 2100, fba_stock: 1200, third_wh_david: 200, third_wh_winit: 100, overseas_on_way_18d: 600, overseas_on_way_45d: 1200, factory_youxin: 2500, factory_shengyi: 0, warning_status: 'normal', recommendation: '' },
        { sku: 'CO1150-AG', product_name: 'Electric Can Opener Deluxe - Green', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', sales_1d: 18, sales_7d: 125, sales_30d: 540, sales_90d: 1700, fba_stock: 900, third_wh_david: 150, third_wh_winit: 80, overseas_on_way_18d: 500, overseas_on_way_45d: 1000, factory_youxin: 2000, factory_shengyi: 0, warning_status: 'watch', recommendation: 'Monitor stock level' },
        { sku: 'CO2600-B', product_name: 'Electric Can Opener Pro - Black', category: 'Electric Can Opener', series: 'CO2600', country: 'US', marketplace: 'Amazon', sales_1d: 0, sales_7d: 0, sales_30d: 0, sales_90d: 0, fba_stock: 0, third_wh_david: 0, third_wh_winit: 0, overseas_on_way_18d: 0, overseas_on_way_45d: 500, factory_youxin: 3000, factory_shengyi: 0, warning_status: 'upcoming', recommendation: 'New product launch Q3' },
        { sku: 'CO5600-RB', product_name: 'Electric Can Opener Compact - Blue', category: 'Electric Can Opener', series: 'CO5600', country: 'US', marketplace: 'Amazon', sales_1d: 0, sales_7d: 0, sales_30d: 0, sales_90d: 0, fba_stock: 0, third_wh_david: 0, third_wh_winit: 0, overseas_on_way_18d: 0, overseas_on_way_45d: 0, factory_youxin: 0, factory_shengyi: 2000, warning_status: 'upcoming', recommendation: 'Production in progress' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', sales_1d: 12, sales_7d: 85, sales_30d: 360, sales_90d: 1100, fba_stock: 800, third_wh_david: 100, third_wh_winit: 50, overseas_on_way_18d: 400, overseas_on_way_45d: 800, factory_youxin: 0, factory_shengyi: 1500, warning_status: 'normal', recommendation: '' },
        { sku: 'SP3120-M', product_name: 'Silicone Spatula Set - Mint', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', sales_1d: 10, sales_7d: 70, sales_30d: 300, sales_90d: 950, fba_stock: 650, third_wh_david: 80, third_wh_winit: 40, overseas_on_way_18d: 350, overseas_on_way_45d: 700, factory_youxin: 0, factory_shengyi: 1200, warning_status: 'normal', recommendation: '' },
        { sku: 'SP3410-B', product_name: 'Silicone Baking Mat - Blue', category: 'Silicone Product', series: 'SP3410', country: 'US', marketplace: 'Amazon', sales_1d: 8, sales_7d: 55, sales_30d: 240, sales_90d: 750, fba_stock: 500, third_wh_david: 60, third_wh_winit: 30, overseas_on_way_18d: 250, overseas_on_way_45d: 500, factory_youxin: 0, factory_shengyi: 1000, warning_status: 'normal', recommendation: '' },
        { sku: 'SP0750', product_name: 'Kitchen Scale - White', category: 'Kitchen Scale', series: 'SP0750', country: 'US', marketplace: 'Amazon', sales_1d: 15, sales_7d: 105, sales_30d: 450, sales_90d: 1400, fba_stock: 400, third_wh_david: 50, third_wh_winit: 0, overseas_on_way_18d: 300, overseas_on_way_45d: 600, factory_youxin: 1800, factory_shengyi: 0, warning_status: 'watch', recommendation: 'Restock soon - 26 days coverage' },
        { sku: 'BOX-CO1100', product_name: 'CO1100 Selling Material Box', category: 'Selling Material', series: 'BOX', country: 'US', marketplace: 'Internal', sales_1d: 0, sales_7d: 0, sales_30d: 0, sales_90d: 0, fba_stock: 0, third_wh_david: 200, third_wh_winit: 0, overseas_on_way_18d: 0, overseas_on_way_45d: 0, factory_youxin: 500, factory_shengyi: 0, warning_status: 'internal', recommendation: 'Internal material - no sales tracking' }
    ];

    // ========================================
    // Factory Stock Demo Data
    // ========================================
    var factoryStock = [
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', series: 'CO1100', category: 'Electric Can Opener', factory_name: '侑鑫', factory_stock: 5000, reserved_qty: 1200, available_qty: 3800, production_status: 'in_production', next_production_date: '2026-07-15', qc_status: 'passed', last_updated: '2026-06-01' },
        { sku: 'CO1100-S', product_name: 'Electric Can Opener - Silver', series: 'CO1100', category: 'Electric Can Opener', factory_name: '侑鑫', factory_stock: 4000, reserved_qty: 1000, available_qty: 3000, production_status: 'in_production', next_production_date: '2026-07-15', qc_status: 'passed', last_updated: '2026-06-01' },
        { sku: 'CO1100-W', product_name: 'Electric Can Opener - White', series: 'CO1100', category: 'Electric Can Opener', factory_name: '侑鑫', factory_stock: 3500, reserved_qty: 800, available_qty: 2700, production_status: 'in_production', next_production_date: '2026-07-20', qc_status: 'passed', last_updated: '2026-06-01' },
        { sku: 'CO1150-ZW', product_name: 'Electric Can Opener Deluxe - White', series: 'CO1150', category: 'Electric Can Opener', factory_name: '侑鑫', factory_stock: 2500, reserved_qty: 600, available_qty: 1900, production_status: 'idle', next_production_date: '2026-08-01', qc_status: 'passed', last_updated: '2026-05-28' },
        { sku: 'CO1150-AG', product_name: 'Electric Can Opener Deluxe - Green', series: 'CO1150', category: 'Electric Can Opener', factory_name: '侑鑫', factory_stock: 2000, reserved_qty: 500, available_qty: 1500, production_status: 'idle', next_production_date: '2026-08-01', qc_status: 'passed', last_updated: '2026-05-28' },
        { sku: 'CO2600-B', product_name: 'Electric Can Opener Pro - Black', series: 'CO2600', category: 'Electric Can Opener', factory_name: '侑鑫', factory_stock: 3000, reserved_qty: 500, available_qty: 2500, production_status: 'in_production', next_production_date: '2026-07-01', qc_status: 'in_progress', last_updated: '2026-06-01' },
        { sku: 'CO5600-RB', product_name: 'Electric Can Opener Compact - Blue', series: 'CO5600', category: 'Electric Can Opener', factory_name: '勝一', factory_stock: 2000, reserved_qty: 0, available_qty: 2000, production_status: 'in_production', next_production_date: '2026-07-10', qc_status: 'in_progress', last_updated: '2026-06-01' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', series: 'SP3120', category: 'Silicone Product', factory_name: '勝一', factory_stock: 1500, reserved_qty: 400, available_qty: 1100, production_status: 'idle', next_production_date: '2026-07-25', qc_status: 'passed', last_updated: '2026-05-25' },
        { sku: 'SP3120-M', product_name: 'Silicone Spatula Set - Mint', series: 'SP3120', category: 'Silicone Product', factory_name: '勝一', factory_stock: 1200, reserved_qty: 350, available_qty: 850, production_status: 'idle', next_production_date: '2026-07-25', qc_status: 'passed', last_updated: '2026-05-25' },
        { sku: 'SP3410-B', product_name: 'Silicone Baking Mat - Blue', series: 'SP3410', category: 'Silicone Product', factory_name: '勝一', factory_stock: 1000, reserved_qty: 250, available_qty: 750, production_status: 'idle', next_production_date: '2026-08-05', qc_status: 'passed', last_updated: '2026-05-20' },
        { sku: 'SP0750', product_name: 'Kitchen Scale - White', series: 'SP0750', category: 'Kitchen Scale', factory_name: '侑鑫', factory_stock: 1800, reserved_qty: 600, available_qty: 1200, production_status: 'in_production', next_production_date: '2026-07-05', qc_status: 'passed', last_updated: '2026-06-01' },
        { sku: 'BOX-CO1100', product_name: 'CO1100 Selling Material Box', series: 'BOX', category: 'Selling Material', factory_name: '侑鑫', factory_stock: 500, reserved_qty: 0, available_qty: 500, production_status: 'idle', next_production_date: '', qc_status: 'n/a', last_updated: '2026-05-15' }
    ];

    // ========================================
    // Forecast Demo Data
    // ========================================
    var forecast = [
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', actual_sales_m1: 1350, actual_sales_m2: 1280, actual_sales_m3: 1420, forecast_m1: 1500, forecast_m2: 1600, forecast_m3: 1800, achievement_rate: 90, risk_level: 'normal', trend: 'stable', note: '' },
        { sku: 'CO1100-S', product_name: 'Electric Can Opener - Silver', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', actual_sales_m1: 1150, actual_sales_m2: 1100, actual_sales_m3: 1200, forecast_m1: 1300, forecast_m2: 1400, forecast_m3: 1500, achievement_rate: 88, risk_level: 'normal', trend: 'stable', note: '' },
        { sku: 'CO1100-W', product_name: 'Electric Can Opener - White', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', actual_sales_m1: 960, actual_sales_m2: 920, actual_sales_m3: 1000, forecast_m1: 1100, forecast_m2: 1200, forecast_m3: 1300, achievement_rate: 87, risk_level: 'normal', trend: 'stable', note: '' },
        { sku: 'CO1150-ZW', product_name: 'Electric Can Opener Deluxe - White', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', actual_sales_m1: 670, actual_sales_m2: 640, actual_sales_m3: 700, forecast_m1: 750, forecast_m2: 800, forecast_m3: 850, achievement_rate: 89, risk_level: 'normal', trend: 'growing', note: '' },
        { sku: 'CO1150-AG', product_name: 'Electric Can Opener Deluxe - Green', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', actual_sales_m1: 540, actual_sales_m2: 510, actual_sales_m3: 560, forecast_m1: 650, forecast_m2: 700, forecast_m3: 750, achievement_rate: 83, risk_level: 'watch', trend: 'growing', note: 'Stock coverage dropping' },
        { sku: 'CO2600-B', product_name: 'Electric Can Opener Pro - Black', category: 'Electric Can Opener', series: 'CO2600', country: 'US', marketplace: 'Amazon', actual_sales_m1: 0, actual_sales_m2: 0, actual_sales_m3: 0, forecast_m1: 800, forecast_m2: 1200, forecast_m3: 1500, achievement_rate: 0, risk_level: 'high', trend: 'new', note: 'New launch - aggressive forecast' },
        { sku: 'CO5600-RB', product_name: 'Electric Can Opener Compact - Blue', category: 'Electric Can Opener', series: 'CO5600', country: 'US', marketplace: 'Amazon', actual_sales_m1: 0, actual_sales_m2: 0, actual_sales_m3: 0, forecast_m1: 500, forecast_m2: 800, forecast_m3: 1000, achievement_rate: 0, risk_level: 'high', trend: 'new', note: 'New launch - moderate forecast' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', actual_sales_m1: 360, actual_sales_m2: 340, actual_sales_m3: 380, forecast_m1: 400, forecast_m2: 420, forecast_m3: 450, achievement_rate: 90, risk_level: 'normal', trend: 'stable', note: '' },
        { sku: 'SP3120-M', product_name: 'Silicone Spatula Set - Mint', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', actual_sales_m1: 300, actual_sales_m2: 280, actual_sales_m3: 320, forecast_m1: 350, forecast_m2: 370, forecast_m3: 400, achievement_rate: 86, risk_level: 'normal', trend: 'stable', note: '' },
        { sku: 'SP3410-B', product_name: 'Silicone Baking Mat - Blue', category: 'Silicone Product', series: 'SP3410', country: 'US', marketplace: 'Amazon', actual_sales_m1: 240, actual_sales_m2: 220, actual_sales_m3: 260, forecast_m1: 280, forecast_m2: 300, forecast_m3: 320, achievement_rate: 86, risk_level: 'normal', trend: 'stable', note: '' },
        { sku: 'SP0750', product_name: 'Kitchen Scale - White', category: 'Kitchen Scale', series: 'SP0750', country: 'US', marketplace: 'Amazon', actual_sales_m1: 450, actual_sales_m2: 420, actual_sales_m3: 480, forecast_m1: 500, forecast_m2: 550, forecast_m3: 600, achievement_rate: 90, risk_level: 'watch', trend: 'growing', note: 'Stock may run low in 4 weeks' },
        { sku: 'BOX-CO1100', product_name: 'CO1100 Selling Material Box', category: 'Selling Material', series: 'BOX', country: 'US', marketplace: 'Internal', actual_sales_m1: 0, actual_sales_m2: 0, actual_sales_m3: 0, forecast_m1: 0, forecast_m2: 0, forecast_m3: 0, achievement_rate: 0, risk_level: 'internal', trend: 'n/a', note: 'Internal material' }
    ];

    // ========================================
    // Request Order Demo Data
    // ========================================
    var requestOrders = [
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', forecast_qty: 1500, current_stock: 2800, incoming_qty: 1200, coverage_days: 62, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: 'Stock sufficient for 62 days' },
        { sku: 'CO1100-S', product_name: 'Electric Can Opener - Silver', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', forecast_qty: 1300, current_stock: 2200, incoming_qty: 1000, coverage_days: 56, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: 'Stock sufficient for 56 days' },
        { sku: 'CO1100-W', product_name: 'Electric Can Opener - White', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', forecast_qty: 1100, current_stock: 1800, incoming_qty: 800, coverage_days: 52, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: 'Stock sufficient for 52 days' },
        { sku: 'CO1150-ZW', product_name: 'Electric Can Opener Deluxe - White', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', forecast_qty: 750, current_stock: 1200, incoming_qty: 600, coverage_days: 54, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: '' },
        { sku: 'CO1150-AG', product_name: 'Electric Can Opener Deluxe - Green', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', forecast_qty: 650, current_stock: 900, incoming_qty: 500, coverage_days: 38, shortage_qty: 150, suggest_order_qty: 500, request_qty: 500, decision_status: 'order_needed', reason: 'Coverage below 45 days threshold' },
        { sku: 'CO2600-B', product_name: 'Electric Can Opener Pro - Black', category: 'Electric Can Opener', series: 'CO2600', country: 'US', marketplace: 'Amazon', forecast_qty: 800, current_stock: 0, incoming_qty: 500, coverage_days: 0, shortage_qty: 300, suggest_order_qty: 2000, request_qty: 2000, decision_status: 'order_needed', reason: 'New product - initial stock required' },
        { sku: 'CO5600-RB', product_name: 'Electric Can Opener Compact - Blue', category: 'Electric Can Opener', series: 'CO5600', country: 'US', marketplace: 'Amazon', forecast_qty: 500, current_stock: 0, incoming_qty: 0, coverage_days: 0, shortage_qty: 500, suggest_order_qty: 1500, request_qty: 1500, decision_status: 'order_needed', reason: 'New product - awaiting production' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', forecast_qty: 400, current_stock: 800, incoming_qty: 400, coverage_days: 67, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: '' },
        { sku: 'SP3120-M', product_name: 'Silicone Spatula Set - Mint', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', forecast_qty: 350, current_stock: 650, incoming_qty: 350, coverage_days: 65, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: '' },
        { sku: 'SP3410-B', product_name: 'Silicone Baking Mat - Blue', category: 'Silicone Product', series: 'SP3410', country: 'US', marketplace: 'Amazon', forecast_qty: 280, current_stock: 500, incoming_qty: 250, coverage_days: 63, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'sufficient', reason: '' },
        { sku: 'SP0750', product_name: 'Kitchen Scale - White', category: 'Kitchen Scale', series: 'SP0750', country: 'US', marketplace: 'Amazon', forecast_qty: 500, current_stock: 400, incoming_qty: 300, coverage_days: 26, shortage_qty: 200, suggest_order_qty: 800, request_qty: 800, decision_status: 'order_needed', reason: 'Coverage only 26 days - urgent restock' },
        { sku: 'BOX-CO1100', product_name: 'CO1100 Selling Material Box', category: 'Selling Material', series: 'BOX', country: 'US', marketplace: 'Internal', forecast_qty: 0, current_stock: 200, incoming_qty: 0, coverage_days: 999, shortage_qty: 0, suggest_order_qty: 0, request_qty: 0, decision_status: 'internal', reason: 'Internal material - low priority' }
    ];

    // ========================================
    // FC Summary Demo Data
    // ========================================
    var fcSummary = [
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 1500, event_forecast: 300, target_qty: 1800, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'CO1100-R', product_name: 'Electric Can Opener - Red', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', fc_name: '3rd WH David', month: '2026-07', regular_forecast: 500, event_forecast: 100, target_qty: 600, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'CO1100-S', product_name: 'Electric Can Opener - Silver', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 1300, event_forecast: 200, target_qty: 1500, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'CO1100-W', product_name: 'Electric Can Opener - White', category: 'Electric Can Opener', series: 'CO1100', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 1100, event_forecast: 150, target_qty: 1250, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'CO1150-ZW', product_name: 'Electric Can Opener Deluxe - White', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 750, event_forecast: 100, target_qty: 850, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'CO1150-AG', product_name: 'Electric Can Opener Deluxe - Green', category: 'Electric Can Opener', series: 'CO1150', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 650, event_forecast: 80, target_qty: 730, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'CO2600-B', product_name: 'Electric Can Opener Pro - Black', category: 'Electric Can Opener', series: 'CO2600', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 800, event_forecast: 0, target_qty: 800, actual_qty: 0, achievement_rate: 0, status: 'new_launch' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 400, event_forecast: 50, target_qty: 450, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'SP3120-R', product_name: 'Silicone Spatula Set - Red', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', fc_name: '3rd WH Winit', month: '2026-07', regular_forecast: 100, event_forecast: 0, target_qty: 100, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'SP3120-M', product_name: 'Silicone Spatula Set - Mint', category: 'Silicone Product', series: 'SP3120', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 350, event_forecast: 40, target_qty: 390, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'SP0750', product_name: 'Kitchen Scale - White', category: 'Kitchen Scale', series: 'SP0750', country: 'US', marketplace: 'Amazon', fc_name: 'Amazon FBA', month: '2026-07', regular_forecast: 500, event_forecast: 80, target_qty: 580, actual_qty: 0, achievement_rate: 0, status: 'planned' },
        { sku: 'BOX-CO1100', product_name: 'CO1100 Selling Material Box', category: 'Selling Material', series: 'BOX', country: 'US', marketplace: 'Internal', fc_name: '3rd WH David', month: '2026-07', regular_forecast: 0, event_forecast: 0, target_qty: 0, actual_qty: 0, achievement_rate: 0, status: 'internal' }
    ];

    // ========================================
    // Filter helper
    // ========================================
    function applyFilters(data, filters) {
        if (!filters) return data.slice();
        return data.filter(function(row) {
            if (filters.country && row.country && row.country !== filters.country) return false;
            if (filters.marketplace && row.marketplace && row.marketplace !== filters.marketplace) return false;
            if (filters.sku && row.sku && row.sku.toLowerCase().indexOf(filters.sku.toLowerCase()) === -1) return false;
            if (filters.category && row.category && row.category !== filters.category) return false;
            if (filters.series && row.series && row.series !== filters.series) return false;
            return true;
        });
    }

    // ========================================

    // ========================================
    // Home Page Demo Data
    // ========================================
    var homeEvents = [
        { name: 'Prime Day 2026', startDate: '7/15', endDate: '7/16', content: 'Amazon Prime Day - All SKUs participate' },
        { name: 'BFCM 2026', startDate: '11/28', endDate: '12/2', content: 'Black Friday / Cyber Monday campaign' },
        { name: 'Spring Deal 2026', startDate: '3/20', endDate: '3/27', content: 'Spring seasonal promotion' }
    ];

    var homeGoal = {
        year: 2026,
        goalAmount: 5000000,
        salesAmount: 1850000
    };

    var homeAnnouncements = [
        { title: 'CO2600-B new product launch confirmed for Q3', time: '2026-06-01' },
        { title: 'Factory price adjustment effective July 2026', time: '2026-05-28' },
        { title: 'Walmart marketplace expansion plan approved', time: '2026-05-25' }
    ];

    var homeUrgentIssues = [
        { title: 'SP0750 stock coverage below 26 days - urgent restock needed' },
        { title: 'CO1150-AG achievement rate dropping - review forecast' }
    ];

    var homeTodos = [
        { text: 'Review Q3 forecast for CO2600-B launch' },
        { text: 'Confirm carrier rates with DHL for July shipment' },
        { text: 'Update factory order template for new SKUs' }
    ];

    // KM.DemoData API
    // ========================================
    var enabled = false;

    window.KM.DemoData = {
        enabled: enabled,
        version: 'demo-2026-06',
        skus: skus,
        marketplaceSkus: marketplaceSkus,
        inventory: inventory,
        factoryStock: factoryStock,
        forecast: forecast,
        requestOrders: requestOrders,
        fcSummary: fcSummary,

        getSkus: function() { return skus.slice(); },
        getSkuBySku: function(sku) { return skus.find(function(s) { return s.sku === sku; }) || null; },
        getMarketplaceSkus: function(country, marketplace) {
            return marketplaceSkus.filter(function(m) {
                if (country && m.country !== country) return false;
                if (marketplace && m.marketplace !== marketplace) return false;
                return true;
            });
        },
        getInventoryRows: function(filters) { return applyFilters(inventory, filters); },
        getFactoryStockRows: function(filters) { return applyFilters(factoryStock, filters); },
        getForecastRows: function(filters) { return applyFilters(forecast, filters); },
        getRequestOrderRows: function(filters) { return applyFilters(requestOrders, filters); },
        getFcSummaryRows: function(filters) { return applyFilters(fcSummary, filters); },
        getHomeEvents: function() { return homeEvents.slice(); },
        getHomeGoal: function() { return JSON.parse(JSON.stringify(homeGoal)); },
        getHomeAnnouncements: function() { return homeAnnouncements.slice(); },
        getHomeUrgentIssues: function() { return homeUrgentIssues.slice(); },
        getHomeTodos: function() { return homeTodos.slice(); },
        isEnabled: function() { return enabled; },
        setEnabled: function(val) {
            enabled = !!val;
            window.KM.DemoData.enabled = enabled;
        }
    };

    console.log('[KM] DemoData initialized - version: demo-2026-06, SKUs: ' + skus.length);
})();

// ========================================
// Debug Helpers (Global)
// ========================================
window.debugDemoData = function() {
    var d = window.KM.DemoData;
    console.log('=== Demo Data Debug ===');
    console.log('enabled:', d.enabled);
    console.log('version:', d.version);
    console.log('SKU count:', d.skus.length);
    console.log('marketplaceSkus count:', d.marketplaceSkus.length);
    console.log('inventory rows:', d.inventory.length);
    console.log('factoryStock rows:', d.factoryStock.length);
    console.log('forecast rows:', d.forecast.length);
    console.log('requestOrders rows:', d.requestOrders.length);
    console.log('fcSummary rows:', d.fcSummary.length);
    console.log('');
    console.log('--- SKUs ---');
    console.table(d.skus);
    console.log('--- Inventory ---');
    console.table(d.inventory);
    console.log('--- Forecast ---');
    console.table(d.forecast);
    console.log('--- Request Orders ---');
    console.table(d.requestOrders);
};

window.setDemoDataMode = function(enabled) {
    if (!window.KM || !window.KM.DemoData) {
        console.error('[DemoData] KM.DemoData not available');
        return;
    }
    window.KM.DemoData.setEnabled(enabled);
    console.log('[DemoData] Demo mode ' + (enabled ? 'ENABLED' : 'DISABLED'));
};


// ========================================
// Demo Data Consistency Audit - Phase 4
// ========================================
window.auditDemoDataConsistency = function() {
    var d = window.KM && window.KM.DemoData;
    if (!d) { console.error('[Audit] KM.DemoData not found'); return; }

    var issues = [];
    console.log('=== Demo Data Consistency Audit ===');
    console.log('');

    // --- 1. Dataset Counts ---
    console.log('--- 1. Dataset Counts ---');
    console.log('  skus:', d.skus.length);
    console.log('  marketplaceSkus:', d.marketplaceSkus.length);
    console.log('  inventory:', d.inventory.length);
    console.log('  factoryStock:', d.factoryStock.length);
    console.log('  forecast:', d.forecast.length);
    console.log('  requestOrders:', d.requestOrders.length);
    console.log('  fcSummary:', d.fcSummary.length);
    console.log('');

    // --- 2. SKU Coverage ---
    console.log('--- 2. SKU Coverage ---');
    var masterSkus = d.skus.map(function(s) { return s.sku; });
    var datasets = {
        inventory: d.inventory.map(function(r) { return r.sku; }),
        factoryStock: d.factoryStock.map(function(r) { return r.sku; }),
        forecast: d.forecast.map(function(r) { return r.sku; }),
        requestOrders: d.requestOrders.map(function(r) { return r.sku; }),
        fcSummary: Array.from(new Set(d.fcSummary.map(function(r) { return r.sku; })))
    };
    console.log('  Master SKU count:', masterSkus.length);
    var skuCoverageIssues = [];
    Object.keys(datasets).forEach(function(name) {
        var dsSkus = Array.from(new Set(datasets[name]));
        var missing = masterSkus.filter(function(s) { return dsSkus.indexOf(s) === -1; });
        var extra = dsSkus.filter(function(s) { return masterSkus.indexOf(s) === -1; });
        console.log('  ' + name + ': ' + dsSkus.length + ' unique SKUs');
        if (missing.length > 0) {
            skuCoverageIssues.push({ dataset: name, type: 'missing_from_dataset', skus: missing.join(', ') });
        }
        if (extra.length > 0) {
            skuCoverageIssues.push({ dataset: name, type: 'extra_not_in_master', skus: extra.join(', ') });
        }
    });
    if (skuCoverageIssues.length > 0) {
        console.table(skuCoverageIssues);
    } else {
        console.log('  All datasets have full SKU coverage. No issues.');
    }
    console.log('');

    // --- 3. Marketplace Coverage ---
    console.log('--- 3. Marketplace Coverage ---');
    var mpSkus = d.marketplaceSkus;
    var activeAmazon = mpSkus.filter(function(m) { return m.country === 'US' && m.marketplace === 'Amazon' && m.is_active; });
    var activeWalmart = mpSkus.filter(function(m) { return m.country === 'US' && m.marketplace === 'Walmart' && m.is_active; });
    var internalMp = mpSkus.filter(function(m) { return !m.is_active || m.sales_status === 'not_selling'; });
    var skusWithMp = Array.from(new Set(mpSkus.map(function(m) { return m.sku; })));
    var skusWithoutMp = masterSkus.filter(function(s) { return skusWithMp.indexOf(s) === -1; });
    console.log('  Total marketplaceSkus:', mpSkus.length);
    console.log('  Active US Amazon:', activeAmazon.length);
    console.log('  Active US Walmart:', activeWalmart.length);
    console.log('  Internal / non-selling:', internalMp.length);
    if (skusWithoutMp.length > 0) {
        console.log('  SKUs without marketplace mapping:', skusWithoutMp.join(', '));
        issues.push({ severity: 'low', area: 'marketplace', detail: skusWithoutMp.join(', ') + ' have no marketplace mapping' });
    } else {
        console.log('  All master SKUs have marketplace mapping.');
    }
    console.log('');

    // --- 4. Inventory → Request Order Consistency ---
    console.log('--- 4. Inventory → Request Order Checks ---');
    var invRoIssues = [];
    d.requestOrders.forEach(function(ro) {
        var inv = d.inventory.find(function(i) { return i.sku === ro.sku; });
        if (!inv) return;
        var totalStock = inv.fba_stock + inv.third_wh_david + inv.third_wh_winit;
        var fc = d.forecast.find(function(f) { return f.sku === ro.sku; });
        var forecastQty = fc ? fc.forecast_m1 : 0;

        // Check: low stock + high forecast should have suggest > 0
        if (totalStock < forecastQty * 0.5 && forecastQty > 100 && ro.suggest_order_qty === 0) {
            invRoIssues.push({ sku: ro.sku, inventoryStock: totalStock, forecastQty: forecastQty, requestSuggestQty: ro.suggest_order_qty, decisionStatus: ro.decision_status, issue: 'Low stock + high forecast but suggest=0' });
        }
        // Check: sufficient stock should not have huge suggest
        if (totalStock > forecastQty * 2 && ro.suggest_order_qty > forecastQty) {
            invRoIssues.push({ sku: ro.sku, inventoryStock: totalStock, forecastQty: forecastQty, requestSuggestQty: ro.suggest_order_qty, decisionStatus: ro.decision_status, issue: 'Stock sufficient but suggest too high' });
        }
        // Check: shortage > 0 but status is sufficient
        if (ro.shortage_qty > 0 && ro.decision_status === 'sufficient') {
            invRoIssues.push({ sku: ro.sku, inventoryStock: totalStock, forecastQty: forecastQty, requestSuggestQty: ro.suggest_order_qty, decisionStatus: ro.decision_status, issue: 'Shortage > 0 but status is sufficient' });
        }
        // Check: BOX should not have large suggest
        if (ro.category === 'Selling Material' && ro.suggest_order_qty > 100) {
            invRoIssues.push({ sku: ro.sku, inventoryStock: totalStock, forecastQty: forecastQty, requestSuggestQty: ro.suggest_order_qty, decisionStatus: ro.decision_status, issue: 'Selling Material with large suggest_order_qty' });
        }
    });
    if (invRoIssues.length > 0) {
        console.table(invRoIssues);
        invRoIssues.forEach(function(i) { issues.push({ severity: 'medium', area: 'inv_ro', detail: i.sku + ': ' + i.issue }); });
    } else {
        console.log('  No Inventory → Request Order inconsistencies found.');
    }
    console.log('');

    // --- 5. Inventory → Factory Stock Consistency ---
    console.log('--- 5. Inventory → Factory Stock Checks ---');
    var factoryIssues = [];
    d.inventory.forEach(function(inv) {
        var fsYouxin = d.factoryStock.find(function(f) { return f.sku === inv.sku && f.factory_name === '侑鑫'; });
        var fsShengyi = d.factoryStock.find(function(f) { return f.sku === inv.sku && f.factory_name === '勝一'; });
        var youxinStock = fsYouxin ? fsYouxin.factory_stock : 0;
        var shengyiStock = fsShengyi ? fsShengyi.factory_stock : 0;
        var tolerance = 0.2;

        if (inv.factory_youxin > 0 && youxinStock > 0) {
            var diff = Math.abs(inv.factory_youxin - youxinStock) / Math.max(inv.factory_youxin, youxinStock);
            if (diff > tolerance) {
                factoryIssues.push({ sku: inv.sku, inventoryYouxin: inv.factory_youxin, factoryYouxin: youxinStock, inventoryShengyi: inv.factory_shengyi, factoryShengyi: shengyiStock, issue: '侑鑫 diff ' + (diff * 100).toFixed(0) + '% > 20%' });
            }
        }
        if (inv.factory_shengyi > 0 && shengyiStock > 0) {
            var diff2 = Math.abs(inv.factory_shengyi - shengyiStock) / Math.max(inv.factory_shengyi, shengyiStock);
            if (diff2 > tolerance) {
                factoryIssues.push({ sku: inv.sku, inventoryYouxin: inv.factory_youxin, factoryYouxin: youxinStock, inventoryShengyi: inv.factory_shengyi, factoryShengyi: shengyiStock, issue: '勝一 diff ' + (diff2 * 100).toFixed(0) + '% > 20%' });
            }
        }
    });
    if (factoryIssues.length > 0) {
        console.table(factoryIssues);
        factoryIssues.forEach(function(i) { issues.push({ severity: 'low', area: 'inv_factory', detail: i.sku + ': ' + i.issue }); });
    } else {
        console.log('  No Inventory → Factory Stock inconsistencies found.');
    }
    console.log('');

    // --- 6. Forecast → FC Summary Consistency ---
    console.log('--- 6. Forecast → FC Summary Checks ---');
    var fcIssues = [];
    d.forecast.forEach(function(fc) {
        var summaryRows = d.fcSummary.filter(function(s) { return s.sku === fc.sku; });
        if (summaryRows.length === 0 && fc.forecast_m1 > 0) {
            fcIssues.push({ sku: fc.sku, forecastM1: fc.forecast_m1, regularForecast: 0, targetQty: 0, issue: 'Has forecast but missing from fcSummary' });
            return;
        }
        var totalRegular = summaryRows.reduce(function(sum, s) { return sum + s.regular_forecast; }, 0);
        var totalTarget = summaryRows.reduce(function(sum, s) { return sum + s.target_qty; }, 0);
        // Check: high forecast but low FC summary
        if (fc.forecast_m1 > 500 && totalRegular === 0) {
            fcIssues.push({ sku: fc.sku, forecastM1: fc.forecast_m1, regularForecast: totalRegular, targetQty: totalTarget, issue: 'High forecast but 0 regular in FC Summary' });
        }
        // Check: BOX should not have high target
        if (fc.category === 'Selling Material' && totalTarget > 100) {
            fcIssues.push({ sku: fc.sku, forecastM1: fc.forecast_m1, regularForecast: totalRegular, targetQty: totalTarget, issue: 'Selling Material with high target_qty in FC Summary' });
        }
    });
    if (fcIssues.length > 0) {
        console.table(fcIssues);
        fcIssues.forEach(function(i) { issues.push({ severity: 'low', area: 'fc_summary', detail: i.sku + ': ' + i.issue }); });
    } else {
        console.log('  No Forecast → FC Summary inconsistencies found.');
    }
    console.log('');

    // --- 7. Selling Material Checks ---
    console.log('--- 7. Selling Material Checks ---');
    var sellingMaterialSkus = d.skus.filter(function(s) { return s.category === 'Selling Material'; });
    var smWarnings = [];
    sellingMaterialSkus.forEach(function(sm) {
        var inv = d.inventory.find(function(i) { return i.sku === sm.sku; });
        var fc = d.forecast.find(function(f) { return f.sku === sm.sku; });
        var ro = d.requestOrders.find(function(r) { return r.sku === sm.sku; });
        var fcSum = d.fcSummary.filter(function(s) { return s.sku === sm.sku; });
        var warn = [];
        if (inv && inv.sales_1d > 0) warn.push('has sales data');
        if (fc && fc.forecast_m1 > 100) warn.push('high forecast');
        if (ro && ro.suggest_order_qty > 100) warn.push('high suggest order');
        if (fcSum.length > 0 && fcSum.some(function(s) { return s.target_qty > 100; })) warn.push('high target in FC Summary');
        if (warn.length > 0) {
            smWarnings.push({ sku: sm.sku, category: 'Selling Material', issues: warn.join(', ') });
        }
    });
    if (smWarnings.length > 0) {
        console.table(smWarnings);
        smWarnings.forEach(function(w) { issues.push({ severity: 'low', area: 'selling_material', detail: w.sku + ': ' + w.issues }); });
    } else {
        console.log('  Selling Material SKUs are correctly marked as internal. No issues.');
    }
    console.log('');

    // --- 8. Helper Availability ---
    console.log('--- 8. Helper Availability ---');
    var helpers = {
        'KM.DemoData.enabled': d.enabled,
        'KM.DemoData.version': d.version,
        'setDemoDataMode': typeof window.setDemoDataMode === 'function',
        'debugDemoData': typeof window.debugDemoData === 'function',
        'debugInventoryDemoData': typeof window.debugInventoryDemoData === 'function',
        'debugFactoryDemoData': typeof window.debugFactoryDemoData === 'function',
        'debugForecastDemoData': typeof window.debugForecastDemoData === 'function',
        'debugRequestOrderDemoData': typeof window.debugRequestOrderDemoData === 'function',
        'debugFcSummaryDemoData': typeof window.debugFcSummaryDemoData === 'function'
    };
    Object.keys(helpers).forEach(function(k) {
        var status = helpers[k] === true ? '✅' : helpers[k] === false ? '❌' : helpers[k];
        console.log('  ' + k + ': ' + status);
    });
    console.log('');

    // --- 9. Final Result ---
    console.log('--- 9. Final Result ---');
    var highIssues = issues.filter(function(i) { return i.severity === 'high'; });
    var mediumIssues = issues.filter(function(i) { return i.severity === 'medium'; });
    var lowIssues = issues.filter(function(i) { return i.severity === 'low'; });
    console.log('  High:', highIssues.length, '| Medium:', mediumIssues.length, '| Low:', lowIssues.length);

    if (highIssues.length > 0 || mediumIssues.length > 0) {
        console.log('  Result: ❌ NEEDS FIX');
        console.table(issues);
    } else if (lowIssues.length > 0) {
        console.log('  Result: ⚠️ PASS WITH WARNINGS');
        console.table(lowIssues);
    } else {
        console.log('  Result: ✅ PASS');
    }
    console.log('');
    console.log('=== Audit Complete ===');
    return { pass: highIssues.length === 0 && mediumIssues.length === 0, issues: issues };
};


// ========================================
// Demo Mode UI Toggle Switch
// 左下角固定按鈕，點擊切換 Demo/正常模式
// ========================================
(function() {
    function createDemoToggle() {
        if (document.getElementById('demo-mode-toggle')) return;

        var btn = document.createElement('button');
        btn.id = 'demo-mode-toggle';
        btn.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9999;padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
        updateToggleUI(btn);

        btn.addEventListener('click', function() {
            var d = window.KM && window.KM.DemoData;
            if (!d) return;
            var newState = !d.isEnabled();
            d.setEnabled(newState);
            updateToggleUI(btn);
            // 重新載入當前頁面
            var current = window.KM && window.KM.lifecycle && window.KM.lifecycle.getCurrentPage();
            if (current && window.KM.lifecycle.switchTo) {
                // 先 unmount 再 mount 觸發重新渲染
                window.KM.lifecycle.switchTo(null);
                setTimeout(function() {
                    window.KM.lifecycle.switchTo(current);
                }, 50);
            }
        });

        document.body.appendChild(btn);
    }

    function updateToggleUI(btn) {
        var d = window.KM && window.KM.DemoData;
        var isOn = d && d.isEnabled();
        if (isOn) {
            btn.style.background = '#8b5cf6';
            btn.style.color = 'white';
            btn.textContent = '⬤ Demo Mode ON';
            btn.title = 'Click to switch to normal mode';
        } else {
            btn.style.background = '#E2E8F0';
            btn.style.color = '#64748B';
            btn.textContent = '○ Demo Mode OFF';
            btn.title = 'Click to switch to demo mode';
        }
    }

    // DOM ready 後建立按鈕
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDemoToggle);
    } else {
        createDemoToggle();
    }
})();
