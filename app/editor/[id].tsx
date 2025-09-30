import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { templates } from '../../doc-templates/manifest';
import { PdfApi, bytesToBase64, bytesToBlob } from '../../services/PdfApi';

export default function TemplateEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null); // web-only iframe for full HTML

  const template = useMemo(() => templates.find(t => t.id === id), [id]);

  const [loading, setLoading] = useState(true);
  const [initialHtml, setInitialHtml] = useState<string>('');
  const [currentHtml, setCurrentHtml] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [baseHref, setBaseHref] = useState<string | null>(null); // web-only
  const [iframeHtml, setIframeHtml] = useState<string>(''); // web-only: decouple srcDoc from saved html

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!template) {
          Alert.alert('Template not found', 'Returning to templates');
          router.back();
          return;
        }
        // Resolve the bundled assets and read contents
        const asset = Asset.fromModule(template.asset);
        // Ensure the logo asset is bundled and get its absolute URI
        let logoUri: string | null = null;
        try {
          const logoAsset = Asset.fromModule(require('../../doc-templates/chronopost_logo.png'));
          await logoAsset.downloadAsync();
          logoUri = (logoAsset.localUri || logoAsset.uri) || null;
        } catch {}
        await asset.downloadAsync();
        let html = '';
        if (Platform.OS === 'web') {
          // On web, read the network URI via fetch
          const res = await fetch(asset.uri);
          html = await res.text();
          // Swap relative logo path with absolute asset URI so Metro serves it
          if (logoUri) {
            html = html.replace(/\.\/chronopost_logo\.png/g, logoUri);
          }
          setBaseHref(asset.uri);
        } else {
          const uri = asset.localUri || asset.uri;
          html = await FileSystem.readAsStringAsync(uri!);
          // iOS WebView can fail to load file:// asset URLs inside HTML; embed as data URI
          if (logoUri) {
            try {
              const base64 = await FileSystem.readAsStringAsync(logoUri, { encoding: FileSystem.EncodingType.Base64 as any });
              const dataUrl = `data:image/png;base64,${base64}`;
              html = html.replace(/\.\/chronopost_logo\.png/g, dataUrl);
              // Remove crossorigin attribute which can interfere with data URLs in WKWebView
              html = html.replace(/\s*crossorigin="anonymous"/g, '');
            } catch {
              // Fallback to absolute URI replacement
              html = html.replace(/\.\/chronopost_logo\.png/g, logoUri);
            }
          }
        }
        if (!mounted) return;

        // Inject minimal editing helpers
        let enhancedHtml = wrapHtmlForEditing(html);
        // On web, ensure relative asset URLs resolve by injecting <base>
        if (Platform.OS === 'web' && baseHref) {
          enhancedHtml = addBaseHref(enhancedHtml, baseHref);
        }
        setInitialHtml(enhancedHtml);
        setCurrentHtml(enhancedHtml);
        if (Platform.OS === 'web') {
          setIframeHtml(enhancedHtml);
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to load template HTML');
      } finally {
        mounted && setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [template]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data?.type === 'content') {
        setCurrentHtml(data.html || '');
      }
    } catch {
      // ignore
    }
  }, []);

  const requestHtmlFromWebView = useCallback(() => {
    webRef.current?.injectJavaScript(`(function(){
      try {
        // Normalize live form control values into attributes/content
        const doc = document;
        doc.querySelectorAll('input').forEach((el)=>{
          const i = el; const t = (i.getAttribute('type')||'text').toLowerCase();
          if (t==='checkbox' || t==='radio') { if (i.checked) { i.setAttribute('checked',''); } else { i.removeAttribute('checked'); } }
          else { i.setAttribute('value', i.value ?? ''); }
        });
        doc.querySelectorAll('textarea').forEach((el)=>{ el.textContent = el.value ?? ''; });
        doc.querySelectorAll('select').forEach((el)=>{
          const s = el; const val = s.value; s.querySelectorAll('option').forEach((opt)=>{ if (opt.value===val) opt.setAttribute('selected',''); else opt.removeAttribute('selected'); });
        });
        const html = doc.documentElement.outerHTML;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', html }));
      } catch (e) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) })); } catch {}
      }
    })();`);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      if (Platform.OS === 'web') {
        // Capture edited HTML from iframe document without reloading iframe
        const doc = iframeRef.current?.contentDocument as Document | undefined;
        if (doc) {
          const html = snapshotDocument(doc);
          setCurrentHtml(html);
          console.log('[editor:web] Saved HTML length:', html.length);
          try { Alert.alert('Saved', 'Your changes have been captured.'); } catch { window.alert('Saved: Your changes have been captured.'); }
        } else {
          console.warn('[editor:web] iframe document not available on save');
          try { Alert.alert('Error', 'Editor not ready'); } catch { window.alert('Error: Editor not ready'); }
        }
      } else {
        requestHtmlFromWebView();
        // Give the WebView a tick to respond
        await new Promise(res => setTimeout(res, 250));
        Alert.alert('Saved', 'Your changes have been captured.');
      }
    } catch (e) {
      console.error(e);
      try { Alert.alert('Error', 'Failed to save changes'); } catch { window.alert('Error: Failed to save changes'); }
    } finally {
      setSaving(false);
    }
  }, [requestHtmlFromWebView]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      let htmlToExport = currentHtml || initialHtml;
      // Desired behavior: use external API. If it fails, fall back to existing local export.
      const fileBaseName = (template?.title || 'document').replace(/\s+/g, '-').toLowerCase();
      const apiDownload = true; // set to false to try inline behavior on web
      const pdfOptions = { margin: { top: '0.4in', right: '0.4in', bottom: '0.6in', left: '0.4in' }, format: 'A4', printBackground: true } as const;

      if (Platform.OS === 'web') {
        // Capture latest HTML from iframe
        const iframeEl = iframeRef.current as HTMLIFrameElement | null;
        const doc = iframeEl?.contentDocument as Document | undefined;
        if (!doc) {
          console.warn('[editor:web] iframe document not available on export');
          try { Alert.alert('Error', 'Editor not ready'); } catch { window.alert('Error: Editor not ready'); }
          return;
        }
        htmlToExport = addPrintCss(snapshotDocument(doc), { compact: false });

        try {
          const resp = await PdfApi.convertHtml({ html: htmlToExport, fileName: fileBaseName, download: apiDownload, pdfOptions });
          const type = resp.contentType || 'application/pdf';
          const blob = bytesToBlob(resp.bytes, type);
          const url = URL.createObjectURL(blob);
          const cd = resp.contentDisposition || '';
          const suggestedName = parseFilenameFromContentDisposition(cd) || `${fileBaseName}.pdf`;
          if (apiDownload) {
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else {
            window.open(url, '_blank');
          }
          return;
        } catch (apiErr) {
          console.warn('[editor:web] API export failed, falling back to browser print', apiErr);
          // Fallback to existing browser print path
          const win = iframeEl?.contentWindow as any;
          if (!win) {
            try { Alert.alert('Error', 'Editor not ready'); } catch { window.alert('Error: Editor not ready'); }
            return;
          }
          try { win.document.open(); win.document.write(htmlToExport); win.document.close(); } catch {}
          try {
            const head = win.document.head || win.document.getElementsByTagName('head')[0];
            if (head && !win.document.getElementById('__export_layout_a4__')) {
              const style = win.document.createElement('style');
              style.id = '__export_layout_a4__';
              style.textContent = `html, body { overflow: visible !important; background: white !important; } body { width: 794px !important; margin: 0 auto !important; } @media print { body { width: 794px !important; } }`;
              head.appendChild(style);
            }
          } catch {}
          try { if (win.document && (win.document as any).fonts && (win.document as any).fonts.ready) await (win.document as any).fonts.ready; } catch {}
          try { win.focus(); win.print(); } catch {}
          return;
        }
      } else {
        // Native platforms: request latest HTML then send to API; fallback to Print.printToFileAsync
        requestHtmlFromWebView();
        await new Promise(res => setTimeout(res, 300));
        htmlToExport = addPrintCss(currentHtml || initialHtml, { compact: true });
        try {
          const resp = await PdfApi.convertHtml({ html: htmlToExport, fileName: fileBaseName, download: true, pdfOptions });
          const base64 = bytesToBase64(resp.bytes);
          const fileUri = `${FileSystem.cacheDirectory}${fileBaseName}-${Date.now()}.pdf`;
          await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 as any });
          if (Platform.OS === 'ios' || (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(fileUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
          } else {
            Alert.alert('Exported', `PDF saved at: ${fileUri}`);
          }
          return;
        } catch (apiErr) {
          console.warn('[editor:native] API export failed, falling back to expo-print', apiErr);
          const { uri } = await Print.printToFileAsync({ html: htmlToExport });
          if (Platform.OS === 'ios' || (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
          } else {
            Alert.alert('Exported', `PDF saved at: ${uri}`);
          }
        }
      }
    } catch (e) {
      console.error(e);
      try { Alert.alert('Error', 'Failed to export PDF'); } catch { window.alert('Error: Failed to export PDF'); }
    } finally {
      setExporting(false);
    }
  }, [currentHtml, initialHtml, requestHtmlFromWebView]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading template…</Text>
      </View>
    );
  }

// Web-only helpers used when Platform.OS === 'web'
function extractBodyHtml(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return m ? m[1] : html;
}

function wrapAsFullHtml(bodyInner: string): string {
  // Basic head with charset and print-friendly defaults
  return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<style>body{margin:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}</style>\n</head>\n<body>\n${bodyInner}\n</body>\n</html>`;
}

function addBaseHref(html: string, baseHref: string): string {
  // If a <base> already exists, leave as is
  if (/<base\b/i.test(html)) return html;
  // Insert <base> as the first element within <head>
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}" />`);
  }
  // If there's no head, create one
  return `<!DOCTYPE html>\n<html>\n<head><base href="${baseHref}" /></head>\n<body>${html}</body>\n</html>`;
}

// Ensure backgrounds/colors/gradients are preserved in print/PDF across engines
function addPrintCss(html: string, opts?: { compact?: boolean }): string {
  const compact = !!opts?.compact;
  const compactRules = compact
    ? `\n@media print {\n  /* Slight scale-down to keep within one page on iOS */\n  body { zoom: 0.92; }\n}`
    : '';
  const printCss = `\n<style id="__print_colors__">\n@media print {\n  * {\n    -webkit-print-color-adjust: exact !important;\n    print-color-adjust: exact !important;\n    color-adjust: exact !important; /* legacy */\n  }\n  html, body {\n    -webkit-print-color-adjust: exact !important;\n    print-color-adjust: exact !important;\n  }\n  /* Hide editor helpers when exporting */\n  ._edit_hint { display: none !important; }\n  [contenteditable] { outline: none !important; }\n}\n@page { size: A4; margin: 0; }\n/* Ensure A4 width layout when printing */\nbody { width: 794px !important; margin: 0 auto !important; }${compactRules}\n</style>`;
  if (/<head[^>]*>/i.test(html)) {
    // If our marker already exists, skip
    if (html.includes('__print_colors__')) return html;
    return html.replace(/<head[^>]*>/i, (m) => `${m}${printCss}`);
  }
  // No head -> create one
  return `<!DOCTYPE html>\n<html>\n<head>${printCss}</head>\n<body>${html}</body>\n</html>`;
}

// Serialize a live document to HTML with form values persisted
function snapshotDocument(doc: Document): string {
  try {
    doc.querySelectorAll('input').forEach((el) => {
      const i = el as HTMLInputElement;
      const t = (i.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox' || t === 'radio') {
        if (i.checked) {
          i.setAttribute('checked', '');
        } else {
          i.removeAttribute('checked');
        }
      } else {
        i.setAttribute('value', i.value ?? '');
      }
    });
    doc.querySelectorAll('textarea').forEach((el) => {
      const ta = el as HTMLTextAreaElement;
      ta.textContent = ta.value ?? '';
    });
    doc.querySelectorAll('select').forEach((el) => {
      const s = el as HTMLSelectElement;
      const val = s.value;
      s.querySelectorAll('option').forEach((opt) => {
        const o = opt as HTMLOptionElement;
        if (o.value === val) o.setAttribute('selected', '');
        else o.removeAttribute('selected');
      });
    });
  } catch {}
  return doc.documentElement.outerHTML;
}

// Parse filename from Content-Disposition header if present
function parseFilenameFromContentDisposition(cd: string): string | null {
  try {
    if (!cd) return null;
    // Try RFC 5987 format: filename*=UTF-8''...
    const star = cd.match(/filename\*=([^;]+)/i);
    if (star && star[1]) {
      const val = star[1].trim().replace(/^(UTF-8''|"|')/i, '').replace(/("|')$/g, '');
      try { return decodeURIComponent(val); } catch { return val; }
    }
    // Fallback: filename="example.pdf" or filename=example.pdf
    const plain = cd.match(/filename=\s*"?([^;\"]+)"?/i);
    if (plain && plain[1]) return plain[1].trim();
  } catch {}
  return null;
}

// (Removed html2pdf loader; using native print dialog on web)

  if (!template) {
    return (
      <View style={styles.center}>
        <Text>Template not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#333" />
          <Text style={styles.headerBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{template.title}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleSave} disabled={saving}>
            <Ionicons name="save-outline" size={22} color="#2196F3" />
            <Text style={styles.actionText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleExport} disabled={exporting}>
            <Ionicons name="share-social-outline" size={22} color="#2196F3" />
            <Text style={styles.actionText}>{exporting ? 'Exporting…' : 'Export'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {Platform.OS === 'web' ? (
        <View style={styles.webFallbackContainer}>
          <iframe
            ref={iframeRef}
            style={{ border: 'none', width: '100%', height: '100%' }}
            srcDoc={iframeHtml || initialHtml}
            onLoad={() => {
              try {
                const doc = iframeRef.current?.contentDocument as Document | undefined;
                if (doc) {
                  // Make body editable and add visual hint
                  doc.body.setAttribute('contenteditable', 'true');
                  const style = doc.createElement('style');
                  style.textContent = '[contenteditable="true"]{outline:2px dashed #cfe4ff; outline-offset:2px}';
                  doc.head.appendChild(style);
                  // Add <base> if missing
                  if (baseHref && !doc.querySelector('base')) {
                    const base = doc.createElement('base');
                    base.setAttribute('href', baseHref);
                    doc.head.insertBefore(base, doc.head.firstChild);
                  }
                }
              } catch {}
            }}
          />
        </View>
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html: currentHtml || initialHtml }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          setSupportMultipleWindows={false}
          style={styles.webview}
        />
      )}
    </SafeAreaView>
  );
}

function wrapHtmlForEditing(raw: string): string {
  // Ensure the HTML has a head/body and inject a small helper script/styles
  // Make everything with [contenteditable], [data-editable], and inputs editable and styled
  const helper = `
  <style>
    [contenteditable="true"] { outline: 2px dashed #cfe4ff; outline-offset: 2px; }
    ._edit_hint { position: fixed; right: 10px; bottom: 10px; color: #666; font: 12px system-ui; background: rgba(255,255,255,0.9); padding: 6px 8px; border-radius: 8px; border: 1px solid #eee; }
    input, textarea { border: 1px solid #e0e0e0; padding: 6px 8px; border-radius: 6px; }
  </style>
  <script>
    (function(){
      document.addEventListener('DOMContentLoaded', function(){
        // Mark common text blocks as editable when they opt-in via data-editable
        document.querySelectorAll('[data-editable]')?.forEach(function(el){
          el.setAttribute('contenteditable', 'true');
        });
      });
      // Periodically send content to RN in case user forgets to save
      setInterval(function(){
        try {
          const html = document.documentElement.outerHTML;
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'content', html }));
        } catch (e) {}
      }, 1500);
    })();
  </script>
  <div class="_edit_hint">Tap fields or highlighted areas to edit. Use Save/Export.</div>
  `;

  if (raw.includes('</body>')) {
    return raw.replace('</body>', `${helper}\n</body>`);
  }
  if (raw.includes('</html>')) {
    return raw.replace('</html>', `${helper}\n</html>`);
  }
  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/>${helper}</head>\n<body>${raw}</body>\n</html>`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
  },
  header: {
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e6e6e6',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  headerBtnText: { color: '#333', marginLeft: 2 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#222',
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#eef6ff',
    borderRadius: 8,
    marginLeft: 6,
  },
  actionText: { marginLeft: 6, color: '#2196F3', fontWeight: '600' },
  webview: {
    flex: 1,
  },
  webFallbackContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
