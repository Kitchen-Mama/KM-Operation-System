// Inventory Replenishment - Add SKU Modal

function openReplenAddSkuModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');
  
  if (!modal || !overlay) return;
  
  const currentCountry = document.getElementById('replenCountry')?.value;
  const currentMarketplace = document.getElementById('replenMarketplace')?.value;
  
  if (currentCountry) document.getElementById('replen-add-country').value = currentCountry;
  if (currentMarketplace) document.getElementById('replen-add-marketplace').value = currentMarketplace;
  
  modal.classList.add('is-open');
  overlay.classList.add('is-open');
}

function closeReplenModal() {
  const modal = document.getElementById('replen-add-sku-modal');
  const overlay = document.getElementById('replen-modal-overlay');
  
  if (!modal || !overlay) return;
  
  modal.classList.remove('is-open');
  overlay.classList.remove('is-open');
  
  const skuInput = document.getElementById('replen-add-sku');
  if (skuInput) skuInput.value = '';
}

function saveReplenSku() {
  const sku = document.getElementById('replen-add-sku')?.value.trim();
  const country = document.getElementById('replen-add-country')?.value;
  const marketplace = document.getElementById('replen-add-marketplace')?.value;
  const status = document.getElementById('replen-add-status')?.value;
  
  if (!sku) {
    alert('SKU is required');
    return;
  }
  
  if (!window.replenishmentData) {
    alert('Data not loaded');
    return;
  }
  
  const exists = replenishmentData.some(item => 
    item.sku === sku && 
    item.country === country && 
    item.marketplace === marketplace
  );
  
  if (exists) {
    alert(`SKU "${sku}" already exists for ${country} - ${marketplace}`);
    return;
  }
  
  const newItem = {
    sku: sku,
    country: country,
    marketplace: marketplace,
    status: status,
    currentStock: 0,
    onTheWay: 0,
    thirdPartyStock: 0,
    avgSalesPerDay: 0,
    fc60Days: 0,
    upcomingEvent: '',
    daysOfSupply: 0,
    suggestedQty: 0,
    plannedQty: 0,
    cnStock: 0,
    twStock: 0
  };
  
  replenishmentData.push(newItem);
  
  if (typeof renderReplenishment === 'function') {
    renderReplenishment();
  }
  
  closeReplenModal();
  
  alert(`SKU "${sku}" added successfully to ${country} - ${marketplace}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('replen-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeReplenModal);
  }
});
