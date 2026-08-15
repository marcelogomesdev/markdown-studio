'use strict';

const STORAGE_KEYS = {
  content: 'markdownStudio.content',
  filename: 'markdownStudio.filename',
  theme: 'markdownStudio.theme'
};

const DEFAULT_CONTENT = `# Bem-vindo ao Markdown Studio

Escreva seu conteúdo no painel ao lado e acompanhe a **pré-visualização em tempo real**.

## Recursos principais

- Formatação com a barra de ferramentas
- Salvamento automático no navegador
- Importação e exportação de arquivos Markdown
- Contagem de palavras, caracteres e linhas
- Modo claro e escuro

> Dica: selecione um texto antes de usar os botões de formatação.

### Exemplo de código

\`\`\`javascript
const mensagem = "Olá, Markdown!";
console.log(mensagem);
\`\`\`

[Conheça a sintaxe Markdown](https://www.markdownguide.org/basic-syntax/)
`;

const elements = {};
let saveTimer = null;
let lastSavedContent = '';

window.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  configureMarkdown();
  restoreState();
  bindEvents();
  renderAll();
}

function cacheElements() {
  elements.root = document.documentElement;
  elements.editor = document.querySelector('#editor');
  elements.preview = document.querySelector('#preview');
  elements.wordCount = document.querySelector('#wordCount');
  elements.characterCount = document.querySelector('#characterCount');
  elements.lineCount = document.querySelector('#lineCount');
  elements.documentName = document.querySelector('#documentName');
  elements.fileInput = document.querySelector('#fileInput');
  elements.importButton = document.querySelector('#importButton');
  elements.exportButton = document.querySelector('#exportButton');
  elements.copyButton = document.querySelector('#copyButton');
  elements.clearButton = document.querySelector('#clearButton');
  elements.themeToggle = document.querySelector('#themeToggle');
  elements.themeIcon = document.querySelector('.theme-icon');
  elements.saveStatus = document.querySelector('#saveStatus');
  elements.toastContainer = document.querySelector('#toastContainer');
  elements.confirmDialog = document.querySelector('#confirmDialog');
  elements.toolbar = document.querySelector('.toolbar');
}

function configureMarkdown() {
  if (!window.marked) return;

  marked.setOptions({
    gfm: true,
    breaks: true
  });
}

function restoreState() {
  const storedContent = safeStorageGet(STORAGE_KEYS.content);
  const storedFilename = safeStorageGet(STORAGE_KEYS.filename);
  const storedTheme = safeStorageGet(STORAGE_KEYS.theme);
  const preferredDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  elements.editor.value = storedContent ?? DEFAULT_CONTENT;
  elements.documentName.value = storedFilename || 'meu-documento';
  setTheme(storedTheme || (preferredDark ? 'dark' : 'light'), false);
  lastSavedContent = elements.editor.value;
}

function bindEvents() {
  elements.editor.addEventListener('input', () => {
    renderAll();
    scheduleSave();
  });

  elements.editor.addEventListener('keydown', handleEditorKeydown);

  elements.documentName.addEventListener('input', () => {
    elements.documentName.value = sanitizeFilename(elements.documentName.value, false);
    scheduleSave();
  });

  elements.importButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', importMarkdownFile);
  elements.exportButton.addEventListener('click', exportMarkdownFile);
  elements.copyButton.addEventListener('click', copyMarkdownContent);
  elements.clearButton.addEventListener('click', requestClearDocument);
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.toolbar.addEventListener('click', handleToolbarClick);

  elements.confirmDialog.addEventListener('close', () => {
    if (elements.confirmDialog.returnValue === 'confirm') clearDocument();
  });

  document.addEventListener('keydown', handleGlobalShortcuts);
  window.addEventListener('beforeunload', saveDraft);
}

function renderAll() {
  renderPreview();
  updateStats();
}

function renderPreview() {
  const source = elements.editor.value;

  if (!source.trim()) {
    elements.preview.innerHTML = `
      <div class="empty-preview">
        <div>
          <strong>Seu documento está vazio</strong>
          Comece a escrever no editor para visualizar o resultado aqui.
        </div>
      </div>`;
    return;
  }

  try {
    if (!window.marked || !window.DOMPurify) {
      elements.preview.innerHTML = `<pre><code>${escapeHtml(source)}</code></pre>`;
      return;
    }

    const rawHtml = marked.parse(source);
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['style', 'onerror', 'onload']
    });

    elements.preview.innerHTML = cleanHtml;
    securePreviewLinks();
    disablePreviewCheckboxes();
  } catch (error) {
    console.error('Falha ao renderizar Markdown:', error);
    elements.preview.innerHTML = `<p>Não foi possível gerar a pré-visualização.</p>`;
  }
}

function securePreviewLinks() {
  elements.preview.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href')?.trim() || '';
    const isUnsafe = /^(javascript|data|vbscript):/i.test(href);

    if (isUnsafe) {
      link.removeAttribute('href');
      return;
    }

    if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });
}

function disablePreviewCheckboxes() {
  elements.preview.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.disabled = true;
  });
}

function updateStats() {
  const text = elements.editor.value;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/u).length : 0;
  const characters = Array.from(text).length;
  const lines = text ? text.split(/\r?\n/).length : 1;

  elements.wordCount.textContent = String(words);
  elements.characterCount.textContent = String(characters);
  elements.lineCount.textContent = String(lines);
}

function scheduleSave() {
  setSaveStatus('Salvando…', 'is-saving');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 550);
}

function saveDraft() {
  window.clearTimeout(saveTimer);
  const content = elements.editor.value;
  const filename = sanitizeFilename(elements.documentName.value) || 'meu-documento';

  const contentSaved = safeStorageSet(STORAGE_KEYS.content, content);
  const filenameSaved = safeStorageSet(STORAGE_KEYS.filename, filename);

  if (contentSaved && filenameSaved) {
    lastSavedContent = content;
    setSaveStatus('Salvo automaticamente', 'is-saved');
    window.setTimeout(() => setSaveStatus('Pronto', ''), 1800);
  } else {
    setSaveStatus('Não foi possível salvar', '');
  }
}

function setSaveStatus(message, stateClass) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.remove('is-saving', 'is-saved');
  if (stateClass) elements.saveStatus.classList.add(stateClass);
}

function handleToolbarClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  applyMarkdownAction(button.dataset.action);
}

function applyMarkdownAction(action) {
  const actions = {
    bold: () => wrapSelection('**', '**', 'texto em negrito'),
    italic: () => wrapSelection('*', '*', 'texto em itálico'),
    strike: () => wrapSelection('~~', '~~', 'texto tachado'),
    h1: () => prefixLines('# ', 'Título principal'),
    h2: () => prefixLines('## ', 'Título da seção'),
    h3: () => prefixLines('### ', 'Título menor'),
    quote: () => prefixLines('> ', 'Sua citação'),
    divider: () => insertAtCursor('\n\n---\n\n', 5),
    unorderedList: () => prefixLines('- ', 'Item da lista'),
    orderedList: () => prefixOrderedList(),
    taskList: () => prefixLines('- [ ] ', 'Nova tarefa'),
    link: () => insertLink(),
    image: () => insertImage(),
    inlineCode: () => wrapSelection('`', '`', 'código'),
    codeBlock: () => insertCodeBlock()
  };

  actions[action]?.();
}

function wrapSelection(before, after, placeholder) {
  const { selectionStart: start, selectionEnd: end, value } = elements.editor;
  const selected = value.slice(start, end) || placeholder;
  const replacement = `${before}${selected}${after}`;

  replaceEditorRange(start, end, replacement);
  elements.editor.setSelectionRange(start + before.length, start + before.length + selected.length);
}

function prefixLines(prefix, placeholder) {
  const editor = elements.editor;
  const value = editor.value;
  let start = editor.selectionStart;
  let end = editor.selectionEnd;

  if (start === end) {
    replaceEditorRange(start, end, `${prefix}${placeholder}`);
    editor.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length);
    return;
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block.split('\n').map(line => `${prefix}${line}`).join('\n');

  replaceEditorRange(lineStart, lineEnd, prefixed);
  editor.setSelectionRange(lineStart, lineStart + prefixed.length);
}

function prefixOrderedList() {
  const editor = elements.editor;
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;

  if (start === end) {
    replaceEditorRange(start, end, '1. Item da lista');
    editor.setSelectionRange(start + 3, start + 16);
    return;
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block.split('\n').map((line, index) => `${index + 1}. ${line}`).join('\n');

  replaceEditorRange(lineStart, lineEnd, prefixed);
  editor.setSelectionRange(lineStart, lineStart + prefixed.length);
}

function insertLink() {
  const editor = elements.editor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || 'texto do link';
  const replacement = `[${selected}](https://exemplo.com)`;

  replaceEditorRange(start, end, replacement);
  const urlStart = start + selected.length + 3;
  editor.setSelectionRange(urlStart, urlStart + 'https://exemplo.com'.length);
}

function insertImage() {
  const editor = elements.editor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || 'descrição da imagem';
  const replacement = `![${selected}](https://exemplo.com/imagem.jpg)`;

  replaceEditorRange(start, end, replacement);
  const urlStart = start + selected.length + 4;
  editor.setSelectionRange(urlStart, urlStart + 'https://exemplo.com/imagem.jpg'.length);
}

function insertCodeBlock() {
  const editor = elements.editor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || 'seu código aqui';
  const replacement = `\n\n\`\`\`javascript\n${selected}\n\`\`\`\n\n`;

  replaceEditorRange(start, end, replacement);
  const selectionStart = start + 15;
  editor.setSelectionRange(selectionStart, selectionStart + selected.length);
}

function insertAtCursor(text, cursorOffset = text.length) {
  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  replaceEditorRange(start, end, text);
  elements.editor.setSelectionRange(start + cursorOffset, start + cursorOffset);
}

function replaceEditorRange(start, end, replacement) {
  elements.editor.setRangeText(replacement, start, end, 'end');
  elements.editor.focus();
  elements.editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleEditorKeydown(event) {
  if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
    return;
  }

  if (event.key === 'Enter') continueMarkdownList(event);
}

function continueMarkdownList(event) {
  const editor = elements.editor;
  const beforeCursor = editor.value.slice(0, editor.selectionStart);
  const currentLine = beforeCursor.slice(beforeCursor.lastIndexOf('\n') + 1);
  const unorderedMatch = currentLine.match(/^(\s*)([-+*])\s+(.*)$/);
  const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
  const taskMatch = currentLine.match(/^(\s*)- \[[ xX]\]\s+(.*)$/);

  let continuation = '';
  let content = '';

  if (taskMatch) {
    continuation = `${taskMatch[1]}- [ ] `;
    content = taskMatch[2];
  } else if (unorderedMatch) {
    continuation = `${unorderedMatch[1]}${unorderedMatch[2]} `;
    content = unorderedMatch[3];
  } else if (orderedMatch) {
    continuation = `${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `;
    content = orderedMatch[3];
  }

  if (!continuation) return;
  event.preventDefault();

  if (!content.trim()) {
    const lineStart = beforeCursor.lastIndexOf('\n') + 1;
    replaceEditorRange(lineStart, editor.selectionStart, '');
    return;
  }

  insertAtCursor(`\n${continuation}`);
}

function handleGlobalShortcuts(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();

  if (key === 's') {
    event.preventDefault();
    exportMarkdownFile();
  } else if (key === 'b') {
    event.preventDefault();
    applyMarkdownAction('bold');
  } else if (key === 'i') {
    event.preventDefault();
    applyMarkdownAction('italic');
  } else if (key === 'k') {
    event.preventDefault();
    applyMarkdownAction('link');
  }
}

async function importMarkdownFile(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;

  const allowedExtensions = ['md', 'markdown', 'txt'];
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    showToast('Selecione um arquivo .md, .markdown ou .txt.', 'error');
    return;
  }

  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('O arquivo deve ter no máximo 2 MB.', 'error');
    return;
  }

  try {
    const content = await file.text();
    elements.editor.value = content;
    elements.documentName.value = sanitizeFilename(file.name.replace(/\.(md|markdown|txt)$/i, '')) || 'documento-importado';
    renderAll();
    saveDraft();
    elements.editor.focus();
    showToast('Arquivo importado com sucesso.', 'success');
  } catch (error) {
    console.error('Falha ao importar arquivo:', error);
    showToast('Não foi possível ler o arquivo selecionado.', 'error');
  }
}

function exportMarkdownFile() {
  const content = elements.editor.value;
  const filename = `${sanitizeFilename(elements.documentName.value) || 'documento'}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  saveDraft();
  showToast(`${filename} exportado com sucesso.`, 'success');
}

async function copyMarkdownContent() {
  const content = elements.editor.value;

  if (!content) {
    showToast('Não há conteúdo para copiar.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    showToast('Conteúdo Markdown copiado.', 'success');
  } catch {
    elements.editor.select();
    const copied = document.execCommand('copy');
    elements.editor.setSelectionRange(0, 0);
    showToast(copied ? 'Conteúdo Markdown copiado.' : 'Não foi possível copiar o conteúdo.', copied ? 'success' : 'error');
  }
}

function requestClearDocument() {
  if (!elements.editor.value.trim()) {
    showToast('O documento já está vazio.');
    return;
  }

  if (typeof elements.confirmDialog.showModal === 'function') {
    elements.confirmDialog.showModal();
  } else if (window.confirm('Limpar todo o conteúdo do documento?')) {
    clearDocument();
  }
}

function clearDocument() {
  elements.editor.value = '';
  elements.documentName.value = 'meu-documento';
  renderAll();
  saveDraft();
  elements.editor.focus();
  showToast('Documento limpo.', 'success');
}

function toggleTheme() {
  const nextTheme = elements.root.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme, true);
}

function setTheme(theme, persist = true) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  const isDark = normalizedTheme === 'dark';

  elements.root.dataset.theme = normalizedTheme;
  elements.themeIcon.textContent = isDark ? '☀' : '☾';
  elements.themeToggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#111827' : '#2563eb');

  if (persist) safeStorageSet(STORAGE_KEYS.theme, normalizedTheme);
}

function sanitizeFilename(value, trimEdges = true) {
  let clean = String(value ?? '')
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  if (trimEdges) clean = clean.replace(/^[.-]+|[.-]+$/g, '');
  return clean.slice(0, 80);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const symbols = { success: '✓', error: '!', info: 'i' };
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${symbols[type] || symbols.info}</span><p></p>`;
  toast.querySelector('p').textContent = message;
  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2800);
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('LocalStorage indisponível:', error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('Não foi possível salvar no LocalStorage:', error);
    return false;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  })[character]);
}
