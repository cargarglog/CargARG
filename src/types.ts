export enum UserRole {
  DRIVER = 'driver',
  COMPANY = 'company',
  STAFF = 'staff',
}

export type Plan = 'free' | 'silver' | 'gold';

export interface User {
  id: string; // This will be the Firebase Auth UID
  email: string;
  role: UserRole;
  // Integración de verificación extendida
  dni?: string; // legacy
  dniNumber?: string; // nuevo alias
  fullName?: string;
  birthDate?: string; // ISO YYYY-MM-DD
  age?: number;
  companyName?: string;
  emailVerified: boolean;
  perfilEstado: 'pending_attempt1' | 'pending_attempt2' | 'pending_selfie' | 'pending_review' | 'validada' | 'rechazada';
  plan: Plan;
  // Estado conciso para staff/registro DNI
  verificationStatus?: 'pending' | 'accepted' | 'ban';
}

export enum LoadStatus {
  AVAILABLE = 'available',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export interface Location {
  lat: number;
  lng: number;
}

export interface PaymentDetails {
  // mÃ©todo principal para compatibilidad hacia atrÃ¡s
  method: 'cheque' | 'efectivo' | 'transferencia';
  terms: string; // e.g., "A 30 dÃ­as", "Contra entrega", "50% al cargar, 50% al entregar"
  // nuevos campos
  methods?: Array<'cheque' | 'efectivo' | 'transferencia'>; // permite mÃºltiples
  chequeDays?: number; // requerido si incluye cheque
  splitOriginDestination?: boolean; // pago en origen/destino
  originPercent?: number; // 0-100
  destinationPercent?: number; // 0-100
}

export interface PlaceLocation {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

export interface Load {
  id: string;
  createdAt: number; // timestamp
  companyId: string;
  driverId: string | null;
  status: LoadStatus;
  startLocation: PlaceLocation;
  endLocation: PlaceLocation;
  price: number;
  currency?: 'ARS' | 'USD' | 'BRL';
  title?: string;
  distanceKm?: number; // calculada por IA/haversine
  company: string;
  cargoDetails: string;
  requirements: string[];
  requiredTruckType?: string[];
  otherTruckType?: string; // descripciÃ³n si eligiÃ³ "Otro"
  paymentDetails: PaymentDetails;
  billing?: {
    type: 'remito' | 'factura';
    iva?: 'con' | 'sin';
  };
  slots?: number; // cupos (obligatorio para plan Silver)
  companyRating?: number;
  driverRating?: number;
}

export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  sources?: { uri: string; title: string }[];
}


// --- Staff Dashboard Types ---

export interface VerificationLog {
  id: string; // doc id
  attemptNumber: number;
  createdAt: any; // Firestore timestamp
  // Integración de verificación extendida
  provider?: 'IA' | 'DocumentAI' | 'HumiOberif' | 'Staff';
  confidenceScore?: number;
  requestedComponents?: string[];
  feedback?: string;
  dniBackUri?: string;
  dniFrontUri: string;
  licenseFrontUri?: string;
  licenseBackUri?: string;
  selfieUri: string;
  errorMessage?: string;
  facialSimilarityScore?: number;
  finalState: string;
  status: 'processing' | 'success' | 'error';
  strategy: 'standard' | 'extended_heuristics';
  userSubmittedDni: string;
  documentVerification?: {
    success: boolean;
    reason: string;
    extractedData?: any;
  };
  manualVerification?: {
      action: 'approved' | 'rejected';
      reason?: string;
      verifiedBy: string; // staff user email
      verifiedAt: any;
  }
}

export interface EnrichedVerificationRequest {
    user: User;
    log: VerificationLog;
    imageUrls: {
        selfie: string;
        dniFront: string;
        dniBack: string | null;
        licenseFront?: string | null;
        licenseBack?: string | null;
    }
}


