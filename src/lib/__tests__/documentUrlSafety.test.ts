import {isAllowedDocumentUrl} from '../documentValidation';
test.each(['javascript:alert(1)','data:text/html,<script>alert(1)</script>','data:image/svg+xml,<svg/>','data:application/pdf-malicious,abc','https://user:password@example.test/file.pdf','http://example.test/file.pdf','file:///private/file'])('rejects unsafe legacy document URL: %s',uri=>{
 expect(isAllowedDocumentUrl(uri)).toBe(false);
});
test.each(['data:application/pdf;base64,JVBERg==','data:image/png;base64,AA==','blob:https://example.test/id','https://example.test/file.pdf'])('retains supported legacy documents: %s',uri=>{
 expect(isAllowedDocumentUrl(uri)).toBe(true);
});
