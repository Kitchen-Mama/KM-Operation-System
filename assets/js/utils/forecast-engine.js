// Forecast Order Engine - 三期缺口計算引擎

(function() {
  'use strict';
  
  // 確保 KM.utils 存在
  if (!window.KM) {
    window.KM = {};
  }
  if (!window.KM.utils) {
    window.KM.utils = {};
  }
  
  /**
   * 計算單一 SKU 的三期缺口
   * @param {Object} input - 輸入參數
   * @returns {Object} 計算結果
   */
  function calculateShortage(input) {
    // 預設值處理
    const data = {
      // Supply
      siteStock: input.siteStock || 0,
      siteOnTheWay: input.siteOnTheWay || 0,
      overseasStock: input.overseasStock || 0,
      overseasOnTheWay: input.overseasOnTheWay || 0,
      factoryStockCN: input.factoryStockCN || 0,
      factoryStockTW: input.factoryStockTW || 0,
      thisMonthOngoingOrder: input.thisMonthOngoingOrder || 0,
      nextMonthOngoingOrder: input.nextMonthOngoingOrder || 0,
      fcAllocationRatio: input.fcAllocationRatio || 0,
      
      // Demand - This Month
      fcThisMonthDaily: input.fcThisMonthDaily || 0,
      remainingDaysThisMonth: input.remainingDaysThisMonth || 0,
      
      // Demand - FC
      fcNextMonth: input.fcNextMonth || 0,
      fcMonth2: input.fcMonth2 || 0,
      fcMonth3: input.fcMonth3 || 0,
      
      // Demand - Campaign FC
      campaignNextMonth: input.campaignNextMonth || 0,
      campaignMonth2: input.campaignMonth2 || 0,
      campaignMonth3: input.campaignMonth3 || 0,
      
      // Target Factor (預設 100%)
      tfThisMonth: input.tfThisMonth !== undefined ? input.tfThisMonth : 1.0,
      tfNextMonth: input.tfNextMonth !== undefined ? input.tfNextMonth : 1.0,
      tfMonth2: input.tfMonth2 !== undefined ? input.tfMonth2 : 1.0,
      tfMonth3: input.tfMonth3 !== undefined ? input.tfMonth3 : 1.0,
      campaignTfNextMonth: input.campaignTfNextMonth !== undefined ? input.campaignTfNextMonth : 1.0,
      campaignTfMonth2: input.campaignTfMonth2 !== undefined ? input.campaignTfMonth2 : 1.0,
      campaignTfMonth3: input.campaignTfMonth3 !== undefined ? input.campaignTfMonth3 : 1.0
    };
    
    // 1. 計算總站點庫存
    const totalSiteStock = data.siteStock + data.siteOnTheWay + data.overseasStock + data.overseasOnTheWay;
    
    // 2. 計算工廠總庫存
    const factoryStockTotal = data.factoryStockCN + data.factoryStockTW;
    
    // 3. 計算本月剩餘需求
    const fcThisMonth = data.remainingDaysThisMonth * data.fcThisMonthDaily;
    
    // 4. 計算三期需求
    const t1Fc = (fcThisMonth * data.tfThisMonth) + (data.fcNextMonth * data.tfNextMonth) + (data.campaignNextMonth * data.campaignTfNextMonth);
    const t2Fc = (data.fcMonth2 * data.tfMonth2) + (data.campaignMonth2 * data.campaignTfMonth2);
    const t3Fc = (data.fcMonth3 * data.tfMonth3) + (data.campaignMonth3 * data.campaignTfMonth3);
    
    // 5. 計算供給基礎
    const supplyBase = totalSiteStock + (factoryStockTotal * data.fcAllocationRatio);
    
    // 6. 計算三期缺貨（遞推）
    const shortageMonth1 = supplyBase - t1Fc;
    const shortageMonth2 = shortageMonth1 + (data.thisMonthOngoingOrder * data.fcAllocationRatio) - t2Fc;
    const shortageMonth3 = shortageMonth2 + (data.nextMonthOngoingOrder * data.fcAllocationRatio) - t3Fc;
    
    return {
      // 中間計算值
      totalSiteStock,
      factoryStockTotal,
      fcThisMonth,
      t1Fc,
      t2Fc,
      t3Fc,
      supplyBase,
      
      // 最終結果
      shortageMonth1,
      shortageMonth2,
      shortageMonth3
    };
  }
  
  // 掛載到 KM.utils
  window.KM.utils.forecastEngine = {
    calculateShortage
  };
  
})();
