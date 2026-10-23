import creditsMd from '../../CREDITS.md?raw';

// The credits screen's text: CREDITS.md, turned into HTML at build time, so the screen always
// shows what the file says. Only what CREDITS.md uses is handled: headings, paragraphs, tables,
// lists, *italics*, **bold**, `code` and bare links.

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  const codes = [];
  let s = escape(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/https?:\/\/[^\s<)"]+/g, (url) => {
    const tail = url.match(/[.,;:]+$/)?.[0] || '';
    const href = url.slice(0, url.length - tail.length);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>${tail}`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (line.trim().startsWith('|')) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      i--;
      const [head, , ...body] = rows;           // (the second row is the |---| separator)
      out.push('<div class="hi-table"><table><thead><tr>' +
        cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
    } else if (/^\s*-\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*-\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*-\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      i--;
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

export const CREDITS_HTML = renderMarkdown(creditsMd);
