export enum TransactionSide {
  BuyerReceipt = 'Buyer Receipt',
  VendorInvoice = 'Vendor Invoice',
  VendorPayment = 'Vendor Payment',
  LandownerReimbursable = 'Landowner Reimbursable',
  LandownerReimbursableReceipt = 'Landowner Reimbursable Receipt',
}

export enum TransactionScope {
  ProjectWide = 'ProjectWide',
  PerUnit = 'PerUnit',
}

export enum OwnershipType {
  Developer = 'Developer',
  Landowner = 'Landowner',
}

export enum WorkPackage {
  Electrical = 'Electrical',
  Plumbing = 'Plumbing',
  Waterproofing = 'Waterproofing',
  Flooring = 'Flooring & Tiling',
  Carpentry = 'Carpentry/Joinery',
  FalseCeiling = 'False Ceiling/POP',
  Painting = 'Painting',
  Fixtures = 'Fixtures (Electrical/Sanitary)',
  Lift = 'Lift/Elevator',
  FireSafety = 'Fire & Safety',
  CommonAreas = 'Common Areas',
  Other = 'Other',
}

export enum PaymentMode {
  NEFT = 'NEFT',
  RTGS = 'RTGS',
  UPI = 'UPI',
  Cheque = 'Cheque',
  Cash = 'Cash',
}

export interface Project {
  version?: number;
  id: string;
  code: string;
  name: string;
  location?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewProjectInput {
  name: string;
  code: string;
  location?: string | null;
}

export type UpdateProjectInput = Pick<NewProjectInput, 'name' | 'location'>;

export interface ProjectStats {
  unitCount: number;
  lastTransactionDate?: string | null;
}

export interface Unit {
  version?: number;
  id?: string;
  tower: string;
  flatNumber: string;
  floor: number;
  bhk: '2BHK' | '3BHK';
  carpetAreaSqFt: number;
  saleableAreaSqFt: number;
  ratePerSqFt: number;
  amenitiesCost: number;
  adjustments: number;
  agreedPrice?: number;
  buyerName: string;
  buyerPhone: string;
  ownershipType: OwnershipType;
  handoverTarget?: string;
  isSold: boolean;
  isSettled: boolean;
}

export interface Transaction {
  version?: number;
  requestId?: string;
  vendorId?: string;
  invoiceId?: string;
  id?: string;
  /**
   * Database UUID of the linked unit. Display codes are derived from the Unit
   * record so duplicate codes can safely exist across different projects.
   */
  unitId?: string;
  scope?: TransactionScope;
  side: TransactionSide;
  amount: number;
  date: string;
  mode?: PaymentMode;
  vendorName?: string;
  workPackage?: WorkPackage;
  dueDate?: string;
  isSettled: boolean;
  description?: string;
}

export type NewUnitInput = Omit<Unit, 'id'>;

export type NewTransactionInput = Omit<Transaction, 'id'>;

export interface CostBreakdown {
  allocatedProjectCost: number;
  perUnitCost: number;
  totalCost: number;
  allocatedPayments: number;
  directPayments: number;
  vendorPayable: number;
  vendorAdvance: number;
}

export interface UnitFinancials {
  agreedPrice: number;
  buyerReceipts: number;
  buyerBalanceDue: number;
  buyerCredit: number;
  unitRevenue: number;
  status: 'Sold' | 'Unsold' | 'Landowner';
  reimbursableDue: number;
  economic: CostBreakdown;
  engineering: CostBreakdown;
}
