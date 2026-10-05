export function readerIcon(kind){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('reader-icon');
  const shapes={first:'M6 5v14M17 6l-6 6 6 6',previous:'M15 6l-6 6 6 6',next:'M9 6l6 6-6 6',last:'M18 5v14M7 6l6 6-6 6',bookmark:'M6 4h12v17l-6-4-6 4z',hide:'M15 6l-6 6 6 6'};
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',shapes[kind]);svg.append(path);return svg;
}
