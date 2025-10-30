// CargARG Identity Extended Integration
export interface DetailedImageAnalysis {
  type: 'dniFront' | 'dniBack' | 'licenseFront' | 'licenseBack' | 'selfie' | 'unknown';
  quality: { sharpness: number; exposure: number; framing: number };
  hints: string[];
}

export const DEFAULT_ANALYSIS: DetailedImageAnalysis = {
  type: 'unknown',
  quality: { sharpness: 0, exposure: 0, framing: 0 },
  hints: ['Intenta con mejor luz y enfoque.']
};

