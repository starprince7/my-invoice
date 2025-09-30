/* PdfApi service: calls external HTML-to-PDF API and returns PDF bytes */

export type PdfOptions = {
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  format?: 'A4' | 'Letter' | string;
  printBackground?: boolean;
};

export type HtmlConvertRequest = {
  html: string;
  fileName?: string;
  download?: boolean;
  pdfOptions?: PdfOptions;
};

export type UrlConvertRequest = {
  url: string;
  fileName?: string;
  download?: boolean;
};

export type PdfApiResponse = {
  bytes: ArrayBuffer;
  contentType: string | null;
  contentDisposition: string | null;
};

const DEFAULT_ENDPOINT = 'https://www.starprince.dev/api/html-to-pdf';

async function postJsonForPdf(endpoint: string, body: any): Promise<PdfApiResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PDF API error ${res.status}: ${text || res.statusText}`);
  }
  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get('content-type');
  const contentDisposition = res.headers.get('content-disposition');
  return { bytes, contentType, contentDisposition };
}

export const PdfApi = {
  async convertHtml(req: HtmlConvertRequest, endpoint: string = DEFAULT_ENDPOINT): Promise<PdfApiResponse> {
    return postJsonForPdf(endpoint, req);
  },
  async convertUrl(req: UrlConvertRequest, endpoint: string = DEFAULT_ENDPOINT): Promise<PdfApiResponse> {
    return postJsonForPdf(endpoint, req);
  },
};

// Utilities for platform handlers
export function bytesToBlob(bytes: ArrayBuffer, type: string = 'application/pdf'): Blob {
  // On web runtime only
  return new Blob([bytes], { type });
}

export function bytesToBase64(bytes: ArrayBuffer): string {
  // Works in RN and web. No external deps.
  const bytesArr = new Uint8Array(bytes);
  const base64abc =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '', i;
  const l = bytesArr.length;
  for (i = 0; i < l - 2; i += 3) {
    result += base64abc[bytesArr[i] >> 2];
    result += base64abc[((bytesArr[i] & 3) << 4) | (bytesArr[i + 1] >> 4)];
    result += base64abc[((bytesArr[i + 1] & 15) << 2) | (bytesArr[i + 2] >> 6)];
    result += base64abc[bytesArr[i + 2] & 63];
  }
  if (i < l) {
    result += base64abc[bytesArr[i] >> 2];
    if (i === l - 1) {
      result += base64abc[(bytesArr[i] & 3) << 4];
      result += '==';
    } else {
      result += base64abc[((bytesArr[i] & 3) << 4) | (bytesArr[i + 1] >> 4)];
      result += base64abc[(bytesArr[i + 1] & 15) << 2];
      result += '=';
    }
  }
  return result;
}
