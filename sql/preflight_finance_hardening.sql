-- Read-only review before upgrading an existing database. Never auto-fix these records.
select t.id,t.project_id,t.unit_id,t.type,t.amount,t.party,t.deleted_at,
 case
  when not (t.amount>0 and t.amount<=999999999999.99 and t.amount=round(t.amount,2)) then 'Invalid amount'
  when (t.scope='PerUnit' and t.unit_id is null) or (t.scope='ProjectWide' and t.unit_id is not null) then 'Scope/unit mismatch'
  when t.scope='PerUnit' and (u.id is null or u.project_id<>t.project_id or u.deleted_at is not null) then 'Missing, cross-project or archived unit'
  when t.type='BuyerReceipt' and (t.scope<>'PerUnit' or u.ownership_type<>'Developer' or not u.is_sold) then 'Buyer receipt requires sold developer unit'
  when t.type in ('LandownerReimbursable','LandownerReimbursableReceipt') and (t.scope<>'PerUnit' or u.ownership_type<>'Landowner') then 'Reimbursement requires landowner unit'
  when t.type in ('VendorInvoice','VendorPayment') and nullif(trim(t.party),'') is null then 'Missing vendor name'
  when t.status not in ('Pending','Completed') then 'Invalid status'
 end as issue
from public.transactions t left join public.units u on u.id=t.unit_id
where not (t.amount>0 and t.amount<=999999999999.99 and t.amount=round(t.amount,2))
 or (t.scope='PerUnit' and t.unit_id is null) or (t.scope='ProjectWide' and t.unit_id is not null)
 or t.status not in ('Pending','Completed')
 or (t.deleted_at is null and (
  (t.scope='PerUnit' and (u.id is null or u.project_id<>t.project_id or u.deleted_at is not null))
  or (t.type='BuyerReceipt' and (t.scope<>'PerUnit' or u.ownership_type<>'Developer' or not u.is_sold))
  or (t.type in ('LandownerReimbursable','LandownerReimbursableReceipt') and (t.scope<>'PerUnit' or u.ownership_type<>'Landowner'))
  or (t.type in ('VendorInvoice','VendorPayment') and nullif(trim(t.party),'') is null)));

select id,project_id,unit_code,ownership_type,is_sold,buyer_name,carpet_area_sqft,saleable_area_sqft,agreed_price,rate_per_sqft,amenities_cost,adjustments
from public.units where not (
 carpet_area_sqft between 0 and 10000000 and saleable_area_sqft between 0 and 10000000
 and rate_per_sqft between 0 and 999999999999.99 and rate_per_sqft=round(rate_per_sqft,2)
 and amenities_cost between 0 and 999999999999.99 and amenities_cost=round(amenities_cost,2)
 and abs(adjustments)<=999999999999.99 and adjustments=round(adjustments,2)
 and agreed_price between 0 and 999999999999.99 and agreed_price=round(agreed_price,2)
 and length(trim(tower))>0 and length(trim(flat_no))>0
 and (not is_sold or (ownership_type='Developer' and nullif(trim(buyer_name),'') is not null)));
