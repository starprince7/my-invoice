import axios from 'axios';

// Interface for Mistral OCR API response based on official documentation
export interface OCRTextElement {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  page: number;
  fontSize: number;
  fontFamily?: string;
  confidence: number;
}

export interface OCRResponse {
  textElements: OCRTextElement[];
  success: boolean;
  error?: string;
}

class MistralService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    // API key should be stored securely and loaded from environment variables
    // For Expo managed projects, use EXPO_PUBLIC prefix for environment variables
    this.apiKey = process.env.EXPO_PUBLIC_MISTRAL_API_KEY || '';
    this.apiUrl = 'https://api.mistral.ai/ocr/v1/process';
  }

  /**
   * Extract text from a PDF using Mistral API's OCR capabilities
   * @param base64Pdf The PDF file as a base64 encoded string
   * @returns Promise with OCR results including text positions and content
   */
  async extractTextFromPDF(base64Pdf: string): Promise<OCRResponse> {
    try {
      if (!this.apiKey) {
        console.error('Mistral API key is not set. Ensure EXPO_PUBLIC_MISTRAL_API_KEY is defined.');
        return { success: false, error: 'API key not configured', textElements: [] };
      }

      console.log('Sending OCR request to Mistral API...');
      
      const requestBody = {
        model: 'mistral-ocr-latest', // Required parameter per documentation
        document: {
          type: 'document_url',
          documentUrl: `data:application/pdf;base64,${base64Pdf}`
        },
        includeImageBase64: true // Include images in response if needed
      };

      const response = await axios.post(
        this.apiUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      console.log('OCR processing completed successfully');
      
      // Transform the API response into our OCRResponse format
      // Note: Adjust the mapping based on the actual response structure from Mistral API
      const pages = response.data.pages || [];
      let textElements: OCRTextElement[] = [];
      
      // Extract text elements from all pages
      pages.forEach((page: any, pageIndex: number) => {
        const pageNumber = pageIndex + 1;
        const elements = page.text_elements || [];
        
        elements.forEach((element: any) => {
          textElements.push({
            text: element.text || '',
            bbox: {
              x0: element.bbox?.[0] || 0,
              y0: element.bbox?.[1] || 0,
              x1: element.bbox?.[2] || 0,
              y1: element.bbox?.[3] || 0
            },
            page: pageNumber,
            fontSize: element.font_size || 12,
            fontFamily: element.font_family || 'default',
            confidence: element.confidence || 1.0
          });
        });
      });

      return {
        textElements,
        success: true
      };
    } catch (error) {
      console.error('Error calling Mistral OCR API:', error);
      return {
        textElements: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export a singleton instance
export const mistralService = new MistralService();
