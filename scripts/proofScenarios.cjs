const { computeProjectTotals, recomputeUnitTotals, computeDashboardMetrics } = require('../.tmp-proof-cjs/utils.cjs');
const { OwnershipType, TransactionScope, TransactionSide } = require('../.tmp-proof-cjs/types.cjs');
const { assertPerUnitRequiresUnit } = require('../.tmp-proof-cjs/transactionValidation.cjs');

const makeUnit = (overrides = {}) => ({ id:'A101',tower:'A',flatNumber:'101',floor:1,bhk:'2BHK',carpetAreaSqFt:850,saleableAreaSqFt:1000,ratePerSqFt:5000,amenitiesCost:0,adjustments:0,buyerName:'',buyerPhone:'',ownershipType:OwnershipType.Developer,isSold:false,isSettled:false,...overrides});
try { assertPerUnitRequiresUnit(TransactionScope.PerUnit, undefined);} catch (err) { console.log('PROOF_ORPHAN_REJECTED:', err.message); }
const reconUnits=[makeUnit({id:'A101'}),makeUnit({id:'A102',flatNumber:'102'})];
const reconTx=[{side:TransactionSide.VendorInvoice,scope:TransactionScope.PerUnit,unitId:'A101',amount:40000,date:'2026-01-01',isSettled:false},{side:TransactionSide.VendorInvoice,scope:TransactionScope.PerUnit,unitId:'A102',amount:60000,date:'2026-01-01',isSettled:false}];
const reconTotals=computeProjectTotals(reconUnits,reconTx);
console.log('PROOF_RECONCILIATION:',{dashboardVendorTotal:reconTotals.totalVendorInvoices,aggregateUnitCostTotal:Object.values(reconTotals.perUnitInvoices).reduce((s,a)=>s+a,0)});
const reimbUnits=[makeUnit({id:'D101',tower:'D',flatNumber:'101',ownershipType:OwnershipType.Developer}),makeUnit({id:'L101',tower:'L',flatNumber:'101',ownershipType:OwnershipType.Landowner})];
const reimbTx=[{side:TransactionSide.VendorInvoice,scope:TransactionScope.PerUnit,unitId:'D101',amount:80000,date:'2026-01-01',isSettled:false},{side:TransactionSide.LandownerReimbursable,scope:TransactionScope.PerUnit,unitId:'L101',amount:20000,date:'2026-01-01',isSettled:false}];
const reimbTotals=recomputeUnitTotals(reimbUnits,reimbTx); const reimbMetrics=computeDashboardMetrics(reimbUnits,reimbTotals,reimbTx);
console.log('PROOF_REIMBURSABLE:',{developerCostPool:reimbTotals.D101.economic.totalCost,landownerOwesBuilder:reimbMetrics.developer.landownerOwesBuilder});
const areaUnits=[makeUnit({id:'D101',tower:'D',flatNumber:'101',carpetAreaSqFt:850,saleableAreaSqFt:1000,ratePerSqFt:5000,isSold:true,buyerName:'Buyer'}),makeUnit({id:'D102',tower:'D',flatNumber:'102',carpetAreaSqFt:1150,saleableAreaSqFt:1000,ratePerSqFt:5000})];
const areaTotals=recomputeUnitTotals(areaUnits,[{side:TransactionSide.VendorInvoice,scope:TransactionScope.ProjectWide,amount:200000,date:'2026-01-01',isSettled:false}]);
console.log('PROOF_AREA_SPLIT:',{agreedPrice:areaTotals.D101.agreedPrice,allocatedUsingBuiltUpArea:Math.round(areaTotals.D101.economic.allocatedProjectCost)});
const soldUnits=[makeUnit({id:'D201',tower:'D',flatNumber:'201',isSold:true,isSettled:false,buyerName:'Buyer',saleableAreaSqFt:1000,ratePerSqFt:5000})];
const soldTx=[{side:TransactionSide.BuyerReceipt,scope:TransactionScope.PerUnit,unitId:'D201',amount:2000000,date:'2026-01-01',isSettled:true}];
const soldTotals=recomputeUnitTotals(soldUnits,soldTx); const soldMetrics=computeDashboardMetrics(soldUnits,soldTotals,soldTx);
console.log('PROOF_SOLD_VS_SETTLED:',{soldCount:soldMetrics.developer.soldUnits,settledCount:soldMetrics.developer.settledUnits,balanceDue:soldTotals.D201.buyerBalanceDue});
